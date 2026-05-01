/**
 * Hybrid signal annotator.
 *
 * Pipeline:
 *   1. Run the deterministic `normalizeToolOutput` rule path.
 *   2. If the rule path classified the chunk as `tool.progress` and the
 *      caller opts in, ask the LLM to refine kind/priority/reliability.
 *   3. Cache annotations by SHA-256(text) so the same chunk is not
 *      re-classified on every tick.
 */

import { createHash } from "node:crypto";
import { normalizeToolOutput } from "../soul-bios/signal.js";
import { createSignalEvent } from "../soul-bios/types.js";

/** @typedef {ReturnType<typeof createSignalEvent>} SignalEvent */

export const ANNOTATION_SCHEMA = Object.freeze({
  type: "object",
  additionalProperties: false,
  required: ["kind", "priority", "reliability"],
  properties: {
    kind: { type: "string", maxLength: 64 },
    priority: { type: "integer", minimum: 0, maximum: 5 },
    reliability: { type: "number", minimum: 0, maximum: 1 },
    rationale: { type: "string", maxLength: 200 }
  }
});

/** Kinds that the rule path is allowed to emit. */
export const KNOWN_KINDS = Object.freeze(
  new Set([
    "tool.failure",
    "tool.progress",
    "tool.complete",
    "user.praise",
    "user.submit",
    "user.typing",
    "approval.pending",
    "session.start",
    "host.reasoning",
    "file.change",
    "host.dormant",
    "host.reflecting"
  ])
);

/**
 * Hybrid annotation entry point.
 *
 * @param {{
 *   llm: object|null,
 *   raw: { text?: unknown, exitCode?: unknown, sourceTool?: unknown, ts?: Date|string },
 *   useLlmAnnotation?: boolean,
 *   cache?: Map<string, { kind: string, priority: number, reliability: number }>
 * }} args
 * @returns {Promise<SignalEvent[]>}
 */
export async function annotateToolOutput({ llm, raw, useLlmAnnotation = false, cache }) {
  const baseEvents = normalizeToolOutput(raw || {});
  if (baseEvents.length === 0) return baseEvents;

  if (
    !useLlmAnnotation ||
    !llm ||
    typeof llm.complete !== "function" ||
    llm.available === false
  ) {
    return baseEvents;
  }

  const first = baseEvents[0];
  if (first.kind !== "tool.progress") return baseEvents;

  const text = String(raw && raw.text != null ? raw.text : "").slice(0, 4096);
  if (!text) return baseEvents;

  const hash = createHash("sha256").update(text).digest("hex");
  const cached = cache instanceof Map ? cache.get(hash) : undefined;
  if (cached) {
    return [rewriteKind(first, cached)];
  }

  let annotation;
  try {
    const result = await llm.complete({
      system:
        "Classify a CLI tool output chunk. Return ONLY structured JSON with " +
        "kind (e.g. tool.failure, tool.progress, tool.complete, file.change), " +
        "priority 0-5 (5 = must surface immediately), reliability 0-1 (rule of thumb: " +
        "exact errors >= 0.9, ambiguous progress 0.4-0.6).",
      messages: [
        {
          role: "user",
          content: `text=${JSON.stringify(text)}\nexitCode=${
            raw && raw.exitCode != null ? String(raw.exitCode) : "null"
          }\nsourceTool=${raw && raw.sourceTool != null ? String(raw.sourceTool) : "null"}`
        }
      ],
      schema: ANNOTATION_SCHEMA,
      schemaName: "SignalAnnotation",
      temperature: 0,
      maxTokens: 160
    });
    if (!result || typeof result.data !== "object" || result.data === null) {
      return baseEvents;
    }
    annotation = {
      kind: typeof result.data.kind === "string" ? result.data.kind : first.kind,
      priority:
        Number.isFinite(Number(result.data.priority))
          ? clampInt(Number(result.data.priority), 0, 5)
          : first.priority,
      reliability:
        Number.isFinite(Number(result.data.reliability))
          ? clamp01(Number(result.data.reliability))
          : first.reliability
    };
  } catch {
    return baseEvents;
  }

  if (cache instanceof Map) cache.set(hash, annotation);
  return [rewriteKind(first, annotation), ...baseEvents.slice(1)];
}

/**
 * @param {SignalEvent} event
 * @param {{ kind: string, priority: number, reliability: number }} annotation
 */
function rewriteKind(event, annotation) {
  return createSignalEvent({
    id: event.id,
    schemaVersion: event.schemaVersion,
    ts: event.ts,
    source: event.source,
    kind: annotation.kind || event.kind,
    priority: clampInt(Number(annotation.priority ?? event.priority), 0, 5),
    reliability: clamp01(Number(annotation.reliability ?? event.reliability)),
    ...(event.ttlMs != null ? { ttlMs: event.ttlMs } : {}),
    payload: event.payload
  });
}

/** @param {number} n */
function clamp01(n) {
  if (!Number.isFinite(n)) return 0;
  return Math.min(1, Math.max(0, n));
}

/**
 * @param {number} n
 * @param {number} lo
 * @param {number} hi
 */
function clampInt(n, lo, hi) {
  if (!Number.isFinite(n)) return lo;
  return Math.max(lo, Math.min(hi, Math.round(n)));
}
