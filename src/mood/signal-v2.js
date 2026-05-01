import { randomUUID } from "node:crypto";
import { clamp } from "./types.js";

export const SIGNAL_V2_KINDS = Object.freeze([
  "session.start", "session.resume", "session.end",
  "turn.start", "turn.end",
  "context.load", "context.compact.begin", "context.compact.end",
  "host.mode.switch", "host.approval.mode",
  "agent.primary.switch",
  "agent.subagent.create", "agent.subagent.start", "agent.subagent.stop",
  "user.typing", "user.submit", "user.interrupt",
  "user.approve", "user.deny",
  "user.praise", "user.critique", "user.correct",
  "host.reasoning.begin", "host.reasoning.stream", "host.reasoning.end",
  "host.output.natural", "host.output.code", "host.output.plan",
  "host.output.todo", "host.output.final", "host.output.log",
  "tool.batch.begin", "tool.batch.end",
  "tool.call.begin", "tool.call.progress", "tool.call.success",
  "tool.call.failure", "tool.call.retry", "tool.call.cancel",
  "tool.permission.request", "tool.permission.grant", "tool.permission.deny",
  "file.read", "file.search", "file.glob", "file.grep",
  "file.write", "file.edit", "file.patch",
  "file.checkpoint", "file.restore",
  "shell.begin", "shell.success", "shell.failure", "shell.destructive",
  "test.begin", "test.pass", "test.fail",
  "build.begin", "build.success", "build.failure",
  "git.diff", "git.commit", "git.conflict",
  "web.search.begin", "web.search.result", "web.fetch.begin", "web.fetch.result", "web.failure",
  "mcp.server.connect", "mcp.server.disconnect",
  "mcp.tool.list.changed",
  "mcp.tool.begin", "mcp.tool.success", "mcp.tool.failure",
  "mcp.resource.updated",
  "rate.limit", "network.failure", "stdout.burst", "terminal.resize",
  "memory.write", "memory.recall", "memory.reflect"
]);

export function createSoulSignalV2(overrides = {}) {
  const o = overrides || {};
  const payload = o.payload && typeof o.payload === "object" ? { ...o.payload } : {};
  const semantic = o.semantic && typeof o.semantic === "object" ? { ...o.semantic } : {};
  const affectHints = o.affectHints && typeof o.affectHints === "object" ? { ...o.affectHints } : {};
  const cause = o.cause && typeof o.cause === "object" ? { ...o.cause } : {};

  return Object.freeze({
    id: String(o.id || randomUUID()),
    ts: Number.isFinite(Number(o.ts)) ? Number(o.ts) : Date.now(),
    hostId: String(o.hostId || "generic"),
    kind: String(o.kind || "stdout.burst"),
    phase: String(o.phase || "idle"),
    priority: clamp(Math.floor(Number(o.priority ?? 2)), 0, 5),
    reliability: clamp(Number(o.reliability ?? 0.8), 0, 1),
    confidence: clamp(Number(o.confidence ?? 0.7), 0, 1),
    ttlMs: Math.max(0, Number(o.ttlMs ?? 10000)),
    payload: Object.freeze({
      text: payload.text != null ? String(payload.text) : undefined,
      redactedText: payload.redactedText != null ? String(payload.redactedText) : undefined,
      toolName: payload.toolName != null ? String(payload.toolName) : undefined,
      exitCode: Number.isFinite(Number(payload.exitCode)) ? Number(payload.exitCode) : undefined,
      errorKind: payload.errorKind != null ? String(payload.errorKind) : undefined,
      filePaths: Array.isArray(payload.filePaths) ? Object.freeze(payload.filePaths.map(String)) : undefined,
      agentName: payload.agentName != null ? String(payload.agentName) : undefined,
      modeName: payload.modeName != null ? String(payload.modeName) : undefined,
      permission: payload.permission != null ? String(payload.permission) : undefined,
    }),
    semantic: Object.freeze({
      segmentKind: semantic.segmentKind || undefined,
      novelty: Number.isFinite(Number(semantic.novelty)) ? clamp(Number(semantic.novelty), 0, 1) : undefined,
      anomaly: Number.isFinite(Number(semantic.anomaly)) ? clamp(Number(semantic.anomaly), 0, 1) : undefined,
    }),
    affectHints: Object.freeze({
      risk: clamp(Number(affectHints.risk ?? 0), 0, 1),
      urgency: clamp(Number(affectHints.urgency ?? 0), 0, 1),
      progress: clamp(Number(affectHints.progress ?? 0), 0, 1),
      blockage: clamp(Number(affectHints.blockage ?? 0), 0, 1),
      uncertainty: clamp(Number(affectHints.uncertainty ?? 0), 0, 1),
      social: clamp(Number(affectHints.social ?? 0), 0, 1),
    }),
    cause: Object.freeze({
      rawSource: ["pty", "hook", "mcp", "adapter", "timer", "memory"].includes(String(cause.rawSource)) ? String(cause.rawSource) : "pty",
      rawId: cause.rawId ? String(cause.rawId) : undefined,
      parentIds: Array.isArray(cause.parentIds) ? Object.freeze(cause.parentIds.map(String)) : Object.freeze([]),
    })
  });
}

// Bridge from old SignalEvent to SoulSignalV2
export function bridgeSignalToV2(oldSignal) {
  if (!oldSignal || typeof oldSignal !== "object") return null;
  const kind = String(oldSignal.kind || "stdout.burst");
  const payload = oldSignal.payload && typeof oldSignal.payload === "object" ? oldSignal.payload : {};
  return createSoulSignalV2({
    id: oldSignal.id,
    ts: typeof oldSignal.ts === "string" ? Date.parse(oldSignal.ts) : Date.now(),
    kind: mapOldKindToV2(kind),
    phase: "idle",
    priority: oldSignal.priority,
    reliability: oldSignal.reliability,
    confidence: 0.7,
    ttlMs: oldSignal.ttlMs || 10000,
    payload: {
      text: payload.text,
      toolName: payload.toolName || payload.sourceTool,
      exitCode: payload.exitCode,
      errorKind: payload.errorKind,
      agentName: payload.agentName,
      modeName: payload.modeName || payload.mode,
    },
    cause: { rawSource: mapSourceToV2(oldSignal.source) }
  });
}

function mapOldKindToV2(kind) {
  const map = {
    "tool.failure": "tool.call.failure",
    "tool.progress": "tool.call.progress",
    "tool.complete": "tool.call.success",
    "tool.start": "tool.call.begin",
    "tool.end": "tool.call.success",
    "approval.pending": "tool.permission.request",
    "host.reasoning": "host.reasoning.begin",
    "host.stream.chunk": "stdout.burst",
    "host.lifecycle.start": "session.start",
    "host.lifecycle.stop": "session.end",
    "host.dormant": "session.end",
    "soul.config": "host.mode.switch",
    "soul.external": "stdout.burst",
  };
  return map[kind] || kind;
}

function mapSourceToV2(source) {
  const map = {
    "tool.output": "pty",
    "host.lifecycle": "adapter",
    "user.input": "pty",
    "telemetry": "adapter",
    "memory": "memory",
    "file.change": "adapter"
  };
  return map[source] || "pty";
}

export function deriveSignalVisual(signals, maxDisplay = 6) {
  const list = Array.isArray(signals) ? signals.slice(-maxDisplay) : [];
  return Object.freeze(list.map(s => Object.freeze({
    kind: String(s.kind || "?").replace(/^(host\.|tool\.|user\.|file\.|shell\.|test\.|build\.|git\.|web\.|mcp\.)/, ""),
    priority: s.priority || 0,
    icon: s.priority >= 5 ? "!" : s.priority >= 4 ? "▸" : s.priority >= 3 ? "·" : "◦",
    timeAgo: formatTimeAgo(s.ts),
    cause: s.affectHints?.risk > 0.5 ? "risk" : s.affectHints?.blockage > 0.3 ? "block" : s.affectHints?.progress > 0.3 ? "progress" : ""
  })));
}

function formatTimeAgo(ts) {
  const ms = Date.now() - (Number(ts) || Date.now());
  if (ms < 1000) return "now";
  if (ms < 60000) return `${Math.floor(ms / 1000)}s`;
  return `${Math.floor(ms / 60000)}m`;
}
