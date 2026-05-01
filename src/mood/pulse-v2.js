import { clamp } from "./types.js";

/** @type {readonly string[]} */
const PULSE_EVENTS = Object.freeze([
  "steady",
  "quickening",
  "holding",
  "skip",
  "flutter",
  "settling",
  "exhale",
  "surge",
]);

/** @type {ReadonlySet<string>} */
const PULSE_EVENT_SET = new Set(PULSE_EVENTS);

/** @param {unknown} s @returns {typeof PULSE_EVENTS[number]} */
function normalizePulseEvent(s) {
  if (typeof s === "string" && PULSE_EVENT_SET.has(s))
    return /** @type {typeof PULSE_EVENTS[number]} */ (s);
  return "steady";
}

/** @param {unknown} v @returns {readonly string[]} */
function normalizeCauseIds(v) {
  if (!Array.isArray(v)) return Object.freeze([]);
  return Object.freeze(
    v.map((x) => (typeof x === "string" ? x : String(x))),
  );
}

/** @param {number} phase @returns {number} */
function normPhase(phase) {
  const x = Number(phase);
  if (!Number.isFinite(x)) return 0;
  return ((x % 1) + 1) % 1;
}

/** @param {number} prev @param {number} target @param {number} rate */
function smooth(prev, target, rate) {
  return prev + rate * (target - prev);
}

const DEFAULT_PULSE_STATE = Object.freeze({
  bpm: 62,
  targetBpm: 62,
  hrvMs: 55,
  breathMs: 4800,
  breathPhase: 0,
  beatPhase: 0,
  beatStrength: 0.5,
  sympathetic: 0.15,
  parasympathetic: 0.35,
  stressLoad: 0.1,
  recoveryLoad: 0.2,
  fatigueLoad: 0,
  irregularity: 0.12,
  pulseEvent: /** @type {typeof PULSE_EVENTS[number]} */ ("steady"),
  causeIds: Object.freeze([]),
});

/**
 * @param {object} [overrides]
 * @returns {Readonly<{
 *   bpm: number,
 *   targetBpm: number,
 *   hrvMs: number,
 *   breathMs: number,
 *   breathPhase: number,
 *   beatPhase: number,
 *   beatStrength: number,
 *   sympathetic: number,
 *   parasympathetic: number,
 *   stressLoad: number,
 *   recoveryLoad: number,
 *   fatigueLoad: number,
 *   irregularity: number,
 *   pulseEvent: typeof PULSE_EVENTS[number],
 *   causeIds: readonly string[],
 * }>}
 */
export function createPulseStateV2(overrides = {}) {
  const o = /** @type {Record<string, unknown>} */ (overrides);
  const causeIdsIn =
    "causeIds" in o && Array.isArray(o.causeIds)
      ? o.causeIds
      : DEFAULT_PULSE_STATE.causeIds;

  return Object.freeze({
    bpm: clamp(o.bpm ?? DEFAULT_PULSE_STATE.bpm, 48, 112),
    targetBpm: clamp(o.targetBpm ?? DEFAULT_PULSE_STATE.targetBpm, 48, 112),
    hrvMs: clamp(o.hrvMs ?? DEFAULT_PULSE_STATE.hrvMs, 8, 90),
    breathMs: clamp(o.breathMs ?? DEFAULT_PULSE_STATE.breathMs, 2200, 6800),
    breathPhase: normPhase(o.breathPhase ?? DEFAULT_PULSE_STATE.breathPhase),
    beatPhase: normPhase(o.beatPhase ?? DEFAULT_PULSE_STATE.beatPhase),
    beatStrength: clamp(
      o.beatStrength ?? DEFAULT_PULSE_STATE.beatStrength,
      0,
      1,
    ),
    sympathetic: clamp(
      o.sympathetic ?? DEFAULT_PULSE_STATE.sympathetic,
      0,
      1,
    ),
    parasympathetic: clamp(
      o.parasympathetic ?? DEFAULT_PULSE_STATE.parasympathetic,
      0,
      1,
    ),
    stressLoad: clamp(o.stressLoad ?? DEFAULT_PULSE_STATE.stressLoad, 0, 1),
    recoveryLoad: clamp(
      o.recoveryLoad ?? DEFAULT_PULSE_STATE.recoveryLoad,
      0,
      1,
    ),
    fatigueLoad: clamp(o.fatigueLoad ?? DEFAULT_PULSE_STATE.fatigueLoad, 0, 1),
    irregularity: clamp(
      o.irregularity ?? DEFAULT_PULSE_STATE.irregularity,
      0,
      1,
    ),
    pulseEvent: normalizePulseEvent(o.pulseEvent ?? DEFAULT_PULSE_STATE.pulseEvent),
    causeIds: normalizeCauseIds(causeIdsIn),
  });
}

const DEFAULT_ENGINE_CONFIG = Object.freeze({
  personaBaseBpm: 62,
  smoothUpRate: 0.30,
  smoothDownRate: 0.18,
  breathCouplingStrength: 0.15,
  minBpm: 48,
  maxBpm: 112,
});

/** @returns {Record<string, unknown>} */
function mutablePulseSnapshot() {
  return {
    bpm: DEFAULT_PULSE_STATE.bpm,
    targetBpm: DEFAULT_PULSE_STATE.targetBpm,
    hrvMs: DEFAULT_PULSE_STATE.hrvMs,
    breathMs: DEFAULT_PULSE_STATE.breathMs,
    breathPhase: DEFAULT_PULSE_STATE.breathPhase,
    beatPhase: DEFAULT_PULSE_STATE.beatPhase,
    beatStrength: DEFAULT_PULSE_STATE.beatStrength,
    sympathetic: DEFAULT_PULSE_STATE.sympathetic,
    parasympathetic: DEFAULT_PULSE_STATE.parasympathetic,
    stressLoad: DEFAULT_PULSE_STATE.stressLoad,
    recoveryLoad: DEFAULT_PULSE_STATE.recoveryLoad,
    fatigueLoad: DEFAULT_PULSE_STATE.fatigueLoad,
    irregularity: DEFAULT_PULSE_STATE.irregularity,
    pulseEvent: DEFAULT_PULSE_STATE.pulseEvent,
    causeIds: [...DEFAULT_PULSE_STATE.causeIds],
  };
}

/**
 * @param {object} prev
 * @param {number} bpm
 * @param {number} targetBpm
 * @param {object} [mood]
 * @param {object} [host]
 */
export function classifyPulseEvent(prev, bpm, targetBpm, mood, host) {
  const appr = mood?.appraisal || {};
  const tend = mood?.tendency || {};
  const delta = bpm - prev.bpm;

  if ((appr.risk || 0) > 0.6 || host?.sandbox === "dangerous") return "surge";
  if (delta > 3 && targetBpm > bpm + 2) return "quickening";
  if ((tend.wait || 0) > 0.4 && Math.abs(delta) < 1.5) return "holding";
  if (Math.abs(delta) > 8 && (appr.goalBlockage || 0) > 0.3) return "skip";
  if ((host?.toolConcurrency || 0) > 2 || (host?.stdoutRate || 0) > 0.7)
    return "flutter";
  if (delta < -2 && prev.pulseEvent !== "settling") return "settling";
  if (delta < -1.5 && (tend.celebrate || 0) > 0.15) return "exhale";
  return "steady";
}

/**
 * @param {object} [config]
 */
export function createPulseEngine(config = {}) {
  let minBpm = clamp(
    config.minBpm ?? DEFAULT_ENGINE_CONFIG.minBpm,
    40,
    200,
  );
  let maxBpm = clamp(
    config.maxBpm ?? DEFAULT_ENGINE_CONFIG.maxBpm,
    40,
    200,
  );
  if (maxBpm < minBpm) {
    const t = minBpm;
    minBpm = maxBpm;
    maxBpm = t;
  }

  const cfg = {
    personaBaseBpm: clamp(
      config.personaBaseBpm ?? DEFAULT_ENGINE_CONFIG.personaBaseBpm,
      40,
      180,
    ),
    smoothUpRate: clamp(
      config.smoothUpRate ?? DEFAULT_ENGINE_CONFIG.smoothUpRate,
      0,
      1,
    ),
    smoothDownRate: clamp(
      config.smoothDownRate ?? DEFAULT_ENGINE_CONFIG.smoothDownRate,
      0,
      1,
    ),
    breathCouplingStrength: clamp(
      config.breathCouplingStrength ??
        DEFAULT_ENGINE_CONFIG.breathCouplingStrength,
      0,
      1,
    ),
    minBpm,
    maxBpm,
  };

  /** @type {ReturnType<typeof mutablePulseSnapshot>} */
  let internal = mutablePulseSnapshot();

  return {
    /**
     * @param {number} dtMs
     * @param {object} [moodFrame]
     * @param {object} [hostPressure]
     * @param {object} [memDebt]
     */
    tick(dtMs, moodFrame, hostPressure = {}, memDebt = {}) {
      const prev = createPulseStateV2(internal);
      const dtMsSafe = Math.min(Number(dtMs) || 0, 2000);

      const core = moodFrame?.core || {};
      const appr = moodFrame?.appraisal || {};
      const tend = moodFrame?.tendency || {};

      const rawStress = clamp(
        0.35 * (core.arousal || 0) +
          0.25 * (appr.risk || 0) +
          0.18 * (appr.uncertainty || 0) +
          0.15 * (appr.goalBlockage || 0) +
          0.12 * (hostPressure.toolConcurrency || 0) +
          0.08 * (hostPressure.permissionPressure || 0),
        0,
        1,
      );
      const stress = smooth(prev.stressLoad, rawStress, 0.25);

      const rawRecovery = clamp(
        0.25 * (tend.wait || 0) +
          0.25 * (tend.celebrate || 0) +
          0.25 * Math.max(0, core.valence || 0) +
          0.15 * (hostPressure.recentSuccess || 0) +
          0.10 * (memDebt.calmBias || 0) +
          0.15 * (1 - rawStress),
        0,
        1,
      );
      const recovery = smooth(prev.recoveryLoad, rawRecovery, 0.2);

      const sympathetic = smooth(
        prev.sympathetic,
        stress,
        cfg.smoothUpRate,
      );
      const parasympathetic = smooth(
        prev.parasympathetic,
        recovery,
        cfg.smoothDownRate,
      );

      const dangerousMode =
        hostPressure.sandbox === "dangerous" ||
        hostPressure.mode === "full-auto";
      const targetBpm = clamp(
        cfg.personaBaseBpm +
          26 * (core.arousal || 0) +
          14 * (appr.risk || 0) +
          10 * (appr.uncertainty || 0) +
          8 * (appr.goalBlockage || 0) +
          6 * (tend.guard || 0) +
          5 * (tend.verify || 0) +
          (dangerousMode ? 8 : 0) -
          8 * (appr.controllability || 0) -
          7 * (tend.wait || 0) -
          6 * recovery -
          4 * Math.max(0, (memDebt.fatigue || 0) - 0.3),
        cfg.minBpm,
        cfg.maxBpm,
      );

      const bpmRate =
        targetBpm > prev.bpm ? cfg.smoothUpRate : cfg.smoothDownRate;
      const bpm = smooth(prev.bpm, targetBpm, bpmRate);

      const hrvMs = clamp(
        55 +
          25 * parasympathetic +
          18 * recovery -
          20 * stress -
          12 * (memDebt.fatigue || 0),
        8,
        90,
      );
      const breathMs = clamp(
        5200 -
          1600 * (core.arousal || 0) -
          900 * (appr.risk || 0) -
          700 * (appr.uncertainty || 0) +
          900 * recovery +
          600 * (memDebt.calmBias || 0),
        2200,
        6800,
      );
      const irregularity = clamp(
        0.12 +
          0.35 * (appr.uncertainty || 0) +
          0.25 * (memDebt.trust || 0) -
          0.15 * parasympathetic,
        0,
        1,
      );

      const fatigueLoad = clamp(memDebt.fatigue ?? 0, 0, 1);

      const beatPeriodMs = 60000 / Math.max(40, bpm);
      const beatPhase = (prev.beatPhase + dtMsSafe / beatPeriodMs) % 1;
      const breathPhase =
        (prev.breathPhase + dtMsSafe / Math.max(500, breathMs)) % 1;
      const beatStrength = clamp(
        0.3 +
          0.4 * sympathetic +
          0.2 * (1 - parasympathetic) -
          0.15 * (memDebt.fatigue || 0),
        0,
        1,
      );

      const pulseEvent = classifyPulseEvent(
        prev,
        bpm,
        targetBpm,
        moodFrame,
        hostPressure,
      );

      internal.bpm = bpm;
      internal.targetBpm = targetBpm;
      internal.hrvMs = hrvMs;
      internal.breathMs = breathMs;
      internal.breathPhase = breathPhase;
      internal.beatPhase = beatPhase;
      internal.beatStrength = beatStrength;
      internal.sympathetic = sympathetic;
      internal.parasympathetic = parasympathetic;
      internal.stressLoad = stress;
      internal.recoveryLoad = recovery;
      internal.fatigueLoad = fatigueLoad;
      internal.irregularity = irregularity;
      internal.pulseEvent = pulseEvent;

      return createPulseStateV2(internal);
    },

    getState() {
      return createPulseStateV2(internal);
    },

    reset() {
      internal = mutablePulseSnapshot();
    },
  };
}

/** @param {number} value @param {number} width */
function miniBar(value, width) {
  const v = clamp(value, 0, 1);
  const fill = Math.round(v * width);
  return "▓".repeat(fill) + "░".repeat(Math.max(0, width - fill));
}

/** @param {ReturnType<typeof createPulseStateV2>} pulse */
function generateBeatWave(pulse) {
  const phase = pulse.beatPhase || 0;
  const strength = pulse.beatStrength || 0.5;
  const chars = "▁▂▃▄▅▆▇█";
  const wave = [];
  for (let i = 0; i < 8; i++) {
    const t = (i / 8 + phase) % 1;
    const v = Math.sin(t * Math.PI * 2) * 0.5 + 0.5;
    const idx = Math.min(7, Math.floor(v * strength * 8));
    wave.push(chars[idx]);
  }
  return wave.join("");
}

/**
 * @param {Readonly<Partial<ReturnType<typeof createPulseStateV2>>>} pulse
 */
export function derivePulseVisual(pulse) {
  const bpm = Math.round(pulse.bpm || 62);
  const breathS = ((pulse.breathMs || 4800) / 1000).toFixed(1);
  const eventIcon =
    {
      steady: "●",
      quickening: "▲",
      holding: "◆",
      skip: "○",
      flutter: "≋",
      settling: "▽",
      exhale: "◌",
      surge: "⚡",
    }[pulse.pulseEvent || "steady"] || "●";

  const stressBar = miniBar(pulse.stressLoad || 0, 6);
  const recoveryBar = miniBar(pulse.recoveryLoad || 0, 6);

  const frozen = Object.freeze({
    bpmText: `${bpm} bpm`,
    breathText: `${breathS}s`,
    eventIcon,
    eventName: pulse.pulseEvent || "steady",
    stressBar,
    recoveryBar,
    sympatheticPct: Math.round((pulse.sympathetic || 0) * 100),
    parasympatheticPct: Math.round((pulse.parasympathetic || 0) * 100),
    beatWave: generateBeatWave(
      /** @type {ReturnType<typeof createPulseStateV2>} */ (pulse),
    ),
    fatigueText:
      (pulse.fatigueLoad || 0) > 0.1
        ? `fatigue ${((pulse.fatigueLoad ?? 0) * 100).toFixed(0)}%`
        : "",
  });
  return frozen;
}
