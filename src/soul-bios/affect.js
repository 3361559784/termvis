/**
 * Rule-driven affect / mood derivation for Soul-bios.
 */

import {
  clamp,
  createExpressionState,
  createMoodState,
  createPulseFromArousal,
  createPulseState
} from "./types.js";

/** @typedef {ReturnType<import("./types.js").createSignalEvent>} SignalEvent */

/**
 * @param {ReturnType<typeof createMoodState>} prev
 * @param {SignalEvent[]} signals
 * @param {number} [taskUrgency]
 * @param {number} [risk]
 * @returns {{ mood: ReturnType<typeof createMoodState>; ruleRefs: string[] }}
 */
export function updateMood(prev, signals, taskUrgency = 0, risk = 0) {
  let dV = 0;
  let dA = 0;
  let dD = 0;
  /** @type {string[]} */
  const ruleRefs = [];

  const urgency = clamp(Number(taskUrgency), 0, 1);
  const riskClamped = clamp(Number(risk), 0, 1);

  for (const s of signals) {
    const k = String(s.kind);
    const r = clamp(Number(s.reliability), 0, 1);

    if (k === "tool.failure") {
      dV -= 0.18 * r;
      dA += 0.22 * r;
      ruleRefs.push("mood:tool.failure");
      continue;
    }
    if (k === "user.praise") {
      dV += 0.16 * r;
      ruleRefs.push("mood:user.praise");
      continue;
    }
    if (k === "approval.pending") {
      dD -= 0.2 * r;
      dA += 0.1 * r;
      ruleRefs.push("mood:approval.pending");
      continue;
    }
    if (k === "tool.progress" || k === "tool.complete") {
      dV += 0.04 * r;
      ruleRefs.push(`mood:${k}`);
      continue;
    }
    if (k === "user.submit") {
      dA += 0.08 * r;
      ruleRefs.push("mood:user.submit");
      continue;
    }
    if (k === "user.typing") {
      dA += 0.02 * r;
      ruleRefs.push("mood:user.typing");
      continue;
    }
    if (k === "host.reasoning" || k === "life.bridge.reasoning") {
      dA += 0.1 * r;
      ruleRefs.push("mood:host.reasoning");
      continue;
    }
    if (
      k === "session.start" ||
      k === "host.lifecycle.start" ||
      (String(s.payload?.event) === "start" && String(s.kind).includes("start"))
    ) {
      dA += 0.06 * r;
      dV += 0.02 * r;
      ruleRefs.push("mood:session.start");
      continue;
    }
    if (s.priority >= 4) {
      dA += 0.05 * r;
      ruleRefs.push("mood:high_priority.generic");
      continue;
    }
  }

  const valence = clamp(
    prev.valence * 0.82 + dV,
    -1,
    1
  );
  const arousal = clamp(
    prev.arousal * 0.75 + dA + urgency * 0.2,
    0,
    1
  );
  const dominance = clamp(
    prev.dominance * 0.8 + dD - riskClamped * 0.25,
    0,
    1
  );

  const tags = inferTagsFromScalars(valence, arousal, dominance, riskClamped);
  const confidence = 0.84;

  const mood = createMoodState({
    valence,
    arousal,
    dominance,
    tags,
    confidence
  });

  return {
    mood,
    ruleRefs: [...new Set(ruleRefs)]
  };
}

/**
 * Noise-seeded pulse from arousal (+ focused tag boosts heartbeat).
 *
 * @param {{ arousal?: number; tags?: string[] }} mood
 */
export function derivePulse(mood) {
  return createPulseFromArousal(mood);
}

/**
 * Deterministic pulse (tests): blink jitter replaces Math.random drift.
 *
 * @param {{ arousal?: number; tags?: string[] }} mood
 * @param {number} [jitter]
 */
export function derivePulseDeterministic(mood, jitter = 0) {
  const arousal = clamp(Number(mood.arousal ?? 0), 0, 1);
  const tags = mood.tags ?? [];
  const focusBoost = Array.isArray(tags) && tags.includes("focused") ? 8 : 0;
  const heartbeatBpm = Math.round(58 + arousal * 28 + focusBoost);
  const breathMs = Math.round(4800 - arousal * 2200);
  const arousalBlink = arousal > 0.5 ? 800 : 0;
  const blinkMs = Math.round(3200 - arousalBlink + jitter);
  const microMotion =
    Math.round((0.1 + arousal * 0.6) * 100) / 100;
  return createPulseState({
    heartbeatBpm: clamp(heartbeatBpm, 58, 96),
    breathMs: clamp(breathMs, 2600, 4800),
    blinkMs: clamp(blinkMs, 1800, 4200),
    microMotion: clamp(microMotion, 0.1, 0.7)
  });
}

/**
 * Natural relaxation when untouched between ticks.
 *
 * @param {ReturnType<typeof createMoodState>} prev
 * @param {number} [elapsedMs]
 */
export function decayMood(prev, elapsedMs = 1000) {
  const t = Math.max(0, elapsedMs) / 1000;
  const targetV = 0.3;
  const targetA = 0.2;
  const targetD = 0.45;

  const valence = clamp(
    prev.valence + (targetV - prev.valence) * (1 - Math.pow(0.99, t)),
    -1,
    1
  );
  const arousal = clamp(
    prev.arousal + (targetA - prev.arousal) * (1 - Math.pow(0.97, t)),
    0,
    1
  );
  const dominance = clamp(
    prev.dominance + (targetD - prev.dominance) * (1 - Math.pow(0.99, t)),
    0,
    1
  );

  let mood = createMoodState({
    ...prev,
    valence,
    arousal,
    dominance,
    confidence: prev.confidence
  });

  const riskProxy = 0;
  const tags = inferTagsFromScalars(valence, arousal, dominance, riskProxy);
  mood = createMoodState({
    valence: mood.valence,
    arousal: mood.arousal,
    dominance: mood.dominance,
    tags,
    confidence: mood.confidence
  });
  return mood;
}

/**
 * @param {ReturnType<typeof createMoodState>} mood
 * @param {string} [phase]
 */
export function deriveExpression(mood, phase = "idle") {
  const tags = mood.tags ?? [];
  const ph = String(phase).toLowerCase();
  const has = (/** @type {string} */ t) => tags.includes(t);

  if (has("guarded") || has("cautious") || ph === "guarded") {
    return createExpressionState({ face: "warn", gesture: "pulse-ring", intensity: 2 });
  }
  if (ph === "speaking" || ph === "foreground") {
    return createExpressionState({ face: "speak", gesture: "glow", intensity: 2 });
  }
  if (ph === "thinking" || ph === "reflecting" || ph === "attentive") {
    return createExpressionState({ face: "think", gesture: "none", intensity: 1 });
  }
  if (has("sleepy")) {
    return createExpressionState({ face: "idle", gesture: "none", intensity: 0 });
  }
  if (has("tired") || has("uneasy")) {
    return createExpressionState({ face: "idle", gesture: "none", intensity: 0 });
  }
  if (has("delighted") || has("content")) {
    return createExpressionState({ face: "smile", gesture: "nod", intensity: 2 });
  }
  if (has("curious")) {
    return createExpressionState({ face: "smile", gesture: "nod", intensity: 1 });
  }
  if (has("focused") || has("attentive")) {
    return createExpressionState({ face: "think", gesture: "cursor-tail", intensity: 1 });
  }
  if (has("confident")) {
    return createExpressionState({ face: "smile", gesture: "glow", intensity: 2 });
  }
  return createExpressionState({ face: "idle", gesture: "none", intensity: 1 });
}

/**
 * Multi-tag inference from VAD scalars. Tags are ordered by relevance.
 * Lower thresholds and multiple overlapping conditions produce richer,
 * more dynamic mood representations than a single if-else chain.
 *
 * @param {number} valence  -1..1
 * @param {number} arousal   0..1
 * @param {number} dominance 0..1
 * @param {number} risk      0..1
 * @returns {string[]}
 */
function inferTagsFromScalars(valence, arousal, dominance, risk) {
  /** @type {string[]} */
  const tags = [];

  // Risk axis
  if (risk > 0.6) tags.push("guarded");
  else if (risk > 0.3) tags.push("cautious");

  // Arousal axis
  if (arousal > 0.55) tags.push("focused");
  else if (arousal > 0.3) tags.push("attentive");

  // Valence axis
  if (valence > 0.3) tags.push("delighted");
  else if (valence > 0.05) tags.push("content");
  else if (valence < -0.2) tags.push("tired");
  else if (valence < -0.05) tags.push("uneasy");

  // Dominance combos
  if (dominance > 0.55 && arousal > 0.25) tags.push("confident");
  if (dominance < 0.4 && arousal > 0.2) tags.push("curious");

  // Low-energy state
  if (arousal < 0.12 && valence > -0.15 && valence < 0.2) tags.push("sleepy");

  if (tags.length === 0) tags.push("calm");
  return tags;
}
