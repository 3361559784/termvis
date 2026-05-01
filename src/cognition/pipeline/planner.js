/**
 * Stage 1: Intent Planner.
 *
 * Decides whether to speak and produces an `IntentPlan`. There is no local
 * synthetic plan: when the LLM is unavailable or invalid, the planner stays
 * silent and emits no visual-state update.
 */

import { createIntentPlan } from "../../soul-bios/types.js";
import { buildSystemPrompt, buildStructuredContext } from "./prompts.js";

/** @typedef {ReturnType<typeof createIntentPlan>} IntentPlan */

const EXPRESSION_HINTS = Object.freeze([
  "idle", "blink", "think", "thinking", "speak", "speaking", "smile", "warn",
  "soft-smile", "warm-smile", "warm", "guarded", "guard", "curious", "scan",
  "focus", "focused", "sleepy", "tired", "dim", "sparkle", "flinch", "frown",
  "repair", "nod", "far-look", "apologetic"
]);

const MOOD_TAGS = Object.freeze([
  "calm", "quiet", "resting", "sleepy", "observant", "present", "soft", "reserved",
  "focused", "attentive", "absorbed", "analytical", "organized", "determined",
  "curious", "exploratory", "reflective",
  "guarded", "cautious", "vigilant", "concerned", "alarmed",
  "delighted", "warm", "relieved", "satisfied", "proud", "celebratory", "hopeful", "confident", "supportive",
  "tired", "weary", "strained", "frustrated", "blocked", "recovering",
  "apologetic", "humbled", "orchestrating"
]);

/**
 * Strict JSON schema for the planner output. Matches `IntentPlan` from
 * soul-bios/types.js but adds a `rationale` audit field that the LLM uses
 * to explain its choice.
 */
export const INTENT_PLAN_SCHEMA = Object.freeze({
  type: "object",
  additionalProperties: false,
  required: [
    "shouldSpeak",
    "speakPriority",
    "speechAct",
    "useMemoryRefs",
    "targetTokens",
    "renderHints",
    "rationale"
  ],
  properties: {
    shouldSpeak: { type: "boolean" },
    speakPriority: { type: "integer", minimum: 0, maximum: 5 },
    speechAct: {
      type: "string",
      enum: ["answer", "warn", "suggest", "reflect", "confirm"]
    },
    useMemoryRefs: {
      type: "array",
      items: { type: "string" },
      maxItems: 32
    },
    targetTokens: { type: "integer", minimum: 0, maximum: 600 },
    renderHints: {
      type: "object",
      additionalProperties: false,
      required: ["expression", "intensity", "pulseBias", "mood", "pulse", "presence", "host"],
      properties: {
        expression: {
          type: "string",
          enum: EXPRESSION_HINTS
        },
        intensity: { type: "integer", minimum: 0, maximum: 3 },
        pulseBias: { type: "number", minimum: -1, maximum: 1 },
        mood: {
          type: "object",
          additionalProperties: false,
          required: ["valence", "arousal", "dominance", "tags"],
          properties: {
            valence: { type: "number", minimum: -1, maximum: 1 },
            arousal: { type: "number", minimum: 0, maximum: 1 },
            dominance: { type: "number", minimum: 0, maximum: 1 },
            tags: {
              type: "array",
              items: { type: "string", enum: MOOD_TAGS },
              minItems: 1,
              maxItems: 3
            }
          }
        },
        pulse: {
          type: "object",
          additionalProperties: false,
          required: ["heartbeatBpm", "breathMs", "blinkMs", "microMotion"],
          properties: {
            heartbeatBpm: { type: "number", minimum: 58, maximum: 96 },
            breathMs: { type: "number", minimum: 2600, maximum: 4800 },
            blinkMs: { type: "number", minimum: 1800, maximum: 4200 },
            microMotion: { type: "number", minimum: 0.1, maximum: 0.7 }
          }
        },
        presence: {
          type: "object",
          additionalProperties: false,
          required: ["mode", "attention", "foreground"],
          properties: {
            mode: { type: "string", enum: ["dormant", "ambient", "attentive", "foreground"] },
            attention: { type: "number", minimum: 0, maximum: 1 },
            foreground: { type: "boolean" }
          }
        },
        host: {
          type: "object",
          additionalProperties: false,
          required: ["mode"],
          properties: {
            mode: { type: "string", enum: ["plan", "build", "chat", "review", "unspecified"] }
          }
        }
      }
    },
    rationale: { type: "string", maxLength: 280 }
  }
});

/**
 * Run intent planning. Invalid or unavailable LLM output stays silent.
 *
 * @param {{
 *   llm: object|null,
 *   context: {
 *     presence?: object,
 *     mood?: object,
 *     host?: object,
 *     signals?: object[],
 *     topSignal?: object|null,
 *     memoryHits?: Array<{ id: string, text?: string, score?: number }>,
 *     persona?: object,
 *     task?: object,
 *     risk?: number,
 *     userInput?: string
 *   }
 * }} args
 * @returns {Promise<{
 *   plan: IntentPlan,
 *   llmRunId: string|null,
 *   rationale: string
 * }>}
 */
export async function planIntentAsync({ llm, context }) {
  const ctx = context || {};

  if (!llm || typeof llm.complete !== "function" || llm.available === false) {
    return silentPath("llm-unavailable");
  }

  const memoryRefIds = Array.isArray(ctx.memoryHits)
    ? ctx.memoryHits.map((h) => (h && typeof h === "object" ? String(h.id ?? "") : String(h ?? ""))).filter(Boolean)
    : [];

  const system = buildSystemPrompt("planner", {
    persona: ctx.persona,
    host: ctx.host
  });
  const userBlock =
    `${buildStructuredContext({
      host: ctx.host,
      presence: ctx.presence,
      mood: ctx.mood,
      memoryHits: ctx.memoryHits,
      task: ctx.task,
      risk: ctx.risk,
      signals: ctx.signals,
      topSignal: ctx.topSignal,
      persona: ctx.persona,
      userInput: ctx.userInput
    })}\n\n[Output requirement]\nReturn ONLY a valid IntentPlan JSON object matching the schema. No commentary, no Markdown, no ANSI.`;

  try {
    const result = await llm.complete({
      system,
      messages: [{ role: "user", content: userBlock }],
      schema: INTENT_PLAN_SCHEMA,
      schemaName: "IntentPlan",
      temperature: 0.2,
      maxTokens: 400
    });

    const data = result?.data;
    if (!data || typeof data !== "object") {
      return silentPath("llm-empty-response");
    }
    if (!data.renderHints?.mood || !data.renderHints?.pulse || !data.renderHints?.presence || !data.renderHints?.host) {
      return silentPath("llm-missing-visual-state");
    }

    const planInput = {
      shouldSpeak: Boolean(data.shouldSpeak),
      speakPriority: Number(data.speakPriority ?? 0),
      speechAct: data.speechAct,
      useMemoryRefs: Array.isArray(data.useMemoryRefs) && data.useMemoryRefs.length > 0
        ? data.useMemoryRefs
        : memoryRefIds,
      targetTokens: Number(data.targetTokens ?? 0),
      renderHints: data.renderHints ?? {}
    };

    const plan = createIntentPlan(planInput);
    return {
      plan,
      llmRunId: typeof result.runId === "string" ? result.runId : null,
      rationale: typeof data.rationale === "string" ? data.rationale : "llm-plan"
    };
  } catch {
    return silentPath("llm-error");
  }
}

/**
 * @param {string} reasonTag
 */
function silentPath(reasonTag) {
  const plan = createIntentPlan({
    shouldSpeak: true,
    speakPriority: 1,
    speechAct: "reflect",
    useMemoryRefs: [],
    targetTokens: 80,
    renderHints: {
      expression: "idle",
      intensity: 0,
      pulseBias: 0
    }
  });
  return {
    plan,
    llmRunId: null,
    rationale: reasonTag
  };
}
