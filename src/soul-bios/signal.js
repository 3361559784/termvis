/**
 * Signal normalization bridge for Soul-bios ingress.
 */

import { randomUUID } from "node:crypto";
import { clamp, createSignalEvent } from "./types.js";

const SPINNER_RE = /\b⠋|⠙|⠹|⠸|⠼|⠴|⠦|⠧|⠇|⠏|spinner\b/i;

/** Kinds that already encode a failure outcome for exit-code merging. */
const HOST_FAILURE_KINDS = new Set([
  "test.fail",
  "build.failure",
  "shell.failure",
  "mcp.tool.failure",
  "tool.failure",
  "git.conflict"
]);

function clampInt(n, lo, hi) {
  return Math.round(clamp(Number(n), lo, hi));
}

/**
 * Classify PTY/host stream text into mood-rule signal kinds (ordered, specific before broad).
 *
 * @param {string} text
 * @param {string} sourceTool
 * @returns {Array<{ kind: string; priority: number; reliability: number }>}
 */
function collectHostClassifications(text, sourceTool) {
  const t = text != null ? String(text) : "";
  const st = sourceTool != null ? String(sourceTool) : "";
  /** @type {Array<{ kind: string; priority: number; reliability: number }>} */
  const out = [];
  const seen = new Set();

  function push(kind, priority, reliability) {
    if (seen.has(kind)) return;
    seen.add(kind);
    out.push({ kind, priority: clampInt(priority, 0, 5), reliability });
  }

  if (!t.trim()) {
    return out;
  }

  // Session
  if (/\b(session\s*(started|begun)|new\s+chat|conversation\s+started)\b/i.test(t)) {
    push("session.start", 5, 0.88);
  }
  if (/\b(session\s*(ended|closed)|goodbye|logging\s*out|exited?\s+session)\b/i.test(t)) {
    push("session.end", 4, 0.85);
  }
  if (/\b(resum(e|ing)|continu(e|ing)\s+session|session\s+resumed)\b/i.test(t)) {
    push("session.resume", 4, 0.85);
  }

  // User echoes / prompts in stream
  if (/^\s*>\s+\S/m.test(t) || /(?:^|\n)\s*>\s+\S/.test(t)) {
    push("user.submit", 4, 0.78);
  }
  if (/\^C|KeyboardInterrupt|SIGINT|interrupted\b|EINTR\b/i.test(t)) {
    push("user.interrupt", 4, 0.82);
  }
  if (/\b(actually|correction:|i\s+meant|instead\s*,)\b/i.test(t)) {
    push("user.correct", 4, 0.75);
  }
  if (/\b(wrong|incorrect|that'?s\s+not|fix\s+this|bad\s+idea)\b/i.test(t) || /(?:^|\n)\s*no\b[,!.]/i.test(t)) {
    push("user.critique", 4, 0.72);
  }
  if (/\b(thanks?|thank\s+you|good\s+job|nice\s+work|great\s+work)\b/i.test(t)) {
    push("user.praise", 4, 0.72);
  }

  // Agents
  if (/\b(launching\s+agent|subagent\s*(started|spawned)|spawning\s+sub-?agent)\b/i.test(t)) {
    push("agent.subagent.create", 4, 0.8);
  }
  if (/\b(agent\s+completed|subagent\s+(stopped|finished|done))\b/i.test(t)) {
    push("agent.subagent.stop", 3, 0.8);
  }

  // Git
  if (/\bmerge\s+conflict\b|CONFLICT\s*\(/i.test(t)) {
    push("git.conflict", 5, 0.9);
  }
  if (/\bgit\s+commit\b|\bcommitted\b.*\b(?:hash|files?)\b/i.test(t)) {
    push("git.commit", 3, 0.82);
  }
  if (/\bgit\s+diff\b|\bdiff\s+--git\b/i.test(t)) {
    push("git.diff", 2, 0.85);
  }

  // MCP
  if (
    (/\bmcp[\s._](?:tool|server)|Calling\s+MCP/i.test(t) || /\bmcp_tool\b/i.test(t)) &&
    /\b(fail|error|exception)\b/i.test(t)
  ) {
    push("mcp.tool.failure", 4, 0.88);
  } else if (
    (/\bmcp[\s._](?:tool|call)|Calling\s+MCP|\bmcp_tool\b/i.test(t)) &&
    /\b(success|succeeded|ok\b|done)\b/i.test(t)
  ) {
    push("mcp.tool.success", 3, 0.8);
  } else if (/\bmcp[\s._](?:tool|server|invoke)|\bmcp_tool\b|Calling\s+MCP/i.test(t)) {
    push("mcp.tool.begin", 3, 0.76);
  }

  // Shell destructive / risky
  if (/\brm\s+-\w*rf\b|\bdd\b\s+(if=|of=)|\bmkfs\b|\bchmod\s+[^\n]*\s-R\b|>\s*\/dev\/sd/i.test(t)) {
    push("shell.destructive", 5, 0.92);
  }

  // Tests
  const testCtx = /\bvitest\b|\bjest\b|\bmocha\b|\bpytest\b|\bTest\s+Suites?\b|\bTests?:\s*\d+|\btest\w*\.(?:js|ts|py)\b/i.test(t);
  if (testCtx || /^\s*(?:PASS|FAIL)\s+\S/m.test(t) || /(?:✓|✗)\s+\S/m.test(t)) {
    if (/\bFAIL\b|✗|failed\s+\d+\s+tests?|Tests?\s+failed|\bfailing\b/i.test(t)) {
      push("test.fail", 5, 0.9);
    } else if (/\bPASS\b|✓|passed\b|Tests?\s+passed|All\s+tests\s+passed/i.test(t)) {
      push("test.pass", 4, 0.88);
    } else {
      push("test.begin", 3, 0.78);
    }
  }

  // Build
  if (/\bwebpack\b|\bvite\b|\btsc\b|Compiled\s+(successfully|with)|build\s+(failed|error)/i.test(t)) {
    if (/\b(build\s+failed|compilation\s+error|failed\s+to\s+compile|ERROR\s+in)\b/i.test(t)) {
      push("build.failure", 5, 0.9);
    } else if (/\b(compiled\s+successfully|build\s+succeeded|webpack\s+compiled)\b/i.test(t)) {
      push("build.success", 3, 0.82);
    } else {
      push("build.begin", 3, 0.78);
    }
  }

  // File tool markers (AI CLI shapes)
  if (/\bRead\s*\(/i.test(t) || /\bread(ing)?\s+file/i.test(t)) {
    push("file.read", 2, 0.88);
  }
  if (/\bWrite\s*\(/i.test(t)) {
    push("file.write", 3, 0.88);
  }
  if (/\bEdit\s*\(/i.test(t)) {
    push("file.edit", 3, 0.88);
  }
  if (/\bPatch\s*\(/i.test(t) || /\bapply\s+patch\b/i.test(t)) {
    push("file.patch", 3, 0.86);
  }
  if (/\bGlob\s*\(/i.test(t)) {
    push("file.glob", 2, 0.86);
  }
  if (/\bGrep\s*\(|\brg\s+\(|ripgrep\b/i.test(t)) {
    push("file.grep", 2, 0.86);
  }
  if (/\bSearch\s*\(|\bcodebase_search\b/i.test(t)) {
    push("file.search", 2, 0.84);
  }

  // Web
  if (/\bweb\s+search\b|\bsearching(\s+the)?\s+web\b/i.test(t)) {
    push("web.search.begin", 2, 0.78);
  }
  if (/\bsearch\s+results\b|\bresults\s+from\s+(the\s+)?web\b/i.test(t)) {
    push("web.search.result", 3, 0.76);
  }
  if (/\bfetch(?:ing)?\b.*https?:\/\/|\bcurl\s+|wget\s+/i.test(t) || /\bweb\.fetch\b/i.test(t)) {
    push("web.fetch.begin", 2, 0.77);
  }

  // Reasoning / host output style
  if (/\bThinking\b|\bReasoning\b|\bPlanning\b|\bAnalyzing\b/i.test(t)) {
    push("host.reasoning.begin", 2, 0.8);
  }
  if (/\bPlan:|\bSteps:|\bI('|’)?ll\b|\bLet\s+me\b/i.test(t)) {
    push("host.output.plan", 3, 0.78);
  }
  if (/\bHere'?s\b|\bBelow\s+is\b|\bNote\s+that\b/i.test(t)) {
    push("host.output.natural", 2, 0.68);
  }
  if (
    /\b(Done|Complete|Finished)(?:[!.]|$|\s)/i.test(t) &&
    /\b(successfully|complete|✓|passed)\b/i.test(t)
  ) {
    push("host.output.final", 2, 0.72);
  }

  // Shell run markers
  const shellish =
    /\b(bash|zsh|sh)\s+(-c|\s*#)|\$[^\n]+\||(?:^|\n)\$\s+\S|Running:\s*\$|`\s*(?:npm|yarn|pnpm|cargo|make)\b/i.test(t) ||
    /\bshell\s+command\b|\brunning\s+(?:bash|shell|command)\b/i.test(t) ||
    /\b(run|execute|executing)\s+(?:command|shell|bash)\b/i.test(t) ||
    /\b(run|execute|executing)\s+(?:command|shell|bash)\b/i.test(st);
  if (shellish) {
    push("shell.begin", 3, 0.74);
  }
  if (
    shellish &&
    /\b(Done\s*!|Command\s+completed|exit\s+code\s*[0:\s]|exit\s+0\b|\bok\b|✓)/i.test(
      t
    ) &&
    !/\b(error|failed|exception|✗)\b/i.test(t)
  ) {
    push("shell.success", 2, 0.76);
  }
  if (shellish && /\b(error|failed|exception|✗|non-zero\s+exit)\b/i.test(t)) {
    push("shell.failure", 5, 0.88);
  }

  // Generic failure/success markers (after specific buckets)
  if (!seen.has("test.fail") && !seen.has("build.failure") && !seen.has("shell.failure")) {
    if (/\b(error|exception|✗|\bfatal\b)\b/i.test(t) || /\bfailed\b/i.test(t)) {
      push("tool.failure", 5, 0.9);
    }
  }

  return out;
}

/**
 * @param {string} text
 * @param {unknown} sourceTool
 * @returns {ReturnType<typeof createSignalEvent>[]}
 */
export function classifyHostOutput(text, sourceTool) {
  const t = text != null ? String(text) : "";
  const st = sourceTool != null ? String(sourceTool) : "";
  const ts = new Date().toISOString();
  const payload = Object.freeze({
    text: t,
    sourceTool: st || undefined
  });
  return collectHostClassifications(t, st).map(({ kind, priority, reliability }) =>
    createSignalEvent({
      source: "tool.output",
      kind,
      priority,
      reliability,
      ts,
      payload
    })
  );
}

/**
 * Classify raw user keyboard text into one or more user.* signal events.
 *
 * @param {string} text
 * @returns {ReturnType<typeof createSignalEvent>[]}
 */
export function classifyInputAsSignal(text) {
  const raw = text != null ? String(text) : "";
  const ts = new Date().toISOString();
  const payload = Object.freeze({ text: raw, isSubmit: true });
  /** @type {ReturnType<typeof createSignalEvent>[]} */
  const events = [];

  if (raw.trim()) {
    events.push(
      createSignalEvent({
        source: "user.input",
        kind: "user.submit",
        priority: 3,
        reliability: 0.85,
        ts,
        payload
      })
    );
  }
  if (/\b(actually|i\s+meant|correction)\b/i.test(raw)) {
    events.push(
      createSignalEvent({
        source: "user.input",
        kind: "user.correct",
        priority: 4,
        reliability: 0.78,
        ts,
        payload
      })
    );
  }
  if (/\b(thank|thanks|good|great|nice)\b/i.test(raw)) {
    events.push(
      createSignalEvent({
        source: "user.input",
        kind: "user.praise",
        priority: 4,
        reliability: 0.78,
        ts,
        payload
      })
    );
  }
  if (/\b(wrong|no\b|\bfix\b|\bcorrect\b)\b/i.test(raw)) {
    events.push(
      createSignalEvent({
        source: "user.input",
        kind: "user.critique",
        priority: 4,
        reliability: 0.78,
        ts,
        payload
      })
    );
  }

  return events;
}

/**
 * Single consolidated signal for bios ingest from user keyboard input.
 *
 * @param {string} text
 * @returns {ReturnType<typeof createSignalEvent>}
 */
export function classifyUserInput(text) {
  const raw = text != null ? String(text) : "";
  const ts = new Date().toISOString();
  if (!raw.trim()) {
    return createSignalEvent({
      source: "user.input",
      kind: "user.typing",
      priority: 2,
      reliability: 0.8,
      ts,
      payload: Object.freeze({ text: raw, isSubmit: false })
    });
  }
  let kind = "user.submit";
  let priority = 3;
  let reliability = 0.85;
  if (/\b(actually|i\s+meant|correction)\b/i.test(raw)) {
    kind = "user.correct";
    priority = 4;
    reliability = 0.82;
  } else if (/\b(wrong|no\b|\bfix\b|\bcorrect\b)\b/i.test(raw)) {
    kind = "user.critique";
    priority = 4;
    reliability = 0.82;
  } else if (/\b(thank|thanks|good|great|nice)\b/i.test(raw)) {
    kind = "user.praise";
    priority = 4;
    reliability = 0.82;
  }
  return createSignalEvent({
    source: "user.input",
    kind,
    priority,
    reliability,
    ts,
    payload: Object.freeze({ text: raw, isSubmit: true })
  });
}

/**
 * @param {{ text?: unknown; exitCode?: unknown; sourceTool?: unknown; ts?: Date|string }} raw
 * @returns {ReturnType<typeof createSignalEvent>[]}
 */
export function normalizeToolOutput(raw) {
  const text = raw.text != null ? String(raw.text) : "";
  const exitCode =
    typeof raw.exitCode === "number" ? raw.exitCode : Number.NaN;
  const ts = normalizeTs(raw.ts);
  const sourceToolStr =
    raw.sourceTool != null ? String(raw.sourceTool) : "";

  const classifications = collectHostClassifications(text, sourceToolStr);
  const basePayload = {
    text,
    exitCode: Number.isFinite(exitCode) ? exitCode : undefined,
    sourceTool: sourceToolStr || undefined
  };

  if (classifications.length > 0) {
    /** @type {ReturnType<typeof createSignalEvent>[]} */
    let events = classifications.map(({ kind, priority, reliability }) =>
      createSignalEvent({
        source: "tool.output",
        kind,
        priority: clampInt(priority, 0, 5),
        reliability,
        ts,
        payload: Object.freeze({ ...basePayload })
      })
    );

    if (
      Number.isFinite(exitCode) &&
      exitCode !== 0 &&
      !events.some((e) => HOST_FAILURE_KINDS.has(String(e.kind)))
    ) {
      events = [
        ...events,
        createSignalEvent({
          source: "tool.output",
          kind: "shell.failure",
          priority: 5,
          reliability: 0.88,
          ts,
          payload: Object.freeze({ ...basePayload })
        })
      ];
    }
    return events;
  }

  const isFailure =
    /error|failed|exception/i.test(text) ||
    (Number.isFinite(exitCode) && exitCode !== 0);
  if (isFailure) {
    return [
      createSignalEvent({
        source: "tool.output",
        kind: "tool.failure",
        priority: 5,
        reliability: 0.95,
        ts,
        payload: Object.freeze({ ...basePayload })
      })
    ];
  }
  return [
    createSignalEvent({
      source: "tool.output",
      kind: "tool.progress",
      priority: 2,
      reliability: 0.8,
      ts,
      payload: Object.freeze({ ...basePayload })
    })
  ];
}

/** @typedef {ReturnType<typeof createSignalEvent>} SignalEvent */

const LIFECYCLE_PRIORITY = /** @type {Record<string, number>} */ ({
  start: 5,
  "host.lifecycle.start": 5,
  "approval.pending": 5,
  "mode.change": 4,
  "tool.start": 3,
  "tool.end": 2,
  "output.complete": 3,
  "session.start": 5,
  stop: 2,
  "host.lifecycle.stop": 2,
  "host.lifecycle.exit": 2,
  exit: 2
});

/**
 * @param {{ event?: unknown; host?: unknown; ts?: Date|string }} raw
 * @returns {SignalEvent[]}
 */
export function normalizeHostLifecycle(raw) {
  const event = raw.event != null ? String(raw.event) : "";
  const pr = LIFECYCLE_PRIORITY[event] ?? 2;
  return [
    createSignalEvent({
      source: "host.lifecycle",
      kind: event || "host.lifecycle.unknown",
      priority: clampInt(pr, 0, 5),
      reliability: 0.9,
      ts: normalizeTs(raw.ts),
      payload: Object.freeze({
        event,
        host: raw.host != null ? String(raw.host) : undefined
      })
    })
  ];
}

/**
 * @param {{ text?: unknown; ts?: Date|string; isSubmit?: unknown }} raw
 * @returns {SignalEvent[]}
 */
export function normalizeUserInput(raw) {
  const isSubmit = Boolean(raw.isSubmit);
  return [
    createSignalEvent({
      source: "user.input",
      kind: isSubmit ? "user.submit" : "user.typing",
      priority: isSubmit ? 5 : 2,
      reliability: 0.85,
      ts: normalizeTs(raw.ts),
      payload: Object.freeze({
        text: raw.text != null ? String(raw.text) : "",
        isSubmit
      })
    })
  ];
}

/**
 * Bridge `inferLifeEventFromChunk` life-event objects into bios signals.
 *
 * @param {{ type?: string; state?: string; message?: string; output?: string; at?: Date }} lifeEvent
 * @returns {SignalEvent[]}
 */
export function bridgeLifeEventToSignals(lifeEvent) {
  const type = lifeEvent?.type ? String(lifeEvent.type) : "host-output";
  const ts = normalizeTs(lifeEvent?.at);
  /** @type {SignalEvent[]} */
  const out = [];

  /** @type {Record<string, { kind: string; priority: number; source: "user.input"|"host.lifecycle"|"tool.output"|"file.change"|"telemetry"|"memory"; reliability?: number }>} */
  const table = {
    "permission-request": {
      kind: "approval.pending",
      priority: 5,
      source: "host.lifecycle",
      reliability: 0.92
    },
    "tool-call": {
      kind: "tool.progress",
      priority: 3,
      source: "tool.output",
      reliability: 0.75
    },
    reasoning: {
      kind: "host.reasoning",
      priority: 4,
      source: "telemetry",
      reliability: 0.7
    },
    success: {
      kind: "tool.complete",
      priority: 2,
      source: "tool.output",
      reliability: 0.75
    },
    error: {
      kind: "tool.failure",
      priority: 5,
      source: "tool.output",
      reliability: 0.93
    },
    "dormant-trigger": {
      kind: "host.dormant",
      priority: 2,
      source: "host.lifecycle",
      reliability: 0.8
    },
    "reflection-tick": {
      kind: "host.reflecting",
      priority: 2,
      source: "telemetry",
      reliability: 0.65
    },
    "host-output": {
      kind: "host.stream.chunk",
      priority: 1,
      source: "telemetry",
      reliability: 0.55
    }
  };

  const defaultRow = {
    kind: `life.bridge.${type}`,
    priority: 2,
    source: /** @type {const} */ ("telemetry"),
    reliability: 0.6
  };
  const row = table[type] ?? defaultRow;

  out.push(
    createSignalEvent({
      source: row.source,
      kind: row.kind,
      priority: row.priority,
      reliability: row.reliability ?? 0.75,
      ts,
      payload: Object.freeze({
        lifeEventType: type,
        lifeState:
          lifeEvent?.state != null ? String(lifeEvent.state) : undefined,
        message:
          lifeEvent?.message != null ? String(lifeEvent.message) : undefined,
        output:
          lifeEvent?.output != null ? String(lifeEvent.output).slice(0, 8192) : ""
      })
    })
  );

  return out;
}

/**
 * TTL merge / debounce.
 *
 * @param {SignalEvent[]} events
 * @param {{ now?: number; mergeLowPriorityCeiling?: number; spinnerDebounceWindowMs?: number }} [options]
 * @returns {SignalEvent[]}
 */
export function denoiseSignals(events, options = {}) {
  const now = options.now ?? Date.now();
  const ceiling = Number.isFinite(options.mergeLowPriorityCeiling)
    ? /** @type {number} */ (options.mergeLowPriorityCeiling)
    : 3;
  const spinnerWindow =
    typeof options.spinnerDebounceWindowMs === "number"
      ? Math.max(0, options.spinnerDebounceWindowMs)
      : 400;

  const fresh = [];
  for (const e of events) {
    if (!isFresh(e, now)) continue;
    fresh.push(e);
  }

  fresh.sort(signalSort);

  const merged = collapseLowPriorityChains(fresh, ceiling);
  const debounced = debounceSpinnerProgress(merged, spinnerWindow);

  return debounced;
}

function signalSort(a, b) {
  const ta =
    typeof a.ts === "string" ? Date.parse(a.ts) : Number.NaN;
  const tb =
    typeof b.ts === "string" ? Date.parse(b.ts) : Number.NaN;
  if (Number.isFinite(ta) && Number.isFinite(tb) && ta !== tb) return ta - tb;
  return String(a.id).localeCompare(String(b.id));
}

/**
 * @param {SignalEvent} e
 * @param {number} nowMs
 */
function isFresh(e, nowMs) {
  if (e.ttlMs == null) return true;
  const t =
    typeof e.ts === "string"
      ? Date.parse(e.ts)
      : typeof e.ts === "number"
        ? e.ts
        : Number.NaN;
  if (!Number.isFinite(t)) return true;
  return t + Number(e.ttlMs) >= nowMs;
}

/**
 * Merge consecutive identical low-priority kinds (keep last merged meta).
 *
 * @param {SignalEvent[]} sorted
 */
function collapseLowPriorityChains(sorted, ceiling) {
  /** @type {SignalEvent[]} */
  const out = [];
  /** @type {SignalEvent[]} */
  let run = [];

  function flushRun() {
    if (run.length === 0) return;
    if (run.length === 1) {
      out.push(run[0]);
    } else {
      const merged = fuseRun(run);
      out.push(merged);
    }
    run = [];
  }

  for (const ev of sorted) {
    const last = run[run.length - 1];
    if (
      run.length &&
      ev.kind === last.kind &&
      ev.priority <= ceiling &&
      last.priority <= ceiling
    ) {
      run.push(ev);
      continue;
    }
    flushRun();
    run = [ev];
  }
  flushRun();
  return out;
}

/**
 * @param {SignalEvent[]} run
 */
function fuseRun(run) {
  const last = run[run.length - 1];
  /** @type {Record<string, unknown>} */
  const payload = {};
  for (let i = run.length - 1; i >= 0; i--) {
    const p = /** @type {Record<string, unknown>} */ (
      typeof run[i].payload === "object" ? run[i].payload ?? {} : {}
    );
    Object.assign(payload, p);
  }
  const ids = Object.freeze(run.map((r) => r.id));

  const reliability =
    run.reduce((a, x) => a + clamp(x.reliability, 0, 1), 0) /
    Math.max(run.length, 1);

  return createSignalEvent({
    id: randomUUID(),
    schemaVersion: last.schemaVersion,
    ts: last.ts,
    source: last.source,
    kind: last.kind,
    priority: clampInt(last.priority, 0, 5),
    reliability: clamp(reliability, 0, 1),
    ...(last.ttlMs != null ? { ttlMs: last.ttlMs } : {}),
    payload: Object.freeze({
      ...payload,
      mergedFrom: ids.length,
      mergedSignalIds: ids
    })
  });
}

/**
 * Dedupe bursts of spinner-style tool.progress lines within a short window (keep newest).
 *
 * @param {SignalEvent[]} merged
 */
function debounceSpinnerProgress(merged, windowMs) {
  /** @type {SignalEvent[]} */
  const out = [];
  function tsMs(ts) {
    return typeof ts === "string" ? Date.parse(ts) : Number.NaN;
  }
  for (const ev of merged) {
    const txt = payloadText(ev);
    const tc = tsMs(ev.ts);
    const prev = out[out.length - 1];
    const tp = prev ? tsMs(prev.ts) : Number.NaN;
    const pt = prev ? payloadText(prev) : "";
    if (
      prev &&
      ev.kind === "tool.progress" &&
      prev.kind === "tool.progress" &&
      SPINNER_RE.test(txt) &&
      txt.length < 200 &&
      txt === pt &&
      Number.isFinite(tc) &&
      Number.isFinite(tp) &&
      tc - tp <= windowMs
    ) {
      out[out.length - 1] = ev;
      continue;
    }
    out.push(ev);
  }
  return out;
}

/** @param {SignalEvent} e */
function payloadText(e) {
  const p =
    typeof e.payload === "object" && e.payload
      ? /** @type {Record<string, unknown>} */ (e.payload)
      : {};
  return p.text != null ? String(p.text) : "";
}

/** @param {unknown} ts */
function normalizeTs(ts) {
  return ts instanceof Date ? ts.toISOString() : new Date(ts ?? Date.now()).toISOString();
}
