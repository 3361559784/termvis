export const agentsRules = [
  { kind: "subagent.create", coreDelta: { arousal: 0.10, dominance: 0.05 }, appraisalDelta: { controllability: 0.15, uncertainty: 0.1 }, tendencyDelta: { verify: 0.15, wait: 0.1 }, tags: ["orchestrating", "delegating"], cause: "subagent created", defaultPriority: 0.5, ttlMs: 10000 },
  { kind: "subagent.start", coreDelta: { arousal: 0.08 }, appraisalDelta: { effort: 0.1 }, tendencyDelta: { wait: 0.15, verify: 0.1 }, tags: ["observant", "delegating"], cause: "subagent started", defaultPriority: 0.4, ttlMs: 8000 },
  { kind: "subagent.stop", coreDelta: { valence: 0.14, dominance: 0.12 }, appraisalDelta: { goalProgress: 0.25 }, tendencyDelta: { verify: 0.15, celebrate: 0.1 }, tags: ["relieved", "content"], cause: "subagent completed successfully", defaultPriority: 0.6, ttlMs: 12000,
    condition: (sig) => sig.payload?.success !== false },
  { kind: "subagent.stop", coreDelta: { valence: -0.12, arousal: 0.14 }, appraisalDelta: { goalBlockage: 0.25 }, tendencyDelta: { investigate: 0.2, repair: 0.15 }, tags: ["concerned"], cause: "subagent failed", defaultPriority: 0.7, ttlMs: 15000,
    condition: (sig) => sig.payload?.success === false },
];
