export function evaluateHardGate(input) {
  const rejections = [];
  if (input.config?.enabled === false) rejections.push({ reason: "disabled" });
  return { pass: rejections.length === 0, rejections };
}

export function computeSpeakScore(input) {
  const { signals, mood, pulse, presence, memory, state, config } = input;
  const now = input.now || Date.now();

  const maxPriority = Math.max(0, ...(signals || []).map(s => s.priority || 0));
  const signalSalience = maxPriority / 5;

  const semanticNovelty = signals?.some(s => s.semantic?.novelty > 0.5) ? 0.7 : 0.3;

  const core = mood?.core || {};
  const moodIntensity = Math.max(
    Math.abs(core.valence || 0),
    core.arousal || 0,
    core.dominance || 0
  );

  const proximityVal = presence?.proximity || 0.3;

  const memorySalience = (memory?.working?.recentSignalCount || 0) > 3 ? 0.5 : 0.2;

  const msSinceLastSay = state?.lastSayAt ? (now - state.lastSayAt) : 120000;
  const timeSinceNorm = Math.min(1, msSinceLastSay / 45000);

  const pulseEventMap = { surge: 0.9, skip: 0.7, quickening: 0.5, flutter: 0.4, holding: 0.3, settling: 0.2, exhale: 0.3, steady: 0.1 };
  const pulseEventSalience = pulseEventMap[pulse?.pulseEvent || "steady"] || 0.1;

  const modeToExpressiveness = { silent: 0, minimal: 0.2, balanced: 0.5, expressive: 0.8, debug: 0.6 };
  const userPref = modeToExpressiveness[config?.mode || "balanced"] || 0.5;

  const taskPhase = input.host?.session?.taskPhase || "idle";
  const criticalPhases = new Set(["waiting_approval", "recovering"]);
  const taskCriticality = criticalPhases.has(taskPhase) ? 0.7 : 0.3;

  const score =
    0.22 * signalSalience +
    0.18 * semanticNovelty +
    0.16 * moodIntensity +
    0.14 * proximityVal +
    0.12 * memorySalience +
    0.18 * timeSinceNorm +
    0.08 * pulseEventSalience +
    0.10 * userPref +
    0.08 * taskCriticality;

  return { score: Math.max(0, Math.min(1, score)), components: { signalSalience, semanticNovelty, moodIntensity, proximityVal, memorySalience, timeSinceNorm, pulseEventSalience } };
}

export function getThreshold(intent) {
  void intent;
  return 0;
}
