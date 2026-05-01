export function createMoodMemory() {
  const patterns = [];
  const maxPatterns = 200;

  return {
    addPattern(pattern) {
      if (!pattern || typeof pattern !== "object") return;
      const entry = {
        id: pattern.id || `mm-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        scope: pattern.scope || "session",
        createdAt: pattern.createdAt || new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        trigger: String(pattern.trigger || ""),
        commonMoodPath: Array.isArray(pattern.commonMoodPath) ? [...pattern.commonMoodPath] : [],
        userPreference: String(pattern.userPreference || ""),
        occurrences: Number(pattern.occurrences) || 1,
        successAfterRepairRate: Number(pattern.successAfterRepairRate) || 0,
        avgRecoveryTimeMs: Number(pattern.avgRecoveryTimeMs) || 0,
        embeddingText: String(pattern.embeddingText || pattern.trigger || "")
      };
      if (patterns.length >= maxPatterns) patterns.shift();
      patterns.push(entry);
      return entry;
    },

    findMatchingPatterns(trigger, limit = 5) {
      const triggerLower = String(trigger || "").toLowerCase();
      if (!triggerLower) return [];
      return patterns
        .filter(p => triggerLower.includes(p.trigger.toLowerCase()) || p.trigger.toLowerCase().includes(triggerLower))
        .sort((a, b) => b.occurrences - a.occurrences)
        .slice(0, limit);
    },

    getMemoryBias(recentMoods = []) {
      const bias = { valence: 0, arousal: 0, dominance: 0 };
      if (patterns.length === 0) return bias;

      let totalFailures = 0;
      let totalSuccesses = 0;
      for (const p of patterns.slice(-50)) {
        if (p.commonMoodPath.some(m => ["frustrated", "strained", "blocked"].includes(m))) {
          totalFailures += p.occurrences;
        }
        totalSuccesses += p.successAfterRepairRate * p.occurrences;
      }

      const failRatio = totalFailures / Math.max(totalFailures + totalSuccesses, 1);
      bias.valence = -0.05 * failRatio;
      bias.arousal = 0.03 * failRatio;
      bias.dominance = -0.04 * failRatio;

      return bias;
    },

    getAll() { return [...patterns]; },
    get size() { return patterns.length; },
    clear() { patterns.length = 0; }
  };
}
