export const userRules = [
  { kind: "user.typing", coreDelta: { arousal: 0.03 }, appraisalDelta: { novelty: 0.08 }, tendencyDelta: {}, tags: ["attentive"], cause: "user typing", defaultPriority: 0.2, ttlMs: 5000 },
  { kind: "user.submit", coreDelta: { arousal: 0.10 }, appraisalDelta: { novelty: 0.15 }, tendencyDelta: { approach: 0.15 }, tags: ["attentive"], cause: "user submitted prompt", defaultPriority: 0.8, ttlMs: 12000,
    condition: (sig) => !sig.payload?.isComplex },
  { kind: "user.submit", coreDelta: { arousal: 0.20, dominance: -0.03 }, appraisalDelta: { effort: 0.25, uncertainty: 0.15 }, tendencyDelta: { investigate: 0.2 }, tags: ["focused", "curious"], cause: "user submitted complex prompt", defaultPriority: 0.9, ttlMs: 15000,
    condition: (sig) => Boolean(sig.payload?.isComplex) },
  { kind: "user.interrupt", coreDelta: { arousal: 0.20, dominance: -0.12 }, appraisalDelta: { interruption: 0.5, controllability: -0.15 }, tendencyDelta: { wait: 0.3 }, tags: ["reorienting"], cause: "user interrupted", defaultPriority: 0.9, ttlMs: 10000 },
  { kind: "user.approve", coreDelta: { valence: 0.08, dominance: 0.12 }, appraisalDelta: { controllability: 0.2, risk: -0.1 }, tendencyDelta: { approach: 0.2 }, tags: ["relieved"], cause: "user approved", defaultPriority: 0.7, ttlMs: 10000 },
  { kind: "user.deny", coreDelta: { valence: -0.06, dominance: -0.05 }, appraisalDelta: { goalBlockage: 0.2, autonomyPressure: 0.1 }, tendencyDelta: { wait: 0.3, guard: 0.1 }, tags: ["restrained"], cause: "user denied", defaultPriority: 0.7, ttlMs: 12000 },
  { kind: "user.praise", coreDelta: { valence: 0.18, arousal: 0.05 }, appraisalDelta: { socialAlignment: 0.4 }, tendencyDelta: { approach: 0.2 }, tags: ["appreciative", "warm"], cause: "user praised", defaultPriority: 0.7, ttlMs: 15000 },
  { kind: "user.critique", coreDelta: { valence: -0.12, arousal: 0.10 }, appraisalDelta: { socialAlignment: -0.25, competence: -0.15 }, tendencyDelta: { repair: 0.2, ask: 0.15 }, tags: ["humbled", "apologetic"], cause: "user critique", defaultPriority: 0.8, ttlMs: 15000 },
];
