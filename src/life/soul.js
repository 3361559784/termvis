import { mkdir, readFile, stat, writeFile, appendFile } from "node:fs/promises";
import { dirname, join } from "node:path";

export const SOUL_PHASES = Object.freeze({
  dormant: "dormant",
  idle: "idle",
  attentive: "attentive",
  thinking: "thinking",
  speaking: "speaking",
  guarded: "guarded",
  reflecting: "reflecting"
});

const DISCRETE_MOODS = Object.freeze(["calm", "focused", "curious", "guarded", "delighted", "tired"]);

export const EXPRESSIONS = Object.freeze({
  idle: "( •‿• )",
  blink: "( -‿- )",
  thinking: "( •_• ) …",
  think: "( •_• ) …",
  speaking: "( •◡• ) >",
  warm: "( ◕‿◕ )",
  guarded: "( •_• ) !",
  guard: "( •_• ) !",
  smile: "( ◕‿◕ )",
  sleepy: "( -_- )"
});

const DISCRETE_TO_EXPRESSION = Object.freeze({
  calm: "idle",
  focused: "thinking",
  curious: "warm",
  guarded: "guarded",
  delighted: "warm",
  tired: "sleepy"
});

/** @deprecated Use MOOD_PRESETS; discrete mood model replaced legacy SOUL_MOODS keys via alias map */
export const SOUL_MOODS = Object.freeze({
  calm: { label: "calm", bpm: 62, wave: "▁▂▃▂", aura: "soft" },
  attentive: { label: "attentive", bpm: 72, wave: "▂▄▅▄", aura: "clear" },
  thinking: { label: "thinking", bpm: 78, wave: "▂▄▆▄", aura: "deep" },
  cautious: { label: "cautious", bpm: 86, wave: "▅▄▂▄", aura: "guarded" },
  busy: { label: "busy", bpm: 96, wave: "▃▅█▅", aura: "bright" },
  recovering: { label: "recovering", bpm: 68, wave: "▃▂▁▂", aura: "steady" },
  celebrate: { label: "celebrate", bpm: 88, wave: "▃▆█▆", aura: "warm" },
  focused: { label: "focused", bpm: 71, wave: "▂▄▅▄", aura: "clear" },
  curious: { label: "curious", bpm: 72, wave: "▂▃▅▃", aura: "warm" },
  guarded: { label: "guarded", bpm: 82, wave: "▅▄▂▄", aura: "guarded" },
  delighted: { label: "delighted", bpm: 80, wave: "▃▆█▆", aura: "warm" },
  tired: { label: "tired", bpm: 59, wave: "▃▂▁▂", aura: "steady" }
});

export const MOOD_PRESETS = Object.freeze({
  calm: {
    discrete: "calm",
    valence: 0.3,
    arousal: 0.2,
    dominance: 0.45,
    heartbeatBpm: 62,
    breathMs: 4800,
    bpmMin: 58,
    bpmMax: 66,
    wave: "▁▂▃▂",
    aura: "soft"
  },
  focused: {
    discrete: "focused",
    valence: 0.2,
    arousal: 0.4,
    dominance: 0.55,
    heartbeatBpm: 71,
    breathMs: 3800,
    bpmMin: 64,
    bpmMax: 78,
    wave: "▂▄▅▄",
    aura: "clear"
  },
  curious: {
    discrete: "curious",
    valence: 0.5,
    arousal: 0.5,
    dominance: 0.5,
    heartbeatBpm: 72,
    breathMs: 3600,
    bpmMin: 68,
    bpmMax: 76,
    wave: "▂▃▅▃",
    aura: "warm"
  },
  guarded: {
    discrete: "guarded",
    valence: -0.2,
    arousal: 0.6,
    dominance: 0.35,
    heartbeatBpm: 82,
    breathMs: 3200,
    bpmMin: 78,
    bpmMax: 86,
    wave: "▅▄▂▄",
    aura: "guarded"
  },
  delighted: {
    discrete: "delighted",
    valence: 0.8,
    arousal: 0.6,
    dominance: 0.62,
    heartbeatBpm: 80,
    breathMs: 3400,
    bpmMin: 72,
    bpmMax: 88,
    wave: "▃▆█▆",
    aura: "warm"
  },
  tired: {
    discrete: "tired",
    valence: -0.1,
    arousal: 0.15,
    dominance: 0.3,
    heartbeatBpm: 59,
    breathMs: 5200,
    bpmMin: 56,
    bpmMax: 62,
    wave: "▃▂▁▂",
    aura: "steady"
  }
});

const LEGACY_MOOD_ALIAS = Object.freeze({
  attentive: "curious",
  thinking: "focused",
  cautious: "guarded",
  busy: "focused",
  recovering: "tired",
  celebrate: "delighted"
});

export const SOUL_PRESENCES = Object.freeze({
  ambient: "ambient",
  active: "active",
  focus: "focus",
  recover: "recover",
  celebrate: "celebrate"
});

const DEFAULT_CHARACTER = Object.freeze({
  id: "termvis-soul",
  name: "Termvis Soul",
  corePurpose: "hybrid",
  archetype: "quiet-oracle",
  traits: ["calm", "warm", "transparent"],
  boundaries: Object.freeze({
    romance: "soft-no",
    persuasion: "warn",
    proactiveStart: "low"
  }),
  speakingStyle: Object.freeze({
    brevity: 2,
    warmth: 2,
    metaphor: 1,
    emoji: 0
  })
});

/** @deprecated Merged into DEFAULT_CHARACTER naming */
export const DEFAULT_SOUL_PERSONA = Object.freeze({
  name: DEFAULT_CHARACTER.name,
  role: "terminal companion",
  trustMode: "companion",
  style: "quiet, warm, transparent",
  boundary: "visual companion only; never controls the host CLI"
});

export const DEFAULT_SOUL_RENDER_HINTS = Object.freeze({
  expression: "idle",
  intensity: 1,
  showHeartbeat: true
});

const CUSTOM_MOOD = Object.freeze({ label: "llm-shaped", bpm: 74, wave: "▂▃▅▃", aura: "adaptive" });
const MAX_NARRATION_CELLS = 120;
const MAX_LABEL_CELLS = 40;
const MAX_DELTA_AROUSAL = 0.18;
const BASE_LERP = 0.42;

export function createMoodFrame(overrides = {}) {
  const presetKey = overrides.discrete ? normalizeDiscreteKey(overrides.discrete) : "calm";
  const preset = MOOD_PRESETS[presetKey] || MOOD_PRESETS.calm;
  const base = normalizeMoodFrame({
    discrete: presetKey,
    valence: preset.valence,
    arousal: preset.arousal,
    dominance: preset.dominance,
    heartbeatBpm: preset.heartbeatBpm,
    breathMs: preset.breathMs
  });
  return normalizeMoodFrame({ ...base, ...overrides });
}

export function normalizeMoodFrame(input = {}) {
  const discrete = normalizeDiscreteKey(input.discrete ?? "calm");
  const preset = MOOD_PRESETS[discrete] || MOOD_PRESETS.calm;
  const bpmMid = preset.heartbeatBpm;
  let heartbeatBpm = Number(input.heartbeatBpm);
  if (!Number.isFinite(heartbeatBpm)) heartbeatBpm = bpmMid;
  heartbeatBpm = clamp(heartbeatBpm, preset.bpmMin, preset.bpmMax);

  let valence = clamp(Number(input.valence), -1, 1);
  if (!Number.isFinite(Number(input.valence))) valence = preset.valence;

  let arousal = clamp(Number(input.arousal), 0, 1);
  if (!Number.isFinite(Number(input.arousal))) arousal = preset.arousal;

  let dominance = clamp(Number(input.dominance), 0, 1);
  if (!Number.isFinite(Number(input.dominance))) dominance = preset.dominance;

  let breathMs = Math.round(Number(input.breathMs));
  if (!Number.isFinite(breathMs) || breathMs < 600) breathMs = preset.breathMs;

  return Object.freeze({
    discrete,
    valence,
    arousal,
    dominance,
    heartbeatBpm: Math.round(heartbeatBpm),
    breathMs
  });
}

export function lerpMoodFrame(from, to, rawT = 1) {
  const a = normalizeMoodFrame(from);
  const b = normalizeMoodFrame(to);
  const t = clamp(Number(rawT), 0, 1);
  let valence = lerpScalar(a.valence, b.valence, t);
  let arousal = lerpScalar(a.arousal, b.arousal, t);
  const dA = arousal - a.arousal;
  if (Math.abs(dA) > MAX_DELTA_AROUSAL) {
    arousal = a.arousal + Math.sign(dA) * MAX_DELTA_AROUSAL;
  }
  const dominance = lerpScalar(a.dominance, b.dominance, t);
  const heartbeatBpm = Math.round(lerpScalar(a.heartbeatBpm, b.heartbeatBpm, t));
  const breathMs = Math.round(lerpScalar(a.breathMs, b.breathMs, t));
  const discrete = t >= 0.88 ? b.discrete : a.discrete;
  return normalizeMoodFrame({ discrete, valence, arousal, dominance, heartbeatBpm, breathMs });
}

function steerMoodFrame(current, destination, rawT = 1) {
  return lerpMoodFrame(current, destination, clamp(Number(rawT) * BASE_LERP, 0, 1));
}

export function resolveDiscreteMood(moodLike) {
  if (moodLike != null && typeof moodLike === "object" && "discrete" in moodLike) {
    return moodLike.discrete || "calm";
  }
  return normalizeSoulMood(moodLike);
}

export function getExpression(moodOrKind = "idle", opts) {
  const options = opts && typeof opts === "object" ? opts : {};
  if (options.blink || options.blinkPhase) return EXPRESSIONS.blink;
  const tryKey = (key) => {
    const normalized = normalizeExpressionKey(String(key || "idle"));
    return EXPRESSIONS[normalized] || EXPRESSIONS.idle;
  };
  if (typeof moodOrKind === "string") {
    return tryKey(moodOrKind);
  }
  if (moodOrKind && typeof moodOrKind === "object") {
    const d = resolveDiscreteMood(moodOrKind);
    const kind = DISCRETE_TO_EXPRESSION[d] || "idle";
    return EXPRESSIONS[kind] || EXPRESSIONS.idle;
  }
  return tryKey(normalizeSoulMood(moodOrKind));
}

export function createCharacterProfile(overrides = {}) {
  const o = overrides || {};
  const boundaries = {
    romance: normalizeBoundaryRomance(o.boundaries?.romance ?? deriveRomance(o.boundary)),
    persuasion: normalizeBoundaryPersuasion(o.boundaries?.persuasion),
    proactiveStart: normalizeProactiveStart(o.boundaries?.proactiveStart)
  };
  const speakingStyle = {
    brevity: clampInt(o.speakingStyle?.brevity ?? 2, 0, 3),
    warmth: clampInt(o.speakingStyle?.warmth ?? DEFAULT_CHARACTER.speakingStyle.warmth, 0, 3),
    metaphor: clampInt(o.speakingStyle?.metaphor ?? DEFAULT_CHARACTER.speakingStyle.metaphor, 0, 3),
    emoji: clampInt(o.speakingStyle?.emoji ?? DEFAULT_CHARACTER.speakingStyle.emoji, 0, 3)
  };
  const traits =
    Array.isArray(o.traits) && o.traits.length > 0
      ? [...o.traits.map((t) => String(t).slice(0, 48))]
      : styleToTraits(o.style || DEFAULT_SOUL_PERSONA.style);

  return normalizeCharacterProfileFields({
    id: o.id ?? slugId(o.name),
    name: o.name ?? DEFAULT_CHARACTER.name,
    corePurpose: normalizeCorePurpose(o.corePurpose ?? inferCorePurpose(o)),
    archetype: normalizeArchetype(o.archetype ?? inferArchetype(o)),
    traits,
    boundaries,
    speakingStyle,
    boundary: o.boundary
  });
}

export function normalizeSoulPersona(persona = {}) {
  return createCharacterProfile({
    ...persona,
    style: persona.style || DEFAULT_SOUL_PERSONA.style,
    boundary: persona.boundary || DEFAULT_SOUL_PERSONA.boundary,
    role: persona.role || DEFAULT_SOUL_PERSONA.role
  });
}

export function createSoulResponse(overrides = {}) {
  const o = overrides || {};
  const mood = normalizeMoodFrame(o.mood || createMoodFrame({ discrete: "calm" }));
  const hints = normalizeRenderHints(o.renderHints);
  const tone = normalizeSpeechTone(o.speech?.tone);
  const main = clampNarration(o.speech?.main || "", MAX_NARRATION_CELLS);
  const aside = o.speech?.aside === undefined ? undefined : clampNarration(o.speech.aside, MAX_NARRATION_CELLS);
  const speech = aside === undefined ? { main, tone } : { main, aside, tone };
  return Object.freeze({
    speech,
    mood,
    renderHints: hints,
    safety: normalizeSafety(o.safety)
  });
}

function normalizeSpeechTone(value = "plain") {
  const key = String(value || "plain").toLowerCase();
  return ["plain", "warm", "playful", "guarded"].includes(key) ? key : "plain";
}

function normalizeRenderHints(h = {}) {
  const expression = normalizeExpressionKey(h.expression);
  const intensity = clampInt(h.intensity ?? 1, 0, 3);
  const showHeartbeat = h.showHeartbeat !== undefined ? Boolean(h.showHeartbeat) : DEFAULT_SOUL_RENDER_HINTS.showHeartbeat;
  return Object.freeze({ expression, intensity, showHeartbeat });
}

function normalizeExpressionKey(value = "idle") {
  const key = String(value || "idle").toLowerCase();
  const map = { think: "thinking", speak: "speaking", smile: "smile", guards: "guarded" };
  const k = map[key] || key;
  const allowed = new Set(["idle", "blink", "thinking", "speaking", "smile", "guard", "guarded", "warm", "sleepy"]);
  return allowed.has(k) ? k : "idle";
}

function normalizeSafety(s = {}) {
  return Object.freeze({
    requiresConsent: Boolean(s.requiresConsent),
    risk: ["low", "medium", "high"].includes(String(s.risk)) ? s.risk : "low"
  });
}

export function createSoulState({
  sessionId = createSoulSessionId(),
  enabled = true,
  mode = "companion",
  mood = "calm",
  presence = "ambient",
  narration = "awake beside the terminal stream",
  reply,
  persona = {},
  startedAt = new Date()
} = {}) {
  const moodFrame = upgradeMoodInput(mood);
  const moodInfo = getMoodInfo(moodFrame);
  const text = clampNarration(narration);
  const trust = normalizeTrustMode(mode);
  const character = mergeCharacterFromLegacy(persona, trust, sessionId);
  const phase = enabled ? SOUL_PHASES.idle : SOUL_PHASES.dormant;
  return {
    enabled: Boolean(enabled),
    sessionId,
    mode: trust,
    persona: character,
    mood: moodFrame,
    soulPhase: phase,
    presence: normalizePresence(presence),
    narration: text,
    reply: clampNarration(reply || text),
    heartBpm: moodFrame.heartbeatBpm,
    aura: moodInfo.aura,
    renderHints: createDefaultRenderHints(moodFrame, phase),
    events: 0,
    systemEvents: 0,
    lastSource: "system",
    startedAt: toIso(startedAt),
    updatedAt: toIso(startedAt)
  };
}

function mergeCharacterFromLegacy(persona, trustMode, sessionId) {
  const trustMap = { transparent: "hybrid", minimal: "coding-assistant", companion: "companion" };
  const coreFromTrust = trustMap[trustMode] || "hybrid";
  const base = createCharacterProfile({
    id: persona?.id,
    name: persona?.name,
    corePurpose: persona?.corePurpose || coreFromTrust,
    archetype: persona?.archetype,
    traits: persona?.traits,
    boundaries: persona?.boundaries,
    speakingStyle: persona?.speakingStyle,
    style: persona?.style,
    boundary: persona?.boundary,
    role: persona?.role
  });
  return normalizeCharacterProfileFields({
    ...base,
    id: persona?.id || `soul-${sanitizeSessionId(sessionId).slice(0, 24)}`,
    corePurpose: persona?.corePurpose || coreFromTrust,
    boundary: persona?.boundary || DEFAULT_SOUL_PERSONA.boundary
  });
}

function normalizeCharacterProfileFields(p) {
  return Object.freeze({
    id: String(p.id || "termvis-soul").slice(0, 80),
    name: clampNarration(p.name || DEFAULT_CHARACTER.name, 40),
    corePurpose: normalizeCorePurpose(p.corePurpose),
    archetype: normalizeArchetype(p.archetype),
    traits: Array.isArray(p.traits) ? p.traits.slice(0, 12) : [...DEFAULT_CHARACTER.traits],
    boundaries: Object.freeze({
      romance: normalizeBoundaryRomance(p.boundaries?.romance),
      persuasion: normalizeBoundaryPersuasion(p.boundaries?.persuasion),
      proactiveStart: normalizeProactiveStart(p.boundaries?.proactiveStart)
    }),
    speakingStyle: Object.freeze({
      brevity: clampInt(p.speakingStyle?.brevity ?? 2, 0, 3),
      warmth: clampInt(p.speakingStyle?.warmth ?? 2, 0, 3),
      metaphor: clampInt(p.speakingStyle?.metaphor ?? 1, 0, 3),
      emoji: clampInt(p.speakingStyle?.emoji ?? 0, 0, 3)
    }),
    boundary: typeof p.boundary === "string" ? clampNarration(p.boundary, 120) : DEFAULT_SOUL_PERSONA.boundary
  });
}

function normalizeCorePurpose(v) {
  const key = String(v || "hybrid").toLowerCase();
  return ["coding-assistant", "companion", "hybrid"].includes(key) ? key : "hybrid";
}

function normalizeArchetype(v) {
  const key = String(v || "quiet-oracle").toLowerCase();
  return ["quiet-oracle", "warm-scout", "playful-synth", "custom"].includes(key) ? key : "quiet-oracle";
}

function normalizeBoundaryRomance(v = "soft-no") {
  const key = String(v || "soft-no").toLowerCase();
  return ["forbid", "soft-no", "unspecified"].includes(key) ? key : "soft-no";
}

function normalizeBoundaryPersuasion(v = "warn") {
  const key = String(v || "warn").toLowerCase();
  return ["forbid", "warn"].includes(key) ? key : "warn";
}

function normalizeProactiveStart(v = "low") {
  const key = String(v || "low").toLowerCase();
  return ["off", "low", "medium"].includes(key) ? key : "low";
}

function deriveRomance(boundary = "") {
  const b = String(boundary).toLowerCase();
  if (/\bromance|romantic|flirt\b/.test(b)) return "forbid";
  return "soft-no";
}

function styleToTraits(style) {
  return String(style || "")
    .split(/[,;]+/)
    .map((s) => s.trim())
    .filter(Boolean)
    .slice(0, 12);
}

function inferCorePurpose(o) {
  const r = String(o?.role || "").toLowerCase();
  if (/\bcode|dev|engineer|assistant\b/.test(r)) return "coding-assistant";
  if (/\bcompan|friend|mate\b/.test(r)) return "companion";
  return "hybrid";
}

function inferArchetype(o) {
  const s = String(o?.style || "").toLowerCase();
  if (/play|spark|wit/.test(s)) return "playful-synth";
  if (/warm|soft|kind/.test(s)) return "warm-scout";
  return "quiet-oracle";
}

function slugId(name) {
  const s = String(name || "soul")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "") || "soul";
  return `${s}-${Math.random().toString(36).slice(2, 6)}`;
}

function upgradeMoodInput(moodInput) {
  if (moodInput && typeof moodInput === "object") {
    const d = normalizeDiscreteKey(moodInput.discrete ?? stringToDiscrete(moodInput.surfaceLabel ?? "calm"));
    const preset = MOOD_PRESETS[d];
    return normalizeMoodFrame({
      discrete: d,
      valence: moodInput.valence ?? preset.valence,
      arousal: moodInput.arousal ?? preset.arousal,
      dominance: moodInput.dominance ?? preset.dominance,
      heartbeatBpm: moodInput.heartbeatBpm,
      breathMs: moodInput.breathMs ?? preset.breathMs
    });
  }
  const discrete = stringToDiscrete(String(moodInput ?? "calm"));
  const preset = MOOD_PRESETS[discrete];
  return normalizeMoodFrame({
    discrete,
    valence: preset.valence,
    arousal: preset.arousal,
    dominance: preset.dominance,
    heartbeatBpm: preset.heartbeatBpm,
    breathMs: preset.breathMs
  });
}

export function normalizeSoulMood(value = "calm") {
  const discrete =
    typeof value === "object" && value ?
      normalizeDiscreteKey(value.discrete ?? "calm")
    : stringToDiscrete(value);
  return discrete;
}

function normalizeDiscreteKey(value) {
  const low = String(value || "calm").toLowerCase();
  const viaLegacy = LEGACY_MOOD_ALIAS[low];
  const key = (viaLegacy || low).slice(0, 32);
  return DISCRETE_MOODS.includes(key) ? key : "calm";
}

function stringToDiscrete(raw) {
  const label = clampLabel(raw || "calm").toLowerCase();
  const key = label.replace(/\s+/g, "").slice(0, 48);
  if (LEGACY_MOOD_ALIAS[key] || LEGACY_MOOD_ALIAS[label]) return LEGACY_MOOD_ALIAS[key] || LEGACY_MOOD_ALIAS[label];
  if (DISCRETE_MOODS.includes(key)) return key;
  if (DISCRETE_MOODS.includes(label)) return label;
  for (const d of DISCRETE_MOODS) {
    if (label.includes(d)) return d;
  }
  return "calm";
}

export function createSoulSessionId(date = new Date()) {
  const time = date.toISOString().replace(/[:.]/g, "-");
  const suffix = Math.random().toString(36).slice(2, 8);
  return `soul-${time}-${suffix}`;
}

export function normalizePresence(value = "ambient") {
  const label = clampLabel(value || "ambient");
  const key = label.toLowerCase();
  return SOUL_PRESENCES[key] || label;
}

export function normalizeTrustMode(value = "companion") {
  const key = String(value || "companion").toLowerCase();
  return ["transparent", "minimal", "companion"].includes(key) ? key : "companion";
}

export function normalizeSoulEvent(event = {}) {
  const at = event.at || new Date();
  let moodDiscrete;
  let moodFramePatch;
  if (event.mood && typeof event.mood === "object") {
    moodFramePatch = event.mood;
    moodDiscrete = normalizeDiscreteKey(event.mood.discrete ?? "calm");
  } else {
    moodDiscrete = event.mood === undefined ? undefined : stringToDiscrete(String(event.mood));
  }
  const presence = event.presence === undefined ? undefined : normalizePresence(event.presence);
  const heartBpm = Number(event.heartBpm);
  const normalizedHeart =
    Number.isFinite(heartBpm) && heartBpm >= 40 && heartBpm <= 160 ? Math.round(heartBpm) : undefined;

  let personaMerged;
  if (event.persona && typeof event.persona === "object") {
    personaMerged = normalizeSoulPersona(event.persona);
  }

  const renderHintsPatch = event.renderHints ? normalizeRenderHints(event.renderHints) : undefined;

  return {
    type: String(event.type || "soul.narration"),
    moodDiscrete,
    moodFrame: moodFramePatch,
    mood: moodDiscrete !== undefined ? moodDiscrete : event.mood,
    presence,
    narration: event.narration === undefined ? undefined : clampNarration(event.narration),
    reply: event.reply === undefined ? undefined : clampNarration(event.reply),
    recovery: event.recovery === undefined ? undefined : clampNarration(event.recovery),
    heartBpm: normalizedHeart,
    persona: personaMerged,
    renderHints: renderHintsPatch,
    avatar: event.avatar === undefined ? undefined : String(event.avatar),
    avatarFit: normalizeAvatarFit(event.avatarFit),
    avatarAlign: normalizeAvatarAlign(event.avatarAlign),
    avatarScale: event.avatarScale === undefined ? undefined : String(event.avatarScale),
    avatarWidth: normalizePositiveNumber(event.avatarWidth),
    avatarHeight: normalizePositiveNumber(event.avatarHeight),
    soulPhaseHint: event.soulPhaseHint ?? inferPhaseFromSoulEventType(event.type),
    source: String(event.source || "llm"),
    at: toIso(at)
  };
}

function normalizeAvatarFit(value) {
  if (value === undefined) return undefined;
  const fit = String(value || "").toLowerCase();
  return ["contain", "cover", "stretch"].includes(fit) ? fit : undefined;
}

function normalizeAvatarAlign(value) {
  if (value === undefined) return undefined;
  const align = String(value || "").toLowerCase();
  return /^(top|mid|bottom),(left|mid|right)$/.test(align) ? align : undefined;
}

function normalizePositiveNumber(value) {
  if (value === undefined) return undefined;
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? Math.round(n) : undefined;
}

function inferPhaseFromSoulEventType(type = "") {
  const t = String(type || "");
  if (t.includes("derive.waiting")) return SOUL_PHASES.guarded;
  if (t.includes("derive.busy")) return SOUL_PHASES.thinking;
  if (t.includes("derive.thinking")) return SOUL_PHASES.thinking;
  if (t.includes("derive.celebrate")) return SOUL_PHASES.speaking;
  if (t.includes("derive.recover")) return SOUL_PHASES.reflecting;
  if (t.includes("derive.attentive")) return SOUL_PHASES.attentive;
  return undefined;
}

function targetFrameFromSoulEvent(normalized, state) {
  let presetKey = normalized.moodDiscrete;
  if (presetKey === undefined && normalized.mood && typeof normalized.mood === "object") {
    presetKey = normalizeDiscreteKey(normalized.mood.discrete ?? "calm");
  }
  if (presetKey === undefined && typeof normalized.mood === "string" && normalized.mood.length > 0) {
    presetKey = stringToDiscrete(normalized.mood);
  }
  if (presetKey === undefined) {
    return normalizeMoodFrame(state.mood);
  }
  let target = createMoodFrame({ discrete: presetKey });

  if (normalized.moodFrame && typeof normalized.moodFrame === "object") {
    target = normalizeMoodFrame({
      ...normalized.moodFrame,
      discrete: presetKey
    });
  }
  if (normalized.heartBpm !== undefined) {
    target = normalizeMoodFrame({
      discrete: target.discrete,
      valence: target.valence,
      arousal: target.arousal,
      dominance: target.dominance,
      heartbeatBpm: normalized.heartBpm,
      breathMs: target.breathMs
    });
  }

  target = normalizeMoodFrame(target);
  return target;
}

function nextSoulPhase(state, normalized) {
  if (!state.enabled) return SOUL_PHASES.dormant;
  return normalized.soulPhaseHint || state.soulPhase || SOUL_PHASES.idle;
}

function createDefaultRenderHints(mood, phase = SOUL_PHASES.idle) {
  const discrete = mood.discrete || "calm";
  let expr = "idle";
  if (phase === SOUL_PHASES.thinking || phase === SOUL_PHASES.reflecting) expr = "think";
  else if (phase === SOUL_PHASES.speaking) expr = "speaking";
  else if (phase === SOUL_PHASES.guarded) expr = "guard";
  else if (discrete === "delighted" || discrete === "curious") expr = discrete === "delighted" ? "smile" : "blink";
  else if (discrete === "tired") expr = "sleepy";
  return normalizeRenderHints({
    expression: expr,
    intensity: discrete === "guarded" ? 2 : 1,
    showHeartbeat: true
  });
}

export function applySoulEvent(state, event = {}) {
  const normalized = normalizeSoulEvent(event);
  const target = targetFrameFromSoulEvent(normalized, state);
  let nextMood = steerMoodFrame(state.mood, target);
  const hadMoodIntent =
    normalized.moodDiscrete !== undefined ||
    (normalized.moodFrame && typeof normalized.moodFrame === "object") ||
    (typeof normalized.mood === "string" && normalized.mood.length > 0);
  if (hadMoodIntent) {
    nextMood = normalizeMoodFrame({ ...nextMood, discrete: target.discrete });
  }
  const moodInfo = getMoodInfo(nextMood.discrete);

  let heartBpm = nextMood.heartbeatBpm;
  if (normalized.heartBpm !== undefined) {
    const fromBpm = state.heartBpm || state.mood.heartbeatBpm;
    if (normalized.source === "system-state") {
      heartBpm = steerScalar(fromBpm, normalized.heartBpm);
    } else {
      heartBpm = normalized.heartBpm;
    }
  }

  const narration = normalized.recovery || normalized.narration || state.narration;
  const reply = normalized.reply || normalized.recovery || normalized.narration || state.reply || narration;

  const systemDerived = normalized.type.startsWith("soul.derive.") || normalized.source === "system-state";

  const nextPhase = nextSoulPhase(state, normalized);

  let personaNext = state.persona;
  if (normalized.persona) {
    personaNext = normalized.persona;
  }

  let renderHints = normalized.renderHints
    ? normalizeRenderHints(normalized.renderHints)
    : createDefaultRenderHints(nextMood, nextPhase);

  return {
    ...state,
    persona: personaNext,
    mood: normalizeMoodFrame({ ...nextMood, heartbeatBpm: heartBpm }),
    soulPhase: nextPhase,
    presence: normalized.presence || state.presence,
    narration,
    reply,
    heartBpm,
    aura: moodInfo.aura,
    renderHints,
    events: state.events + (systemDerived ? 0 : 1),
    systemEvents: (state.systemEvents || 0) + (systemDerived ? 1 : 0),
    lastSource: normalized.source,
    updatedAt: normalized.at
  };
}

function steerScalar(from, to) {
  const d = clamp(to - from, -MAX_DELTA_AROUSAL * 80, MAX_DELTA_AROUSAL * 80);
  return Math.round(from + d);
}

export function deriveSoulEventFromLifeEvent(event = {}) {
  const type = event.type || "host-output";
  if (type === "permission-request") {
    return {
      type: "soul.derive.waiting",
      mood: MOOD_PRESETS.guarded,
      presence: "focus",
      source: "system-state",
      soulPhaseHint: SOUL_PHASES.guarded
    };
  }
  if (type === "tool-call") {
    return {
      type: "soul.derive.busy",
      mood: MOOD_PRESETS.focused,
      presence: "active",
      source: "system-state",
      soulPhaseHint: SOUL_PHASES.thinking
    };
  }
  if (type === "reasoning") {
    return {
      type: "soul.derive.thinking",
      mood: MOOD_PRESETS.focused,
      presence: "focus",
      source: "system-state",
      soulPhaseHint: SOUL_PHASES.thinking
    };
  }
  if (type === "success") {
    return {
      type: "soul.derive.celebrate",
      mood: MOOD_PRESETS.delighted,
      presence: "celebrate",
      source: "system-state",
      soulPhaseHint: SOUL_PHASES.speaking
    };
  }
  if (type === "error" || type === "life-error") {
    return {
      type: "soul.derive.recovering",
      mood: MOOD_PRESETS.tired,
      presence: "recover",
      source: "system-state",
      soulPhaseHint: SOUL_PHASES.reflecting
    };
  }
  return {
    type: "soul.derive.attentive",
    mood: MOOD_PRESETS.curious,
    presence: "ambient",
    source: "system-state",
    soulPhaseHint: SOUL_PHASES.attentive
  };
}

export function getSoulPulse(state = {}, at = new Date()) {
  const moodKey = normalizeSoulMood(state.mood ?? "calm");
  const normalizedMood =
    typeof state.mood === "object"
      ? state.mood
    : normalizeMoodFrame(createMoodFrame({ discrete: moodKey }));
  const moodInfo = getMoodInfo(normalizedMood);
  const bpm =
    normalizedMood?.heartbeatBpm ||
    Number(state.heartBpm) ||
    moodInfo.bpm;
  const started = new Date(state.startedAt || Date.now()).getTime();
  const now = at instanceof Date ? at.getTime() : new Date(at).getTime();
  const elapsedMs = Math.max(0, now - started);
  const beatMs = 60000 / bpm;
  const beat = Math.floor(elapsedMs / beatMs);
  return {
    bpm,
    beat,
    wave: rotatePulse(moodInfo.wave, beat),
    aura: state.aura || moodInfo.aura
  };
}

export function getMoodInfo(mood = "calm") {
  let key =
    mood && typeof mood === "object" ? normalizeDiscreteKey(mood.discrete || "calm") : normalizeSoulMood(mood);

  key = LEGACY_MOOD_ALIAS[String(key).toLowerCase()] || key;
  if (DISCRETE_MOODS.includes(key)) {
    const p = MOOD_PRESETS[key];
    return Object.freeze({
      label: key,
      bpm: p.heartbeatBpm,
      wave: p.wave,
      aura: p.aura
    });
  }
  const lk = String(mood ?? "calm").toLowerCase();
  if (SOUL_MOODS[lk]) return SOUL_MOODS[lk];
  return CUSTOM_MOOD;
}

export function formatSoulMoodLabel(stateOrMood) {
  const m = typeof stateOrMood === "object" && stateOrMood && "discrete" in stateOrMood ?
      stateOrMood
    : stateOrMood?.mood;
  if (!m || typeof m !== "object") return normalizeSoulMood(m);
  return m.discrete;
}

export function renderSoulAltText(state = {}, snapshot = {}) {
  const soul = state.enabled === undefined && snapshot.soul ? snapshot.soul : state;
  const mood = normalizeMoodFrame(typeof soul.mood === "object" ? soul.mood : upgradeMoodInput(soul.mood));
  const presence = soul.presence || "ambient";
  const bpm = mood.heartbeatBpm || soul.heartBpm || MOOD_PRESETS[mood.discrete].heartbeatBpm;
  const hostState = snapshot.state || "listening";
  const host = snapshot.host || "terminal";
  const reply = soul.reply || soul.narration || "";
  const character = soul.persona?.id ? soul.persona : mergeCharacterFromLegacy(soul.persona || {}, soul.mode, soul.sessionId || "session");

  const expressionKey = normalizeExpressionKey(soul.renderHints?.expression || "idle");
  const avatarLine = `Expression · ${expressionKey}: ${getExpression(expressionKey)}`;
  const structured = [
    `<soul persona="${escapeXml(character.name)}" id="${escapeXml(character.id)}" phase="${soul.soulPhase || SOUL_PHASES.idle}">`,
    `  <pulse bpm="${bpm}" aura="${escapeXml(soul.aura || getMoodInfo(mood).aura)}" breathingMs="${mood.breathMs}" />`,
    `  ${avatarLine}`,
    `  <mood valence="${mood.valence.toFixed(2)}" arousal="${mood.arousal.toFixed(2)}" dominance="${mood.dominance.toFixed(2)}" discrete="${mood.discrete}" />`,
    `  <host name="${escapeXml(host)}" state="${escapeXml(hostState)}" presence="${escapeXml(presence)}" />`,
    `  <speech tone="${inferToneFromMood(mood)}">${escapeXml(reply)}</speech>`,
    `</soul>`
  ].join("\n");

  const plainSummary = [
    `Soul ${character.name}.`,
    `Host ${host} is ${hostState}.`,
    `Mood ${mood.discrete} (v ${mood.valence.toFixed(2)}, a ${mood.arousal.toFixed(2)}, d ${mood.dominance.toFixed(2)}); presence ${presence}; heartbeat ${bpm} bpm; breath ${mood.breathMs} ms.`,
    `${avatarLine}`,
    reply ? `Reply: ${reply}` : "No current reply."
  ].join(" ");

  return `${structured}\nPlain: ${plainSummary}`;
}

/**
 * One-line status for `--reader` / `--plain` during a hosted command: append-only stderr log
 * without the multi-line XML block (avoids scrollback/TUI-like clutter mixed with host stdout).
 */
export function renderSoulReaderTraceLine(snapshot = {}) {
  const full = renderSoulAltText(snapshot.soul || {}, snapshot);
  const marker = "\nPlain: ";
  const idx = full.indexOf(marker);
  const raw = idx >= 0 ? full.slice(idx + marker.length) : full;
  return raw.replace(/\r?\n/g, " ").replace(/\s+/g, " ").trim();
}

function inferToneFromMood(mood) {
  const d = mood.discrete || "calm";
  if (d === "delighted" || d === "curious") return "warm";
  if (d === "guarded") return "guarded";
  if (d === "focused") return "plain";
  return "plain";
}

function escapeXml(s = "") {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/"/g, "&quot;");
}

export async function createSoulEventStore({ cwd = process.cwd(), sessionId, state } = {}) {
  const dir = soulEventsDir(cwd);
  await mkdir(dir, { recursive: true });
  const id = sessionId || state?.sessionId || createSoulSessionId();
  const path = soulEventsPath(cwd, id);
  await writeFile(path, `${JSON.stringify({ type: "soul.session", state: serializeSoulForStore(state || { sessionId: id }) })}\n`, "utf8");
  await writeFile(join(dir, "latest"), id, "utf8");
  const size = (await stat(path)).size;
  return {
    sessionId: id,
    path,
    offset: size
  };
}

function serializeSoulForStore(state) {
  if (!state) return {};
  const { mood, persona, renderHints } = state;
  return {
    ...state,
    mood: mood && typeof mood === "object" ? { ...mood } : mood,
    persona:
      persona && typeof persona === "object"
        ? { ...persona, boundaries: { ...persona.boundaries }, speakingStyle: { ...persona.speakingStyle } }
        : persona,
    renderHints:
      renderHints && typeof renderHints === "object" ? { ...renderHints } : renderHints
  };
}

export async function appendSoulEvent({ cwd = process.cwd(), sessionId, event } = {}) {
  const targetSession = sessionId || (await readLatestSoulSession(cwd)) || "ambient";
  const path = soulEventsPath(cwd, targetSession);
  await mkdir(dirname(path), { recursive: true });
  const normalized = normalizeSoulEvent(event);
  await appendFile(path, `${JSON.stringify(normalized)}\n`, "utf8");
  return {
    sessionId: targetSession,
    event: normalized,
    path
  };
}

export async function readSoulEvents({ cwd = process.cwd(), sessionId, offset = 0 } = {}) {
  if (!sessionId) return { events: [], offset };
  const path = soulEventsPath(cwd, sessionId);
  let size = 0;
  try {
    size = (await stat(path)).size;
  } catch (error) {
    if (error.code === "ENOENT") return { events: [], offset: 0 };
    throw error;
  }
  if (size <= offset) return { events: [], offset };
  const text = await readFile(path, "utf8");
  const nextText = text.slice(offset);
  const events = [];
  for (const line of nextText.split(/\r?\n/)) {
    if (!line.trim()) continue;
    try {
      const parsed = JSON.parse(line);
      if (parsed.type === "soul.session") continue;
      events.push(normalizeSoulEvent(parsed));
    } catch {
      // Ignore incomplete lines
    }
  }
  return { events, offset: size };
}

export async function readLatestSoulSession(cwd = process.cwd()) {
  try {
    const value = await readFile(join(soulEventsDir(cwd), "latest"), "utf8");
    return value.trim() || null;
  } catch (error) {
    if (error.code === "ENOENT") return null;
    throw error;
  }
}

export function soulEventsDir(cwd = process.cwd()) {
  return join(cwd, ".termvis", "soul-events");
}

export function soulEventsPath(cwd = process.cwd(), sessionId = "ambient") {
  return join(soulEventsDir(cwd), `${sanitizeSessionId(sessionId)}.jsonl`);
}

export function soulMoodToDisplayString(state) {
  const m =
    typeof state?.mood === "object"
      ? state.mood
    : upgradeMoodInput(state?.mood ?? "calm");
  return `${m.discrete} · v${m.valence.toFixed(2)}`;
}

export function sanitizeSessionId(value) {
  return String(value || "ambient").replace(/[^a-zA-Z0-9_.-]/g, "_").slice(0, 120) || "ambient";
}

function clampNarration(value = "", max = MAX_NARRATION_CELLS) {
  return String(value || "").replace(/\s+/g, " ").trim().slice(0, max);
}

function clampLabel(value = "", max = MAX_LABEL_CELLS) {
  return String(value || "").replace(/[\u001b\u009b][\s\S]*?[@-~]/g, "").replace(/\s+/g, " ").trim().slice(0, max) || "calm";
}

function clamp(v, lo, hi) {
  return Math.min(hi, Math.max(lo, v));
}

function clampInt(v, lo, hi) {
  const n = Math.round(Number(v));
  if (!Number.isFinite(n)) return lo;
  return clamp(n, lo, hi);
}

function lerpScalar(a, b, t) {
  return a + (b - a) * clamp(t, 0, 1);
}

function rotatePulse(pulse, beat) {
  const chars = Array.from(pulse || "▁▃▅▇");
  if (chars.length === 0) return "";
  const offset = beat % chars.length;
  return [...chars.slice(offset), ...chars.slice(0, offset)].join("");
}

function toIso(value) {
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}
