import { stat } from "node:fs/promises";
import { createTermvisEngine } from "../application/termvis-engine.js";
import { renderCard } from "../core/layout.js";
import { padCells, truncateCells } from "../core/width.js";
import { DEFAULT_LIFE_AVATAR_PATH } from "../life/frame.js";

export const DEFAULT_AVATAR_PATH = DEFAULT_LIFE_AVATAR_PATH;

const STATES = Object.freeze({
  idle: {
    label: "idle",
    message: "ready for a new command"
  },
  listening: {
    label: "listening",
    message: "waiting for your next instruction"
  },
  thinking: {
    label: "thinking",
    message: "working through the command"
  },
  success: {
    label: "success",
    message: "command completed"
  },
  error: {
    label: "error",
    message: "command needs attention"
  }
});

export function normalizePersonaState(state = "idle") {
  const key = String(state || "idle").toLowerCase();
  return STATES[key] ? key : "idle";
}

export async function renderPersonaFrame({
  engine,
  io = {},
  avatar = DEFAULT_AVATAR_PATH,
  title = "termvis persona",
  state = "idle",
  message,
  width,
  avatarWidth,
  avatarHeight,
  command,
  symbolic = true
} = {}) {
  const runtime = engine || await createTermvisEngine({ cwd: io.cwd, env: io.env });
  const caps = runtime.probeCapabilities({
    stdout: io.stdout,
    stdin: io.stdin,
    env: io.env
  });
  const viewportWidth = Math.max(32, Number(width || caps.cols || io.stdout?.columns || 80));
  const visualWidth = Math.max(18, Number(avatarWidth || Math.min(34, Math.floor(viewportWidth * 0.42))));
  const visualHeight = Math.max(6, Number(avatarHeight || 14));
  const stateKey = normalizePersonaState(state);
  const stateInfo = STATES[stateKey];
  const status = message || stateInfo.message;
  const avatarResult = await runtime.renderBlock({
    source: { type: "file", path: avatar },
    alt: `${title} avatar`,
    caps: {
      ...caps,
      pixelProtocol: symbolic ? "none" : caps.pixelProtocol,
      cols: visualWidth,
      rows: visualHeight
    }
  }, io);

  const body = [
    `state: ${stateInfo.label}`,
    `mood: ${status}`,
    command ? `host: ${command}` : "host: local terminal"
  ].join("\n");

  const header = renderCard({
    title: truncateCells(title, Math.max(12, viewportWidth - 4)),
    body,
    width: viewportWidth
  }).join("\n");
  const visual = normalizeVisualPayload(avatarResult.payload, viewportWidth);
  return `${header}\n${visual}\n`;
}

export async function validatePersonaAvatar(path) {
  await stat(path);
}

function normalizeVisualPayload(payload = "", width = 80) {
  const lines = String(payload || "").replace(/\s+$/u, "").split(/\r?\n/);
  if (lines.length === 1 && lines[0] === "") return "";
  return lines.map((line) => padCells(line, width)).join("\n");
}
