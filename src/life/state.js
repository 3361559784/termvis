import { createHash } from "node:crypto";

export const LIFE_STATES = Object.freeze({
  awakening: {
    label: "awakening",
    voice: "bootstrapping the terminal presence",
    pulse: "▁▃▅▇",
    bpm: 76
  },
  listening: {
    label: "listening",
    voice: "waiting for the next intent",
    pulse: "▂▂▃▂",
    bpm: 62
  },
  reasoning: {
    label: "reasoning",
    voice: "holding context and planning",
    pulse: "▂▄▆▄",
    bpm: 72
  },
  acting: {
    label: "acting",
    voice: "touching tools and files",
    pulse: "▃▅█▅",
    bpm: 92
  },
  observing: {
    label: "observing",
    voice: "watching the host stream",
    pulse: "▁▂▃▂",
    bpm: 66
  },
  waiting: {
    label: "waiting",
    voice: "asking for human attention",
    pulse: "▅▃▂▃",
    bpm: 84
  },
  succeeded: {
    label: "succeeded",
    voice: "the loop closed cleanly",
    pulse: "▃▆█▆",
    bpm: 58
  },
  failed: {
    label: "failed",
    voice: "the host reported a failure",
    pulse: "█▅▂▅",
    bpm: 112
  },
  dormant: {
    label: "dormant",
    voice: "resting quietly while the shell sleeps",
    pulse: "▁▁▁▁",
    bpm: 48
  },
  reflecting: {
    label: "reflecting",
    voice: "noting rhythms in the idle stream",
    pulse: "▂▃▂▃",
    bpm: 54
  }
});

const SIGNALS = [
  {
    type: "permission-request",
    state: "waiting",
    pattern: /\b(allow|approve|permission|continue\?|proceed\?|do you want|确认|批准|允许)\b/i,
    message: "human permission requested"
  },
  {
    type: "tool-call",
    state: "acting",
    pattern: /\b(running|executing|tool|bash|shell|edit|write|patch|npm|pnpm|git|cargo|pytest|test)\b/i,
    message: "host is invoking tools"
  },
  {
    type: "reasoning",
    state: "reasoning",
    pattern: /\b(thinking|reasoning|planning|analyzing|research|plan|思考|分析|计划|调研)\b/i,
    message: "host is shaping intent"
  },
  {
    type: "success",
    state: "succeeded",
    pattern: /\b(done|success|passed|complete|completed|通过|完成|成功)\b/i,
    message: "positive completion signal"
  },
  {
    type: "error",
    state: "failed",
    pattern: /\b(error|failed|exception|traceback|denied|fatal|失败|错误|拒绝)\b/i,
    message: "failure signal detected"
  },
  {
    type: "dormant-trigger",
    state: "dormant",
    pattern: /\b(dormant|hibernating|deep sleep|standby\s+mode|系统休眠)\b/i,
    message: "host entered a dormant stance"
  },
  {
    type: "reflection-tick",
    state: "reflecting",
    pattern: /\b(idle\s+reflection|quiet\s+reflection|reflecting\b.*\bidle\b|paused\s*&\s*thinking)\b/i,
    message: "idle cue for reflective pacing"
  }
];

export function normalizeLifeState(state = "listening") {
  const key = String(state || "listening").toLowerCase();
  return LIFE_STATES[key] ? key : "listening";
}

export function createLifeSnapshot({
  title = "termvis living shell",
  host = "terminal",
  state = "awakening",
  message,
  avatar,
  startedAt = new Date()
} = {}) {
  const stateKey = normalizeLifeState(state);
  return {
    title,
    host,
    avatar,
    state: stateKey,
    message: message || LIFE_STATES[stateKey].voice,
    heartbeat: 0,
    heartBpm: LIFE_STATES[stateKey].bpm,
    events: 0,
    outputBytes: 0,
    lastSignal: "boot",
    lastDigest: "",
    startedAt: toIso(startedAt),
    updatedAt: toIso(startedAt)
  };
}

export function applyLifeEvent(snapshot, event = {}) {
  const nextState = normalizeLifeState(event.state || snapshot.state);
  const output = event.output ? String(event.output) : "";
  const bytes = Buffer.byteLength(output);
  return {
    ...snapshot,
    state: nextState,
    message: event.message || LIFE_STATES[nextState].voice,
    heartbeat: snapshot.heartbeat || 0,
    heartBpm: LIFE_STATES[nextState].bpm,
    events: snapshot.events + 1,
    outputBytes: snapshot.outputBytes + bytes,
    lastSignal: event.type || snapshot.lastSignal,
    lastDigest: output ? digestOutput(output) : snapshot.lastDigest,
    updatedAt: toIso(event.at || new Date())
  };
}

export function inferLifeEventFromChunk(chunk, at = new Date()) {
  const output = String(chunk || "");
  for (const signal of SIGNALS) {
    if (signal.pattern.test(output)) {
      return {
        type: signal.type,
        state: signal.state,
        message: signal.message,
        output,
        at
      };
    }
  }
  return {
    type: "host-output",
    state: "observing",
    message: "host stream changed",
    output,
    at
  };
}

export function serializeLifeEvent(snapshot, event) {
  const record = {
    at: toIso(event.at || new Date()),
    type: event.type,
    state: snapshot.state,
    heartBpm: snapshot.heartBpm || getLifeStateInfo(snapshot.state).bpm,
    events: snapshot.events,
    message: snapshot.message,
    digest: snapshot.lastDigest,
    outputBytes: snapshot.outputBytes
  };
  if (event.diagnostic && typeof event.diagnostic === "object") record.diagnostic = event.diagnostic;
  if (event.error) record.error = String(event.error).slice(0, 240);
  return JSON.stringify(record);
}

export function getLifeStateInfo(state) {
  return LIFE_STATES[normalizeLifeState(state)];
}

export function getLifePulse(snapshot = {}, at = new Date()) {
  const stateInfo = getLifeStateInfo(snapshot.state);
  const bpm = snapshot.heartBpm || stateInfo.bpm;
  const started = new Date(snapshot.startedAt || Date.now()).getTime();
  const now = at instanceof Date ? at.getTime() : new Date(at).getTime();
  const elapsedMs = Math.max(0, now - started);
  const beatMs = 60000 / bpm;
  const beat = Math.floor(elapsedMs / beatMs);
  return {
    bpm,
    beat,
    wave: rotatePulse(stateInfo.pulse, beat)
  };
}

function digestOutput(output) {
  return createHash("sha256").update(String(output)).digest("hex").slice(0, 12);
}

function rotatePulse(pulse, beat) {
  const chars = Array.from(pulse || "▁▃▅▇");
  if (chars.length === 0) return "";
  const offset = beat % chars.length;
  return [...chars.slice(offset), ...chars.slice(0, offset)].join("");
}

function toIso(value) {
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}
