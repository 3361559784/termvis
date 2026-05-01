export { SAY_INTENTS, SAY_TONES, SAY_VISIBILITIES, SAY_STATES, SAY_SOURCES,
  INTENT_THRESHOLDS, INTENT_TTL, DEFAULT_SAYS_CONFIG, DEFAULT_STYLE,
  createSayCandidate, createSayDisplayFrame, createSayDecision } from "./types.js";
export { evaluateHardGate, computeSpeakScore, getThreshold } from "./opportunity.js";
export { selectIntent, intentToTone, intentToBrevity } from "./intent.js";
export { scoreCandidates, selectBest, containsDependencyLanguage, containsSecrets } from "./curator.js";
export { generateLLMCandidates, buildSoulSaysPrompt, SOUL_SAYS_SCHEMA } from "./llm-generator.js";
export { createSoulSaysEngine } from "./engine.js";

/**
 * GATE POLICY (v2):
 *
 * Soul Says uses time-interval gating ONLY. All other gates (hard gates,
 * score thresholds, shouldSpeak flags, candidate score minimums) have been
 * removed. The remaining controls are:
 *   1. cadence.ambientRefreshMs — min interval between speech (default 20000ms / 20s, range 5s–120s)
 *   2. Text length hard cap — all output truncated to 120 characters
 *
 * When the LLM is unavailable, content.js and style.js fall back to local
 * template text so the pipeline always produces speakable output.
 *
 * Flow:  signal → intent → LLM/local candidate → safety filter → display
 *
 * To disable Soul Says entirely, set config.enabled = false.
 */
