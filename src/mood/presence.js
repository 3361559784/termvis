import { clamp } from "./types.js";

/** @type {readonly string[]} */
export const PRESENCE_MODES = Object.freeze([
  "dormant",
  "ambient",
  "peripheral",
  "attentive",
  "focused",
  "engaged",
  "foreground",
  "guardian",
  "recovering",
  "celebrating",
  "reflective",
]);

/** @type {readonly string[]} */
export const PRESENCE_STANCES = Object.freeze([
  "rest",
  "observe",
  "listen",
  "think",
  "scan",
  "verify",
  "repair",
  "guard",
  "ask",
  "report",
  "celebrate",
  "remember",
]);

/** @type {readonly string[]} */
export const GAZE_TARGETS = Object.freeze([
  "user",
  "host_output",
  "tool",
  "memory",
  "plan",
  "risk",
  "terminal",
  "none",
]);

/** @type {ReadonlySet<string>} */
const PRESENCE_MODE_SET = new Set(PRESENCE_MODES);
/** @type {ReadonlySet<string>} */
const PRESENCE_STANCE_SET = new Set(PRESENCE_STANCES);
/** @type {ReadonlySet<string>} */
const GAZE_TARGET_SET = new Set(GAZE_TARGETS);

/** @param {unknown} s @param {string} fallback @returns {string} */
function normalizePresenceModeString(s, fallback = "ambient") {
  if (typeof s !== "string") return fallback;
  const t = s.trim().toLowerCase();
  for (const m of PRESENCE_MODES) {
    if (m === t) return m;
  }
  return fallback;
}

/** @param {unknown} s @param {string} fallback @returns {string} */
function normalizePresenceStanceString(s, fallback = "observe") {
  if (typeof s !== "string") return fallback;
  const t = s.trim().toLowerCase();
  for (const st of PRESENCE_STANCES) {
    if (st === t) return st;
  }
  return fallback;
}

/** @param {unknown} s @param {string} fallback @returns {string} */
function normalizeGazeTargetString(s, fallback = "terminal") {
  if (typeof s !== "string") return fallback;
  const t = s.trim().toLowerCase();
  for (const g of GAZE_TARGETS) {
    if (g === t) return g;
  }
  return fallback;
}

/** @param {unknown} v @returns {readonly string[]} */
function freezeCauseIds(v) {
  if (!Array.isArray(v)) return Object.freeze([]);
  return Object.freeze(
    v.map((x) => (typeof x === "string" ? x : String(x))),
  );
}

/**
 * @param {Record<string, unknown>} [overrides]
 * @returns {Readonly<{
 *   mode: string,
 *   stance: string,
 *   attention: number,
 *   proximity: number,
 *   agency: number,
 *   interruptibility: number,
 *   silenceBias: number,
 *   gazeTarget: string,
 *   causeIds: readonly string[],
 * }>}
 */
export function createPresenceState(overrides = {}) {
  const o = overrides && typeof overrides === "object" ? overrides : {};
  const mode = normalizePresenceModeString(o.mode, "ambient");
  const stance = normalizePresenceStanceString(o.stance, "observe");
  const gazeTarget = normalizeGazeTargetString(o.gazeTarget, "terminal");
  return Object.freeze({
    mode: PRESENCE_MODE_SET.has(mode) ? mode : "ambient",
    stance: PRESENCE_STANCE_SET.has(stance) ? stance : "observe",
    attention: clamp(o.attention ?? 0.5, 0, 1),
    proximity: clamp(o.proximity ?? 0.3, 0, 1),
    agency: clamp(o.agency ?? 0.2, 0, 1),
    interruptibility: clamp(o.interruptibility ?? 0.7, 0, 1),
    silenceBias: clamp(o.silenceBias ?? 0.3, 0, 1),
    gazeTarget: GAZE_TARGET_SET.has(gazeTarget) ? gazeTarget : "terminal",
    causeIds: freezeCauseIds(o.causeIds),
  });
}

/** @param {unknown} signals @returns {number} */
function maxSignalPriority(signals) {
  if (!Array.isArray(signals) || signals.length === 0) return 0;
  let max = 0;
  for (const s of signals) {
    if (!s || typeof s !== "object") continue;
    const p = Number(/** @type {Record<string, unknown>} */ (s).priority);
    if (Number.isFinite(p) && p > max) max = p;
  }
  return max;
}

/** @param {unknown} sig @returns {string} */
function signalKind(sig) {
  if (!sig || typeof sig !== "object") return "";
  const k = /** @type {Record<string, unknown>} */ (sig).kind;
  return typeof k === "string" ? k.trim() : "";
}

/**
 * @param {unknown} sig
 * @returns {boolean}
 */
function isHighSeveritySignal(sig) {
  if (!sig || typeof sig !== "object") return false;
  const r = /** @type {Record<string, unknown>} */ (sig);
  const sev = r.severity;
  if (typeof sev === "string") {
    const t = sev.trim().toLowerCase();
    if (t === "high" || t === "critical" || t === "error" || t === "fatal")
      return true;
  }
  const p = Number(r.priority);
  return Number.isFinite(p) && p >= 3;
}

/** @param {unknown} signals @returns {boolean} */
function hasCelebrationSuccessSignal(signals) {
  if (!Array.isArray(signals)) return false;
  for (const s of signals) {
    const k = signalKind(s);
    if (k === "test.pass" || k === "build.success") return true;
    if (k === "host.says.final") return true;
  }
  return false;
}

/** @param {unknown} signals @param {number} [now] @returns {boolean} */
function hasRecoveringFailureSignal(signals, now = Date.now()) {
  if (!Array.isArray(signals)) return false;
  const freshCutoff = now - 5000;
  for (const s of signals) {
    const ts = Number(/** @type {Record<string,unknown>} */(s || {}).ts);
    if (Number.isFinite(ts) && ts < freshCutoff) continue;
    const k = signalKind(s);
    if (k === "test.fail" || k === "build.failure" || k === "tool.call.failure")
      return true;
  }
  return false;
}

/** @param {unknown} signals @param {number} apprRisk @returns {boolean} */
function hasGuardianTrigger(signals, apprRisk) {
  if (Number.isFinite(apprRisk) && apprRisk > 0.6) return true;
  if (!Array.isArray(signals)) return false;
  for (const s of signals) {
    const k = signalKind(s);
    if (k === "tool.permission.request") return true;
    if (k === "shell.destructive" || k === "shell.command.destructive")
      return true;
  }
  return false;
}

/** @param {unknown} signals @returns {boolean} */
function hasUserSubmitSignal(signals) {
  if (!Array.isArray(signals)) return false;
  return signals.some((s) => signalKind(s) === "user.submit");
}

/** @param {unknown} signals @returns {boolean} */
function hasLowPriorityGeneralOutput(signals) {
  if (!Array.isArray(signals) || signals.length === 0) return false;
  const maxP = maxSignalPriority(signals);
  if (maxP > 1) return false;
  const outputKinds = new Set([
    "unknown.stdout",
    "host.says.natural_text",
    "host.reasoning.stream",
  ]);
  return signals.some((s) => outputKinds.has(signalKind(s)));
}

/**
 * @param {{
 *   idleToReflectiveMs: number,
 *   celebrateMaxMs: number,
 *   recoveringMaxMs: number,
 *   guardianCooldownMs: number,
 * }} cfg
 * @param {{
 *   mode: string,
 *   stance: string,
 *   modeEnteredAt: number,
 *   previousMode: string,
 *   lastSpeakAt: number,
 *   lastActivityAt: number,
 * }} st
 * @param {*} mood
 * @param {*} host
 * @param {*} signals
 * @param {number} now
 */
function decideModeAndStance(cfg, st, mood, host, signals, now) {
  const appr = mood?.appraisal || {};
  const apprRisk = clamp(Number(appr.risk) || 0, 0, 1);

  const guardianNow = hasGuardianTrigger(signals, apprRisk);
  const recoveryFail = hasRecoveringFailureSignal(signals, now);
  const celebrateSig = hasCelebrationSuccessSignal(signals);

  /** @type {string} */
  let mode;
  /** @type {string} */
  let stance;

  if (guardianNow) {
    mode = "guardian";
    stance = "guard";
  } else if (recoveryFail) {
    mode = "recovering";
    stance = "repair";
  } else if (celebrateSig) {
    mode = "celebrating";
    stance = "celebrate";
  } else if (
    st.mode === "celebrating" &&
    now - st.modeEnteredAt < cfg.celebrateMaxMs
  ) {
    mode = "celebrating";
    stance = "celebrate";
  } else if (st.mode === "guardian" && !guardianNow) {
    const riskClear = apprRisk <= 0.6;
    const elapsed = now - st.modeEnteredAt;
    if (elapsed >= cfg.guardianCooldownMs && riskClear) {
      mode = normalizePresenceModeString(st.previousMode, "ambient");
      stance = "observe";
    } else {
      mode = "guardian";
      stance = "guard";
    }
  } else if (st.mode === "recovering") {
    const elapsed = now - st.modeEnteredAt;
    if (!recoveryFail && elapsed >= cfg.recoveringMaxMs) {
      mode = "focused";
      stance = "verify";
    } else {
      mode = "recovering";
      stance = "repair";
    }
  } else {
    const phase = typeof host?.taskPhase === "string" ? host.taskPhase : "";

    if (phase === "waiting_approval" || phase === "waiting_user") {
      mode = "attentive";
      stance = "ask";
    } else if (phase === "reasoning" || phase === "planning") {
      mode = "focused";
      stance = "think";
    } else if (phase === "tooling" || phase === "editing" || phase === "verifying") {
      mode = "focused";
      stance = "verify";
    } else if (phase === "responding") {
      mode = "engaged";
      stance = "report";
    } else if (phase === "recovering") {
      mode = "recovering";
      stance = "repair";
    } else if (host?.userIsTyping) {
      mode = "attentive";
      stance = "listen";
    } else if (hasUserSubmitSignal(signals)) {
      mode = "attentive";
      stance = "listen";
    } else if (now - st.lastActivityAt > cfg.idleToReflectiveMs) {
      mode = "reflective";
      stance = "remember";
    } else if (hasLowPriorityGeneralOutput(signals)) {
      mode = "peripheral";
      stance = "observe";
    } else {
      mode = "ambient";
      stance = "observe";
    }
  }

  return {
    mode: normalizePresenceModeString(mode, "ambient"),
    stance: normalizePresenceStanceString(stance, "observe"),
  };
}

/**
 * @param {unknown} host
 * @param {unknown} signals
 * @param {number} now
 * @param {number} prevLastActivityAt
 * @returns {number}
 */
function bumpLastActivityAt(host, signals, now, prevLastActivityAt) {
  let active =
    Boolean(host?.userIsTyping) ||
    Boolean(host?.toolActive) ||
    Boolean(host?.isCodeStreaming);

  const phase = typeof host?.taskPhase === "string" ? host.taskPhase : "";
  if (
    phase &&
    phase !== "idle" &&
    phase !== "reflective"
  )
    active = true;

  if (Array.isArray(signals) && signals.length > 0 && maxSignalPriority(signals) >= 1)
    active = true;

  if (hasUserSubmitSignal(signals)) active = true;

  return active ? now : prevLastActivityAt;
}

/** @param {unknown} signals @param {number} now @param {number} prev */
function bumpLastSpeakAt(signals, now, prev) {
  const speakKinds = new Set([
    "host.says.natural_text",
    "host.says.code",
    "host.says.plan",
    "host.says.final",
  ]);
  if (!Array.isArray(signals)) return prev;
  let hit = false;
  for (const s of signals) {
    if (speakKinds.has(signalKind(s))) {
      hit = true;
      break;
    }
  }
  return hit ? now : prev;
}

/**
 * @param {object} [config]
 * @returns {{
 *   update: (mood: unknown, host: unknown, mem: unknown, signals: unknown, now?: number) => Readonly<ReturnType<typeof createPresenceState>>,
 *   getState: () => Readonly<ReturnType<typeof createPresenceState>>,
 *   reset: () => void,
 * }}
 */
export function createPresenceScheduler(config = {}) {
  const cfgRaw = config && typeof config === "object" ? config : {};
  const cfg = {
    idleToReflectiveMs: Math.max(0, Number(cfgRaw.idleToReflectiveMs ?? 90_000) || 90_000),
    celebrateMaxMs: Math.max(0, Number(cfgRaw.celebrateMaxMs ?? 8000) || 8000),
    recoveringMaxMs: Math.max(0, Number(cfgRaw.recoveringMaxMs ?? 10_000) || 10_000),
    guardianCooldownMs: Math.max(0, Number(cfgRaw.guardianCooldownMs ?? 3000) || 3000),
  };

  /** @type {ReturnType<typeof createPresenceState>} */
  let state = createPresenceState();

  let modeEnteredAt = Date.now();
  let previousMode = "ambient";
  let lastSpeakAt = 0;
  let lastActivityAt = Date.now();

  function reset() {
    state = createPresenceState();
    const now = Date.now();
    modeEnteredAt = now;
    previousMode = "ambient";
    lastSpeakAt = 0;
    lastActivityAt = now;
  }

  function getState() {
    return state;
  }

  /**
   * @param {*} mood
   * @param {*} host
   * @param {*} mem
   * @param {*} signals
   * @param {number} [nowIn]
   */
  function update(mood, host, mem, signals, nowIn = Date.now()) {
    const now = Number(nowIn);
    const t = Number.isFinite(now) ? now : Date.now();

    const core = mood?.core || {};
    const appr = mood?.appraisal || {};
    const tend = mood?.tendency || {};
    const rhythm = mem?.rhythm || {};
    const sigs = Array.isArray(signals) ? signals : [];

    const celebrateSig = hasCelebrationSuccessSignal(sigs);
    const recoveryFail = hasRecoveringFailureSignal(sigs, t);

    lastActivityAt = bumpLastActivityAt(host, sigs, t, lastActivityAt);
    lastSpeakAt = bumpLastSpeakAt(sigs, t, lastSpeakAt);
    const msSinceSpeech = lastSpeakAt > 0 ? t - lastSpeakAt : Number.POSITIVE_INFINITY;

    const attention = clamp(
      0.35 * (Number(core.arousal) || 0) +
        0.2 * (Number(tend.investigate) || 0) +
        0.2 * (Number(tend.verify) || 0) +
        0.15 * (host?.toolActive ? 0.6 : 0.2) +
        0.1 * (maxSignalPriority(sigs) / 5),
      0,
      1,
    );

    const rhythmPref =
      typeof rhythm.preferredPresence === "string"
        ? rhythm.preferredPresence.trim().toLowerCase()
        : "";
    const rhythmTerm =
      rhythmPref === "minimal" ? 0.8 : rhythmPref === "balanced" ? 0.4 : 0.1;

    const silenceBias = clamp(
      0.3 * (host?.isCodeStreaming ? 0.9 : 0) +
        0.25 * (host?.userIsTyping ? 0.8 : 0) +
        0.2 * (host?.screenReaderMode ? 0.7 : 0) +
        0.15 * rhythmTerm +
        0.1 * (msSinceSpeech < 5000 ? 0.6 : 0),
      0,
      1,
    );

    const proximity = clamp(
      0.3 * (Number(tend.approach) || 0) +
        0.25 * (Number(tend.ask) || 0) +
        0.2 * (Number(tend.celebrate) || 0) +
        0.15 * (Number(appr.socialAlignment) || 0) -
        0.2 * (host?.isCodeStreaming ? 0.8 : 0) -
        0.15 * silenceBias,
      0,
      1,
    );

    const hostMode =
      typeof host?.mode === "string" ? host.mode.trim().toLowerCase() : "";
    const agency = clamp(
      0.3 * (Number(tend.repair) || 0) +
        0.25 * (Number(tend.guard) || 0) +
        0.2 * (Number(tend.verify) || 0) +
        0.15 * (Number(tend.ask) || 0) +
        0.1 * (hostMode === "full-auto" ? 0.5 : 0),
      0,
      1,
    );

    const interruptibility = clamp(
      0.7 -
        0.25 * (Number(core.arousal) || 0) -
        0.2 * (Number(tend.guard) || 0) -
        0.15 * agency +
        0.15 * (Number(tend.wait) || 0),
      0,
      1,
    );

    const prevMode = state.mode;
    const decided = decideModeAndStance(
      cfg,
      {
        mode: prevMode,
        stance: state.stance,
        modeEnteredAt,
        previousMode,
        lastSpeakAt,
        lastActivityAt,
      },
      mood,
      host,
      sigs,
      t,
    );

    let mode = decided.mode;
    let stance = decided.stance;

    if (mode === "celebrating" && t - modeEnteredAt >= cfg.celebrateMaxMs && !celebrateSig) {
      mode = "ambient";
      stance = "observe";
    }

    if (mode === "guardian" && prevMode !== "guardian") {
      previousMode = PRESENCE_MODE_SET.has(prevMode) ? prevMode : "ambient";
      modeEnteredAt = t;
    } else if (mode === "celebrating" && prevMode !== "celebrating") {
      modeEnteredAt = t;
    } else if (mode === "recovering" && prevMode !== "recovering") {
      modeEnteredAt = t;
    } else if (mode !== prevMode) {
      modeEnteredAt = t;
    }

    const gazeTarget = (() => {
      if (mode === "guardian") return "risk";
      if (mode === "recovering") return "tool";
      if (mode === "celebrating") return "user";
      if (mode === "reflective") return "memory";
      if (mode === "engaged") return "user";
      if (stance === "scan" || stance === "verify") return "tool";
      if (stance === "think") return "plan";
      if (stance === "listen" || stance === "ask") return "user";
      if (stance === "observe") return "host_output";
      return "terminal";
    })();

    const moodCauseIds = mood?.mood?.causeIds;
    const causeIds = freezeCauseIds(
      Array.isArray(moodCauseIds) ? moodCauseIds : state.causeIds,
    );

    state = createPresenceState({
      mode,
      stance,
      attention,
      proximity,
      agency,
      interruptibility,
      silenceBias,
      gazeTarget: normalizeGazeTargetString(gazeTarget, "terminal"),
      causeIds,
    });

    return state;
  }

  return {
    update,
    getState,
    reset,
  };
}

/**
 * @param {ReturnType<typeof createPresenceState>} presence
 * @returns {Readonly<{
 *   modeIcon: string,
 *   modeText: string,
 *   stanceIcon: string,
 *   stanceText: string,
 *   gazeIcon: string,
 *   gazeText: string,
 *   attentionPct: number,
 *   proximityPct: number,
 *   agencyPct: number,
 *   silenceText: string,
 * }>}
 */
export function derivePresenceVisual(presence) {
  const p = presence && typeof presence === "object" ? presence : createPresenceState();
  const mode = normalizePresenceModeString(p.mode, "ambient");
  const stance = normalizePresenceStanceString(p.stance, "observe");
  const gazeTarget = normalizeGazeTargetString(p.gazeTarget, "terminal");

  const modeIcon =
    {
      dormant: "◌",
      ambient: "○",
      peripheral: "◔",
      attentive: "◑",
      focused: "◉",
      engaged: "●",
      foreground: "◈",
      guardian: "⚡",
      recovering: "◐",
      celebrating: "✦",
      reflective: "◇",
    }[mode] || "○";

  const stanceIcon =
    {
      rest: "—",
      observe: "◦",
      listen: "◟",
      think: "◦",
      scan: "⊙",
      verify: "✓",
      repair: "↻",
      guard: "⊘",
      ask: "?",
      report: "▶",
      celebrate: "✧",
      remember: "◆",
    }[stance] || "◦";

  const gazeIcon =
    {
      user: "👤",
      host_output: "📺",
      tool: "🔧",
      memory: "💭",
      plan: "📋",
      risk: "⚠",
      terminal: "▪",
      none: "·",
    }[gazeTarget] || "▪";

  return Object.freeze({
    modeIcon,
    modeText: mode,
    stanceIcon,
    stanceText: stance,
    gazeIcon,
    gazeText: gazeTarget,
    attentionPct: Math.round((Number(p.attention) || 0) * 100),
    proximityPct: Math.round((Number(p.proximity) || 0) * 100),
    agencyPct: Math.round((Number(p.agency) || 0) * 100),
    silenceText: (Number(p.silenceBias) || 0) > 0.5 ? "quiet" : "open",
  });
}
