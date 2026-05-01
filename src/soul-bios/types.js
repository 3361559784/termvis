/**
 * Soul-bios core data models — frozen factory objects with defaults.
 */

import { randomUUID } from "node:crypto";

/**
 * @param {number} n
 * @param {number} lo
 * @param {number} hi
 */
export function clamp(n, lo, hi) {
  return Math.min(hi, Math.max(lo, n));
}

/** @typedef {"user.input"|"host.lifecycle"|"tool.output"|"file.change"|"telemetry"|"memory"} SignalSource */
/** @typedef {string} MoodTag */

/**
 * @param {Record<string, unknown>} overrides
 */
export function createSignalEvent(overrides = {}) {
  const ts = overrides.ts instanceof Date ? overrides.ts.toISOString() : (overrides.ts ?? new Date().toISOString());
  /** @type {SignalSource|string} */
  const source =
    overrides.source ??
    /** @type {SignalSource|string} */ ("telemetry");
  const obj = Object.freeze({
    id: overrides.id ?? randomUUID(),
    schemaVersion: overrides.schemaVersion ?? "1.0.0",
    ts,
    source,
    kind: overrides.kind ?? "unknown.signal",
    priority: clamp(Number(overrides.priority ?? 0), 0, 5),
    reliability: clamp(Number(overrides.reliability ?? 1), 0, 1),
    ...(overrides.ttlMs != null ? { ttlMs: Number(overrides.ttlMs) } : {}),
    payload:
      overrides.payload != null && typeof overrides.payload === "object" ? Object.freeze({ ...overrides.payload }) : Object.freeze({})
  });
  return obj;
}

/**
 * Maps SoulBiosCaps-ish input into frozen HostContext (accepts stray keys from caps).
 * @param {Record<string, unknown>} overrides
 */
export function createHostContext(overrides = {}) {
  const ttyCapsRaw = overrides.ttyCaps ?? overrides.tty ?? {};
  const tc = ttyCapsRaw && typeof ttyCapsRaw === "object" ? ttyCapsRaw : {};
  const obj = Object.freeze({
    host: normalizeHostEnum(overrides.host ?? overrides.hostId),
    mode: normalizeHostModeEnum(overrides.mode),
    approvalState: normalizeApprovalEnum(overrides.approvalState),
    sandbox: normalizeSandboxEnum(overrides.sandbox),
    ttyCaps: Object.freeze({
      cols: clamp(Number(tc.cols ?? 80), 1, 9999),
      rows: clamp(Number(tc.rows ?? 24), 1, 9999),
      colorDepth: normalizeColorDepth(tc.colorDepth ?? 1),
      pixelProtocol: normalizePixelProtocol(tc.pixelProtocol ?? "none")
    })
  });
  return obj;
}

/**
 * @param {Record<string, unknown>} overrides
 */
export function createPresenceState(overrides = {}) {
  const obj = Object.freeze({
    mode: normalizePresenceMode(overrides.mode),
    attention: clamp(Number(overrides.attention ?? 0.5), 0, 1),
    foreground: Boolean(overrides.foreground ?? false),
    silenceBudgetMs: Number(overrides.silenceBudgetMs ?? 30000),
    userConsentLevel: normalizeConsent(overrides.userConsentLevel),
    inactiveStreakMs: clamp(Number(overrides.inactiveStreakMs ?? 0), 0, Number.MAX_SAFE_INTEGER)
  });
  return obj;
}

/**
 * @param {Record<string, unknown>} overrides
 */
export function createMoodState(overrides = {}) {
  const tags = normalizeMoodTags(overrides.tags);
  const obj = Object.freeze({
    valence: clamp(Number(overrides.valence ?? 0.3), -1, 1),
    arousal: clamp(Number(overrides.arousal ?? 0.2), 0, 1),
    dominance: clamp(Number(overrides.dominance ?? 0.45), 0, 1),
    tags,
    confidence: clamp(Number(overrides.confidence ?? 0.8), 0, 1)
  });
  return obj;
}

/**
 * @param {Record<string, unknown>} overrides
 */
export function createPulseState(overrides = {}) {
  const explicitPulse =
    overrides.heartbeatBpm != null ||
    overrides.breathMs != null ||
    overrides.blinkMs != null ||
    overrides.microMotion != null;
  if (
    !explicitPulse &&
    (overrides.arousal != null ||
      overrides.tags !== undefined)
  ) {
    return createPulseFromArousal({
      arousal: overrides.arousal ?? 0,
      tags: Array.isArray(overrides.tags) ? overrides.tags : []
    });
  }
  const obj = Object.freeze({
    heartbeatBpm: clamp(Number(overrides.heartbeatBpm ?? 72), 58, 96),
    breathMs: clamp(Number(overrides.breathMs ?? 4000), 2600, 4800),
    blinkMs: clamp(Number(overrides.blinkMs ?? 3200), 1800, 4200),
    microMotion: clamp(Number(overrides.microMotion ?? 0.3), 0.1, 0.7)
  });
  return obj;
}

/**
 * @param {number} heartbeatBpm
 * @param {number} breathMs
 * @param {number} blinkMs
 * @param {number} microMotion
 * @returns {ReturnType<typeof createPulseState>}
 */
function buildPulseFreeze({ heartbeatBpm, breathMs, blinkMs, microMotion }) {
  return createPulseState({
    heartbeatBpm: clamp(Math.round(heartbeatBpm), 58, 96),
    breathMs: clamp(Math.round(breathMs), 2600, 4800),
    blinkMs: clamp(Math.round(blinkMs), 1800, 4200),
    microMotion: clamp(Math.round(microMotion * 100) / 100, 0.1, 0.7)
  });
}

/** @param {{ arousal?: number; tags?: string[] }} mood */
export function createPulseFromArousal(mood = {}) {
  const arousal = clamp(Number(mood.arousal ?? 0), 0, 1);
  const tags = mood.tags ?? [];
  const focusBoost = Array.isArray(tags) && tags.includes("focused") ? 8 : 0;
  const heartbeatBpm = 58 + arousal * 28 + focusBoost;
  const breathMs = 4800 - arousal * 2200;
  const arousalBlink = arousal > 0.5 ? 800 : 0;
  const blinkJitter = Math.random() * 400 - 200;
  const blinkMs = 3200 - arousalBlink + blinkJitter;
  const microMotion = 0.1 + arousal * 0.6;
  return buildPulseFreeze({ heartbeatBpm, breathMs, blinkMs, microMotion });
}

/**
 * @param {Record<string, unknown>} overrides
 */
export function createExpressionState(overrides = {}) {
  const obj = Object.freeze({
    face: normalizeFace(overrides.face),
    gesture: normalizeGesture(overrides.gesture),
    frameset: String(overrides.frameset ?? "default"),
    intensity: /** @type {0|1|2|3} */ (clamp(Number(overrides.intensity ?? 1), 0, 3))
  });
  return obj;
}

/**
 * @param {Record<string, unknown>} overrides
 */
export function createSaysState(overrides = {}) {
  const base = {
    main: String(overrides.main ?? ""),
    tone: normalizeSaysTone(overrides.tone),
    speechAct: normalizeSpeechActSays(overrides.speechAct)
  };
  const obj =
    overrides.aside !== undefined
      ? Object.freeze({ ...base, aside: String(overrides.aside) })
      : Object.freeze(base);
  return obj;
}

/**
 * @param {Record<string, unknown>} overrides
 */
export function createProvenance(overrides = {}) {
  const obj = Object.freeze({
    signalRefs: Object.freeze(Array.isArray(overrides.signalRefs) ? [...overrides.signalRefs.map(String)] : []),
    memoryRefs: Object.freeze(Array.isArray(overrides.memoryRefs) ? [...overrides.memoryRefs.map(String)] : []),
    ruleRefs: Object.freeze(Array.isArray(overrides.ruleRefs) ? [...overrides.ruleRefs.map(String)] : []),
    ...(overrides.llmRunId !== undefined ? { llmRunId: String(overrides.llmRunId) } : {}),
    consistencyScore: clamp(Number(overrides.consistencyScore ?? 1), 0, 1)
  });
  return obj;
}

/**
 * @param {Record<string, unknown>} overrides
 */
export function createSoulFrame(overrides = {}) {
  const mood = createMoodState(/** @type {Record<string, unknown>} */ (overrides.mood ?? {}));
  const pulse =
    overrides.pulse != null
      ? createPulseState(/** @type {Record<string, unknown>} */ (overrides.pulse))
      : createPulseFromArousal(mood);

  const saysRaw = overrides.says;
  const says =
    saysRaw !== undefined ? createSaysState(/** @type {Record<string, unknown>} */ (saysRaw ?? {})) : undefined;

  const obj = Object.freeze({
    schemaVersion: overrides.schemaVersion ?? "1.0.0",
    entityVersion: Math.max(1, Math.floor(Number(overrides.entityVersion ?? 1))),
    frameId: overrides.frameId ?? randomUUID(),
    sessionId: String(overrides.sessionId ?? ""),
    ts:
      overrides.ts instanceof Date
        ? overrides.ts.toISOString()
        : overrides.ts != null
          ? String(overrides.ts)
          : new Date().toISOString(),
    host: createHostContext(/** @type {Record<string, unknown>} */ (overrides.host ?? {})),
    presence: createPresenceState(/** @type {Record<string, unknown>} */ (overrides.presence ?? {})),
    mood,
    pulse,
    expression: createExpressionState(/** @type {Record<string, unknown>} */ (overrides.expression ?? {})),
    ...(says !== undefined ? { says } : {}),
    provenance: createProvenance(/** @type {Record<string, unknown>} */ (overrides.provenance ?? {}))
  });
  return obj;
}

/**
 * @param {Record<string, unknown>} overrides
 */
export function createSoulBiosCaps(overrides = {}) {
  const tty = overrides.tty != null && typeof overrides.tty === "object" ? overrides.tty : {};
  /** @typedef {"stdio"|"uds"|"named-pipe"|"http"} BiosTransport */
  const transport = normalizeTransportEnum(overrides.transport);
  const proto = tty.pixelProtocol != null ? normalizePixelProtocol(tty.pixelProtocol) : normalizePixelProtocol("none");

  const obj = Object.freeze({
    hostId: String(overrides.hostId ?? "generic"),
    transport,
    supportsMcp: Boolean(overrides.supportsMcp ?? false),
    supportsHooks: Boolean(overrides.supportsHooks ?? false),
    supportsPlugins: Boolean(overrides.supportsPlugins ?? false),
    tty: Object.freeze({
      isTTY: Boolean(overrides.tty?.isTTY ?? overrides.isTTY ?? false),
      cols: clamp(Number(tty.cols ?? 80), 1, 9999),
      rows: clamp(Number(tty.rows ?? 24), 1, 9999),
      colorDepth: normalizeColorDepth(tty.colorDepth ?? 1),
      pixelProtocol: proto
    })
  });
  return obj;
}

/**
 * @param {Record<string, unknown>} overrides
 */
export function createIntentPlan(overrides = {}) {
  const rhRaw = overrides.renderHints != null ? overrides.renderHints : {};
  /** @type {Record<string, unknown>} */
  const rh = rhRaw != null && typeof rhRaw === "object" ? { ...rhRaw } : {};

  const obj = Object.freeze({
    shouldSpeak: Boolean(overrides.shouldSpeak),
    speakPriority: clamp(Number(overrides.speakPriority ?? 0), 0, 5),
    speechAct: normalizeSpeechActIntent(overrides.speechAct),
    useMemoryRefs: Object.freeze(
      Array.isArray(overrides.useMemoryRefs) ? [...overrides.useMemoryRefs.map(String)] : []
    ),
    targetTokens: Math.max(0, Math.floor(Number(overrides.targetTokens ?? 0))),
    renderHints: Object.freeze({
      expression:
        rh.expression != null
          ? /** @type {ReturnType<typeof createExpressionState>["face"]} */ (normalizeFace(rh.expression))
          : "idle",
      intensity: /** @type {0|1|2|3} */ (clamp(Number(rh.intensity ?? 1), 0, 3)),
      pulseBias: clamp(Number(rh.pulseBias ?? 0), -1, 1),
      ...(rh.mood && typeof rh.mood === "object"
        ? { mood: createMoodState(/** @type {Record<string, unknown>} */ (rh.mood)) }
        : {}),
      ...(rh.pulse && typeof rh.pulse === "object"
        ? { pulse: createPulseState(/** @type {Record<string, unknown>} */ (rh.pulse)) }
        : {}),
      ...(rh.presence && typeof rh.presence === "object"
        ? { presence: createPresenceState(/** @type {Record<string, unknown>} */ (rh.presence)) }
        : {}),
      ...(rh.host && typeof rh.host === "object"
        ? { host: createHostContext(/** @type {Record<string, unknown>} */ (rh.host)) }
        : {})
    })
  });
  return obj;
}

function normalizeHostEnum(v) {
  const s = String(v ?? "generic").toLowerCase();
  return /** @type {const} */ (
    ["codex", "claude-code", "opencode", "generic"].includes(s) ? s : "generic"
  );
}

function normalizeHostModeEnum(v) {
  const s = String(v ?? "unspecified").toLowerCase();
  return /** @type {const} */ (["plan", "build", "chat", "review", "unspecified"].includes(s) ? s : "unspecified");
}

function normalizeApprovalEnum(v) {
  const s = String(v ?? "free").toLowerCase();
  return /** @type {const} */ (["free", "pending", "restricted"].includes(s) ? s : "free");
}

function normalizeSandboxEnum(v) {
  const s = String(v ?? "unspecified").toLowerCase();
  const map = ["read-only", "workspace-write", "dangerous", "unspecified"];
  return /** @type {const} */ (map.includes(s) ? s : "unspecified");
}

/** @param {unknown} cd */
function normalizeColorDepth(cd) {
  const n = Number(cd);
  if (n === 1 || n === 4 || n === 8 || n === 24) return n;
  return 1;
}

function normalizePixelProtocol(p) {
  const s = String(p ?? "none").toLowerCase();
  return /** @type {"kitty"|"iterm"|"sixels"|"none"} */ (
    ["kitty", "iterm", "sixels", "none"].includes(s) ? s : "none"
  );
}

function normalizePresenceMode(m) {
  const s = String(m ?? "ambient").toLowerCase();
  return /** @type {"dormant"|"ambient"|"attentive"|"foreground"} */ (
    ["dormant", "ambient", "attentive", "foreground"].includes(s) ? s : "ambient"
  );
}

function normalizeConsent(v) {
  const s = String(v ?? "balanced").toLowerCase();
  return /** @type {"minimal"|"balanced"|"expressive"} */ (
    ["minimal", "balanced", "expressive"].includes(s) ? s : "balanced"
  );
}

/** @param {unknown} tags */
function normalizeMoodTags(tags) {
  const allowed = new Set([
    "calm", "quiet", "resting", "sleepy", "observant", "present", "soft", "reserved",
    "focused", "attentive", "absorbed", "analytical", "organized", "determined",
    "curious", "exploratory", "reflective",
    "guarded", "cautious", "vigilant", "concerned", "alarmed",
    "delighted", "warm", "relieved", "satisfied", "proud", "celebratory", "hopeful", "confident", "supportive",
    "tired", "weary", "strained", "frustrated", "blocked", "recovering",
    "apologetic", "humbled", "orchestrating"
  ]);
  const arr =
    tags == null ? ["calm"] : Array.isArray(tags) ? tags.map(String) : [];
  /** @type {MoodTag[]} */
  const out = [];
  for (const t of arr) {
    if (allowed.has(t)) /** @type {MoodTag} */ (out.push(/** @type {MoodTag} */ (t)));
  }
  return Object.freeze(out.length ? [...new Set(out)] : ["calm"]);
}

function normalizeFace(f) {
  const s = String(f ?? "idle").toLowerCase();
  const ok = [
    "idle", "blink", "think", "thinking", "speak", "speaking", "smile", "warn",
    "soft-smile", "warm-smile", "warm", "guarded", "guard", "curious", "scan",
    "focus", "focused", "sleepy", "tired", "dim", "sparkle", "flinch", "frown",
    "repair", "nod", "far-look", "apologetic"
  ];
  return /** @type {*} */ (ok.includes(s) ? s : "idle");
}

function normalizeGesture(g) {
  const s = String(g ?? "none").toLowerCase();
  const ok = ["none", "nod", "pulse-ring", "glow", "cursor-tail"];
  return /** @type {"none"|"nod"|"pulse-ring"|"glow"|"cursor-tail"} */ (ok.includes(s) ? s : "none");
}

function normalizeSaysTone(t) {
  const s = String(t ?? "plain").toLowerCase();
  return /** @type {"plain"|"warm"|"playful"|"guarded"} */ (
    ["plain", "warm", "playful", "guarded"].includes(s) ? s : "plain"
  );
}

function normalizeSpeechActSays(a) {
  const s = String(a ?? "answer").toLowerCase();
  const ok = ["answer", "warn", "suggest", "reflect", "confirm"];
  return /** @type {"answer"|"warn"|"suggest"|"reflect"|"confirm"} */ (ok.includes(s) ? s : "answer");
}

function normalizeSpeechActIntent(a) {
  return normalizeSpeechActSays(a ?? "answer");
}

function normalizeTransportEnum(t) {
  const s = String(t ?? "stdio").toLowerCase();
  const ok = ["stdio", "uds", "named-pipe", "http"];
  return /** @type {"stdio"|"uds"|"named-pipe"|"http"} */ (ok.includes(s) ? s : "stdio");
}
