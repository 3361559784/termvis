import {
  clamp,
  createMoodFrameV2,
  createCoreAffect,
  createAppraisal,
  createActionTendency,
} from "./types.js";

/** @type {readonly string[]} */
const CORE_KEYS = /** @type {const} */ (["valence", "arousal", "dominance"]);

const APPRAISAL_DECAY = 0.08;

const DEFAULT_INTEGRATOR_CONFIG = Object.freeze({
  baselineReturn: Object.freeze({
    valence: 0.25,
    arousal: 0.30,
    dominance: 0.20,
  }),
  anchorGain: 0.30,
  ruleGain: 1.5,
  memoryGain: 0.22,
  fatigueGain: 0.06,
  smoothingTau: 0.55,
});

/** @param {number} x @param {number} fb @returns {number} */
function finiteOr(x, fb) {
  return Number.isFinite(x) ? x : fb;
}

/** @param {Record<string, unknown>} cfg @returns {typeof DEFAULT_INTEGRATOR_CONFIG} */
function mergeConfig(cfg) {
  const brIn = cfg.baselineReturn;
  const br =
    brIn && typeof brIn === "object"
      ? {
          valence: finiteOr(
            Number(/** @type {*} */ (brIn).valence),
            DEFAULT_INTEGRATOR_CONFIG.baselineReturn.valence,
          ),
          arousal: finiteOr(
            Number(/** @type {*} */ (brIn).arousal),
            DEFAULT_INTEGRATOR_CONFIG.baselineReturn.arousal,
          ),
          dominance: finiteOr(
            Number(/** @type {*} */ (brIn).dominance),
            DEFAULT_INTEGRATOR_CONFIG.baselineReturn.dominance,
          ),
        }
      : { ...DEFAULT_INTEGRATOR_CONFIG.baselineReturn };

  return {
    baselineReturn: br,
    anchorGain: finiteOr(Number(cfg.anchorGain), DEFAULT_INTEGRATOR_CONFIG.anchorGain),
    ruleGain: finiteOr(Number(cfg.ruleGain), DEFAULT_INTEGRATOR_CONFIG.ruleGain),
    memoryGain: finiteOr(Number(cfg.memoryGain), DEFAULT_INTEGRATOR_CONFIG.memoryGain),
    fatigueGain: finiteOr(Number(cfg.fatigueGain), DEFAULT_INTEGRATOR_CONFIG.fatigueGain),
    smoothingTau: clamp(
      finiteOr(Number(cfg.smoothingTau), DEFAULT_INTEGRATOR_CONFIG.smoothingTau),
      0,
      1,
    ),
  };
}

/** @returns {readonly string[]} */
function appraisalKeys() {
  return /** @type {readonly string[]} */ (Object.keys(createAppraisal()));
}

/** @returns {readonly string[]} */
function tendencyKeys() {
  return /** @type {readonly string[]} */ (Object.keys(createActionTendency()));
}

/**
 * @param {{ valence: number, arousal: number, dominance: number }} core
 */
function mutableCoreFrom(core) {
  return {
    valence: finiteOr(Number(core.valence), 0),
    arousal: finiteOr(Number(core.arousal), 0),
    dominance: finiteOr(Number(core.dominance), 0),
  };
}

/** @param {Readonly<Record<string, number>>} src */
function mutableAppraisalFrom(src) {
  /** @type {Record<string, number>} */
  const o = {};
  for (const k of appraisalKeys()) {
    o[k] = finiteOr(Number(src[k]), 0);
  }
  return o;
}

/** @param {Readonly<Record<string, number>>} src */
function mutableTendencyFrom(src) {
  /** @type {Record<string, number>} */
  const o = {};
  for (const k of tendencyKeys()) {
    o[k] = finiteOr(Number(src[k]), 0);
  }
  return o;
}

/** @param {ReturnType<typeof createMoodFrameV2>} frame */
function mutableMoodFromFrame(frame) {
  const m = frame.mood;
  return {
    primary: typeof m.primary === "string" ? m.primary : "calm",
    secondary: m.secondary ?? null,
    intensity: finiteOr(Number(m.intensity), 0.5),
    stability: finiteOr(Number(m.stability), 0.8),
    causeIds: Array.isArray(m.causeIds) ? [...m.causeIds] : [],
    confidence: finiteOr(Number(m.confidence), 0.8),
  };
}

/**
 * @param {{
 *   core: ReturnType<typeof mutableCoreFrom>,
 *   appraisal: Record<string, number>,
 *   tendency: Record<string, number>,
 *   mood: ReturnType<typeof mutableMoodFromFrame>,
 * }} parts
 */
function cloneMutableFrame(parts) {
  return {
    core: { ...parts.core },
    appraisal: { ...parts.appraisal },
    tendency: { ...parts.tendency },
    mood: { ...parts.mood, causeIds: [...parts.mood.causeIds] },
  };
}

function clampMutableCore(core) {
  core.valence = clamp(core.valence, -1, 1);
  core.arousal = clamp(core.arousal, 0, 1);
  core.dominance = clamp(core.dominance, 0, 1);
}

function clampMutableAppraisal(appraisal) {
  for (const k of appraisalKeys()) {
    appraisal[k] = clamp(appraisal[k], 0, 1);
  }
}

function clampMutableTendency(tendency) {
  for (const k of tendencyKeys()) {
    tendency[k] = clamp(tendency[k], 0, 1);
  }
}

function clampMutableFrame(frame) {
  clampMutableCore(frame.core);
  clampMutableAppraisal(frame.appraisal);
  clampMutableTendency(frame.tendency);
  frame.mood.intensity = clamp(frame.mood.intensity, 0, 1);
  frame.mood.stability = clamp(frame.mood.stability, 0, 1);
  frame.mood.confidence = clamp(frame.mood.confidence, 0, 1);
}

/** @param {unknown} impulse @param {number} now */
function impulseIsActive(impulse, now) {
  if (!impulse || typeof impulse !== "object") return false;
  const i = /** @type {Record<string, unknown>} */ (impulse);
  const ttl = Number(i.ttlMs);
  const ttlMs = Number.isFinite(ttl) ? Math.max(0, ttl) : 10_000;
  if (ttlMs <= 0) return false;

  if (Number.isFinite(Number(i.expiresAt))) {
    return now < Number(i.expiresAt);
  }
  if (Number.isFinite(Number(i.createdAt))) {
    return now < Number(i.createdAt) + ttlMs;
  }
  return true;
}

/** @param {unknown} anchor @param {number} now */
function anchorIsActive(anchor, now) {
  if (!anchor || typeof anchor !== "object") return false;
  const a = /** @type {Record<string, unknown>} */ (anchor);
  const ttl = Number(a.ttlMs);
  const ttlMs = Number.isFinite(ttl) ? Math.max(0, ttl) : 30_000;
  if (ttlMs <= 0) return false;
  const createdAt = Number(a.createdAt);
  if (!Number.isFinite(createdAt)) return true;
  return now < createdAt + ttlMs;
}

/**
 * @param {unknown} part
 * @param {Record<string, number>} force
 * @param {readonly string[]} keys
 * @param {number} gain
 */
function addMemoryPart(part, force, keys, gain) {
  if (!part || typeof part !== "object") return;
  const o = /** @type {Record<string, unknown>} */ (part);
  for (const k of keys) {
    if (k in o) {
      const v = Number(o[k]);
      if (Number.isFinite(v)) force[k] = finiteOr(force[k], 0) + gain * v;
    }
  }
}

/**
 * @param {object} [persona]
 * @param {null | { frustrationDebt?: number, fatigueDebt?: number, trustDebt?: number, uncertaintyDebt?: number, socialDebt?: number }} [debt]
 * @returns {Readonly<{ valence: number, arousal: number, dominance: number }>}
 */
export function computeBaseline(persona = {}, debt = null) {
  let v = 0.3;
  let a = 0.2;
  let d = 0.45;

  const traits = Array.isArray(persona?.traits) ? persona.traits : [];
  if (traits.includes("warm")) v += 0.05;
  if (traits.includes("calm")) a -= 0.03;
  if (traits.includes("confident")) d += 0.05;
  if (traits.includes("playful")) {
    v += 0.03;
    a += 0.02;
  }
  if (traits.includes("reserved")) {
    a -= 0.02;
    d -= 0.03;
  }

  if (debt) {
    v -= 0.1 * finiteOr(Number(debt.frustrationDebt), 0);
    a += 0.08 * finiteOr(Number(debt.uncertaintyDebt), 0);
    d -= 0.12 * finiteOr(Number(debt.trustDebt), 0);
    a -= 0.1 * finiteOr(Number(debt.fatigueDebt), 0);
    v -= 0.05 * finiteOr(Number(debt.socialDebt), 0);
  }

  return createCoreAffect({ valence: v, arousal: a, dominance: d });
}

/**
 * @param {object} [config]
 */
export function createIntegrator(config = {}) {
  const cfg = mergeConfig(/** @type {Record<string, unknown>} */ (config));
  const c = /** @type {Record<string, unknown>} */ (config);

  const baselineCore =
    c.baseline !== undefined && c.baseline !== null
      ? createCoreAffect(/** @type {*} */ (c.baseline))
      : computeBaseline(/** @type {object} */ (c.persona) ?? {}, null);

  /** @type {{ valence: number, arousal: number, dominance: number }} */
  let baseline = mutableCoreFrom(baselineCore);

  const blank = createMoodFrameV2({
    core: baselineCore,
    appraisal: {},
    tendency: {},
  });
  let raw = cloneMutableFrame({
    core: mutableCoreFrom(blank.core),
    appraisal: mutableAppraisalFrom(blank.appraisal),
    tendency: mutableTendencyFrom(blank.tendency),
    mood: mutableMoodFromFrame(blank),
  });
  let visible = cloneMutableFrame(raw);

  /** @type {number | null} */
  let lastTickAt = null;

  function reset() {
    const fr = createMoodFrameV2({
      core: createCoreAffect(baseline),
      appraisal: {},
      tendency: {},
    });
    raw = cloneMutableFrame({
      core: mutableCoreFrom(fr.core),
      appraisal: mutableAppraisalFrom(fr.appraisal),
      tendency: mutableTendencyFrom(fr.tendency),
      mood: mutableMoodFromFrame(fr),
    });
    visible = cloneMutableFrame(raw);
    lastTickAt = null;
  }

  /** @param {object} newBaseline */
  function setBaseline(newBaseline) {
    baseline = mutableCoreFrom(createCoreAffect(/** @type {*} */ (newBaseline)));
  }

  function getRawState() {
    clampMutableFrame(raw);
    return createMoodFrameV2({
      core: raw.core,
      appraisal: raw.appraisal,
      tendency: raw.tendency,
      mood: raw.mood,
    });
  }

  function getVisibleState() {
    clampMutableFrame(visible);
    return createMoodFrameV2({
      core: visible.core,
      appraisal: visible.appraisal,
      tendency: visible.tendency,
      mood: visible.mood,
    });
  }

  /**
   * @param {number} dtMs
   * @param {unknown[]} [impulses]
   * @param {unknown} [anchor]
   * @param {unknown} [memoryBias]
   * @param {unknown} [debt]
   */
  function tick(dtMs, impulses = [], anchor = null, memoryBias = null, debt = null) {
    const now = Date.now();
    const dtRaw = Number(dtMs) / 1000;
    const dt = clamp(Number.isFinite(dtRaw) ? dtRaw : 0, 0, 2);

    /** @type {Record<string, number>} */
    const coreForce = { valence: 0, arousal: 0, dominance: 0 };
    /** @type {Record<string, number>} */
    const appraisalForce = Object.fromEntries(appraisalKeys().map((k) => [k, 0]));
    /** @type {Record<string, number>} */
    const tendencyForce = Object.fromEntries(tendencyKeys().map((k) => [k, 0]));

    for (const dim of CORE_KEYS) {
      const rate = finiteOr(
        Number(cfg.baselineReturn[/** @type {string} */ (dim)]),
        DEFAULT_INTEGRATOR_CONFIG.baselineReturn[
          /** @type {"valence"|"arousal"|"dominance"} */ (dim)
        ],
      );
      const b = baseline[/** @type {"valence"|"arousal"|"dominance"} */ (dim)];
      const x = raw.core[/** @type {"valence"|"arousal"|"dominance"} */ (dim)];
      coreForce[dim] -= rate * (x - b);
    }

    for (const k of appraisalKeys()) {
      appraisalForce[k] -= APPRAISAL_DECAY * raw.appraisal[k];
    }
    for (const k of tendencyKeys()) {
      tendencyForce[k] -= APPRAISAL_DECAY * raw.tendency[k];
    }

    const ruleScale = cfg.ruleGain;
    for (const imp of impulses) {
      if (!impulseIsActive(imp, now)) continue;
      const i = /** @type {Record<string, unknown>} */ (imp);
      const rel = clamp(finiteOr(Number(i.reliability), 1), 0, 1);
      const pri = clamp(finiteOr(Number(i.priority), 0), 0, 1);
      const w = rel * pri * ruleScale;

      const cd = i.coreDelta;
      if (cd && typeof cd === "object") {
        for (const dim of CORE_KEYS) {
          if (dim in cd) {
            const dv = Number(/** @type {Record<string, unknown>} */ (cd)[dim]);
            if (Number.isFinite(dv))
              coreForce[dim] = finiteOr(coreForce[dim], 0) + dv * w;
          }
        }
      }
      const ad = i.appraisalDelta;
      if (ad && typeof ad === "object") {
        for (const k of appraisalKeys()) {
          if (k in ad) {
            const dv = Number(/** @type {Record<string, unknown>} */ (ad)[k]);
            if (Number.isFinite(dv))
              appraisalForce[k] = finiteOr(appraisalForce[k], 0) + dv * w;
          }
        }
      }
      const td = i.tendencyDelta;
      if (td && typeof td === "object") {
        for (const k of tendencyKeys()) {
          if (k in td) {
            const dv = Number(/** @type {Record<string, unknown>} */ (td)[k]);
            if (Number.isFinite(dv))
              tendencyForce[k] = finiteOr(tendencyForce[k], 0) + dv * w;
          }
        }
      }
    }

    if (anchorIsActive(anchor, now)) {
      const a = /** @type {Record<string, unknown>} */ (anchor);
      const conf = clamp(finiteOr(Number(a.confidence), 0.5), 0, 1);
      const ag = cfg.anchorGain * conf;
      const ct = a.coreTarget;
      if (ct && typeof ct === "object") {
        const o = /** @type {Record<string, unknown>} */ (ct);
        for (const dim of CORE_KEYS) {
          if (dim in o) {
            const target = Number(o[dim]);
            if (Number.isFinite(target)) {
              coreForce[dim] =
                finiteOr(coreForce[dim], 0) +
                ag * (target - raw.core[/** @type {"valence"|"arousal"|"dominance"} */ (dim)]);
            }
          }
        }
      }
      const at = a.appraisalTarget;
      if (at && typeof at === "object") {
        const o = /** @type {Record<string, unknown>} */ (at);
        for (const k of appraisalKeys()) {
          if (k in o) {
            const target = Number(o[k]);
            if (Number.isFinite(target)) {
              appraisalForce[k] =
                finiteOr(appraisalForce[k], 0) + ag * (target - raw.appraisal[k]);
            }
          }
        }
      }
      const tt = a.tendencyTarget;
      if (tt && typeof tt === "object") {
        const o = /** @type {Record<string, unknown>} */ (tt);
        for (const k of tendencyKeys()) {
          if (k in o) {
            const target = Number(o[k]);
            if (Number.isFinite(target)) {
              tendencyForce[k] =
                finiteOr(tendencyForce[k], 0) + ag * (target - raw.tendency[k]);
            }
          }
        }
      }
    }

    if (memoryBias && typeof memoryBias === "object") {
      const mb = /** @type {Record<string, unknown>} */ (memoryBias);
      const mg = cfg.memoryGain;
      addMemoryPart(mb.core, coreForce, CORE_KEYS, mg);
      addMemoryPart(mb.appraisal, appraisalForce, appraisalKeys(), mg);
      addMemoryPart(mb.tendency, tendencyForce, tendencyKeys(), mg);
    }

    if (debt && typeof debt === "object") {
      const D = /** @type {Record<string, unknown>} */ (debt);
      const fg = cfg.fatigueGain;
      const fr = clamp(finiteOr(Number(D.frustrationDebt), 0), 0, 1);
      const ft = clamp(finiteOr(Number(D.fatigueDebt), 0), 0, 1);
      const tr = clamp(finiteOr(Number(D.trustDebt), 0), 0, 1);
      const un = clamp(finiteOr(Number(D.uncertaintyDebt), 0), 0, 1);
      raw.core.valence -= fg * fr * dt;
      raw.core.arousal -= fg * ft * 0.5 * dt;
      raw.core.dominance -= fg * tr * dt;
      raw.core.arousal += fg * un * 0.3 * dt;
    }

    for (const dim of CORE_KEYS) {
      raw.core[dim] += dt * finiteOr(coreForce[dim], 0);
    }
    for (const k of appraisalKeys()) {
      raw.appraisal[k] += dt * finiteOr(appraisalForce[k], 0);
    }
    for (const k of tendencyKeys()) {
      raw.tendency[k] += dt * finiteOr(tendencyForce[k], 0);
    }

    clampMutableFrame(raw);

    const tau = cfg.smoothingTau;
    for (const dim of CORE_KEYS) {
      const r = raw.core[dim];
      const v = visible.core[dim];
      visible.core[dim] = v + tau * (r - v);
    }
    for (const k of appraisalKeys()) {
      visible.appraisal[k] += tau * (raw.appraisal[k] - visible.appraisal[k]);
    }
    for (const k of tendencyKeys()) {
      visible.tendency[k] += tau * (raw.tendency[k] - visible.tendency[k]);
    }

    clampMutableFrame(visible);

    lastTickAt = now;
    return getVisibleState();
  }

  return {
    tick,
    getRawState,
    getVisibleState,
    setBaseline,
    reset,
  };
}
