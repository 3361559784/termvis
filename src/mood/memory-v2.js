import { clamp } from "./types.js";

export function createMemoryStateV2(overrides = {}) {
  const o = overrides || {};
  const rhythm = o.rhythm || {};
  const relationship = o.relationship || {};
  const debt = o.debt || {};
  const bios = o.bios || {};

  return Object.freeze({
    working: Object.freeze({
      recentSignalCount: Math.max(0, Number(o.working?.recentSignalCount || 0)),
      recentMoodPath: Object.freeze(Array.isArray(o.working?.recentMoodPath) ? o.working.recentMoodPath.map(String).slice(-10) : []),
      activeTaskFacts: Object.freeze(Array.isArray(o.working?.activeTaskFacts) ? o.working.activeTaskFacts.map(String).slice(0, 8) : [])
    }),

    rhythm: Object.freeze({
      calmBias: clamp(Number(rhythm.calmBias ?? 0.3), 0, 1),
      typicalWorkingTempo: clamp(Number(rhythm.typicalWorkingTempo ?? 0.5), 0, 1),
      userInterruptPattern: clamp(Number(rhythm.userInterruptPattern ?? 0.2), 0, 1),
      preferredVerbosity: clamp(Number(rhythm.preferredVerbosity ?? 0.5), 0, 1),
      preferredPresence: normalizePreference(rhythm.preferredPresence)
    }),

    relationship: Object.freeze({
      trust: clamp(Number(relationship.trust ?? 0.6), 0, 1),
      familiarity: clamp(Number(relationship.familiarity ?? 0.3), 0, 1),
      correctionSensitivity: clamp(Number(relationship.correctionSensitivity ?? 0.5), 0, 1),
      praiseSensitivity: clamp(Number(relationship.praiseSensitivity ?? 0.5), 0, 1)
    }),

    debt: Object.freeze({
      frustration: clamp(Number(debt.frustration ?? 0), 0, 1),
      fatigue: clamp(Number(debt.fatigue ?? 0), 0, 1),
      uncertainty: clamp(Number(debt.uncertainty ?? 0), 0, 1),
      trust: clamp(Number(debt.trust ?? 0), 0, 1),
      social: clamp(Number(debt.social ?? 0), 0, 1)
    }),

    bios: Object.freeze({
      lifetimeTurnCount: Math.max(0, Math.floor(Number(bios.lifetimeTurnCount || 0))),
      sessionCount: Math.max(0, Math.floor(Number(bios.sessionCount || 1))),
      projectAgeDays: Math.max(0, Number(bios.projectAgeDays || 0)),
      rememberedMilestones: Object.freeze(Array.isArray(bios.rememberedMilestones) ? bios.rememberedMilestones.map(String).slice(0, 20) : [])
    })
  });
}

function normalizePreference(v) {
  const s = String(v || "balanced").toLowerCase();
  return ["minimal", "balanced", "expressive"].includes(s) ? s : "balanced";
}

export function createMemoryModel() {
  let state = {
    working: { recentSignalCount: 0, recentMoodPath: [], activeTaskFacts: [] },
    rhythm: { calmBias: 0.3, typicalWorkingTempo: 0.5, userInterruptPattern: 0.2, preferredVerbosity: 0.5, preferredPresence: "balanced" },
    relationship: { trust: 0.6, familiarity: 0.3, correctionSensitivity: 0.5, praiseSensitivity: 0.5 },
    debt: { frustration: 0, fatigue: 0, uncertainty: 0, trust: 0, social: 0 },
    bios: { lifetimeTurnCount: 0, sessionCount: 1, projectAgeDays: 0, rememberedMilestones: [] },
    toolReliability: {},
    recentEpisodes: [],
    recalled: []
  };

  function update(signals, moodId, moodFrame, dtMs = 250) {
    const sigs = Array.isArray(signals) ? signals : [];
    state.working.recentSignalCount = sigs.length;

    if (moodId && (!state.working.recentMoodPath.length || state.working.recentMoodPath[state.working.recentMoodPath.length - 1] !== moodId)) {
      state.working.recentMoodPath.push(moodId);
      if (state.working.recentMoodPath.length > 10) state.working.recentMoodPath.shift();
    }

    // Debt accumulation from signals
    for (const sig of sigs) {
      const kind = sig.kind || "";
      const tags = sig.tags || [];
      if (kind.includes("failure") || kind.includes("fail")) {
        state.debt.frustration = clamp(state.debt.frustration + 0.06, 0, 1);
        const toolName = sig.payload?.toolName || kind;
        if (!state.toolReliability[toolName]) state.toolReliability[toolName] = { successes: 0, failures: 0 };
        state.toolReliability[toolName].failures += 1;
      }
      if (kind.includes("success") || kind.includes("pass")) {
        const toolName = sig.payload?.toolName || kind;
        if (!state.toolReliability[toolName]) state.toolReliability[toolName] = { successes: 0, failures: 0 };
        state.toolReliability[toolName].successes += 1;
      }
      if (kind === "user.critique" || kind === "user.correct") {
        state.debt.social = clamp(state.debt.social + 0.08, 0, 1);
        state.relationship.correctionSensitivity = clamp(state.relationship.correctionSensitivity + 0.02, 0, 1);
      }
      if (kind === "user.praise") {
        state.relationship.trust = clamp(state.relationship.trust + 0.03, 0, 1);
        state.debt.social = clamp(state.debt.social - 0.04, 0, 1);
      }
      if (kind === "user.interrupt") {
        state.rhythm.userInterruptPattern = clamp(state.rhythm.userInterruptPattern + 0.05, 0, 1);
      }
    }

    // Fatigue from sustained high arousal
    if (moodFrame?.core?.arousal > 0.6) {
      state.debt.fatigue = clamp(state.debt.fatigue + 0.015 * (dtMs / 1000), 0, 1);
    }

    // Uncertainty from mood
    if (moodFrame?.appraisal?.uncertainty > 0.5) {
      state.debt.uncertainty = clamp(state.debt.uncertainty + 0.01 * (dtMs / 1000), 0, 1);
    }

    // Natural decay
    const decayFactor = Math.pow(0.5, dtMs / 90000);
    state.debt.frustration *= decayFactor;
    state.debt.fatigue *= Math.pow(0.5, dtMs / 180000);
    state.debt.uncertainty *= Math.pow(0.5, dtMs / 60000);
    state.debt.trust *= Math.pow(0.5, dtMs / 300000);
    state.debt.social *= Math.pow(0.5, dtMs / 120000);
    state.rhythm.userInterruptPattern *= Math.pow(0.5, dtMs / 120000);
    state.relationship.familiarity = clamp(state.relationship.familiarity + 0.001 * (dtMs / 60000), 0, 1);

    return getState();
  }

  function getToolReliability(toolName) {
    const entry = state.toolReliability[toolName];
    if (!entry) return 0.5;
    const total = entry.successes + entry.failures;
    if (total === 0) return 0.5;
    return entry.successes / total;
  }

  function getState() {
    return createMemoryStateV2(state);
  }

  function reset() {
    state = {
      working: { recentSignalCount: 0, recentMoodPath: [], activeTaskFacts: [] },
      rhythm: { calmBias: 0.3, typicalWorkingTempo: 0.5, userInterruptPattern: 0.2, preferredVerbosity: 0.5, preferredPresence: "balanced" },
      relationship: { trust: 0.6, familiarity: 0.3, correctionSensitivity: 0.5, praiseSensitivity: 0.5 },
      debt: { frustration: 0, fatigue: 0, uncertainty: 0, trust: 0, social: 0 },
      bios: { lifetimeTurnCount: 0, sessionCount: 1, projectAgeDays: 0, rememberedMilestones: [] },
      toolReliability: {},
      recentEpisodes: [],
      recalled: []
    };
  }

  return { update, getState, getToolReliability, reset };
}

export function deriveMemoryVisual(memState) {
  const debt = memState?.debt || {};
  const rel = memState?.relationship || {};
  return Object.freeze({
    frustrationPct: Math.round((debt.frustration || 0) * 100),
    fatiguePct: Math.round((debt.fatigue || 0) * 100),
    trustPct: Math.round((rel.trust || 0) * 100),
    familiarityPct: Math.round((rel.familiarity || 0) * 100),
    moodPath: memState?.working?.recentMoodPath || [],
    presencePreference: memState?.rhythm?.preferredPresence || "balanced"
  });
}
