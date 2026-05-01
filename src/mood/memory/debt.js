import { clamp, createMoodDebt } from "../types.js";

export function createDebtTracker(config = {}) {
  const decayRates = {
    frustrationDecayMs: config.frustrationDecayMs ?? 25000,
    fatigueDecayMs: config.fatigueDecayMs ?? 45000,
    uncertaintyDecayMs: config.uncertaintyDecayMs ?? 20000,
    trustDecayMs: config.trustDecayMs ?? 60000,
    socialDecayMs: config.socialDecayMs ?? 30000
  };

  const chargedImpulseIds = new Set();

  let debt = {
    frustrationDebt: 0,
    fatigueDebt: 0,
    trustDebt: 0,
    uncertaintyDebt: 0,
    socialDebt: 0
  };
  let lastUpdateAt = Date.now();

  function decayValue(current, dtMs, halfLifeMs) {
    if (current <= 0) return 0;
    const factor = Math.pow(0.5, dtMs / halfLifeMs);
    return current * factor;
  }

  return {
    update(moodFrame, recentImpulses = [], now = Date.now()) {
      const dtMs = Math.max(0, now - lastUpdateAt);
      lastUpdateAt = now;

      // Natural decay
      debt.frustrationDebt = decayValue(debt.frustrationDebt, dtMs, decayRates.frustrationDecayMs);
      debt.fatigueDebt = decayValue(debt.fatigueDebt, dtMs, decayRates.fatigueDecayMs);
      debt.trustDebt = decayValue(debt.trustDebt, dtMs, decayRates.trustDecayMs);
      debt.uncertaintyDebt = decayValue(debt.uncertaintyDebt, dtMs, decayRates.uncertaintyDecayMs);
      debt.socialDebt = decayValue(debt.socialDebt, dtMs, decayRates.socialDecayMs);

      // Accumulate from impulses (once per eventId per tracker lifetime)
      for (const imp of recentImpulses) {
        const eid = imp.eventId || imp.cause || "";
        if (!eid || chargedImpulseIds.has(eid)) continue;
        chargedImpulseIds.add(eid);
        if (chargedImpulseIds.size > 200) {
          const first = chargedImpulseIds.values().next().value;
          chargedImpulseIds.delete(first);
        }
        const tags = imp.tags || [];
        if (tags.includes("frustrated") || tags.includes("blocked") || tags.includes("strained")) {
          debt.frustrationDebt = clamp(debt.frustrationDebt + 0.12 * (imp.priority || 0.5), 0, 1);
        }
        if (tags.includes("concerned") || tags.includes("wary")) {
          debt.trustDebt = clamp(debt.trustDebt + 0.08 * (imp.priority || 0.5), 0, 1);
        }
        if (tags.includes("uncertain") || tags.includes("puzzled")) {
          debt.uncertaintyDebt = clamp(debt.uncertaintyDebt + 0.10 * (imp.priority || 0.5), 0, 1);
        }
        if (tags.includes("humbled") || tags.includes("apologetic") || tags.includes("contrite")) {
          debt.socialDebt = clamp(debt.socialDebt + 0.10 * (imp.priority || 0.5), 0, 1);
        }
        if (tags.includes("relieved") || tags.includes("satisfied") || tags.includes("proud")) {
          debt.frustrationDebt = clamp(debt.frustrationDebt - 0.15, 0, 1);
          debt.fatigueDebt = clamp(debt.fatigueDebt - 0.08, 0, 1);
        }
        if (tags.includes("content") || tags.includes("organized")) {
          debt.uncertaintyDebt = clamp(debt.uncertaintyDebt - 0.10, 0, 1);
          debt.trustDebt = clamp(debt.trustDebt - 0.05, 0, 1);
        }
      }

      // Fatigue from sustained high arousal
      if (moodFrame && moodFrame.core && moodFrame.core.arousal > 0.6) {
        const excess = moodFrame.core.arousal - 0.6;
        debt.fatigueDebt = clamp(debt.fatigueDebt + excess * 0.008 * (dtMs / 1000), 0, 1);
      }

      return this.getDebt();
    },

    getDebt() {
      return createMoodDebt({
        frustrationDebt: debt.frustrationDebt,
        fatigueDebt: debt.fatigueDebt,
        trustDebt: debt.trustDebt,
        uncertaintyDebt: debt.uncertaintyDebt,
        socialDebt: debt.socialDebt
      });
    },

    reset() {
      debt = { frustrationDebt: 0, fatigueDebt: 0, trustDebt: 0, uncertaintyDebt: 0, socialDebt: 0 };
      chargedImpulseIds.clear();
      lastUpdateAt = Date.now();
    }
  };
}
