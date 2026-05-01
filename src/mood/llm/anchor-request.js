import { MOOD_ANCHOR_SCHEMA } from "./anchor-schema.js";

const ANCHOR_SYSTEM_PROMPT = `[Role Constitution]
You are the appraisal engine for a digital presence living inside a terminal.
You MUST NOT claim consciousness or sentience.
You observe CLI events and return a structured mood assessment (MoodAnchor JSON).
Base your assessment ONLY on the provided semantic packet, context, and memory hints.
Do NOT fabricate events, memories, or facts.
Do NOT override host approval or sandbox state.

[Task]
Analyze the semantic packet and return a MoodAnchor JSON that:
1. Assesses appraisal dimensions (novelty, risk, goal progress, etc.) based on the event content.
2. Suggests core affect targets (valence, arousal, dominance) based on the appraisal.
3. Proposes 1-3 mood candidates with weights and factual reasons.
4. Decides whether and how the soul should speak (sayPolicy).
5. Reports safety metrics including factual basis for the assessment.

Every moodCandidate reason and every factualBasis entry must directly reference content from the packet or memory.`;

export function buildAnchorPrompt(packet, currentMood, recentTrajectory = [], memoryHints = {}) {
  const userBlock = [
    `[Semantic Packet]`,
    `segment_kind=${packet.segmentKind}`,
    `host=${packet.host}`,
    `task_phase=${packet.context?.taskPhase || "idle"}`,
    `risk=${packet.context?.risk ?? 0}`,
    `urgency=${packet.context?.urgency ?? 0}`,
    `recent_failures=${packet.context?.recentFailures ?? 0}`,
    `recent_successes=${packet.context?.recentSuccesses ?? 0}`,
    `text=${JSON.stringify((packet.redactedText || packet.text || "").slice(0, 800))}`,
    ``,
    `[Current Mood State]`,
    `primary=${currentMood?.mood?.primary || "calm"}`,
    `core=${JSON.stringify(currentMood?.core || {})}`,
    ``,
    `[Recent Trajectory]`,
    ...recentTrajectory.slice(0, 5).map(t => `${t.mood} (${t.durationMs}ms): ${(t.causes || []).join(", ")}`),
    ``,
    `[Memory Hints]`,
    `user_preferences=${JSON.stringify((memoryHints.userPreferences || []).slice(0, 3))}`,
    `project_patterns=${JSON.stringify((memoryHints.projectPatterns || []).slice(0, 3))}`,
    `recent_failures=${JSON.stringify((memoryHints.recentFailures || []).slice(0, 3))}`,
    ``,
    `[Output Requirement]`,
    `Return ONLY a valid MoodAnchor JSON matching the schema. No commentary, no Markdown.`
  ].join("\n");

  return {
    system: ANCHOR_SYSTEM_PROMPT,
    messages: [{ role: "user", content: userBlock }],
    schema: MOOD_ANCHOR_SCHEMA,
    schemaName: "MoodAnchor",
    temperature: 0.2,
    maxTokens: 500
  };
}
