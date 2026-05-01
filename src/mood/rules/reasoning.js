export const reasoningRules = [
  { kind: "host.reasoning.begin", coreDelta: { arousal: 0.12 }, appraisalDelta: { goalProgress: 0.05, effort: 0.1 }, tendencyDelta: { investigate: 0.2 }, tags: ["focused"], cause: "reasoning started", defaultPriority: 0.6, ttlMs: 10000 },
  { kind: "host.reasoning.stream", coreDelta: { arousal: 0.02 }, appraisalDelta: { effort: 0.03 }, tendencyDelta: {}, tags: ["absorbed"], cause: "reasoning streaming", defaultPriority: 0.2, ttlMs: 5000 },
  { kind: "host.reasoning.end", coreDelta: { arousal: -0.05, dominance: 0.05 }, appraisalDelta: { uncertainty: -0.05 }, tendencyDelta: { verify: 0.1 }, tags: ["focused"], cause: "reasoning ended", defaultPriority: 0.5, ttlMs: 8000 },
  { kind: "host.says.plan", coreDelta: { dominance: 0.15, valence: 0.06 }, appraisalDelta: { goalProgress: 0.3, controllability: 0.2 }, tendencyDelta: { approach: 0.2, verify: 0.15 }, tags: ["organized", "hopeful"], cause: "plan generated", defaultPriority: 0.7, ttlMs: 15000 },
  { kind: "host.says.natural_text", coreDelta: { arousal: 0.03 }, appraisalDelta: {}, tendencyDelta: { approach: 0.1 }, tags: ["warm"], cause: "natural text output", defaultPriority: 0.3, ttlMs: 8000 },
  { kind: "host.says.code", coreDelta: { arousal: 0.05 }, appraisalDelta: { competence: 0.05, effort: 0.05 }, tendencyDelta: { verify: 0.1 }, tags: ["focused"], cause: "code output", defaultPriority: 0.3, ttlMs: 8000 },
  { kind: "host.says.final", coreDelta: { valence: 0.20, dominance: 0.15, arousal: -0.08 }, appraisalDelta: { goalProgress: 0.4 }, tendencyDelta: { celebrate: 0.15, wait: 0.1 }, tags: ["satisfied", "relieved"], cause: "final answer", defaultPriority: 0.8, ttlMs: 20000,
    condition: (sig) => !sig.payload?.uncertain },
  { kind: "host.says.final", coreDelta: { dominance: -0.08 }, appraisalDelta: { uncertainty: 0.2 }, tendencyDelta: { ask: 0.15, verify: 0.1 }, tags: ["uncertain"], cause: "uncertain final answer", defaultPriority: 0.7, ttlMs: 15000,
    condition: (sig) => Boolean(sig.payload?.uncertain) },
];
