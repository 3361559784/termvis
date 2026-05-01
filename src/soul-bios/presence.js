/**
 * Presence / attention state machine for Soul-bios.
 */

import { clamp, createPresenceState } from "./types.js";

/** @typedef {ReturnType<import("./types.js").createSignalEvent>} SignalEvent */

const DORMANT_MS = 300_000;
const SILENCE_RECOVERY_PER_MS = 0.012;

/**
 * @param {ReturnType<typeof createPresenceState>} prev
 * @param {SignalEvent[]} signals
 * @param {number} [elapsedMs]
 */
export function updatePresence(prev, signals, elapsedMs = 0) {
  const elapsed = Math.max(0, elapsedMs);
  const hadSignals = signals.length > 0;

  let inactive = hadSignals
    ? 0
    : clamp(prev.inactiveStreakMs + elapsed, 0, Number.MAX_SAFE_INTEGER);

  let mode = prev.mode;
  let attention = prev.attention;
  let foreground = prev.foreground;
  let silence = prev.silenceBudgetMs;

  const topPriority = signals.reduce((m, s) => Math.max(m, s.priority), -1);
  const kinds = new Set(signals.map((s) => s.kind));

  if (mode === "dormant") {
    if (
      kinds.has("session.start") ||
      kinds.has("start") ||
      signals.some((s) => String(s.payload?.event) === "start")
    ) {
      mode = "ambient";
      attention = clamp(attention + 0.2, 0, 1);
    }
  }

  if (hadSignals) {
    if (kinds.has("user.typing")) {
      attention = clamp(attention + 0.03, 0, 1);
    }

    const promoteAttentive = kinds.has("user.submit") || topPriority >= 4;
    if (promoteAttentive) {
      mode = mode === "dormant" ? "ambient" : mode;
      if (!(mode === "foreground" && kinds.has("output.complete"))) {
        mode = "attentive";
      }
    }

    const toolHeavy =
      kinds.has("tool.start") ||
      kinds.has("approval.pending") ||
      kinds.has("tool.failure") ||
      kinds.has("host.reasoning");

    if (toolHeavy) {
      mode = "foreground";
      foreground = true;
      attention = clamp(attention + 0.15, 0, 1);
    }

    if (kinds.has("output.complete")) {
      if (mode === "foreground") {
        mode = "ambient";
        foreground = false;
      }
    }

    if (topPriority >= 5) attention = clamp(attention + 0.12, 0, 1);
    else if (topPriority >= 4) attention = clamp(attention + 0.08, 0, 1);
    else attention = clamp(attention + 0.02, 0, 1);
  } else {
    attention =
      elapsed > 0
        ? clamp(attention * Math.pow(0.92, elapsed / 750), 0, 1)
        : attention;
    silence =
      elapsed > 0 ? Math.min(silence + elapsed * SILENCE_RECOVERY_PER_MS, 45000) : silence;

    if (mode === "ambient" && inactive > DORMANT_MS) {
      mode = "dormant";
      foreground = false;
      attention = clamp(attention - 0.2, 0, 1);
    }
    if (
      prev.mode !== "ambient" &&
      mode === "foreground" &&
      !hadSignals &&
      inactive > DORMANT_MS
    ) {
      mode = "ambient";
      foreground = false;
    }
  }

  silence = clamp(silence, 0, 600_000);

  return createPresenceState({
    ...prev,
    mode,
    foreground,
    attention,
    silenceBudgetMs: silence,
    inactiveStreakMs: inactive,
    userConsentLevel: prev.userConsentLevel
  });
}
