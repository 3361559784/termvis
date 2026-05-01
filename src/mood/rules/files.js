export const filesRules = [
  { kind: "file.read", coreDelta: { arousal: 0.03 }, appraisalDelta: { uncertainty: -0.03, controllability: 0.03 }, tendencyDelta: { investigate: 0.1 }, tags: ["observant"], cause: "file read", defaultPriority: 0.3, ttlMs: 6000 },
  { kind: "file.search", coreDelta: { arousal: 0.05 }, appraisalDelta: { uncertainty: 0.05 }, tendencyDelta: { investigate: 0.15 }, tags: ["curious"], cause: "file search", defaultPriority: 0.3, ttlMs: 6000 },
  { kind: "file.write", coreDelta: { arousal: 0.10, dominance: 0.04 }, appraisalDelta: { goalProgress: 0.15, risk: 0.15 }, tendencyDelta: { verify: 0.1 }, tags: ["focused"], cause: "file written", defaultPriority: 0.5, ttlMs: 10000 },
  { kind: "file.edit", coreDelta: { arousal: 0.08, dominance: 0.05 }, appraisalDelta: { goalProgress: 0.1, risk: 0.1 }, tendencyDelta: { verify: 0.1 }, tags: ["focused"], cause: "file edited", defaultPriority: 0.5, ttlMs: 10000 },
  { kind: "file.patch", coreDelta: { arousal: 0.12 }, appraisalDelta: { goalProgress: 0.2, risk: 0.2 }, tendencyDelta: { verify: 0.15 }, tags: ["focused", "vigilant"], cause: "file patched", defaultPriority: 0.6, ttlMs: 10000 },
  { kind: "file.checkpoint", coreDelta: { dominance: 0.12 }, appraisalDelta: { controllability: 0.2 }, tendencyDelta: { verify: 0.05 }, tags: ["prepared"], cause: "checkpoint created", defaultPriority: 0.5, ttlMs: 8000 },
  { kind: "file.restore", coreDelta: { valence: 0.06, dominance: 0.10 }, appraisalDelta: { goalBlockage: -0.15, controllability: 0.15 }, tendencyDelta: { repair: 0.2, verify: 0.1 }, tags: ["relieved", "recovering"], cause: "file restored", defaultPriority: 0.6, ttlMs: 10000 },
];
