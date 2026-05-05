import {
  clamp,
  createMoodEpisode,
  createVisibleMood,
  MOOD_GROUPS,
} from "./types.js";
import { MOOD_PROTOTYPES, findPrototype } from "./prototypes.js";

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

/** @type {ReadonlySet<string>} */
const FAILURE_GROUP_MOODS = new Set(MOOD_GROUPS.failure);

const RATE_WINDOW_MS = 60_000;
const ONSET_MS = 400;
const RISE_END_MS = 1500;
const DIST_CONF_SCALE = 3.75;
const DIST_INTENSITY_SCALE = 2.75;

/** @typedef {ReturnType<import("./types.js").createMoodFrame>} MoodFrame */
/** @typedef {ReturnType<typeof findPrototype>} MoodPrototype */

/**
 * @param {MoodFrame} frame
 * @param {MoodPrototype} proto
 * @returns {number}
 */
export function weightedMoodDistance(frame, proto) {
  const coreW = 1.0;
  const appraisalW = 0.7;
  const tendencyW = 0.5;

  let dist = 0;
  const fc = frame.core;
  const pc = proto.core;
  dist +=
    coreW *
    ((fc.valence - pc.valence) ** 2 +
      (fc.arousal - pc.arousal) ** 2 +
      (fc.dominance - pc.dominance) ** 2);

  for (const [key, protoVal] of Object.entries(proto.appraisal)) {
    const frameVal = /** @type {Record<string, number>} */ (frame.appraisal)[key] ?? 0;
    dist += appraisalW * (frameVal - protoVal) ** 2;
  }
  for (const [key, protoVal] of Object.entries(proto.tendency)) {
    const frameVal = /** @type {Record<string, number>} */ (frame.tendency)[key] ?? 0;
    dist += tendencyW * (frameVal - protoVal) ** 2;
  }
  return Math.sqrt(dist);
}

/**
 * @param {number} dist
 * @returns {number}
 */
function distanceToConfidence(dist) {
  return clamp(1 - dist / DIST_CONF_SCALE, 0, 1);
}

/**
 * @param {number} dist
 * @returns {number}
 */
function distanceToIntensity(dist) {
  return clamp(1 - dist / DIST_INTENSITY_SCALE, 0, 1);
}

/**
 * @param {{ moodId: string, timestamp: number }[]} history
 * @param {number} now
 * @param {number} windowMs
 * @returns {number}
 */
function countSwitchesInWindow(history, now, windowMs) {
  const lo = now - windowMs;
  let n = 0;
  for (let i = history.length - 1; i >= 0; i--) {
    if (history[i].timestamp < lo) break;
    n++;
  }
  return n;
}

/**
 * @param {unknown[]} impulses
 * @returns {{ tags: string[], priority: number, cause: string }[]}
 */
function normalizeImpulses(impulses) {
  if (!Array.isArray(impulses)) return [];
  const out = [];
  for (const raw of impulses) {
    if (!raw || typeof raw !== "object") continue;
    const o = /** @type {Record<string, unknown>} */ (raw);
    const tags = Array.isArray(o.tags)
      ? o.tags.map((t) => (typeof t === "string" ? t : String(t)))
      : [];
    const priority = clamp(Number(o.priority ?? 0), 0, 1);
    const cause = typeof o.cause === "string" ? o.cause : "";
    out.push({ tags, priority, cause });
  }
  return out;
}

/**
 * @param {ReturnType<typeof normalizeImpulses>} impulses
 * @param {string} protoId
 */
function countTagMatches(impulses, protoId) {
  let c = 0;
  for (const imp of impulses) {
    for (const t of imp.tags) {
      if (t === protoId) c++;
    }
  }
  return c;
}

/**
 * @param {ReturnType<typeof normalizeImpulses>} impulses
 */
function hasCriticalImpulse(impulses) {
  return impulses.some((i) => i.priority >= 0.9);
}

/**
 * @param {ReturnType<typeof normalizeImpulses>} impulses
 */
function impulseCauseIds(impulses) {
  const ids = [];
  for (const imp of impulses) {
    if (imp.cause) ids.push(imp.cause);
  }
  return ids;
}

/**
 * @param {MoodFrame} frame
 * @param {MoodPrototype} proto
 * @param {MoodPrototype} currentProto
 * @param {ReturnType<typeof normalizeImpulses>} impulses
 * @param {number} now
 * @param {Map<string, number>} cooldowns
 */
function prototypeScore(
  frame,
  proto,
  currentProto,
  impulses,
  now,
  cooldowns,
) {
  const dist = weightedMoodDistance(frame, proto);
  let score = -dist;
  if (currentProto.recoveryTo?.includes(proto.id)) score += 0.08;
  score += 0.05 * countTagMatches(impulses, proto.id);
  const memoryBias = 0;
  score += memoryBias;
  const until = cooldowns.get(proto.id);
  if (until != null && now < until) score -= 0.15;
  return { score, dist };
}

/**
 * Mutable episode snapshot (not frozen until exported).
 * @typedef {{
 *   moodId: string,
 *   phase: "onset"|"rise"|"sustain"|"decay"|"recovery",
 *   startedAt: number,
 *   phaseStartedAt: number,
 *   causeIds: string[],
 *   peakIntensity: number,
 * }} MutableEpisode
 */

/**
 * @param {MutableEpisode} ep
 * @param {number} now
 * @param {string} currentMoodId
 * @param {number} currentScore
 * @param {Map<string, number>} scoreById
 * @param {number} hysteresisMargin
 */
function advanceEpisodePhase(
  ep,
  now,
  currentMoodId,
  currentScore,
  scoreById,
  hysteresisMargin,
) {
  let bestOther = -Infinity;
  for (const [id, s] of scoreById) {
    if (id === currentMoodId) continue;
    if (s > bestOther) bestOther = s;
  }
  if (!Number.isFinite(bestOther)) bestOther = -Infinity;

  const halfM = hysteresisMargin / 2;
  const dominant = currentScore >= bestOther + halfM;
  const age = now - ep.startedAt;
  const inFailure = FAILURE_GROUP_MOODS.has(currentMoodId);

  /** @type {MutableEpisode["phase"]} */
  let nextPhase = ep.phase;
  if (age < ONSET_MS) nextPhase = "onset";
  else if (age < RISE_END_MS) nextPhase = "rise";
  else if (inFailure && !dominant) nextPhase = "recovery";
  else if (!dominant) nextPhase = "decay";
  else nextPhase = "sustain";

  const phaseChanged = nextPhase !== ep.phase;
  return {
    ...ep,
    moodId: currentMoodId,
    phase: nextPhase,
    phaseStartedAt: phaseChanged ? now : ep.phaseStartedAt,
  };
}

/**
 * @param {object} [config]
 */
export function createTransitionGovernor(config = {}) {
  const hysteresisMargin = Number(config.hysteresisMargin ?? 0.06);
  const defaultMinDwellMs = Number(config.defaultMinDwellMs ?? 1200);
  const criticalOverride = config.criticalOverride !== false;
  const maxPrimarySwitchesPerMinute = Number(
    config.maxPrimarySwitchesPerMinute ?? 18,
  );
  const secondaryMoodEnabled = config.secondaryMoodEnabled !== false;

  const now0 = Date.now();
  /** @type {string} */
  let currentMoodId = "calm";
  /** @type {string | null} */
  let secondaryMoodId = null;

  /** @type {MutableEpisode} */
  let episode = {
    moodId: currentMoodId,
    phase: "onset",
    startedAt: now0,
    phaseStartedAt: now0,
    causeIds: [],
    peakIntensity: 0.5,
  };

  /** @type {{ moodId: string, timestamp: number }[]} */
  let switchHistory = [];
  /** @type {Map<string, number>} */
  const cooldowns = new Map();

  function protoMinDwell(p) {
    const m = p?.minDwellMs;
    return Number.isFinite(Number(m)) ? Number(m) : defaultMinDwellMs;
  }

  function pruneCooldowns(now) {
    for (const [id, until] of cooldowns) {
      if (until <= now) cooldowns.delete(id);
    }
  }

  function pruneSwitchHistory(now) {
    const lo = now - RATE_WINDOW_MS * 2;
    if (switchHistory.length === 0) return;
    let i0 = 0;
    while (i0 < switchHistory.length && switchHistory[i0].timestamp < lo) i0++;
    if (i0 > 0) switchHistory = switchHistory.slice(i0);
  }

  /**
   * @param {MoodFrame | null} frame
   * @param {string} newId
   * @param {string} oldId
   * @param {number} now
   * @param {string[]} extraCauses
   */
  function commitSwitch(frame, newId, oldId, now, extraCauses) {
    const oldProto = findPrototype(oldId);
    cooldowns.set(oldId, now + protoMinDwell(oldProto) * 2);
    switchHistory.push({ moodId: newId, timestamp: now });

    const causes = [...episode.causeIds];
    for (const c of extraCauses) {
      if (c && !causes.includes(c)) causes.push(c);
    }

    const peak = frame
      ? distanceToIntensity(weightedMoodDistance(frame, findPrototype(newId)))
      : 0.5;
    episode = {
      moodId: newId,
      phase: "onset",
      startedAt: now,
      phaseStartedAt: now,
      causeIds: causes,
      peakIntensity: peak,
    };
    currentMoodId = newId;
  }

  let lastFrameRef = /** @type {MoodFrame | null} */ (null);

  return {
    /**
     * @param {MoodFrame} moodFrame
     * @param {unknown[]} [activeImpulses]
     * @param {number} [now]
     */
    update(moodFrame, activeImpulses = [], now = Date.now()) {
      lastFrameRef = moodFrame;
      pruneCooldowns(now);
      pruneSwitchHistory(now);
      const impulses = normalizeImpulses(activeImpulses);
      const crit = criticalOverride && hasCriticalImpulse(impulses);
      const currentProto = findPrototype(currentMoodId);

      /** @type {{ proto: MoodPrototype, score: number, dist: number }[]} */
      const ranked = [];
      for (const proto of MOOD_PROTOTYPES) {
        const { score, dist } = prototypeScore(
          moodFrameV2,
          proto,
          currentProto,
          impulses,
          now,
          cooldowns,
        );
        ranked.push({ proto, score, dist });
      }
      ranked.sort((a, b) => {
        if (b.score !== a.score) return b.score - a.score;
        return a.proto.id.localeCompare(b.proto.id);
      });

      const best = ranked[0];
      const confidence = distanceToConfidence(best.dist);

      const scoreById = new Map(ranked.map((r) => [r.proto.id, r.score]));

      const currentRank = ranked.find((r) => r.proto.id === currentMoodId);
      const currentScore = currentRank ? currentRank.score : -Infinity;

      const dwellMs = now - episode.startedAt;
      const minDwell = protoMinDwell(currentProto);
      const dwellOk = dwellMs >= minDwell || crit;

      const switchesLastMinute = countSwitchesInWindow(
        switchHistory,
        now,
        RATE_WINDOW_MS,
      );
      const rateOk = switchesLastMinute < maxPrimarySwitchesPerMinute;

      let primaryId = currentMoodId;
      const candidate = best.proto;
      const shouldConsider =
        candidate.id !== currentMoodId &&
        best.score > currentScore + hysteresisMargin &&
        dwellOk &&
        rateOk &&
        confidence >= 0.3;

      /** @type {string[]} */
      const extraCauses = [];
      if (shouldConsider) {
        for (const imp of impulses) {
          if (imp.cause) extraCauses.push(imp.cause);
        }
        commitSwitch(moodFrameV2, candidate.id, currentMoodId, now, extraCauses);
        primaryId = currentMoodId;
      } else {
        episode = advanceEpisodePhase(
          episode,
          now,
          primaryId,
          currentScore,
          scoreById,
          hysteresisMargin,
        );
        episode.moodId = primaryId;
      }

      const primaryProto = findPrototype(primaryId);
      const intensity = distanceToIntensity(
        weightedMoodDistance(moodFrameV2, primaryProto),
      );
      episode.peakIntensity = Math.max(episode.peakIntensity, intensity);

      const otherScores = ranked
        .filter((r) => r.proto.id !== primaryId)
        .map((r) => r.score);
      const bestOtherScore = otherScores.length
        ? Math.max(...otherScores)
        : -Infinity;
      const primaryScore = scoreById.get(primaryId) ?? -Infinity;
      const margin = primaryScore - bestOtherScore;
      const margin01 = clamp(margin / (2 * hysteresisMargin) + 0.5, 0, 1);
      const dwellForStability = now - episode.startedAt;
      const dwell01 = clamp(dwellForStability / 12_000, 0, 1);
      const stability = clamp(
        0.45 * dwell01 + 0.35 * margin01 + 0.2 * (episode.phase === "sustain" ? 1 : 0.55),
        0,
        1,
      );

      let secondary = null;
      if (secondaryMoodEnabled) {
        const pg = primaryProto.group;
        const alt = ranked.find((r) => r.proto.group !== pg);
        secondary = alt ? alt.proto.id : null;
      }
      secondaryMoodId = secondary;

      const ic = impulseCauseIds(impulses);
      const causeIds = [...new Set([...episode.causeIds, ...ic])];

      const episodeSnap = createMoodEpisode({
        moodId: episode.moodId,
        phase: episode.phase,
        startedAt: episode.startedAt,
        phaseStartedAt: episode.phaseStartedAt,
        causeIds: [...episode.causeIds],
        peakIntensity: episode.peakIntensity,
      });

      const visible = createVisibleMood({
        primary: primaryId,
        secondary,
        intensity,
        stability,
        causeIds,
        confidence,
      });

      return freezeDeep({
        ...visible,
        episode: episodeSnap,
      });
    },

    getCurrentMood() {
      return currentMoodId;
    },

    getEpisode() {
      return createMoodEpisode({
        moodId: episode.moodId,
        phase: episode.phase,
        startedAt: episode.startedAt,
        phaseStartedAt: episode.phaseStartedAt,
        causeIds: [...episode.causeIds],
        peakIntensity: episode.peakIntensity,
      });
    },

    /**
     * @param {number} [windowMs]
     */
    getRecentSwitches(windowMs = 60_000) {
      const lo = Date.now() - windowMs;
      const out = switchHistory
        .filter((s) => s.timestamp >= lo)
        .map((s) => Object.freeze({ ...s }));
      return Object.freeze(out);
    },

    /**
     * @param {string} moodId
     * @param {string} [causeId]
     */
    forceMood(moodId, causeId = "") {
      const now = Date.now();
      pruneCooldowns(now);
      pruneSwitchHistory(now);
      const target = findPrototype(typeof moodId === "string" ? moodId : "calm");
      const newId = target.id;
      const extra = causeId ? [causeId] : [];
      commitSwitch(lastFrameRef, newId, currentMoodId, now, extra);
    },
  };
}
