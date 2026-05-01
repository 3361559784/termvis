/**
 * Stage 3: Style Enforcer.
 *
 * Re-projects the `ContentDraft` through the persona's speakingStyle dials
 * (brevity / warmth / metaphor / emoji) and returns a `SaysState`. There is
 * no local rewrite; invalid or unavailable LLM output stays silent.
 */

import { createSaysState } from "../../soul-bios/types.js";
import { buildSystemPrompt } from "./prompts.js";

/** @typedef {ReturnType<typeof createSaysState>} SaysState */

export const STYLE_OUTPUT_SCHEMA = Object.freeze({
  type: "object",
  additionalProperties: false,
  required: ["main", "tone", "speechAct"],
  properties: {
    main: { type: "string", maxLength: 520 },
    aside: { type: "string", maxLength: 220 },
    tone: { type: "string", enum: ["plain", "warm", "playful", "guarded"] },
    speechAct: {
      type: "string",
      enum: ["answer", "warn", "suggest", "reflect", "confirm"]
    }
  }
});

/** Brevity dial → max main length. */
const BREVITY_LIMITS = Object.freeze({ 0: 520, 1: 360, 2: 240, 3: 140 });
const ASIDE_LIMITS = Object.freeze({ 0: 220, 1: 180, 2: 120, 3: 80 });

/**
 * Apply persona's speakingStyle to the draft and produce a frozen SaysState.
 *
 * @param {{
 *   llm: object|null,
 *   draft: { main: string, aside?: string, reasoning?: string, confidence?: number }|null,
 *   persona: object|null,
 *   plan: object,
 *   mood: object|null
 * }} args
 * @returns {Promise<{ says: SaysState|null, llmRunId: string|null }>}
 */
export async function applyStyle({ llm, draft, persona, plan, mood }) {
  if (!draft || typeof draft.main !== "string") {
    return { says: null, llmRunId: null };
  }

  const safePersona = persona && typeof persona === "object" ? persona : {};
  const speakingStyle = normalizeSpeakingStyle(safePersona.speakingStyle);
  const speechAct = typeof plan?.speechAct === "string" ? plan.speechAct : "answer";
  const tone = chooseTone(mood, plan);

  if (!llm || typeof llm.complete !== "function" || llm.available === false) {
    const limit = BREVITY_LIMITS[speakingStyle.brevity] ?? 320;
    const main = truncateUtterance(String(draft.main), limit);
    const says = createSaysState({ main, tone, speechAct });
    return { says, llmRunId: null };
  }

  const system =
    `${buildSystemPrompt("style", { persona: safePersona })}\n\n` +
    `[Style Dials]\n` +
    `Brevity=${speakingStyle.brevity}/3. Warmth=${speakingStyle.warmth}/3. ` +
    `Metaphor=${speakingStyle.metaphor}/3. Emoji=${speakingStyle.emoji}/3.\n` +
    `Match the requested speech act (${speechAct}) and mood tone (${tone}). ` +
    `Do not invent new content beyond the draft.`;

  const userBlock =
    `draft=${safeJson(draft)}\n` +
    `plan=${safeJson(plan)}\n` +
    `mood=${safeJson(mood ?? {})}\n` +
    `persona.speakingStyle=${safeJson(speakingStyle)}\n\n` +
    `[Output requirement]\nReturn a SaysState JSON with fields {main, aside?, tone, speechAct}. Preserve a complete small paragraph unless brevity=3.`;

  try {
    const result = await llm.complete({
      system,
      messages: [{ role: "user", content: userBlock }],
      schema: STYLE_OUTPUT_SCHEMA,
      schemaName: "SaysState",
      temperature: 0.3,
      maxTokens: 360
    });

    const data = result?.data;
    if (!data || typeof data !== "object" || typeof data.main !== "string") {
      return { says: null, llmRunId: null };
    }

    const limit = BREVITY_LIMITS[speakingStyle.brevity] ?? 320;
    const asideLimit = ASIDE_LIMITS[speakingStyle.brevity] ?? 160;
    const main = truncateUtterance(String(data.main), limit);
    const aside =
      typeof data.aside === "string" && data.aside.length > 0
        ? truncateUtterance(String(data.aside), asideLimit)
        : undefined;

    const says = createSaysState({
      main,
      tone: typeof data.tone === "string" ? data.tone : tone,
      speechAct: typeof data.speechAct === "string" ? data.speechAct : speechAct,
      ...(aside !== undefined ? { aside } : {})
    });

    return {
      says,
      llmRunId: typeof result.runId === "string" ? result.runId : null
    };
  } catch {
    return { says: null, llmRunId: null };
  }
}

/**
 * @param {unknown} input
 */
function normalizeSpeakingStyle(input) {
  const o = input && typeof input === "object" ? /** @type {Record<string, unknown>} */ (input) : {};
  return {
    brevity: clampDial(o.brevity, 1),
    warmth: clampDial(o.warmth, 1),
    metaphor: clampDial(o.metaphor, 0),
    emoji: clampDial(o.emoji, 0)
  };
}

/**
 * @param {unknown} v
 * @param {number} defaultDial
 */
function clampDial(v, defaultDial) {
  const n = Number(v);
  if (!Number.isFinite(n)) return defaultDial;
  return Math.min(3, Math.max(0, Math.round(n)));
}

/**
 * @param {object|null} mood
 * @param {object} plan
 * @returns {"plain"|"warm"|"playful"|"guarded"}
 */
function chooseTone(mood, plan) {
  const tags =
    mood && Array.isArray(/** @type {Record<string, unknown>} */ (mood).tags)
      ? /** @type {string[]} */ (/** @type {Record<string, unknown>} */ (mood).tags)
      : [];

  if (plan && (plan.speechAct === "warn" || plan.speechAct === "confirm")) {
    return "guarded";
  }
  if (tags.some((t) => ["guarded", "cautious", "vigilant", "alarmed", "concerned"].includes(t))) return "guarded";
  if (tags.some((t) => ["delighted", "curious", "warm", "relieved", "satisfied", "hopeful", "supportive", "present"].includes(t))) return "warm";
  if (tags.some((t) => ["focused", "attentive", "absorbed", "analytical", "organized", "determined", "orchestrating"].includes(t))) return "plain";
  return "plain";
}

/**
 * @param {string} text
 * @param {number} limit
 */
function truncateUtterance(text, limit) {
  const cleaned = String(text ?? "").replace(/\s+/g, " ").trim();
  if (cleaned.length <= limit) return cleaned;
  const slice = cleaned.slice(0, Math.max(1, limit - 1));
  return `${slice.replace(/[\s,;:.!?]+$/, "")}…`;
}

/** @param {unknown} value */
function safeJson(value) {
  try {
    return JSON.stringify(value);
  } catch {
    return '"[unserializable]"';
  }
}
