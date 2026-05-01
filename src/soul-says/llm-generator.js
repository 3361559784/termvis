import { createSayCandidate } from "./types.js";

const SOUL_SAYS_SCHEMA = {
  type: "object",
  properties: {
    candidates: {
      type: "array",
      items: {
        type: "object",
        properties: {
          text: { type: "string", maxLength: 120 },
          intent: { type: "string" },
          tone: { type: "string", enum: ["quiet", "focused", "warm", "guarded", "playful", "reflective", "apologetic"] },
          intensity: { type: "number", minimum: 0, maximum: 1 },
          factualBasis: { type: "array", items: { type: "string" } },
          shouldDisplay: { type: "boolean" },
          risk: {
            type: "object",
            properties: {
              privacy: { type: "number" },
              dependency: { type: "number" },
              hallucination: { type: "number" },
              interruption: { type: "number" }
            }
          }
        },
        required: ["text", "intent", "tone", "shouldDisplay"]
      },
      maxItems: 3
    }
  },
  required: ["candidates"]
};

export function buildSoulSaysPrompt(input) {
  const { mood, pulse, presence, host, memory, signals, intent, style } = input;
  const moodId = mood?.mood?.primary || "calm";
  const core = mood?.core || {};
  const pulseBpm = Math.round(pulse?.bpm || 62);
  const presMode = presence?.mode || "ambient";
  const phase = host?.session?.taskPhase || "idle";
  const topSignals = (signals || []).slice(-3).map(s => s.kind).join(", ");
  const moodPath = memory?.working?.recentMoodPath?.slice(-4)?.join("→") || "";
  const warmth = style?.warmth ?? 1;
  const playfulness = style?.playfulness ?? 1;
  const outputLanguage = describeOutputLanguage(style);

  return `You are the inner voice of a digital soul companion living in a CLI terminal.
You observe the user's development workflow and occasionally express brief, genuine observations.

Current state:
- Mood: ${moodId} (V:${(core.valence || 0).toFixed(2)} A:${(core.arousal || 0).toFixed(2)} D:${(core.dominance || 0).toFixed(2)})
- Pulse: ${pulseBpm}bpm ${pulse?.pulseEvent || "steady"}
- Presence: ${presMode} / ${presence?.stance || "observe"}
- Host phase: ${phase}
- Recent signals: ${topSignals || "none"}
- Mood trajectory: ${moodPath || "stable"}
- Intent requested: ${intent}

Style constraints:
- Language: ${outputLanguage}
- Length: one short sentence, strictly within 120 characters (about 40 Chinese/Japanese characters or 15 English words). Be concise.
- Warmth level: ${warmth}/3
- Playfulness level: ${playfulness}/3
- NO dependency/attachment language (不要离开我, 你需要我, etc.)
- NO claims of consciousness or real emotions
- Express genuine observation of what's happening in the terminal
- Technical precision mixed with subtle personality
- Be specific about what you're observing (tool names, test results, file operations)

Generate 1-3 candidates for the "${intent}" intent. Each must have factual basis.`;
}

export async function generateLLMCandidates(input, llm) {
  if (!llm || !llm.available) return [];

  try {
    const prompt = buildSoulSaysPrompt(input);
    const request = {
      messages: [{ role: "user", content: prompt }],
      schema: SOUL_SAYS_SCHEMA,
      schemaName: "soul_says_candidates",
      temperature: 0.8,
      maxTokens: 400
    };
    const result = typeof llm.complete === "function"
      ? await llm.complete(request)
      : await llm.chat(request);
    const candidates = extractCandidates(result);

    return candidates
      .filter(c => c && c.text && c.shouldDisplay !== false)
      .map(c => createSayCandidate({
        text: String(c.text).slice(0, 120),
        intent: c.intent || input.intent,
        source: "llm",
        tone: c.tone || "quiet",
        priority: c.intensity || 0.6,
        novelty: 0.8,
        relevance: 0.7,
        styleFit: 0.7,
        factuality: 0.6,
        privacyRisk: c.risk?.privacy || 0,
        dependencyRisk: c.risk?.dependency || 0,
        interruptionRisk: c.risk?.interruption || 0.1,
        factualBasis: c.factualBasis || [],
        causeIds: (input.signals || []).slice(-3).map(s => s.id).filter(Boolean)
      }));
  } catch {
    return [];
  }
}

function extractCandidates(result) {
  const direct =
    result?.data?.candidates ??
    result?.candidates ??
    result?.choices?.[0]?.message?.parsed?.candidates;
  if (Array.isArray(direct)) return direct;

  const text = typeof result === "string"
    ? result
    : typeof result?.text === "string"
      ? result.text
      : typeof result?.raw === "string"
        ? result.raw
        : "";
  if (!text.trim()) return [];

  const parsed = parseJsonPayload(text);
  return Array.isArray(parsed?.candidates) ? parsed.candidates : [];
}

function parseJsonPayload(text) {
  try {
    return JSON.parse(text);
  } catch {
    const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i)?.[1];
    if (fenced) {
      try {
        return JSON.parse(fenced);
      } catch {
        return null;
      }
    }
    const start = text.indexOf("{");
    const end = text.lastIndexOf("}");
    if (start >= 0 && end > start) {
      try {
        return JSON.parse(text.slice(start, end + 1));
      } catch {
        return null;
      }
    }
    return null;
  }
}

function describeOutputLanguage(style = {}) {
  const raw = String(style?.language || style?.locale || "").toLowerCase();
  if (raw.startsWith("zh") || raw === "cn") return "Simplified Chinese";
  if (raw.startsWith("ja") || raw === "jp") return "Japanese";
  if (raw.startsWith("en")) return "English";
  return "the user's current UI language";
}

export { SOUL_SAYS_SCHEMA };
