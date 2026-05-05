import { fileURLToPath } from "node:url";
import { createTermvisEngine } from "../application/termvis-engine.js";
import { renderCard } from "../core/layout.js";
import { cellWidth, padCells, stripAnsi, truncateCells, wrapCells } from "../core/width.js";
import { createLifeSnapshot, getLifePulse, getLifeStateInfo } from "./state.js";
import { createMoodFrame, createSoulState, formatSoulMoodLabel, getExpression, getSoulPulse } from "./soul.js";
import { style, resolveTheme } from "../core/theme.js";

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
  title,
  host,
  state,
  width,
  avatarWidth,
  avatarHeight,
  symbolic = true,
  strict = false
} = {}) {
  const runtime = engine || await createTermvisEngine({ cwd: io.cwd, env: io.env });
  const preferredAvatar = (avatar === DEFAULT_LIFE_AVATAR_PATH && runtime.config?.life?.avatar)
    ? runtime.config.life.avatar
    : avatar;

  const life = snapshot || createLifeSnapshot({ avatar: preferredAvatar, title, host, state });
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
  const soul = life.soul || createSoulState({
    enabled: runtime.config?.life?.soul?.enabled ?? false,
    mode: runtime.config?.life?.soul?.mode,
    mood: runtime.config?.life?.soul?.mood,
    presence: runtime.config?.life?.soul?.presence,
    narration: runtime.config?.life?.soul?.narration,
    reply: runtime.config?.life?.soul?.reply,
    persona: runtime.config?.life?.soul?.persona
  });
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

  const visual = avatarResult.mode === "plain" && looksLikeVisualMarker(avatarResult.payload)
    ? renderFallbackVisual(avatarResult, visualWidth, visualHeight)
    : normalizeVisualPayload(avatarResult.payload, visualWidth, visualHeight);
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
    infoWidth,
    theme: resolveTheme(runtime.config, caps),
    caps
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

function renderSideFrame({ title, visual, info, width, visualWidth, infoWidth, theme, caps }) {
  const innerHeight = Math.max(visual.length, info.length, 6);
  const borderColor = theme?.colors?.border || "#334155";
  const pipe = style("│", { fg: borderColor });
  
  const lines = [
    topBorder(title, width, theme, caps)
  ];
  for (let index = 0; index < innerHeight; index += 1) {
    const left = padCells(truncateCells(visual[index] || "", visualWidth), visualWidth);
    const right = padCells(truncateCells(info[index] || "", infoWidth), infoWidth);
    lines.push(`${pipe} ${left} ${pipe} ${right} ${pipe}`);
  }
  lines.push(bottomBorder("life frame", width, theme, caps));
  return `${lines.map((line) => padCells(truncateCells(line, width), width)).join("\n")}\n`;
}

function normalizeVisualPayload(payload = "", width = 80, height = 12) {
  const lines = String(payload || "").replace(/\s+$/u, "").split(/\r?\n/);
  if (lines.length === 1 && lines[0] === "") return [];
  const out = lines.slice(0, height).map((line) => padCells(truncateCells(line, width), width));
  while (out.length < height) out.push(padCells("", width));
  return out;
}

function renderFallbackVisual(result, width, height) {
  const fallback = parseVisualMarker(String(result?.payload || ""));
  const title = truncateCells(stripAnsi(fallback?.title || result?.altText || "Visual preview"), Math.max(8, width - 4));
  const shortSource = fallback?.source ? fallback.source.split(/[\\/]/u).pop() || fallback.source : "";
  const body = [
    shortSource ? `src: ${shortSource}` : "",
    fallback?.reason ? fallback.reason : ""
  ].filter(Boolean).join("\n") || "preview unavailable";
  return normalizeVisualPayload(renderCard({ title, body, width }).join("\n"), width, height);
}

function looksLikeVisualMarker(payload) {
  return /^\[visual:\s*.+\]$/u.test(String(payload || "").trim());
}

function parseVisualMarker(payload) {
  const text = String(payload || "").trim();
  if (!text.startsWith("[visual:") || !text.endsWith("]")) return null;
  const inner = text.slice(8, -1).trim();
  const [head, ...reasonParts] = inner.split(/;\s*/u);
  const reason = reasonParts.join("; ").trim();
  const sourceMatch = head.match(/^(.*)\s+\((.+)\)$/u);
  if (sourceMatch) {
    return {
      title: sourceMatch[1].trim(),
      source: sourceMatch[2].trim(),
      reason
    };
  }
  return {
    title: head.trim(),
    source: "",
    reason
  };
}

function wrapLabel(label, value, width) {
  const prefix = `${label} `;
  const usable = Math.max(8, width - cellWidth(prefix));
  const wrapped = wrapCells(value || "", usable).map((line) => line.trimEnd());
  if (wrapped.length === 0) return [prefix.trimEnd()];
  return wrapped.map((line, index) => index === 0 ? `${prefix}${line.trimEnd()}` : `${" ".repeat(cellWidth(prefix))}${line.trimEnd()}`);
}

function topBorder(title, width, theme, caps) {
  const label = ` ${truncateCells(stripAnsi(title), Math.max(8, width - 6))} `;
  const borderStr = `╭${label}${"─".repeat(Math.max(0, width - 2 - cellWidth(label)))}╮`;
  const borderColor = theme?.colors?.border || "#334155";
  
  if (caps?.noColor) return borderStr;
  
  const parts = [
    style("╭", { fg: borderColor }),
    style(label, { fg: theme?.colors?.primary || "#A78BFA", isBold: true }),
    style("─".repeat(Math.max(0, width - 2 - cellWidth(label))), { fg: borderColor }),
    style("╮", { fg: borderColor })
  ];
  return parts.join("");
}

function bottomBorder(label, width, theme, caps) {
  const text = ` ${label} `;
  const borderStr = `╰${text}${"─".repeat(Math.max(0, width - 2 - cellWidth(text)))}╯`;
  const borderColor = theme?.colors?.border || "#334155";
  
  if (caps?.noColor) return borderStr;
  
  const parts = [
    style("╰", { fg: borderColor }),
    style(text, { fg: theme?.colors?.muted || "#6B7280" }),
    style("─".repeat(Math.max(0, width - 2 - cellWidth(text))), { fg: borderColor }),
    style("╯", { fg: borderColor })
  ];
  return parts.join("");
}
