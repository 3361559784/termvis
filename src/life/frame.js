import { fileURLToPath } from "node:url";
import { createTermvisEngine } from "../application/termvis-engine.js";
import { cellWidth, padCells, stripAnsi, truncateCells, wrapCells } from "../core/width.js";
import { createLifeSnapshot, getLifePulse, getLifeStateInfo } from "./state.js";
import { createMoodFrame, createSoulState, formatSoulMoodLabel, getExpression, getSoulPulse } from "./soul.js";

function hostMoodframeForLifeFrame(stateLabel) {
  const discrete =
    ({
      reasoning: "focused",
      waiting: "guarded",
      failed: "tired",
      acting: "curious",
      observing: "calm",
      awakening: "calm",
      listening: "calm"
    })[stateLabel || "listening"] || "calm";
  return createMoodFrame({ discrete });
}

export const DEFAULT_LIFE_AVATAR_PATH = fileURLToPath(new URL("../../examples/avatar-soft.svg", import.meta.url));

export async function renderLifeFrame({
  engine,
  io = {},
  snapshot,
  avatar = DEFAULT_LIFE_AVATAR_PATH,
  width,
  avatarWidth,
  avatarHeight,
  symbolic = true,
  strict = false
} = {}) {
  const runtime = engine || await createTermvisEngine({ cwd: io.cwd, env: io.env });
  const life = snapshot || createLifeSnapshot({ avatar });
  const caps = runtime.probeCapabilities({
    stdout: io.stdout,
    stdin: io.stdin,
    env: io.env
  });
  const viewportWidth = Math.max(60, Number(width || caps.cols || io.stdout?.columns || 80));
  const visualWidth = Math.max(18, Number(avatarWidth || Math.min(30, Math.floor(viewportWidth * 0.34))));
  const visualHeight = Math.max(6, Number(avatarHeight || 12));
  const infoWidth = Math.max(24, viewportWidth - visualWidth - 7);
  const stateInfo = getLifeStateInfo(life.state);
  const pulse = getLifePulse(life);
  const soul = life.soul || createSoulState({ enabled: false });
  const soulPulse = getSoulPulse(soul);

  const avatarResult = await runtime.renderBlock({
    source: { type: "file", path: life.avatar || avatar },
    alt: `${life.title} avatar`,
    caps: {
      ...caps,
      pixelProtocol: symbolic ? "none" : caps.pixelProtocol,
      cols: visualWidth,
      rows: visualHeight
    },
    strict
  }, io);

  const visual = normalizeVisualPayload(avatarResult.payload, visualWidth, visualHeight);
  const info = soul.enabled ? [
    `soul  ${soul.persona.name}`,
    `mood  ${formatSoulMoodLabel(soul.mood)}`,
    `expr  ${stripAnsi(getExpression(soul.mood))}`,
    `pulse ${soulPulse.bpm} bpm ${soulPulse.wave}`,
    `presence ${soul.presence}`,
    `host  ${life.host}`,
    `state ${stateInfo.label}`,
    `signal ${life.lastSignal}  events ${life.events}`,
    ...wrapLabel("says", soul.reply || soul.narration, infoWidth),
    life.lastDigest ? `digest ${life.lastDigest}  bytes ${life.outputBytes}` : `bytes ${life.outputBytes}`
  ] : [
    `host  ${life.host}`,
    `state ${stateInfo.label}`,
    `expr  ${stripAnsi(getExpression(hostMoodframeForLifeFrame(life.state)))}`,
    `heart ${pulse.bpm} bpm ${pulse.wave}`,
    `signal ${life.lastSignal}  events ${life.events}`,
    ...wrapLabel("voice", life.message, infoWidth),
    life.lastDigest ? `digest ${life.lastDigest}  bytes ${life.outputBytes}` : `bytes ${life.outputBytes}`
  ];

  return renderSideFrame({
    title: life.title,
    visual,
    info,
    width: viewportWidth,
    visualWidth,
    infoWidth
  });
}

export function renderLifeStatusLine(snapshot, width = 80) {
  const stateInfo = getLifeStateInfo(snapshot.state);
  const pulse = getLifePulse(snapshot);
  const line = [
    `termvis`,
    snapshot.host,
    stateInfo.label,
    `${pulse.bpm}bpm`,
    pulse.wave,
    snapshot.message
  ].join(" | ");
  return truncateCells(line, Math.max(20, width));
}

export function terminalTitle(snapshot) {
  const stateInfo = getLifeStateInfo(snapshot.state);
  return `${snapshot.host} :: ${stateInfo.label} :: ${snapshot.message}`;
}

function renderSideFrame({ title, visual, info, width, visualWidth, infoWidth }) {
  const innerHeight = Math.max(visual.length, info.length, 6);
  const lines = [
    topBorder(title, width)
  ];
  for (let index = 0; index < innerHeight; index += 1) {
    const left = padCells(truncateCells(visual[index] || "", visualWidth), visualWidth);
    const right = padCells(truncateCells(info[index] || "", infoWidth), infoWidth);
    lines.push(`│ ${left} │ ${right} │`);
  }
  lines.push(bottomBorder("life frame", width));
  return `${lines.map((line) => padCells(truncateCells(line, width), width)).join("\n")}\n`;
}

function normalizeVisualPayload(payload = "", width = 80, height = 12) {
  const lines = String(payload || "").replace(/\s+$/u, "").split(/\r?\n/);
  if (lines.length === 1 && lines[0] === "") return [];
  const out = lines.slice(0, height).map((line) => padCells(truncateCells(line, width), width));
  while (out.length < height) out.push(padCells("", width));
  return out;
}

function wrapLabel(label, value, width) {
  const prefix = `${label} `;
  const usable = Math.max(8, width - cellWidth(prefix));
  const wrapped = wrapCells(value || "", usable).map((line) => line.trimEnd());
  if (wrapped.length === 0) return [prefix.trimEnd()];
  return wrapped.map((line, index) => index === 0 ? `${prefix}${line.trimEnd()}` : `${" ".repeat(cellWidth(prefix))}${line.trimEnd()}`);
}

function topBorder(title, width) {
  const label = ` ${truncateCells(stripAnsi(title), Math.max(8, width - 6))} `;
  return `╭${label}${"─".repeat(Math.max(0, width - 2 - cellWidth(label)))}╮`;
}

function bottomBorder(label, width) {
  const text = ` ${label} `;
  return `╰${text}${"─".repeat(Math.max(0, width - 2 - cellWidth(text)))}╯`;
}
