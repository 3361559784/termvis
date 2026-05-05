import { randomUUID } from "node:crypto";

/**
 * @param {number} n
 * @param {number} lo
 * @param {number} hi
 * @returns {number}
 */
export function clamp(n, lo, hi) {
  const x = Number(n);
  if (!Number.isFinite(x)) return lo;
  return Math.min(hi, Math.max(lo, x));
}

/** @param {number} n @returns {number} */
function clamp01(n) {
  return clamp(n, 0, 1);
}

/** @param {number} n @returns {number} */
function clampIntNonNeg(n) {
  const x = Math.trunc(Number(n));
  if (!Number.isFinite(x) || x < 0) return 0;
  return x;
}

/**
 * @template T
 * @param {T} v
 * @returns {T}
 */
function freezeDeep(v) {
  if (v === null || typeof v !== "object") return v;
  if (Array.isArray(v)) {
    for (let i = 0; i < v.length; i++) {
      const e = v[i];
      if (e && typeof e === "object") freezeDeep(e);
    }
    return Object.freeze(v);
  }
  for (const k of Object.keys(v)) {
    const val = /** @type {Record<string, unknown>} */ (v)[k];
    if (val && typeof val === "object") freezeDeep(val);
  }
  return Object.freeze(v);
}

export const UNIVERSAL_SIGNAL_KINDS = Object.freeze(
  /** @type {readonly string[]} */ ([
    "session.start",
    "session.resume",
    "session.end",
    "context.loaded",
    "context.compact.begin",
    "context.compact.end",
    "mode.switch",
    "agent.switch",
    "subagent.create",
    "subagent.start",
    "subagent.stop",
    "user.typing",
    "user.submit",
    "user.interrupt",
    "user.approve",
    "user.deny",
    "user.praise",
    "user.critique",
    "host.reasoning.begin",
    "host.reasoning.stream",
    "host.reasoning.end",
    "host.says.natural_text",
    "host.says.code",
    "host.says.plan",
    "host.says.final",
    "tool.batch.begin",
    "tool.batch.end",
    "tool.call.begin",
    "tool.call.progress",
    "tool.call.success",
    "tool.call.failure",
    "tool.call.retry",
    "tool.call.cancelled",
    "tool.permission.request",
    "tool.permission.granted",
    "tool.permission.denied",
    "file.read",
    "file.search",
    "file.write",
    "file.edit",
    "file.patch",
    "file.checkpoint",
    "file.restore",
    "shell.command.begin",
    "shell.command.success",
    "shell.command.failure",
    "shell.command.destructive",
    "test.begin",
    "test.pass",
    "test.fail",
    "build.begin",
    "build.success",
    "build.failure",
    "git.diff",
    "git.commit",
    "git.conflict",
    "web.search.begin",
    "web.search.result",
    "web.fetch.begin",
    "web.fetch.result",
    "mcp.server.connect",
    "mcp.server.disconnect",
    "mcp.tool.begin",
    "mcp.tool.success",
    "mcp.tool.failure",
    "rate_limit",
    "network.failure",
    "unknown.stdout",
  ]),
);

/** @type {ReadonlySet<string>} */
const SIGNAL_KIND_SET = new Set(UNIVERSAL_SIGNAL_KINDS);

export const MOOD_GROUPS = Object.freeze(
  /** @type {Readonly<Record<string, readonly string[]>>} */ ({
    ambient: Object.freeze([
      "calm",
      "quiet",
      "resting",
      "sleepy",
      "observant",
      "present",
      "soft",
      "reserved",
    ]),
    cognitive: Object.freeze([
      "attentive",
      "curious",
      "analytical",
      "focused",
      "absorbed",
      "puzzled",
      "uncertain",
      "reflective",
    ]),
    planning: Object.freeze([
      "organized",
      "prepared",
      "determined",
      "hopeful",
      "reorienting",
      "restrained",
      "delegating",
      "orchestrating",
    ]),
    success: Object.freeze([
      "content",
      "satisfied",
      "relieved",
      "proud",
      "delighted",
      "celebratory",
      "grateful",
      "playful",
    ]),
    risk: Object.freeze([
      "cautious",
      "guarded",
      "vigilant",
      "skeptical",
      "suspicious",
      "protective",
      "alarmed",
      "tense",
    ]),
    failure: Object.freeze([
      "concerned",
      "strained",
      "frustrated",
      "blocked",
      "disappointed",
      "weary",
      "overloaded",
      "recovering",
    ]),
    social: Object.freeze([
      "warm",
      "appreciative",
      "amused",
      "teasing",
      "supportive",
      "apologetic",
      "humbled",
      "contrite",
    ]),
    meta: Object.freeze([
      "familiar",
      "nostalgic",
      "melancholic",
      "ritual",
      "flowing",
      "drifting",
      "resetting",
      "integrating",
    ]),
  }),
);

export const MOOD_IDS = Object.freeze(
  /** @type {readonly string[]} */ (
    Object.freeze([
      ...MOOD_GROUPS.ambient,
      ...MOOD_GROUPS.cognitive,
      ...MOOD_GROUPS.planning,
      ...MOOD_GROUPS.success,
      ...MOOD_GROUPS.risk,
      ...MOOD_GROUPS.failure,
      ...MOOD_GROUPS.social,
      ...MOOD_GROUPS.meta,
    ])
  ),
);

/** @type {ReadonlySet<string>} */
const MOOD_ID_SET = new Set(MOOD_IDS);

/** @param {unknown} s @returns {string} */
function normalizeSignalKind(s) {
  if (typeof s !== "string" || !SIGNAL_KIND_SET.has(s)) return "unknown.stdout";
  return s;
}

/** @param {unknown} s @param {string} fallback @returns {string} */
function normalizeMoodId(s, fallback = "calm") {
  if (typeof s !== "string" || !MOOD_ID_SET.has(s)) return fallback;
  return s;
}

/** @param {unknown} s @returns {string | null} */
function normalizeSecondaryMood(s) {
  if (s === null || s === undefined) return null;
  if (typeof s !== "string") return null;
  const t = s.trim();
  if (!t) return null;
  return MOOD_ID_SET.has(t) ? t : null;
}

const EPISODE_PHASES = /** @type {const} */ ([
  "onset",
  "rise",
  "sustain",
  "decay",
  "recovery",
]);

/** @param {unknown} s @returns {"onset"|"rise"|"sustain"|"decay"|"recovery"} */
function normalizeEpisodePhase(s) {
  if (typeof s === "string" && EPISODE_PHASES.includes(/** @type {*} */ (s)))
    return /** @type {"onset"|"rise"|"sustain"|"decay"|"recovery"} */ (s);
  return "onset";
}

const SAY_CHANNELS = /** @type {const} */ (["silent", "aside", "status", "main"]);

/** @param {unknown} s @returns {"silent"|"aside"|"status"|"main"} */
function normalizeSayChannel(s) {
  if (typeof s === "string" && SAY_CHANNELS.includes(/** @type {*} */ (s)))
    return /** @type {"silent"|"aside"|"status"|"main"} */ (s);
  return "silent";
}

const TASK_PHASES = /** @type {const} */ ([
  "idle",
  "planning",
  "executing",
  "verifying",
  "recovering",
  "closing",
]);

/** @param {unknown} s @returns {typeof TASK_PHASES[number]} */
function normalizeTaskPhase(s) {
  if (typeof s === "string" && TASK_PHASES.includes(/** @type {*} */ (s)))
    return /** @type {typeof TASK_PHASES[number]} */ (s);
  return "idle";
}

/** @param {Record<string, unknown> | null | undefined} o @returns {Readonly<Record<string, unknown>>} */
function clampPartialCore(o) {
  if (!o || typeof o !== "object") return Object.freeze({});
  /** @type {Record<string, number>} */
  const out = {};
  if ("valence" in o) out.valence = clamp(/** @type {*} */ (o).valence, -1, 1);
  if ("arousal" in o) out.arousal = clamp01(/** @type {*} */ (o).arousal);
  if ("dominance" in o) out.dominance = clamp01(/** @type {*} */ (o).dominance);
  return Object.freeze(out);
}

/** @type {(keyof AppraisalDims)[]} */
const APPRAISAL_KEYS = [
  "novelty",
  "expectedness",
  "goalProgress",
  "goalBlockage",
  "uncertainty",
  "risk",
  "controllability",
  "competence",
  "effort",
  "socialAlignment",
  "autonomyPressure",
  "interruption",
  "ambiguity",
];

/**
 * @typedef {object} AppraisalDims
 * @property {number} novelty
 * @property {number} expectedness
 * @property {number} goalProgress
 * @property {number} goalBlockage
 * @property {number} uncertainty
 * @property {number} risk
 * @property {number} controllability
 * @property {number} competence
 * @property {number} effort
 * @property {number} socialAlignment
 * @property {number} autonomyPressure
 * @property {number} interruption
 * @property {number} ambiguity
 */

/** @param {Record<string, unknown> | null | undefined} o @returns {Readonly<Partial<AppraisalDims>>} */
function clampPartialAppraisal(o) {
  if (!o || typeof o !== "object") return Object.freeze({});
  /** @type {Partial<AppraisalDims>} */
  const out = {};
  for (const k of APPRAISAL_KEYS) {
    if (k in o) /** @type {*} */ (out)[k] = clamp01(/** @type {*} */ (o)[k]);
  }
  return Object.freeze(out);
}

/** @type {(keyof ActionTendencyDims)[]} */
const TENDENCY_KEYS = [
  "approach",
  "investigate",
  "verify",
  "repair",
  "ask",
  "wait",
  "guard",
  "celebrate",
];

/**
 * @typedef {object} ActionTendencyDims
 * @property {number} approach
 * @property {number} investigate
 * @property {number} verify
 * @property {number} repair
 * @property {number} ask
 * @property {number} wait
 * @property {number} guard
 * @property {number} celebrate
 */

/** @param {Record<string, unknown> | null | undefined} o @returns {Readonly<Partial<ActionTendencyDims>>} */
function clampPartialTendency(o) {
  if (!o || typeof o !== "object") return Object.freeze({});
  /** @type {Partial<ActionTendencyDims>} */
  const out = {};
  for (const k of TENDENCY_KEYS) {
    if (k in o) /** @type {*} */ (out)[k] = clamp01(/** @type {*} */ (o)[k]);
  }
  return Object.freeze(out);
}

/**
 * @typedef {object} CoreAffect
 * @property {number} valence
 * @property {number} arousal
 * @property {number} dominance
 */

/**
 * @param {Partial<{ valence: number, arousal: number, dominance: number }>} [overrides]
 * @returns {Readonly<CoreAffect>}
 */
export function createCoreAffect(overrides = {}) {
  return Object.freeze({
    valence: clamp(overrides.valence ?? 0.3, -1, 1),
    arousal: clamp01(overrides.arousal ?? 0.2),
    dominance: clamp01(overrides.dominance ?? 0.45),
  });
}

/**
 * @param {Partial<AppraisalDims>} [overrides]
 * @returns {Readonly<AppraisalDims>}
 */
export function createAppraisal(overrides = {}) {
  /** @type {AppraisalDims} */
  const base = {
    novelty: 0,
    expectedness: 0,
    goalProgress: 0,
    goalBlockage: 0,
    uncertainty: 0,
    risk: 0,
    controllability: 0,
    competence: 0,
    effort: 0,
    socialAlignment: 0,
    autonomyPressure: 0,
    interruption: 0,
    ambiguity: 0,
  };
  for (const k of APPRAISAL_KEYS) {
    if (k in overrides) base[k] = clamp01(/** @type {*} */ (overrides)[k]);
  }
  return Object.freeze(base);
}

/**
 * @param {Partial<ActionTendencyDims>} [overrides]
 * @returns {Readonly<ActionTendencyDims>}
 */
export function createActionTendency(overrides = {}) {
  /** @type {ActionTendencyDims} */
  const base = {
    approach: 0,
    investigate: 0,
    verify: 0,
    repair: 0,
    ask: 0,
    wait: 0,
    guard: 0,
    celebrate: 0,
  };
  for (const k of TENDENCY_KEYS) {
    if (k in overrides) base[k] = clamp01(/** @type {*} */ (overrides)[k]);
  }
  return Object.freeze(base);
}

/**
 * @param {Partial<{ primary: string, secondary: string | null, intensity: number, stability: number, causeIds: string[], confidence: number }>} [overrides]
 * @returns {Readonly<{ primary: string, secondary: string | null, intensity: number, stability: number, causeIds: readonly string[], confidence: number }>}
 */
export function createVisibleMood(overrides = {}) {
  const primary = normalizeMoodId(overrides.primary, "calm");
  const secondary = normalizeSecondaryMood(overrides.secondary);
  const causeIds = Array.isArray(overrides.causeIds)
    ? overrides.causeIds.map((x) => (typeof x === "string" ? x : String(x)))
    : [];
  return freezeDeep({
    primary,
    secondary,
    intensity: clamp01(overrides.intensity ?? 0.5),
    stability: clamp01(overrides.stability ?? 0.8),
    causeIds,
    confidence: clamp01(overrides.confidence ?? 0.8),
  });
}

/**
 * @param {object} [overrides]
 * @returns {Readonly<{ core: Readonly<CoreAffect>, appraisal: Readonly<AppraisalDims>, tendency: Readonly<ActionTendencyDims>, mood: ReturnType<typeof createVisibleMood> }>}
 */
export function createMoodFrame(overrides = {}) {
  const o = /** @type {{ core?: object, appraisal?: object, tendency?: object, mood?: object }} */ (
    overrides
  );
  return freezeDeep({
    core: createCoreAffect(/** @type {*} */ (o.core) ?? {}),
    appraisal: createAppraisal(/** @type {*} */ (o.appraisal) ?? {}),
    tendency: createActionTendency(/** @type {*} */ (o.tendency) ?? {}),
    mood: createVisibleMood(/** @type {*} */ (o.mood) ?? {}),
  });
}

/**
 * @param {object} [overrides]
 * @returns {Readonly<{
 *   eventId: string,
 *   kind: string,
 *   priority: number,
 *   reliability: number,
 *   semanticConfidence: number,
 *   ttlMs: number,
 *   coreDelta: Readonly<Partial<CoreAffect>>,
 *   appraisalDelta: Readonly<Partial<AppraisalDims>>,
 *   tendencyDelta: Readonly<Partial<ActionTendencyDims>>,
 *   tags: readonly string[],
 *   cause: string,
 * }>}
 */
export function createMoodImpulse(overrides = {}) {
  const o = /** @type {Record<string, unknown>} */ (overrides);
  const tags = Array.isArray(o.tags)
    ? o.tags.map((x) => (typeof x === "string" ? x : String(x)))
    : [];
  const kind =
    "kind" in o && typeof o.kind === "string"
      ? normalizeSignalKind(o.kind)
      : "unknown.stdout";
  const eventId = typeof o.eventId === "string" && o.eventId ? o.eventId : randomUUID();
  const cause = typeof o.cause === "string" ? o.cause : "";
  return freezeDeep({
    eventId,
    kind,
    priority: clamp01(o.priority ?? 0),
    reliability: clamp01(o.reliability ?? 1),
    semanticConfidence: clamp01(o.semanticConfidence ?? 0),
    ttlMs: Math.max(0, Number(o.ttlMs ?? 10_000) || 10_000),
    coreDelta: clampPartialCore(
      /** @type {Record<string, unknown>} */ (o.coreDelta),
    ),
    appraisalDelta: clampPartialAppraisal(
      /** @type {Record<string, unknown>} */ (o.appraisalDelta),
    ),
    tendencyDelta: clampPartialTendency(
      /** @type {Record<string, unknown>} */ (o.tendencyDelta),
    ),
    tags,
    cause,
  });
}

/**
 * @param {unknown} rows
 * @returns {ReadonlyArray<{ mood: string, weight: number, reason: string }>}
 */
function normalizeMoodCandidates(rows) {
  if (!Array.isArray(rows)) return Object.freeze([]);
  const out = rows.map((row) => {
    if (!row || typeof row !== "object")
      return { mood: "calm", weight: 0, reason: "" };
    const r = /** @type {Record<string, unknown>} */ (row);
    const mood = normalizeMoodId(r.mood, "calm");
    const weight = clamp01(r.weight ?? 0);
    const reason = typeof r.reason === "string" ? r.reason : "";
    return Object.freeze({ mood, weight, reason });
  });
  return Object.freeze(out);
}

/**
 * @param {object} [pol]
 * @returns {Readonly<{ shouldSpeak: boolean, channel: "silent"|"aside"|"status"|"main", brevity: string, tone: string }>}
 */
function normalizeSayPolicy(pol) {
  if (!pol || typeof pol !== "object") {
    return Object.freeze({
      shouldSpeak: false,
      channel: /** @type {"silent"} */ ("silent"),
      brevity: "none",
      tone: "plain",
    });
  }
  const p = /** @type {Record<string, unknown>} */ (pol);
  const shouldSpeak = Boolean(p.shouldSpeak);
  const channel = normalizeSayChannel(p.channel);
  const brevity = typeof p.brevity === "string" && p.brevity ? p.brevity : "none";
  const tone = typeof p.tone === "string" && p.tone ? p.tone : "plain";
  return Object.freeze({ shouldSpeak, channel, brevity, tone });
}

/**
 * @param {object} [s]
 * @returns {Readonly<{ factualBasis: readonly string[], uncertainty: number, hallucinationRisk: number, permissionSensitivity: number }>}
 */
function normalizeSafety(s) {
  if (!s || typeof s !== "object") {
    return Object.freeze({
      factualBasis: Object.freeze([]),
      uncertainty: 0,
      hallucinationRisk: 0,
      permissionSensitivity: 0,
    });
  }
  const x = /** @type {Record<string, unknown>} */ (s);
  const fb = Array.isArray(x.factualBasis)
    ? x.factualBasis.map((t) => (typeof t === "string" ? t : String(t)))
    : [];
  return Object.freeze({
    factualBasis: Object.freeze(fb),
    uncertainty: clamp01(x.uncertainty ?? 0),
    hallucinationRisk: clamp01(x.hallucinationRisk ?? 0),
    permissionSensitivity: clamp01(x.permissionSensitivity ?? 0),
  });
}

/**
 * @param {object} [overrides]
 * @returns {Readonly<{
 *   anchorId: string,
 *   sourceEventIds: readonly string[],
 *   semanticSummary: string,
 *   appraisalTarget: Readonly<Partial<AppraisalDims>>,
 *   coreTarget: Readonly<Partial<CoreAffect>>,
 *   tendencyTarget: Readonly<Partial<ActionTendencyDims>>,
 *   moodCandidates: ReadonlyArray<{ mood: string, weight: number, reason: string }>,
 *   sayPolicy: ReturnType<typeof normalizeSayPolicy>,
 *   safety: ReturnType<typeof normalizeSafety>,
 *   confidence: number,
 *   ttlMs: number,
 *   createdAt: number,
 * }>}
 */
export function createMoodAnchor(overrides = {}) {
  const o = /** @type {Record<string, unknown>} */ (overrides);
  const anchorId =
    typeof o.anchorId === "string" && o.anchorId ? o.anchorId : randomUUID();
  const sourceEventIds = Array.isArray(o.sourceEventIds)
    ? o.sourceEventIds.map((x) => (typeof x === "string" ? x : String(x)))
    : [];
  const semanticSummary =
    typeof o.semanticSummary === "string" ? o.semanticSummary : "";
  return freezeDeep({
    anchorId,
    sourceEventIds,
    semanticSummary,
    appraisalTarget: clampPartialAppraisal(
      /** @type {Record<string, unknown>} */ (o.appraisalTarget),
    ),
    coreTarget: clampPartialCore(
      /** @type {Record<string, unknown>} */ (o.coreTarget),
    ),
    tendencyTarget: clampPartialTendency(
      /** @type {Record<string, unknown>} */ (o.tendencyTarget),
    ),
    moodCandidates: normalizeMoodCandidates(o.moodCandidates),
    sayPolicy: normalizeSayPolicy(
      /** @type {Record<string, unknown>} */ (o.sayPolicy),
    ),
    safety: normalizeSafety(/** @type {Record<string, unknown>} */ (o.safety)),
    confidence: clamp01(o.confidence ?? 0.5),
    ttlMs: Math.max(0, Number(o.ttlMs ?? 30_000) || 30_000),
    createdAt: Number.isFinite(Number(o.createdAt))
      ? Number(o.createdAt)
      : Date.now(),
  });
}

/**
 * @param {Partial<{ frustrationDebt: number, fatigueDebt: number, trustDebt: number, uncertaintyDebt: number, socialDebt: number }>} [overrides]
 * @returns {Readonly<{ frustrationDebt: number, fatigueDebt: number, trustDebt: number, uncertaintyDebt: number, socialDebt: number }>}
 */
export function createMoodDebt(overrides = {}) {
  return Object.freeze({
    frustrationDebt: clamp01(overrides.frustrationDebt ?? 0),
    fatigueDebt: clamp01(overrides.fatigueDebt ?? 0),
    trustDebt: clamp01(overrides.trustDebt ?? 0),
    uncertaintyDebt: clamp01(overrides.uncertaintyDebt ?? 0),
    socialDebt: clamp01(overrides.socialDebt ?? 0),
  });
}

/**
 * @param {Partial<{ moodId: string, phase: string, startedAt: number, phaseStartedAt: number, causeIds: string[], peakIntensity: number }>} [overrides]
 * @returns {Readonly<{
 *   moodId: string,
 *   phase: "onset"|"rise"|"sustain"|"decay"|"recovery",
 *   startedAt: number,
 *   phaseStartedAt: number,
 *   causeIds: readonly string[],
 *   peakIntensity: number,
 * }>}
 */
export function createMoodEpisode(overrides = {}) {
  const causeIds = Array.isArray(overrides.causeIds)
    ? overrides.causeIds.map((x) => (typeof x === "string" ? x : String(x)))
    : [];
  const now = Date.now();
  return freezeDeep({
    moodId: normalizeMoodId(overrides.moodId, "calm"),
    phase: normalizeEpisodePhase(overrides.phase),
    startedAt: Number.isFinite(Number(overrides.startedAt))
      ? Number(overrides.startedAt)
      : now,
    phaseStartedAt: Number.isFinite(Number(overrides.phaseStartedAt))
      ? Number(overrides.phaseStartedAt)
      : now,
    causeIds,
    peakIntensity: clamp01(overrides.peakIntensity ?? 0.5),
  });
}

/**
 * @param {Record<string, unknown> | null | undefined} ctxIn
 * @returns {Readonly<{
 *   mode: string | undefined,
 *   agent: string | undefined,
 *   toolName: string | undefined,
 *   risk: number,
 *   urgency: number,
 *   taskPhase: ReturnType<typeof normalizeTaskPhase>,
 *   recentFailures: number,
 *   recentSuccesses: number,
 * }>}
 */
function normalizeSemanticContext(ctxIn) {
  if (!ctxIn || typeof ctxIn !== "object") {
    return Object.freeze({
      mode: undefined,
      agent: undefined,
      toolName: undefined,
      risk: 0,
      urgency: 0,
      taskPhase: /** @type {"idle"} */ ("idle"),
      recentFailures: 0,
      recentSuccesses: 0,
    });
  }
  const c = /** @type {Record<string, unknown>} */ (ctxIn);
  const mode =
    c.mode === undefined || c.mode === null
      ? undefined
      : typeof c.mode === "string"
        ? c.mode
        : String(c.mode);
  const agent =
    c.agent === undefined || c.agent === null
      ? undefined
      : typeof c.agent === "string"
        ? c.agent
        : String(c.agent);
  const toolName =
    c.toolName === undefined || c.toolName === null
      ? undefined
      : typeof c.toolName === "string"
        ? c.toolName
        : String(c.toolName);
  return Object.freeze({
    mode,
    agent,
    toolName,
    risk: clamp01(c.risk ?? 0),
    urgency: clamp01(c.urgency ?? 0),
    taskPhase: normalizeTaskPhase(c.taskPhase),
    recentFailures: clampIntNonNeg(c.recentFailures ?? 0),
    recentSuccesses: clampIntNonNeg(c.recentSuccesses ?? 0),
  });
}

/**
 * @param {object} [overrides]
 * @returns {Readonly<{
 *   id: string,
 *   host: string,
 *   timestamp: number,
 *   segmentKind: string,
 *   text: string,
 *   redactedText: string,
 *   context: ReturnType<typeof normalizeSemanticContext>,
 *   embedding: null | readonly number[],
 *   nearestMoodPrototypes: readonly unknown[] | null,
 *   nearestMemories: readonly unknown[] | null,
 * }>}
 */
export function createSemanticPacket(overrides = {}) {
  const o = /** @type {Record<string, unknown>} */ (overrides);
  const id = typeof o.id === "string" && o.id ? o.id : randomUUID();
  const host = typeof o.host === "string" && o.host ? o.host : "unknown";
  const timestamp = Number.isFinite(Number(o.timestamp))
    ? Number(o.timestamp)
    : Date.now();
  const segmentKind =
    typeof o.segmentKind === "string" && o.segmentKind
      ? o.segmentKind
      : "natural_response";
  const text = typeof o.text === "string" ? o.text : "";
  const redactedText =
    typeof o.redactedText === "string" ? o.redactedText : "";

  let embedding = null;
  if (Array.isArray(o.embedding)) {
    const nums = o.embedding.map((v) => {
      const x = Number(v);
      return Number.isFinite(x) ? x : 0;
    });
    embedding = Object.freeze(nums);
  }

  let nearestMoodPrototypes = null;
  if (Array.isArray(o.nearestMoodPrototypes))
    nearestMoodPrototypes = freezeDeep([...o.nearestMoodPrototypes]);

  let nearestMemories = null;
  if (Array.isArray(o.nearestMemories))
    nearestMemories = freezeDeep([...o.nearestMemories]);

  const context = normalizeSemanticContext(
    /** @type {Record<string, unknown>} */ (o.context),
  );

  return freezeDeep({
    id,
    host,
    timestamp,
    segmentKind,
    text,
    redactedText,
    context,
    embedding,
    nearestMoodPrototypes,
    nearestMemories,
  });
}
