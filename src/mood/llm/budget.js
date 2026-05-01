export function createAnchorBudget(config = {}) {
  const mode = config.mode || "balanced";
  const limits = {
    economy: { minCooldownMs: 30000, maxCallsPerMinute: 2, maxCallsPerTurn: 2 },
    balanced: { minCooldownMs: 12000, maxCallsPerMinute: 4, maxCallsPerTurn: 3 },
    expressive: { minCooldownMs: 5000, maxCallsPerMinute: 8, maxCallsPerTurn: 5 }
  };
  const cfg = limits[mode] || limits.balanced;
  const minCooldownMs = config.minCooldownMs ?? cfg.minCooldownMs;
  const maxCallsPerMinute = config.maxCallsPerMinute ?? cfg.maxCallsPerMinute;
  const maxCallsPerTurn = config.maxCallsPerTurn ?? cfg.maxCallsPerTurn;
  const semanticDeltaThreshold = config.semanticDeltaThreshold ?? 0.18;

  let lastCallAt = 0;
  let callsThisMinute = [];
  let callsThisTurn = 0;
  let turnId = null;

  function pruneMinuteWindow(now) {
    const cutoff = now - 60000;
    callsThisMinute = callsThisMinute.filter(t => t > cutoff);
  }

  return {
    allow(now = Date.now()) {
      pruneMinuteWindow(now);
      if (now - lastCallAt < minCooldownMs) return false;
      if (callsThisMinute.length >= maxCallsPerMinute) return false;
      if (callsThisTurn >= maxCallsPerTurn) return false;
      return true;
    },
    record(now = Date.now()) {
      lastCallAt = now;
      callsThisMinute.push(now);
      callsThisTurn += 1;
    },
    newTurn(id) {
      turnId = id;
      callsThisTurn = 0;
    },
    get semanticDeltaThreshold() { return semanticDeltaThreshold; },
    get mode() { return mode; },
    stats(now = Date.now()) {
      pruneMinuteWindow(now);
      return Object.freeze({
        mode,
        callsLastMinute: callsThisMinute.length,
        callsThisTurn,
        lastCallAt,
        cooldownRemainingMs: Math.max(0, minCooldownMs - (now - lastCallAt))
      });
    }
  };
}
