import { SAY_INTENTS } from "./types.js";

export function selectIntent(input, opportunity) {
  const { signals, mood, pulse, presence, host, memory } = input;
  const sigs = signals || [];
  const moodId = mood?.mood?.primary || "calm";
  const pulseEvt = pulse?.pulseEvent || "steady";
  const presMode = presence?.mode || "ambient";
  const taskPhase = host?.session?.taskPhase || "idle";
  const tend = mood?.tendency || {};
  const appr = mood?.appraisal || {};

  // Signal-driven intents (highest priority)
  for (const s of sigs) {
    const k = s.kind || "";
    if (k === "session.start") return "ritual_open";
    if (k === "session.end") return "ritual_close";
    if (k === "session.resume") return "ritual_open";

    if (k === "tool.permission.request" || k === "shell.destructive") return "risk_guard";
    if (k === "tool.permission.deny") return "risk_guard";

    if (k === "test.fail" || k === "build.failure") return "failure_recovery";
    if (k === "test.pass" || k === "build.success") return "success_release";

    if (k === "user.praise") return "user_alignment";
    if (k === "user.critique" || k === "user.correct") return "apology_or_recalibration";
    if (k === "user.submit") return "user_alignment";

    if (k === "host.output.plan") return "plan_marker";
    if (k === "host.output.final") return "ritual_close";

    if (k === "web.search.begin" || k === "web.search.result" || k === "web.failure") return "web_research_note";

    if (k.startsWith("agent.subagent.")) return "subagent_comment";

    if (k.startsWith("mcp.tool.")) return "tool_watch";
  }

  // Mood-driven intents
  if ((appr.risk || 0) > 0.5) return "risk_guard";
  if (presMode === "recovering") return "failure_recovery";
  if (presMode === "celebrating") return "success_release";
  if (presMode === "guardian") return "risk_guard";

  // Presence-driven
  if (presMode === "reflective") return "memory_echo";

  // Task-phase driven
  if (taskPhase === "reasoning" || taskPhase === "planning") return "micro_status";
  if (taskPhase === "tooling" || taskPhase === "editing") return "tool_watch";
  if (taskPhase === "verifying") return "tool_watch";
  if (taskPhase === "waiting_approval") return "risk_guard";

  // Pulse-driven
  if (pulseEvt === "surge") return "mood_reflection";
  if (pulseEvt === "skip") return "mood_reflection";

  // Mood-intensity driven
  const core = mood?.core || {};
  if ((core.arousal || 0) > 0.7) return "mood_reflection";

  // Idle / ambient
  const msSinceActivity = input.msSinceLastActivity || 0;
  if (msSinceActivity > 90000) return "ambient_whisper";

  return "micro_status";
}

export function intentToTone(intent, moodId) {
  const map = {
    silent: "quiet",
    micro_status: "focused",
    mood_reflection: "reflective",
    risk_guard: "guarded",
    plan_marker: "focused",
    tool_watch: "focused",
    failure_recovery: "focused",
    success_release: "warm",
    memory_echo: "reflective",
    user_alignment: "warm",
    ambient_whisper: "quiet",
    ritual_open: "warm",
    ritual_close: "reflective",
    subagent_comment: "focused",
    web_research_note: "focused",
    apology_or_recalibration: "apologetic"
  };
  return map[intent] || "quiet";
}

export function intentToBrevity(intent) {
  const map = {
    micro_status: "micro",
    ambient_whisper: "micro",
    tool_watch: "micro",
    risk_guard: "short",
    failure_recovery: "short",
    success_release: "short",
    plan_marker: "short",
    memory_echo: "normal",
    ritual_open: "micro",
    ritual_close: "short",
    user_alignment: "micro",
    subagent_comment: "short",
    web_research_note: "short",
    mood_reflection: "short",
    apology_or_recalibration: "short"
  };
  return map[intent] || "short";
}
