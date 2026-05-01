/**
 * Soul bios engine — integrates the seven cognitive layers:
 *   signal → perception → cognition → memory → affect → action/express → render
 *
 * `createSoulEngine()` remains a deterministic state engine for tests and
 * non-visual integrations. `createIntelligentSoulEngine()` enables strict
 * visual mode: mood, pulse, presence, and host state must come from the LLM
 * planner's structured render hints, with no local synthetic replacement when
 * the provider is absent or invalid.
 */

import { randomUUID } from "node:crypto";

import {
  createHostContext,
  createMoodState,
  createPresenceState,
  createProvenance,
  createPulseState,
  createSoulBiosCaps,
  createSoulFrame,
  createSignalEvent
} from "./types.js";
import { denoiseSignals } from "./signal.js";
import { deriveExpression } from "./affect.js";
import { createAuditLog, appendAuditEntry, createAuditSnapshot } from "./audit.js";
import { createMoodEngine, findPrototype } from "../mood/index.js";
import { createSoulRuntime } from "../mood/soul-runtime.js";

/** @typedef {ReturnType<typeof createSignalEvent>} SignalEvent */

/** @param {unknown} simNow */
function parseTickTime(simNow) {
  if (typeof simNow === "number" && Number.isFinite(simNow)) return simNow;
  if (typeof simNow === "string" && simNow.trim()) {
    const p = Date.parse(simNow);
    if (Number.isFinite(p)) return p;
  }
  return Date.now();
}

/**
 * @typedef {Object} SoulEngineCognition
 * @property {object|null} llm           - LLMProvider (or null)
 * @property {object|null} embedder       - EmbeddingProvider (or null)
 * @property {object|null} memory         - EmbeddedMemoryStore (or null)
 * @property {Function|null} pipeline     - runCognitivePipeline (or null)
 * @property {Function|null} reflectionScheduler - createReflectionScheduler result (or null)
 */

/**
 * Create a fully wired soul bios engine.
 *
 * @param {{
 *   sessionId?: string,
 *   cwd?: string,
 *   config?: Record<string, unknown>,
 *   cognition?: SoulEngineCognition,
 *   persona?: object,
 *   speakingEnabled?: boolean,
 *   safetyJudge?: boolean,
 *   strictLlmVisuals?: boolean
 * }} [options]
 */
export function createSoulEngine(options = {}) {
  const presetSessionId =
    typeof options.sessionId === "string" && options.sessionId.trim()
      ? options.sessionId.trim()
      : null;

  const cognition = options.cognition || {
    llm: null,
    embedder: null,
    memory: null,
    pipeline: null,
    reflectionScheduler: null
  };
  let persona = options.persona || null;
  let speakingEnabled = options.speakingEnabled !== false;
  let safetyJudge = Boolean(options.safetyJudge);
  const strictLlmVisuals = Boolean(options.strictLlmVisuals);

  /** @type {string|null} */
  let sessionId = presetSessionId;
  /** @type {ReturnType<typeof createSoulBiosCaps>|null} */
  let caps = null;
  /** @type {SignalEvent[]} */
  let buffer = [];
  let lastTs = Date.now();
  let tickIndex = 0;
  let entityVersion = 0;

  const moodEngine = createMoodEngine({
    persona: persona || {},
    config: options.config || {},
    llm: cognition.llm
  });

  const soulRuntime = createSoulRuntime({
    persona: persona || {},
    config: options.config || {},
    llm: cognition.llm
  });

  let state = {
    host: createHostContext(),
    mood: createMoodState(),
    pulse: createPulseState(),
    presence: createPresenceState(),
    visualRefs: [],
    lastCitedMemoryIds: [],
    lastSays: null,
    lastSaysAt: 0,
    lastAmbientAttemptAt: 0
  };

  const auditLog = createAuditLog({ sessionId: presetSessionId || null });

  function ensureSessionAndCaps() {
    if (!sessionId) sessionId = randomUUID();
    if (!caps) caps = createSoulBiosCaps({ hostId: presetSessionId ?? "generic" });
  }

  /**
   * @param {Record<string, unknown>} [overrides]
   */
  function currentHostContext(overrides = {}) {
    const base = caps ? { host: caps.hostId, tty: caps.tty } : {};
    const existing = state.host || {};
    const host =
      overrides.host && overrides.host !== "generic"
        ? overrides.host
        : existing.host && existing.host !== "generic"
          ? existing.host
          : base.host;
    return createHostContext({
      ...base,
      ...existing,
      ...overrides,
      host,
      ttyCaps: overrides.ttyCaps ?? existing.ttyCaps ?? base.tty
    });
  }

  /**
   * Auto-ingest signals into working memory so the cognitive pipeline can recall them.
   * @param {SignalEvent[]} drained
   */
  async function feedMemory(drained) {
    if (!cognition.memory) return;
    for (const sig of drained) {
      try {
        const text = stringifySignal(sig);
        if (!text) continue;
        await cognition.memory.addWorking(text, { sourceSignalId: sig.id });
        if (sig.priority >= 4) {
          await cognition.memory.addEpisodic(text, {
            sourceSignalId: sig.id,
            importance: 0.4 + 0.1 * sig.priority,
            confidence: sig.reliability
          });
        }
      } catch {
        // memory layer must never crash the engine
      }
    }
  }

  /**
   * Build the cognitive pipeline context (recall memory, choose top signal, etc.).
   * @param {SignalEvent[]} drained
   */
  async function buildPipelineContext(drained) {
    let memoryHits = [];
    if (cognition.memory && cognition.memory.embedder?.available) {
      try {
        const top = drained.reduce((m, s) => (m && m.priority >= s.priority ? m : s), null);
        const queryText = top
          ? stringifySignal(top)
          : state.lastSays?.main || "";
        if (queryText) {
          const recall = await cognition.memory.recall({
            query: queryText,
            topK: 5,
            threshold: 0.15,
            reinforce: true
          });
          memoryHits = [
            ...(recall.episodic || []),
            ...(recall.semantic || [])
          ].slice(0, 8);
        }
      } catch {
        memoryHits = [];
      }
    }
    const topSignal = drained.length
      ? drained.reduce((m, s) => (m.priority >= s.priority ? m : s))
      : null;
      return {
        presence: state.presence,
        mood: state.mood,
        host: currentHostContext(),
        signals: drained,
      topSignal,
      memoryHits,
      persona: persona || undefined,
      risk: state.mood.tags.includes("guarded") ? 0.7 : 0
    };
  }

  /**
   * Run the cognitive pipeline if a pipeline runner is available.
   * Returns null when speech is suppressed by config or pipeline absence.
   *
   * @param {SignalEvent[]} drained
   * @returns {Promise<null | import("../cognition/pipeline/orchestrator.js").CognitivePipelineResult>}
   */
  async function runCognition(drained, { requireVisualState = false } = {}) {
    if (!speakingEnabled && !requireVisualState) return null;
    if (!cognition.pipeline || typeof cognition.pipeline !== "function") {
      return null;
    }
    const ctx = await buildPipelineContext(drained);
    try {
      const result = await cognition.pipeline({
        llm: cognition.llm,
        context: ctx,
        evidence: ctx.memoryHits.map((h) => h.text || "").filter(Boolean).slice(0, 5),
        safetyJudge
      });
      const cited = Array.isArray(result?.plan?.useMemoryRefs)
        ? result.plan.useMemoryRefs.slice(0, 16)
        : [];
      state.lastCitedMemoryIds = cited;
      return result;
    } catch (error) {
      auditLog.append({
        type: "pipeline.error",
        ts: new Date().toISOString(),
        data: { message: error?.message || String(error) }
      });
      return null;
    }
  }

  return {
    get sessionId() {
      return sessionId;
    },
    get auditLog() {
      return auditLog;
    },
    get cognition() {
      return cognition;
    },

    /** @param {ReturnType<typeof createSoulBiosCaps>} c */
    async init(c) {
      caps = c || caps || createSoulBiosCaps({ hostId: presetSessionId ?? "generic" });
      sessionId = presetSessionId ?? randomUUID();
      buffer = [];
      lastTs = Date.now();
      tickIndex = 0;
      entityVersion = 0;
      state = {
        host: currentHostContext(),
        mood: createMoodState(),
        pulse: createPulseState(),
        presence: createPresenceState(),
        visualRefs: [],
        lastCitedMemoryIds: [],
        lastSays: null,
        lastSaysAt: 0,
        lastAmbientAttemptAt: 0
      };
      auditLog.append({
        type: "session.init",
        ts: new Date().toISOString(),
        data: { sessionId, hostId: caps.hostId }
      });
      return { sessionId };
    },

    /** @param {SignalEvent[]} events */
    async ingest(events) {
      ensureSessionAndCaps();
      const list = Array.isArray(events) ? events : [];
      buffer.push(...list);
      auditLog.append({
        type: "signal.ingest",
        ts: new Date().toISOString(),
        data: { count: list.length }
      });
      return { accepted: list.length };
    },

    configure(patch = {}) {
      if (patch && typeof patch === "object") {
        if (patch.persona && typeof patch.persona === "object") {
          const currentPersona = persona && typeof persona === "object" ? persona : {};
          const currentStyle = currentPersona.speakingStyle && typeof currentPersona.speakingStyle === "object"
            ? currentPersona.speakingStyle
            : {};
          persona = { ...currentPersona, ...patch.persona };
          if (patch.persona.speakingStyle && typeof patch.persona.speakingStyle === "object") {
            persona.speakingStyle = {
              ...currentStyle,
              ...patch.persona.speakingStyle
            };
          }
        }
        if (patch.speakingEnabled !== undefined) speakingEnabled = patch.speakingEnabled !== false;
        if (patch.safetyJudge !== undefined) safetyJudge = Boolean(patch.safetyJudge);
      }
      auditLog.append({
        type: "session.configure",
        ts: new Date().toISOString(),
        data: {
          personaName: persona && typeof persona === "object" ? persona.name : undefined,
          speakingEnabled,
          safetyJudge
        }
      });
      return { persona, speakingEnabled, safetyJudge };
    },

    /** @param {number|string} [simNow] */
    async tick(simNow) {
      ensureSessionAndCaps();
      const now = parseTickTime(simNow);
      const elapsed = Math.max(0, now - lastTs);
      lastTs = now;
      tickIndex += 1;
      entityVersion += 1;

      const externalDrained = denoiseSignals(buffer.splice(0, buffer.length), { now });
      const lastSayAgeMs = state.lastSaysAt > 0 ? now - state.lastSaysAt : Number.POSITIVE_INFINITY;
      const lastAmbientAttemptAgeMs =
        state.lastAmbientAttemptAt > 0 ? now - state.lastAmbientAttemptAt : Number.POSITIVE_INFINITY;
      const ambientIntervalMs = ambientSpeechIntervalMs(options.config || {});
      const needsAmbientRefresh =
        speakingEnabled &&
        tickIndex > 1 &&
        externalDrained.length === 0 &&
        lastSayAgeMs >= ambientIntervalMs &&
        lastAmbientAttemptAgeMs >= ambientIntervalMs;
      if (needsAmbientRefresh) state.lastAmbientAttemptAt = now;
      const drained = needsAmbientRefresh
        ? [
            ...externalDrained,
            createSignalEvent({
              ts: new Date(now).toISOString(),
              source: "telemetry",
              kind: "soul.ambient.refresh",
              priority: 2,
              reliability: 1,
              payload: {
                reason: "rail-visible-refresh",
                sinceLastSaysMs: Number.isFinite(lastSayAgeMs) ? Math.round(lastSayAgeMs) : null
              }
            })
          ]
        : externalDrained;

      // Layer: Memory (auto-ingest)
      await feedMemory(externalDrained);

      let cognitionResult = null;
      const needsCognition =
        (speakingEnabled || strictLlmVisuals) && (tickIndex === 1 || drained.length > 0);
      if (needsCognition) {
        cognitionResult = await runCognition(drained);
      }

      // Local signal models feed rich secondary telemetry; strict visual mode
      // never uses them as a replacement for LLM mood/pulse/presence/host.
      for (const sig of drained) {
        moodEngine.ingest(sig);
        soulRuntime.ingest(sig);
      }
      await moodEngine.maybeRunLLMAnchor().catch(() => null);
      const moodFrame = moodEngine.tick(now);
      const hadeMood = moodFrame.mood || {};
      const hadeCore = moodFrame.core || {};
      const hadeTendency = moodFrame.tendency || {};
      const v2Frame = await soulRuntime.tick(now);

      const prototype = findPrototype(hadeMood.primary || "calm");
      const llmHints = cognitionResult?.plan?.renderHints;
      if (strictLlmVisuals && llmHints?.mood && llmHints?.pulse && llmHints?.presence && llmHints?.host) {
        state.mood = createMoodState(llmHints.mood);
        state.pulse = createPulseState(llmHints.pulse);
        state.presence = createPresenceState(llmHints.presence);
        state.host = currentHostContext(llmHints.host);
        state.visualRefs = ["llm:mood", "llm:pulse", "llm:presence", "llm:host"];
      } else {
        const hadeTags = hadeMood.primary ? [hadeMood.primary] : ["calm"];
        if (hadeMood.secondary && hadeMood.secondary !== hadeMood.primary) {
          hadeTags.push(hadeMood.secondary);
        }
        const biosCompatTags = hadeTags.map(t => {
          if (["calm", "focused", "curious", "guarded", "delighted", "tired"].includes(t)) return t;
          const groupMap = {
            ambient: "calm", cognitive: "focused", planning: "focused",
            success: "delighted", risk: "guarded", failure: "tired",
            social: "curious", meta: "calm"
          };
          return groupMap[prototype.group] || "calm";
        });
        state.mood = createMoodState({
          valence: hadeCore.valence,
          arousal: hadeCore.arousal,
          dominance: hadeCore.dominance,
          tags: [...new Set(biosCompatTags)],
          confidence: hadeMood.confidence || 0.8
        });

        const v2Pulse = v2Frame.pulse || {};
        state.pulse = createPulseState({
          heartbeatBpm: Math.round(v2Pulse.bpm || 62),
          breathMs: Math.round(v2Pulse.breathMs || 4800)
        });

        const v2Presence = v2Frame.presence || {};
        const presenceMode = v2Presence.mode === "foreground" || v2Presence.mode === "engaged" ? "foreground"
          : v2Presence.mode === "focused" || v2Presence.mode === "attentive" || v2Presence.mode === "guardian" ? "attentive"
          : "ambient";
        state.presence = createPresenceState({
          mode: presenceMode,
          attention: v2Presence.attention || 0.3,
          foreground: presenceMode === "foreground"
        });

        state.visualRefs = ["hade:mood", "hade:pulse", "hade:presence", "hade:host", "hade:memory"];
      }
      state.v2Frame = v2Frame;

      const anchor = moodEngine.getActiveAnchor();
      void anchor;
      if (speakingEnabled && cognition.pipeline && typeof cognition.pipeline === "function") {
        if (!cognitionResult) cognitionResult = await runCognition(drained);
      }
      if (hasSpeakableSays(cognitionResult?.says)) {
        state.lastSays = cognitionResult.says;
        state.lastSaysAt = now;
      }

      // Layer: Reflection (RMM scheduler)
      let reflection = null;
      if (cognition.reflectionScheduler && typeof cognition.reflectionScheduler === "function") {
        try {
          reflection = await cognition.reflectionScheduler(
            tickIndex,
            state.lastCitedMemoryIds || []
          );
        } catch {
          reflection = null;
        }
      }

      const expressionHint = llmHints?.expression || prototype.visual?.expression || "idle";
      const expression = deriveExpression(state.mood, mapExpressionToPhase(expressionHint));

      const says = cognitionResult?.says || state.lastSays || undefined;

      const signalRefs = drained.length
        ? drained.map((s) => s.id).filter(Boolean)
        : ["tick:nosignal"];
      const causeIds = hadeMood.causeIds || [];
      const ruleRefs = [...state.visualRefs, ...causeIds.slice(0, 8)];
      const llmRunIds = cognitionResult?.provenance?.llmRunIds || [];
      const memoryRefs = state.lastCitedMemoryIds || [];
      const consistencyScore = cognitionResult?.safety?.passed === false ? 0.6 : 1;

      const host = currentHostContext();

      const frame = createSoulFrame({
        sessionId: sessionId ?? "",
        entityVersion,
        ts: new Date(now).toISOString(),
        host,
        presence: state.presence,
        mood: state.mood,
        pulse: state.pulse,
        expression,
        says,
        provenance: createProvenance({
          signalRefs,
          ruleRefs,
          memoryRefs,
          llmRunId: llmRunIds[0],
          consistencyScore
        })
      });

      appendAuditEntry(auditLog, {
        type: "tick",
        ts: frame.ts,
        data: {
          tickIndex,
          entityVersion,
          hadeMood: hadeMood.primary,
          hadeSecondary: hadeMood.secondary,
          hadeIntensity: hadeMood.intensity,
          hadeStability: hadeMood.stability,
          moodTags: [...state.mood.tags],
          presenceMode: state.presence.mode,
          shouldSpeak: speakingEnabled,
          llmRunIds,
          reflection: reflection
            ? {
                prospective: reflection.prospective?.summarized || 0,
                retrospective: reflection.retrospective?.bumped || 0
              }
            : null
        },
        provenance: { signalRefs, ruleRefs, memoryRefs, llmRunIds }
      });

      if (tickIndex % 10 === 0) {
        createAuditSnapshot(auditLog, frame);
      }

      const result = Object.create(frame);
      result.v2Frame = v2Frame;
      return result;
    },

    /**
     * Convenience: surface the latest pipeline result without ticking.
     * Useful for inspection / debugging / sidecar query.
     */
    inspect() {
      const llm = cognition.llm;
      const llmStats =
        llm && typeof llm.stats === "function"
          ? llm.stats()
          : {
              providerName: llm?.name || "none",
              model: llm?.model || "(none)",
              available: Boolean(llm?.available),
              state: "idle",
              currentCall: null,
              recentCalls: [],
              totalCalls: 0,
              totalErrors: 0,
              totalTokens: 0,
              avgLatencyMs: null
            };
      const embedder = cognition.embedder;
      const memory = cognition.memory;
      const memoryStats =
        memory && typeof memory.stats === "function" ? memory.stats() : null;
      return {
        sessionId,
        tickIndex,
        entityVersion,
        mood: state.mood,
        presence: state.presence,
        lastSays: state.lastSays,
        lastSaysAt: state.lastSaysAt,
        lastAmbientAttemptAt: state.lastAmbientAttemptAt,
        lastCitedMemoryIds: state.lastCitedMemoryIds,
        hade: moodEngine.inspect(),
        v2: soulRuntime.inspect(),
        cognitionAvailable: {
          llm: Boolean(llm?.available),
          embedder: Boolean(embedder?.available),
          memory: Boolean(memory),
          pipeline: typeof cognition.pipeline === "function",
          reflectionScheduler: typeof cognition.reflectionScheduler === "function"
        },
        llm: llmStats,
        embedder: {
          name: embedder?.name || "none",
          available: Boolean(embedder?.available),
          dimensions: embedder?.dimensions || 0
        },
        memory: memoryStats
      };
    },

    async dispose() {
      try {
        if (cognition.memory && typeof cognition.memory.saveToDisk === "function") {
          await cognition.memory.saveToDisk();
        }
      } catch {
        // ignore persistence failures on dispose
      }
      moodEngine.dispose();
      soulRuntime.dispose();
      auditLog.append({
        type: "session.dispose",
        ts: new Date().toISOString(),
        data: { tickIndex, entityVersion }
      });
      sessionId = null;
      caps = null;
      buffer = [];
      lastTs = Date.now();
      tickIndex = 0;
      entityVersion = 0;
      state = {
        host: createHostContext(),
        mood: createMoodState(),
        pulse: createPulseState(),
        presence: createPresenceState(),
        visualRefs: [],
        lastCitedMemoryIds: [],
        lastSays: null,
        lastSaysAt: 0,
        lastAmbientAttemptAt: 0
      };
    }
  };
}

function hasCompleteLlmVisualHints(result) {
  const hints = result?.plan?.renderHints;
  return Boolean(hints?.mood && hints?.pulse && hints?.presence && hints?.host);
}

function hasSpeakableSays(says) {
  return Boolean(says && typeof says === "object" && typeof says.main === "string" && says.main.trim());
}

function ambientSpeechIntervalMs(config = {}) {
  const raw =
    config?.cognition?.soulSays?.ambientIntervalMs ??
    config?.soulSays?.cadence?.ambientRefreshMs ??
    config?.soulSays?.cadence?.minCooldownMs ??
    20000;
  const n = Number(raw);
  if (!Number.isFinite(n)) return 20000;
  return Math.min(120000, Math.max(5000, Math.round(n)));
}

/**
 * Convenience factory that wires every cognitive layer with sensible defaults.
 *
 * If providers/services are not passed, the standard provider factories are used:
 *   - LLM: createLLMProvider() (auto-detect, may return null)
 *   - Embedder: createEmbeddingProvider() (local lexical provider is available)
 *   - Memory: EmbeddedMemoryStore wrapping the embedder
 *   - Pipeline: runCognitivePipeline
 *   - Reflection: scheduler running every 20 ticks
 *
 * @param {{
 *   env?: Record<string, string>,
 *   config?: Record<string, unknown>,
 *   cwd?: string,
 *   sessionId?: string,
 *   persona?: object,
 *   tickIntervalForReflection?: number,
 *   memoryAllowReflective?: boolean,
 *   safetyJudge?: boolean,
 *   llmPreferred?: string,
 *   requireLlm?: boolean,
 *   strictLlmVisuals?: boolean
 * }} [options]
 */
export async function createIntelligentSoulEngine(options = {}) {
  const env = options.env ?? process.env;
  const config = options.config ?? {};
  const sessionId = options.sessionId;
  const persona = options.persona;

  const [{ createLLMProvider }, { createEmbeddingProvider }, { InstrumentedLLMProvider }, { injectSecretsIntoEnv }] = await Promise.all([
    import("../cognition/llm-provider.js"),
    import("../cognition/embeddings.js"),
    import("../cognition/instrumented-provider.js"),
    import("../core/config.js")
  ]);
  if (options.skipSecrets !== true) {
    try { injectSecretsIntoEnv(env); } catch { /* ignore */ }
  }
  const [{ runCognitivePipeline }, { EmbeddedMemoryStore }, { createReflectionScheduler }] =
    await Promise.all([
      import("../cognition/pipeline/index.js"),
      import("../memory/index.js"),
      import("../memory/reflection.js")
    ]);

  let innerLlm = null;
  let llmInitError = null;
  try {
    innerLlm = await createLLMProvider({
      env,
      config,
      cwd: options.cwd,
      preferred: options.llmPreferred
    });
  } catch (err) {
    llmInitError = err;
    innerLlm = null;
  }

  const requestedProvider = options.llmPreferred || config?.cognition?.llm?.provider || "auto";
  if (innerLlm && innerLlm.available) {
    if (typeof options.onDiagnostic === "function") {
      options.onDiagnostic(`[soul] LLM provider: ${innerLlm.name}, model: ${innerLlm.model}`);
    }
  } else {
    const reason = llmInitError?.message
      || "no API key found (set OPENAI_API_KEY, DEEPSEEK_API_KEY, ANTHROPIC_API_KEY, or OLLAMA_HOST)";
    if (typeof options.onDiagnostic === "function") {
      options.onDiagnostic(`[soul] LLM unavailable (provider=${requestedProvider}): ${reason}`);
    }
  }

  if ((options.requireLlm === true) && (!innerLlm || innerLlm.available === false)) {
    throw new Error(
      `No real LLM provider available for termvis soul (provider=${requestedProvider}): ${llmInitError?.message || "no API key configured"}`
    );
  }
  const llm = new InstrumentedLLMProvider(innerLlm);
  const embedder = await createEmbeddingProvider({ env, config });
  const memory = new EmbeddedMemoryStore({
    embedder,
    sessionId: sessionId || "default",
    allowReflective: Boolean(options.memoryAllowReflective ?? config?.memory?.reflective)
  });

  const reflectionScheduler = createReflectionScheduler({
    memory,
    llm,
    tickInterval: options.tickIntervalForReflection ?? 20
  });

  return createSoulEngine({
    sessionId,
    cwd: options.cwd,
    config,
    persona,
    safetyJudge: Boolean(options.safetyJudge),
    strictLlmVisuals: options.strictLlmVisuals ?? true,
    cognition: {
      llm,
      embedder,
      memory,
      pipeline: runCognitivePipeline,
      reflectionScheduler
    }
  });
}

/** @param {string} expression */
function mapExpressionToPhase(expression) {
  switch (expression) {
    case "speak":
    case "speaking":
      return "speaking";
    case "think":
    case "thinking":
    case "scan":
    case "focus":
    case "focused":
      return "thinking";
    case "warn":
    case "guarded":
    case "guard":
    case "flinch":
      return "guarded";
    case "smile":
    case "warm":
    case "soft-smile":
    case "warm-smile":
    case "sparkle":
    case "nod":
    case "blink":
      return "attentive";
    case "sleepy":
    case "tired":
    case "dim":
    case "frown":
    case "repair":
    case "far-look":
    case "apologetic":
      return "idle";
    default:
      return "idle";
  }
}

/** @param {SignalEvent} sig */
function stringifySignal(sig) {
  if (!sig) return "";
  const payloadText =
    sig.payload && typeof sig.payload === "object" && typeof sig.payload.text === "string"
      ? sig.payload.text.slice(0, 400)
      : "";
  const message =
    sig.payload && typeof sig.payload === "object" && typeof sig.payload.message === "string"
      ? sig.payload.message.slice(0, 200)
      : "";
  const parts = [`[${sig.kind || "unknown"}]`];
  if (payloadText) parts.push(payloadText);
  else if (message) parts.push(message);
  return parts.join(" ").slice(0, 800);
}
