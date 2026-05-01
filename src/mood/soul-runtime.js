import { createMoodEngine } from "./engine.js";
import { createPulseEngine, derivePulseVisual } from "./pulse-v2.js";
import { createPresenceScheduler, derivePresenceVisual } from "./presence-v2.js";
import { createHostModel, deriveHostVisual } from "./host-v2.js";
import { createMemoryModel, deriveMemoryVisual } from "./memory-v2.js";
import { bridgeSignalToV2, deriveSignalVisual } from "./signal-v2.js";
import { findPrototype } from "./prototypes.js";
import { createSoulSaysEngine } from "../soul-says/engine.js";

export function createSoulRuntime(options = {}) {
  const config = options.config || {};
  const runtimeConfig = config.soulRuntime || {};
  void runtimeConfig;
  const persona = options.persona && typeof options.persona === "object" ? options.persona : {};
  const personaStyle = persona.speakingStyle && typeof persona.speakingStyle === "object" ? persona.speakingStyle : {};
  const language = normalizeLanguage(config?.ui?.language || persona.language || config?.language || "en");
  const personalityPatch = {};
  for (const key of ["warmth", "playfulness", "metaphor", "emoji"]) {
    const value = personaStyle[key] ?? config.soulSays?.personality?.[key];
    if (value !== undefined) personalityPatch[key] = value;
  }
  const saysConfig = {
    ...(config.soulSays || {}),
    personality: {
      ...(config.soulSays?.personality || {}),
      ...personalityPatch,
      language
    }
  };

  const moodEngine = createMoodEngine(options);
  const pulseEngine = createPulseEngine(config.pulse || {});
  const presenceScheduler = createPresenceScheduler(config.presence || {});
  const hostModel = createHostModel(config.host || {});
  const memoryModel = createMemoryModel();
  const saysEngine = createSoulSaysEngine({
    config: saysConfig,
    llm: options.llm || null
  });

  let lastTickAt = Date.now();
  let tickIndex = 0;
  let recentSignalsV2 = [];
  const MAX_RECENT_SIGNALS = 30;

  return {
    ingest(signal) {
      moodEngine.ingest(signal);
      const v2 = bridgeSignalToV2(signal);
      if (v2) {
        recentSignalsV2.push(v2);
        if (recentSignalsV2.length > MAX_RECENT_SIGNALS) recentSignalsV2.shift();
      }
    },

    ingestBatch(signals) {
      if (!Array.isArray(signals)) return;
      for (const s of signals) this.ingest(s);
    },

    async tick(now = Date.now()) {
      const dtMs = Math.max(0, now - lastTickAt);
      lastTickAt = now;
      tickIndex += 1;

      // 1. LLM anchor (if budget allows)
      await moodEngine.maybeRunLLMAnchor().catch(() => null);

      // 2. Mood tick
      const moodFrame = moodEngine.tick(now);
      const moodId = moodEngine.getCurrentMoodId();
      const prototype = findPrototype(moodId);

      // 3. Host update from recent signals
      const hostState = hostModel.update(recentSignalsV2);

      // 4. Memory update
      const memState = memoryModel.update(recentSignalsV2, moodId, moodFrame, dtMs);

      // 5. Pulse tick — feeds from mood + host pressure + memory debt
      const pulseState = pulseEngine.tick(dtMs, moodFrame, {
        toolConcurrency: hostState.pressure?.toolConcurrency || 0,
        permissionPressure: hostState.pressure?.permissionPressure || 0,
        recentSuccess: hostState.recovery?.recentSuccess || 0,
        sandbox: hostState.permissions?.sandbox,
        mode: hostState.mode?.name,
        stdoutRate: hostState.pressure?.stdoutRate || 0
      }, {
        fatigue: memState.debt?.fatigue || 0,
        trust: memState.debt?.trust || 0,
        calmBias: memState.rhythm?.calmBias || 0
      });

      // 6. Presence tick — feeds from mood + host + memory + signals
      const presenceState = presenceScheduler.update(moodFrame, {
        taskPhase: hostState.session?.taskPhase,
        mode: hostState.mode?.name,
        approvalState: hostState.permissions?.approvalState,
        isCodeStreaming: hostState.session?.taskPhase === "responding",
        toolActive: hostState.tool?.activeCount > 0,
        userIsTyping: recentSignalsV2.some(s => s.kind === "user.typing" && (now - s.ts) < 3000),
        screenReaderMode: hostState.tty?.screenReaderMode
      }, {
        rhythm: memState.rhythm,
        debt: memState.debt,
        relationship: memState.relationship
      }, recentSignalsV2, now);

      // 7. Soul Says tick
      let saysDecision = null;
      try {
        saysDecision = await saysEngine.tick({
          signals: recentSignalsV2,
          host: hostState,
          mood: moodFrame,
          pulse: pulseState,
          presence: presenceState,
          memory: memState,
          now
        });
      } catch { /* says engine must never break runtime */ }
      const currentSaysFrame = saysDecision?.frame || saysEngine.getCurrentFrame();
      const saysState = saysEngine.getState().machineState;

      // Clear old signals
      const cutoff = now - 12000;
      recentSignalsV2 = recentSignalsV2.filter(s => s.ts > cutoff);

      // Build status frame
      return Object.freeze({
        timestamp: now,
        tickIndex,

        mood: Object.freeze({
          primary: moodId,
          secondary: moodFrame.mood?.secondary || null,
          caap: moodFrame,
          prototype: Object.freeze({
            group: prototype.group,
            expression: prototype.visual?.expression || "idle",
            aura: prototype.visual?.aura || "none"
          })
        }),

        pulse: pulseState,
        presence: presenceState,
        host: hostState,

        memory: Object.freeze({
          debt: memState.debt,
          rhythm: memState.rhythm,
          relationship: memState.relationship,
          moodPath: memState.working?.recentMoodPath || []
        }),

        signals: Object.freeze({
          latest: Object.freeze(recentSignalsV2.slice(-8).map(s => Object.freeze({ kind: s.kind, priority: s.priority, ts: s.ts }))),
          count: recentSignalsV2.length
        }),

        soulSays: Object.freeze({
          action: currentSaysFrame ? "speak" : (saysDecision?.action || "silent"),
          frame: currentSaysFrame || null,
          history: Object.freeze(saysEngine.getHistory()),
          state: saysState
        }),

        visual: Object.freeze({
          pulse: derivePulseVisual(pulseState),
          presence: derivePresenceVisual(presenceState),
          host: deriveHostVisual(hostState),
          memory: deriveMemoryVisual(memState),
          signals: deriveSignalVisual(recentSignalsV2, 6)
        })
      });
    },

    getMoodEngine() { return moodEngine; },
    getPulseState() { return pulseEngine.getState(); },
    getPresenceState() { return presenceScheduler.getState(); },
    getHostState() { return hostModel.getState(); },
    getMemoryState() { return memoryModel.getState(); },

    getSaysEngine() { return saysEngine; },

    inspect() {
      return Object.freeze({
        tickIndex,
        mood: moodEngine.inspect(),
        host: hostModel.getState(),
        memory: memoryModel.getState(),
        recentSignals: recentSignalsV2.length,
        soulSays: saysEngine.getState()
      });
    },

    reset() {
      moodEngine.reset();
      pulseEngine.reset();
      presenceScheduler.reset();
      hostModel.reset();
      memoryModel.reset();
      saysEngine.reset();
      recentSignalsV2 = [];
      tickIndex = 0;
      lastTickAt = Date.now();
    },

    dispose() {
      saysEngine.dispose();
      this.reset();
    }
  };
}

function normalizeLanguage(value) {
  const lang = String(value || "").toLowerCase();
  if (lang.startsWith("zh") || lang === "cn") return "zh";
  if (lang.startsWith("ja") || lang === "jp") return "ja";
  return "en";
}
