export const webRules = [
  { kind: "web.search.begin", coreDelta: { arousal: 0.10 }, appraisalDelta: { novelty: 0.2, uncertainty: 0.2 }, tendencyDelta: { investigate: 0.3 }, tags: ["curious", "exploratory"], cause: "web search started", defaultPriority: 0.5, ttlMs: 10000 },
  { kind: "web.search.result", coreDelta: { dominance: 0.12, valence: 0.05 }, appraisalDelta: { uncertainty: -0.15 }, tendencyDelta: { verify: 0.15, approach: 0.1 }, tags: ["informed", "content"], cause: "web search results", defaultPriority: 0.5, ttlMs: 10000,
    condition: (sig) => !sig.payload?.conflicting },
  { kind: "web.search.result", coreDelta: { arousal: 0.10, dominance: -0.10 }, appraisalDelta: { ambiguity: 0.3, uncertainty: 0.15 }, tendencyDelta: { verify: 0.25, investigate: 0.15 }, tags: ["skeptical"], cause: "conflicting search results", defaultPriority: 0.6, ttlMs: 12000,
    condition: (sig) => Boolean(sig.payload?.conflicting) },
  { kind: "web.fetch.begin", coreDelta: { arousal: 0.08 }, appraisalDelta: { uncertainty: 0.1 }, tendencyDelta: { investigate: 0.15 }, tags: ["curious"], cause: "web fetch started", defaultPriority: 0.4, ttlMs: 8000 },
  { kind: "web.fetch.result", coreDelta: { valence: 0.04, dominance: 0.05 }, appraisalDelta: { uncertainty: -0.1 }, tendencyDelta: { approach: 0.1 }, tags: ["content"], cause: "web fetch completed", defaultPriority: 0.4, ttlMs: 8000,
    condition: (sig) => !sig.payload?.failed },
  { kind: "web.fetch.result", coreDelta: { valence: -0.08, arousal: 0.10 }, appraisalDelta: { goalBlockage: 0.2 }, tendencyDelta: { repair: 0.15, investigate: 0.1 }, tags: ["concerned"], cause: "web fetch failed", defaultPriority: 0.6, ttlMs: 12000,
    condition: (sig) => Boolean(sig.payload?.failed) },
];
