export const sessionRules = [
  { kind: "session.start", coreDelta: { arousal: 0.10, valence: 0.04 }, appraisalDelta: { novelty: 0.25, socialAlignment: 0.1 }, tendencyDelta: { approach: 0.2 }, tags: ["attentive", "warm"], cause: "session started", defaultPriority: 0.8, ttlMs: 15000 },
  { kind: "session.resume", coreDelta: { valence: 0.08, dominance: 0.08 }, appraisalDelta: { expectedness: 0.3 }, tendencyDelta: { approach: 0.1 }, tags: ["familiar", "content"], cause: "session resumed", defaultPriority: 0.6, ttlMs: 12000 },
  { kind: "session.end", coreDelta: { arousal: -0.15 }, appraisalDelta: { effort: -0.2 }, tendencyDelta: { wait: 0.2 }, tags: ["quiet", "reflective"], cause: "session ended", defaultPriority: 0.5, ttlMs: 20000 },
  { kind: "context.loaded", coreDelta: { dominance: 0.05 }, appraisalDelta: { controllability: 0.1 }, tendencyDelta: { approach: 0.1 }, tags: ["prepared"], cause: "context loaded", defaultPriority: 0.4, ttlMs: 8000 },
  { kind: "context.compact.begin", coreDelta: { arousal: 0.08 }, appraisalDelta: { interruption: 0.15, uncertainty: 0.1 }, tendencyDelta: { wait: 0.2 }, tags: ["reflective"], cause: "context compacting", defaultPriority: 0.5, ttlMs: 10000 },
  { kind: "context.compact.end", coreDelta: { dominance: 0.06 }, appraisalDelta: { controllability: 0.1 }, tendencyDelta: { approach: 0.1 }, tags: ["integrating"], cause: "context compacted", defaultPriority: 0.4, ttlMs: 8000 },
  { kind: "mode.switch", coreDelta: { arousal: 0.06 }, appraisalDelta: { novelty: 0.1 }, tendencyDelta: { investigate: 0.1 }, tags: ["attentive"], cause: "mode switched", defaultPriority: 0.5, ttlMs: 8000,
    condition: (sig) => {
      const mode = sig.payload?.mode;
      if (mode === "full-auto" || mode === "bypass") return false;
      return true;
    }
  },
  { kind: "mode.switch", coreDelta: { arousal: 0.18, dominance: -0.10 }, appraisalDelta: { risk: 0.25, autonomyPressure: 0.35 }, tendencyDelta: { guard: 0.3 }, tags: ["vigilant", "guarded"], cause: "switched to full-auto/bypass mode", defaultPriority: 0.9, ttlMs: 20000,
    condition: (sig) => {
      const mode = sig.payload?.mode;
      return mode === "full-auto" || mode === "bypass";
    }
  },
  { kind: "agent.switch", coreDelta: { arousal: 0.05 }, appraisalDelta: { novelty: 0.08 }, tendencyDelta: { investigate: 0.1 }, tags: ["attentive"], cause: "agent switched", defaultPriority: 0.4, ttlMs: 8000 },
];
