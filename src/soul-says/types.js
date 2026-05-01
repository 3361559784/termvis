import { randomUUID } from "node:crypto";

export const SAY_INTENTS = Object.freeze([
  "silent", "micro_status", "mood_reflection", "risk_guard",
  "plan_marker", "tool_watch", "failure_recovery", "success_release",
  "memory_echo", "user_alignment", "ambient_whisper",
  "ritual_open", "ritual_close", "subagent_comment",
  "web_research_note", "apology_or_recalibration"
]);

export const SAY_TONES = Object.freeze([
  "quiet", "focused", "warm", "guarded", "playful", "reflective", "apologetic"
]);

export const SAY_VISIBILITIES = Object.freeze([
  "hidden", "dim", "normal", "bright", "guard"
]);

export const SAY_STATES = Object.freeze([
  "silent", "primed", "composing", "speaking", "cooling", "ambient", "archived"
]);

export const SAY_SOURCES = Object.freeze(["memory", "llm", "hybrid"]);

export const SAY_BREVITY = Object.freeze(["micro", "short", "normal"]);

export const INTENT_THRESHOLDS = Object.freeze({
  ritual_open: 0,
  risk_guard: 0,
  ritual_close: 0,
  success_release: 0,
  failure_recovery: 0,
  micro_status: 0,
  tool_watch: 0,
  plan_marker: 0,
  user_alignment: 0,
  apology_or_recalibration: 0,
  subagent_comment: 0,
  mood_reflection: 0,
  web_research_note: 0,
  memory_echo: 0,
  ambient_whisper: 0,
  silent: 0
});

export const INTENT_TTL = Object.freeze({
  micro_status: 24000,
  mood_reflection: 45000,
  risk_guard: 50000,
  plan_marker: 42000,
  tool_watch: 36000,
  failure_recovery: 50000,
  success_release: 38000,
  memory_echo: 52000,
  user_alignment: 42000,
  ambient_whisper: 45000,
  ritual_open: 42000,
  ritual_close: 42000,
  subagent_comment: 36000,
  web_research_note: 42000,
  apology_or_recalibration: 50000,
  silent: 0
});

export const DEFAULT_SAYS_CONFIG = Object.freeze({
  enabled: true,
  mode: "balanced",
  bottomStrip: {
    visible: true,
    height: 2,
    showMeta: true,
    showCauseInDebug: false,
    historySize: 5
  },
  generation: {
    memoryEcho: true,
    llmCandidates: true,
    llmOnlyAtCheckpoints: false,
    maxLlmCallsPerHour: 0
  },
  personality: {
    warmth: 1,
    playfulness: 1,
    anthropomorphism: 1,
    technicality: 2,
    metaphor: 1,
    emoji: 0
  },
  cadence: {
    minCooldownMs: 0,
    maxPerMinute: 0,
    maxAmbientPerHour: 0,
    maxMemoryEchoPerHour: 0,
    afterMicroStatusMs: 0,
    afterMemoryEchoMs: 0,
    afterPlayfulMs: 0,
    afterRiskGuardMs: 0,
    ambientRefreshMs: 20000
  },
  safety: {
    noDependencyLanguage: true,
    requireFactualBasis: true,
    redactSecrets: true,
    privacyRiskThreshold: 0.25,
    dependencyRiskThreshold: 0.2
  },
  idle: {
    firstWhisperAfterMs: 24000,
    repeatWhisperMinMs: 45000,
    onlyWhenLowRisk: true
  }
});

export const DEFAULT_STYLE = Object.freeze({
  brevity: "short",
  warmth: 1,
  playfulness: 1,
  technicality: 2,
  anthropomorphism: 1,
  metaphor: 1,
  emoji: 0
});

function clamp(n, lo, hi) {
  const x = Number(n);
  if (!Number.isFinite(x)) return lo;
  return Math.min(hi, Math.max(lo, x));
}

export function createSayCandidate(overrides = {}) {
  const o = overrides || {};
  return Object.freeze({
    id: String(o.id || randomUUID()),
    text: String(o.text || ""),
    intent: SAY_INTENTS.includes(o.intent) ? o.intent : "silent",
    source: SAY_SOURCES.includes(o.source) ? o.source : "llm",
    tone: SAY_TONES.includes(o.tone) ? o.tone : "quiet",
    brevity: SAY_BREVITY.includes(o.brevity) ? o.brevity : "short",
    priority: clamp(Number(o.priority ?? 0.5), 0, 1),
    novelty: clamp(Number(o.novelty ?? 0.5), 0, 1),
    relevance: clamp(Number(o.relevance ?? 0.5), 0, 1),
    styleFit: clamp(Number(o.styleFit ?? 0.5), 0, 1),
    factuality: clamp(Number(o.factuality ?? 0.8), 0, 1),
    privacyRisk: clamp(Number(o.privacyRisk ?? 0), 0, 1),
    interruptionRisk: clamp(Number(o.interruptionRisk ?? 0.1), 0, 1),
    dependencyRisk: clamp(Number(o.dependencyRisk ?? 0), 0, 1),
    ttlMs: Math.max(0, Number(o.ttlMs ?? INTENT_TTL[o.intent] ?? 8000)),
    causeIds: Object.freeze(Array.isArray(o.causeIds) ? o.causeIds.map(String) : []),
    factualBasis: Object.freeze(Array.isArray(o.factualBasis) ? o.factualBasis.map(String) : []),
    memoryBasis: Object.freeze(Array.isArray(o.memoryBasis) ? o.memoryBasis.map(String) : [])
  });
}

export function createSayDisplayFrame(overrides = {}) {
  const o = overrides || {};
  return Object.freeze({
    id: String(o.id || randomUUID()),
    text: String(o.text || ""),
    intent: SAY_INTENTS.includes(o.intent) ? o.intent : "silent",
    tone: SAY_TONES.includes(o.tone) ? o.tone : "quiet",
    visibility: SAY_VISIBILITIES.includes(o.visibility) ? o.visibility : "normal",
    ttlMs: Math.max(0, Number(o.ttlMs ?? 8000)),
    fadeMs: Math.max(0, Number(o.fadeMs ?? 800)),
    enteredAt: Number.isFinite(Number(o.enteredAt)) ? Number(o.enteredAt) : Date.now(),
    meta: Object.freeze({
      mood: String(o.meta?.mood || "calm"),
      pulseBpm: Math.round(Number(o.meta?.pulseBpm || 62)),
      pulseEvent: String(o.meta?.pulseEvent || "steady"),
      presenceMode: String(o.meta?.presenceMode || "ambient"),
      stance: String(o.meta?.stance || "observe")
    }),
    trace: Object.freeze({
      source: SAY_SOURCES.includes(o.trace?.source) ? o.trace.source : "llm",
      causeIds: Object.freeze(Array.isArray(o.trace?.causeIds) ? o.trace.causeIds.map(String) : []),
      factualBasis: Object.freeze(Array.isArray(o.trace?.factualBasis) ? o.trace.factualBasis.map(String) : []),
      llmUsed: Boolean(o.trace?.llmUsed)
    })
  });
}

export function createSayDecision(overrides = {}) {
  const o = overrides || {};
  return Object.freeze({
    action: ["speak", "update_meta", "silent"].includes(o.action) ? o.action : "silent",
    frame: o.frame ? createSayDisplayFrame(o.frame) : undefined,
    rejected: Object.freeze(Array.isArray(o.rejected) ? o.rejected.map(r => Object.freeze({
      reason: String(r.reason || "no_candidate"),
      candidateId: r.candidateId ? String(r.candidateId) : undefined
    })) : [])
  });
}
