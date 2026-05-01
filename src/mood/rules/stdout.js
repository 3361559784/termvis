export const stdoutRules = [
  { kind: "unknown.stdout", coreDelta: { arousal: 0.01 }, appraisalDelta: {}, tendencyDelta: { wait: 0.05 }, tags: ["observant"], cause: "stdout output", defaultPriority: 0.1, ttlMs: 4000 },
  { kind: "rate_limit", coreDelta: { valence: -0.08, arousal: 0.05 }, appraisalDelta: { goalBlockage: 0.2, controllability: -0.1 }, tendencyDelta: { wait: 0.4, guard: 0.1 }, tags: ["blocked", "weary"], cause: "rate limited", defaultPriority: 0.6, ttlMs: 15000 },
  { kind: "network.failure", coreDelta: { valence: -0.10, arousal: 0.08 }, appraisalDelta: { goalBlockage: 0.25, controllability: -0.15 }, tendencyDelta: { wait: 0.3, repair: 0.15 }, tags: ["blocked", "concerned"], cause: "network failure", defaultPriority: 0.7, ttlMs: 15000 },
];
