/**
 * Behaviour planning (speech / rendering intent) for Soul-bios.
 */

import {
  clamp,
  createHostContext,
  createIntentPlan,
  createMoodState,
  createPresenceState
} from "./types.js";

/** @typedef {ReturnType<import("./types.js").createHostContext>} HostContext */
/** @typedef {ReturnType<import("./types.js").createPresenceState>} PresenceState */
/** @typedef {ReturnType<import("./types.js").createMoodState>} MoodState */
/** @typedef {ReturnType<import("./types.js").createSignalEvent>} SignalEvent */

/**
 * Host + presence + mood gating before rendering speech (report-aligned).
 *
 * @param {PresenceState} presence
 * @param {MoodState} mood
 * @param {HostContext} host
 * @param {SignalEvent|null|undefined} topSignal
 * @returns {boolean}
 */
export function shouldSpeak(presence, mood, host, topSignal) {
  if (host.approvalState === "pending") return true;
  if (presence.mode === "attentive" && topSignal?.kind === "user.typing") return false;
  if (presence.silenceBudgetMs <= 0) return false;
  if (mood.tags.includes("guarded") && topSignal && topSignal.priority >= 4) return true;
  const pr = topSignal?.priority ?? 0;
  return pr >= 4 && presence.userConsentLevel !== "minimal";
}

/**
 * @typedef {{
 *   presence: PresenceState;
 *   mood: MoodState;
 *   host: HostContext;
 *   topSignal?: SignalEvent|null;
 *   memoryHits?: string[];
 * }} IntentContext
 */

/**
 * Produce a concrete rendering / speech blueprint from runtime context.
 *
 * @param {IntentContext & Record<string, unknown>} context
 * @returns {ReturnType<typeof createIntentPlan>}
 */
export function planIntent(context = {}) {
  const presence =
    context.presence != null
      ? /** @type {PresenceState} */ (context.presence)
      : createPresenceState();
  const mood =
    context.mood != null
      ? /** @type {MoodState} */ (context.mood)
      : createMoodState();
  const host =
    context.host != null
      ? /** @type {HostContext} */ (context.host)
      : createHostContext();

  const topSignal = context.topSignal;

  const memoryHits = Array.isArray(context.memoryHits)
    ? context.memoryHits.map(String)
    : [];

  const speak = shouldSpeak(presence, mood, host, topSignal);
  const sp = clamp(topSignal?.priority ?? (speak ? 3 : 0), 0, 5);
  const act = deriveSpeechAct(topSignal, mood, speak);

  const arousalBias = clamp((mood.arousal - 0.5) * 2, -1, 1);

  const face =
    mood.tags.includes("guarded") || host.approvalState === "pending"
      ? /** @type {const} */ ("warn")
      : mood.tags.includes("delighted") || mood.tags.includes("curious")
        ? /** @type {const} */ ("smile")
        : mood.tags.includes("focused")
          ? /** @type {const} */ ("think")
          : /** @type {const} */ ("idle");

  return createIntentPlan({
    shouldSpeak: speak,
    speakPriority: sp,
    speechAct: act,
    useMemoryRefs: memoryHits.slice(0, 32),
    targetTokens: speak ?
      clamp(80 + mood.arousal * 120 + (topSignal?.priority ?? 0) * 8, 48, 600)
      : 0,
    renderHints: {
      expression: face,
      intensity: speak
        ? clamp(
            Math.round((topSignal?.priority ?? 0) + mood.arousal * 3),
            0,
            3
          )
        : /** @type {const} */ (1),
      pulseBias: arousalBias
    }
  });
}

/**
 * @param {SignalEvent|null|undefined} sig
 * @param {MoodState} mood
 * @param {boolean} speaking
 */
function deriveSpeechAct(sig, mood, speaking) {
  if (!speaking) return /** @type {const} */ ("reflect");
  if (!sig)
    return mood.tags.includes("guarded") ?
        /** @type {const} */ ("warn")
      : /** @type {const} */ ("answer");

  const k = String(sig.kind);
  if (/failure|denied/i.test(k) || mood.tags.includes("guarded"))
    return /** @type {const} */ ("warn");
  if (k === "approval.pending") return /** @type {const} */ ("confirm");
  if (k.includes("suggest")) return /** @type {const} */ ("suggest");
  if (/reflect|reflection/i.test(k)) return /** @type {const} */ ("reflect");
  return /** @type {const} */ ("answer");
}
