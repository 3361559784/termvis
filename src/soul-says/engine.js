import { createSayCandidate, createSayDecision, createSayDisplayFrame, DEFAULT_SAYS_CONFIG, INTENT_TTL } from "./types.js";
import { computeSpeakScore } from "./opportunity.js";
import { selectIntent, intentToTone } from "./intent.js";
import { scoreCandidates, selectBest, containsDependencyLanguage, containsSecrets } from "./curator.js";
import { generateLLMCandidates } from "./llm-generator.js";

export function createSoulSaysEngine(options = {}) {
  const userConfig = options.config || {};
  const config = {
    ...DEFAULT_SAYS_CONFIG,
    ...userConfig,
    bottomStrip: { ...DEFAULT_SAYS_CONFIG.bottomStrip, ...(userConfig.bottomStrip || {}) },
    generation: { ...DEFAULT_SAYS_CONFIG.generation, ...(userConfig.generation || {}) },
    personality: { ...DEFAULT_SAYS_CONFIG.personality, ...(userConfig.personality || {}) },
    cadence: { ...DEFAULT_SAYS_CONFIG.cadence, ...(userConfig.cadence || {}) },
    safety: { ...DEFAULT_SAYS_CONFIG.safety, ...(userConfig.safety || {}) },
    idle: { ...DEFAULT_SAYS_CONFIG.idle, ...(userConfig.idle || {}) }
  };
  const llm = options.llm || null;

  let machineState = "silent";
  let lastSayAt = 0;
  let currentFrame = null;
  let recentSpeakTimestamps = [];
  let totalSaysThisTurn = 0;
  let turnId = null;
  let history = [];
  const MAX_HISTORY = config.bottomStrip?.historySize || 5;

  function getState() {
    return Object.freeze({
      machineState,
      lastSayAt,
      currentFrame,
      recentSpeakTimestamps: [...recentSpeakTimestamps],
      totalSaysThisTurn,
      history: [...history]
    });
  }

  function transition(newState) {
    machineState = newState;
  }

  function canUseLLM(now) {
    void now;
    if (!llm || !llm.available) return false;
    if (!config.generation?.llmCandidates) return false;
    return true;
  }

  function shouldUseLLM(intent, signals) {
    void intent;
    void signals;
    return true;
  }

  function archiveCurrentFrame() {
    if (!currentFrame?.text) return;
    history.push(currentFrame);
    if (history.length > MAX_HISTORY) history.shift();
  }

  async function tick(input) {
    const now = input.now || Date.now();

    if (input.host?.session?.turnId && input.host.session.turnId !== turnId) {
      turnId = input.host.session.turnId;
      totalSaysThisTurn = 0;
    }

    if (currentFrame && now > currentFrame.enteredAt + currentFrame.ttlMs + (currentFrame.fadeMs || 800)) {
      archiveCurrentFrame();
      currentFrame = null;
      transition("silent");
    }

    if (!config.enabled) return createSayDecision({ action: "silent" });

    const engineState = {
      lastSayAt,
      currentFrame,
      recentSpeakTimestamps,
      totalSaysThisTurn
    };

    const opp = computeSpeakScore({ ...input, config, state: engineState });
    const intent = selectIntent(input, opp);

    transition("composing");

    const candidates = [];

    if (canUseLLM(now) && shouldUseLLM(intent, input.signals)) {
      try {
        const llmCands = await generateLLMCandidates({
          ...input,
          intent,
          style: config.personality
        }, llm);
        candidates.push(...llmCands);
      } catch { /* LLM failure must never break says */ }
    }

    if (candidates.length === 0) {
      const localText = generateLocalCandidate(intent, input);
      if (localText) {
        candidates.push(createSayCandidate({
          text: localText,
          intent,
          source: "hybrid",
          tone: intentToTone(intent),
          brevity: "short",
          priority: 0.6,
          relevance: 0.7,
          styleFit: 0.8,
          factuality: 1.0,
          privacyRisk: 0,
          dependencyRisk: 0
        }));
      }
    }

    if (candidates.length === 0) {
      transition("silent");
      return createSayDecision({ action: "update_meta", rejected: [{ reason: "no_candidate" }] });
    }

    // Safety filter
    const safeCandidates = candidates.filter(c => {
      if (config.safety?.noDependencyLanguage && containsDependencyLanguage(c.text)) return false;
      if (config.safety?.redactSecrets && containsSecrets(c.text)) return false;
      return true;
    });

    if (safeCandidates.length === 0) {
      transition("silent");
      return createSayDecision({ action: "update_meta", rejected: [{ reason: "privacy_risk" }] });
    }

    const scored = scoreCandidates(safeCandidates, { ...input, config, state: engineState });
    const selected = selectBest(scored, input);

    if (!selected) {
      transition("silent");
      return createSayDecision({ action: "update_meta", rejected: [{ reason: "no_candidate" }] });
    }

    // Create display frame
    const frame = createSayDisplayFrame({
      text: selected.text,
      intent: selected.intent,
      tone: selected.tone,
      visibility: selected.intent === "risk_guard" ? "guard"
        : selected.intent === "ambient_whisper" ? "dim"
        : selected.intent === "success_release" ? "bright"
        : "normal",
      ttlMs: selected.ttlMs || INTENT_TTL[selected.intent] || 8000,
      fadeMs: 800,
      enteredAt: now,
      meta: {
        mood: input.mood?.mood?.primary || "calm",
        pulseBpm: Math.round(input.pulse?.bpm || 62),
        pulseEvent: input.pulse?.pulseEvent || "steady",
        presenceMode: input.presence?.mode || "ambient",
        stance: input.presence?.stance || "observe"
      },
      trace: {
        source: selected.source,
        causeIds: [...(selected.causeIds || [])],
        factualBasis: [...(selected.factualBasis || [])],
        llmUsed: selected.source === "llm"
      }
    });

    archiveCurrentFrame();
    currentFrame = frame;
    lastSayAt = now;
    recentSpeakTimestamps.push(now);
    if (recentSpeakTimestamps.length > 20) recentSpeakTimestamps.shift();
    totalSaysThisTurn++;
    transition("speaking");

    return createSayDecision({ action: "speak", frame });
  }

  function getCurrentFrame() {
    return currentFrame;
  }

  function getHistory() {
    return [...history];
  }

  function reset() {
    machineState = "silent";
    lastSayAt = 0;
    currentFrame = null;
    recentSpeakTimestamps = [];
    totalSaysThisTurn = 0;
    history = [];
  }

  function dispose() { reset(); }

  return { tick, getState, getCurrentFrame, getHistory, reset, dispose };
}

const LOCAL_TEMPLATES = Object.freeze({
  ritual_open: [
    "Session started — watching alongside you.",
    "Here we go. I'll keep an eye on things.",
    "Terminal session active. Standing by."
  ],
  ritual_close: [
    "Session wrapping up. Good run.",
    "That's a wrap. Nice work.",
    "Done. See you next session."
  ],
  micro_status: [
    "Processing…",
    "Working on it…",
    "Running…",
    "Making progress.",
    "Still going."
  ],
  risk_guard: [
    "Heads up — this action needs attention.",
    "Careful here — check before proceeding.",
    "This looks sensitive. Double-check."
  ],
  failure_recovery: [
    "Something went wrong. Let's figure it out.",
    "Hit an error — reviewing.",
    "Failure detected. Investigating."
  ],
  success_release: [
    "That worked!",
    "Success.",
    "Looking good — passed.",
    "All clear."
  ],
  tool_watch: [
    "Tool running…",
    "Watching the output.",
    "Executing…"
  ],
  plan_marker: [
    "Planning the approach…",
    "Thinking about the steps.",
    "Working out the strategy."
  ],
  memory_echo: [
    "This reminds me of something we saw before.",
    "I recall a similar pattern.",
    "Seems familiar…"
  ],
  user_alignment: [
    "Got it.",
    "Understood.",
    "On it."
  ],
  mood_reflection: [
    "Staying focused.",
    "Keeping pace.",
    "In the flow."
  ],
  ambient_whisper: [
    "Still here if you need me.",
    "Quiet moment — all calm.",
    "Standing by."
  ],
  subagent_comment: [
    "Sub-task running in parallel.",
    "Background work in progress."
  ],
  web_research_note: [
    "Looking something up…",
    "Searching for info."
  ],
  apology_or_recalibration: [
    "My mistake — adjusting.",
    "Let me correct that.",
    "Recalibrating."
  ]
});

function generateLocalCandidate(intent, _input) {
  const templates = LOCAL_TEMPLATES[intent] || LOCAL_TEMPLATES.micro_status;
  const text = templates[Math.floor(Math.random() * templates.length)];
  return text || null;
}
