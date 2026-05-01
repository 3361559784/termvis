import { createMoodFrameV2, createSemanticPacket } from "./types.js";
import { findPrototype } from "./prototypes.js";
import { signalToImpulses } from "./rules/index.js";
import { createIntegrator, computeBaseline } from "./integrator.js";
import { createTransitionGovernor } from "./transition.js";
import { createAnchorBudget } from "./llm/budget.js";
import { createAnchorCache } from "./llm/cache.js";
import { buildAnchorPrompt } from "./llm/anchor-request.js";
import { validateAnchor } from "./llm/anchor-validator.js";
import { createDebtTracker } from "./memory/debt.js";
import { createMoodMemory } from "./memory/mood-memory.js";
import { createEpisodeSummarizer } from "./memory/episode-summary.js";

/**
 * @template T
 * @param {T} v
 * @returns {T}
 */
function freezeDeep(v) {
  if (v === null || typeof v !== "object") return v;
  if (Array.isArray(v)) {
    for (let i = 0; i < v.length; i++) {
      const e = v[i];
      if (e && typeof e === "object") freezeDeep(e);
    }
    return Object.freeze(v);
  }
  for (const k of Object.keys(v)) {
    const val = /** @type {Record<string, unknown>} */ (v)[k];
    if (val && typeof val === "object") freezeDeep(val);
  }
  return Object.freeze(v);
}

/**
 * @param {{
 *   persona?: object,
 *   config?: object,
 *   llm?: object|null,
 * }} [options]
 */
export function createMoodEngine(options = {}) {
  const config = options.config?.mood || {};
  const persona = options.persona || {};
  const llm = options.llm || null;

  const integrator = createIntegrator({
    ...config.dynamics,
    persona,
    baseline: computeBaseline(persona),
  });

  const governor = createTransitionGovernor(config.transition);
  const budget = createAnchorBudget(config.llmAnchor);
  const cache = createAnchorCache(config.llmAnchor);
  const debtTracker = createDebtTracker(config.debts);
  const memory = createMoodMemory();
  const episodeSummarizer = createEpisodeSummarizer();

  let activeImpulses = [];
  let currentAnchor = null;
  let lastTickAt = Date.now();
  let tickIndex = 0;
  let semanticQueue = [];
  let previousMoodId = "calm";

  function pruneImpulses(now) {
    activeImpulses = activeImpulses.filter((imp) => {
      if (!imp.ttlMs || imp.ttlMs <= 0) return false;
      const createdAt = imp._createdAt || now;
      return createdAt + imp.ttlMs > now;
    });
  }

  function pruneAnchor(now) {
    if (!currentAnchor) return;
    const expiresAt =
      (currentAnchor.createdAt || 0) + (currentAnchor.ttlMs || 30000);
    if (now > expiresAt) currentAnchor = null;
  }

  const api = {
    /**
     * Ingest a signal event and convert to impulses.
     * @param {{ kind: string, id?: string, priority?: number, reliability?: number, payload?: object }} signal
     */
    ingest(signal) {
      if (!signal || typeof signal !== "object") return;

      let impulses = [];
      try {
        let recentFailures = 0;
        try {
          recentFailures =
            episodeSummarizer.getMoodFrequency().frustrated || 0;
        } catch {
          recentFailures = 0;
        }
        const context = {
          currentMood: governor.getCurrentMood(),
          debt: debtTracker.getDebt(),
          recentFailures,
        };
        impulses = signalToImpulses(signal, context);
      } catch {
        impulses = [];
      }

      const now = Date.now();
      for (const imp of impulses) {
        imp._createdAt = now;
        activeImpulses.push(imp);
      }

      try {
        if (shouldCreateSemanticPacket(signal)) {
          semanticQueue.push(toSemanticPacket(signal));
        }
      } catch {
        /* malformed semantic payload */
      }
    },

    /**
     * Ingest multiple signals.
     * @param {object[]} signals
     */
    ingestBatch(signals) {
      if (!Array.isArray(signals)) return;
      for (const s of signals) api.ingest(s);
    },

    /**
     * Optionally run LLM anchor if budget allows and semantic content warrants it.
     * Returns the anchor or null.
     */
    async maybeRunLLMAnchor() {
      if (!llm || typeof llm.complete !== "function") return null;
      if (semanticQueue.length === 0) return null;

      const now = Date.now();
      let allowed = false;
      try {
        allowed = budget.allow(now);
      } catch {
        return null;
      }
      if (!allowed) return null;

      const latest = semanticQueue[semanticQueue.length - 1];
      semanticQueue = [];

      try {
        if (cache.has(latest, now)) {
          return cache.get(latest, now);
        }
      } catch {
        return null;
      }

      let currentMood;
      let trajectory;
      let memoryHints;
      let prompt;
      try {
        currentMood = integrator.getVisibleState();
        trajectory = episodeSummarizer.getRecentTrajectory(5);
        memoryHints = {
          userPreferences: Object.freeze([]),
          projectPatterns: memory
            .findMatchingPatterns(latest.text || "", 3)
            .map((p) => p.trigger),
          recentFailures: Object.freeze([]),
        };
        memoryHints = freezeDeep(memoryHints);
        prompt = buildAnchorPrompt(
          latest,
          currentMood,
          trajectory,
          memoryHints,
        );
      } catch {
        return null;
      }

      try {
        const result = await llm.complete(prompt);
        try {
          budget.record(now);
        } catch {
          /* budget must not fail the pipeline */
        }

        const validated = validateAnchor(result?.data, latest);
        if (validated.ok && validated.anchor) {
          currentAnchor = validated.anchor;
          try {
            cache.set(latest, validated.anchor, now);
          } catch {
            /* cache failures are non-fatal */
          }
          return validated.anchor;
        }
      } catch {
        /* LLM errors must never crash the mood engine */
      }
      return null;
    },

    /**
     * Advance the mood engine by one tick.
     * @param {number} [now]
     * @returns {import("./types.js").MoodFrameV2}
     */
    tick(now = Date.now()) {
      const dtMs = Math.max(0, now - lastTickAt);
      lastTickAt = now;
      tickIndex += 1;

      pruneImpulses(now);
      pruneAnchor(now);

      let currentFrame;
      try {
        currentFrame = integrator.getVisibleState();
      } catch {
        currentFrame = createMoodFrameV2();
      }

      try {
        debtTracker.update(currentFrame, activeImpulses, now);
      } catch {
        /* debt update failure: keep previous debt state */
      }

      let memoryBias = { core: { valence: 0, arousal: 0, dominance: 0 } };
      try {
        memoryBias = { core: memory.getMemoryBias() };
      } catch {
        memoryBias = { core: { valence: 0, arousal: 0, dominance: 0 } };
      }

      let frame;
      try {
        frame = integrator.tick(
          dtMs,
          activeImpulses,
          currentAnchor,
          memoryBias,
          debtTracker.getDebt(),
        );
      } catch {
        try {
          frame = integrator.getVisibleState();
        } catch {
          frame = createMoodFrameV2();
        }
      }

      let visibleMood;
      try {
        visibleMood = governor.update(frame, activeImpulses, now);
      } catch {
        try {
          const primary = governor.getCurrentMood();
          visibleMood = freezeDeep({
            primary,
            secondary: null,
            intensity: 0.5,
            stability: 0.5,
            causeIds: Object.freeze([]),
            confidence: 0.5,
            episode: governor.getEpisode(),
          });
        } catch {
          visibleMood = freezeDeep({
            primary: "calm",
            secondary: null,
            intensity: 0.5,
            stability: 0.5,
            causeIds: Object.freeze([]),
            confidence: 0.5,
          });
        }
      }

      try {
        if (visibleMood.primary !== previousMoodId) {
          const episode = governor.getEpisode();
          if (previousMoodId && previousMoodId !== "calm") {
            episodeSummarizer.recordEpisode(
              previousMoodId,
              episode?.startedAt ? now - episode.startedAt : 0,
              visibleMood.causeIds || [],
              visibleMood.intensity || 0.5,
            );
          }
          previousMoodId = visibleMood.primary;
        }
      } catch {
        /* episode logging must not break tick */
      }

      return createMoodFrameV2({
        core: frame.core,
        appraisal: frame.appraisal,
        tendency: frame.tendency,
        mood: visibleMood,
      });
    },

    /**
     * Get the current visible mood state without ticking.
     */
    getState() {
      try {
        return integrator.getVisibleState();
      } catch {
        return createMoodFrameV2();
      }
    },

    getCurrentMoodId() {
      try {
        return governor.getCurrentMood();
      } catch {
        return "calm";
      }
    },

    getCurrentPrototype() {
      try {
        return freezeDeep(findPrototype(governor.getCurrentMood()));
      } catch {
        return freezeDeep(findPrototype("calm"));
      }
    },

    getDebt() {
      try {
        return debtTracker.getDebt();
      } catch {
        return freezeDeep({
          frustrationDebt: 0,
          fatigueDebt: 0,
          trustDebt: 0,
          uncertaintyDebt: 0,
          socialDebt: 0,
        });
      }
    },

    getTrajectory(limit = 8) {
      try {
        const rows = episodeSummarizer.getRecentTrajectory(limit);
        return freezeDeep(rows.map((r) => ({ ...r, causes: [...(r.causes || [])] })));
      } catch {
        return Object.freeze([]);
      }
    },

    getBudgetStats() {
      try {
        return budget.stats();
      } catch {
        return Object.freeze({
          mode: "balanced",
          callsLastMinute: 0,
          callsThisTurn: 0,
          lastCallAt: 0,
          cooldownRemainingMs: 0,
        });
      }
    },

    getActiveAnchor() {
      return currentAnchor;
    },

    forceMood(moodId, causeId) {
      try {
        governor.forceMood(moodId, causeId);
      } catch {
        /* ignore invalid force */
      }
    },

    newTurn(turnId) {
      try {
        budget.newTurn(turnId);
      } catch {
        /* ignore */
      }
    },

    setPersona(newPersona) {
      try {
        const baseline = computeBaseline(
          newPersona || {},
          debtTracker.getDebt(),
        );
        integrator.setBaseline(baseline);
      } catch {
        /* ignore invalid persona */
      }
    },

    inspect() {
      let recentSwitches = 0;
      try {
        recentSwitches = governor.getRecentSwitches(60000).length;
      } catch {
        recentSwitches = 0;
      }
      try {
        return Object.freeze({
          tickIndex,
          currentMood: governor.getCurrentMood(),
          episode: governor.getEpisode(),
          activeImpulses: activeImpulses.length,
          anchorActive: currentAnchor !== null,
          debt: debtTracker.getDebt(),
          budget: budget.stats(),
          memoryPatterns: memory.size,
          episodes: episodeSummarizer.size,
          recentSwitches,
        });
      } catch {
        return Object.freeze({
          tickIndex,
          currentMood: "calm",
          episode: null,
          activeImpulses: activeImpulses.length,
          anchorActive: currentAnchor !== null,
          debt: api.getDebt(),
          budget: api.getBudgetStats(),
          memoryPatterns: 0,
          episodes: 0,
          recentSwitches: 0,
        });
      }
    },

    reset() {
      activeImpulses = [];
      currentAnchor = null;
      semanticQueue = [];
      lastTickAt = Date.now();
      tickIndex = 0;
      previousMoodId = "calm";
      try {
        integrator.reset();
      } catch {
        /* ignore */
      }
      try {
        debtTracker.reset();
      } catch {
        /* ignore */
      }
      try {
        memory.clear();
      } catch {
        /* ignore */
      }
      try {
        episodeSummarizer.clear();
      } catch {
        /* ignore */
      }
    },

    dispose() {
      api.reset();
    },
  };

  return Object.freeze(api);
}

function shouldCreateSemanticPacket(signal) {
  const kind = signal.kind || "";
  const semanticKinds = [
    "user.submit",
    "host.says.plan",
    "host.says.natural_text",
    "host.says.final",
    "tool.call.failure",
    "tool.permission.request",
    "user.praise",
    "user.critique",
    "web.search.result",
    "subagent.stop",
    "test.fail",
    "build.failure",
    "git.conflict",
  ];
  return semanticKinds.includes(kind);
}

function toSemanticPacket(signal) {
  const payload = signal.payload || {};
  return createSemanticPacket({
    host: payload.host || "unknown",
    segmentKind: inferSegmentKind(signal.kind),
    text: payload.text || payload.message || payload.output || "",
    context: {
      risk: payload.risk ?? 0,
      urgency: payload.urgency ?? 0,
      toolName: payload.toolName || payload.sourceTool,
      taskPhase: inferTaskPhase(signal.kind),
      recentFailures: payload.recentFailures ?? 0,
      recentSuccesses: payload.recentSuccesses ?? 0,
    },
  });
}

function inferSegmentKind(signalKind) {
  if (signalKind === "user.submit") return "user_prompt";
  if (signalKind === "host.says.plan") return "plan";
  if (signalKind === "host.says.final") return "final_answer";
  if (signalKind === "host.says.natural_text") return "natural_response";
  if (signalKind?.startsWith("tool.call.failure")) return "error_summary";
  if (signalKind === "tool.permission.request") return "approval_request";
  if (signalKind?.startsWith("web.")) return "web_result";
  if (signalKind === "subagent.stop") return "subagent_summary";
  if (signalKind?.startsWith("test.") || signalKind?.startsWith("build.")) {
    return "tool_result_summary";
  }
  return "natural_response";
}

function inferTaskPhase(signalKind) {
  if (!signalKind) return "idle";
  if (signalKind.includes("reasoning") || signalKind.includes("plan")) {
    return "planning";
  }
  if (
    signalKind.includes("tool.") ||
    signalKind.includes("file.") ||
    signalKind.includes("shell.")
  ) {
    return "executing";
  }
  if (
    signalKind.includes("test.") ||
    signalKind.includes("build.") ||
    signalKind.includes("verify")
  ) {
    return "verifying";
  }
  if (
    signalKind.includes("repair") ||
    signalKind.includes("restore") ||
    signalKind.includes("retry")
  ) {
    return "recovering";
  }
  if (signalKind.includes("final") || signalKind.includes("end")) {
    return "closing";
  }
  return "idle";
}
