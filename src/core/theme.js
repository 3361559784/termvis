export const SEMANTIC_TOKEN_ROLES = Object.freeze([
  "soulIdle",
  "soulThinking",
  "soulSpeaking",
  "soulGuarded",
  "heartbeat",
  "breathGlow"
]);

const ROLE_TO_PLATFORM = {
  text: "fg",
  background: "bg",
  primary: "accent",
  accent: "pulse",
  muted: "muted",
  border: "border",
  success: "success",
  warning: "warn",
  error: "error",
  selection: "selection",
  heartbeat: "heartbeat",
  breathGlow: "breathGlow",
  guarded: "guarded",
  soulIdle: "soulIdle",
  soulThinking: "soulThinking",
  soulSpeaking: "soulSpeaking",
  soulGuarded: "soulGuarded"
};

const MONO_CODES = Object.freeze({
  normal: "",
  bold: "\u001b[1m",
  underline: "\u001b[4m",
  reverse: "\u001b[7m",
  dim: "\u001b[2m",
  dotted: "\u001b[2m"
});

function semanticFromPalette({ fg, accent, pulse, warn, muted }) {
  return {
    soulIdle: fg,
    soulThinking: muted,
    soulSpeaking: accent,
    soulGuarded: warn,
    heartbeat: pulse,
    breathGlow: accent
  };
}

function buildPlatformKeys(truecolor, color256Indices, monoByRole) {
  const keys = [
    "bg",
    "fg",
    "accent",
    "pulse",
    "warn",
    "muted",
    "border",
    "selection",
    "success",
    "error",
    "heartbeat",
    "breathGlow",
    "guarded",
    "soulIdle",
    "soulThinking",
    "soulSpeaking",
    "soulGuarded"
  ];
  const tc = {};
  const c256 = {};
  const mo = {};
  for (const k of keys) {
    tc[k] = truecolor[k];
    const idxDefined = typeof color256Indices[k] === "number";
    c256[k] = idxDefined
      ? color256Indices[k]
      : rgbToAnsi256(hexToRgb(tc[k]) || hexToRgb(truecolor.accent));
    mo[k] = monoByRole[k] || monoByRole.fg || "normal";
  }
  return { truecolor: tc, color256: c256, mono: mo };
}

const MOON_WHITE = buildPlatformKeys(
  {
    bg: "#0B1020",
    fg: "#DCE7F7",
    accent: "#8FD3FF",
    pulse: "#7BE0C8",
    warn: "#FFB86B",
    muted: "#6E7B91",
    border: "#2F3A4F",
    selection: "#173B57",
    success: "#78D88F",
    error: "#FF6B8A",
    heartbeat: "#7BE0C8",
    breathGlow: "#8FD3FF",
    guarded: "#FFB86B"
  },
  { bg: 17, fg: 255, accent: 117, pulse: 79, warn: 215, muted: 66, border: 235, selection: 24, success: 114, error: 204, heartbeat: 79, breathGlow: 117, guarded: 215, soulIdle: 255, soulThinking: 66, soulSpeaking: 117, soulGuarded: 215 },
  {
    fg: "normal",
    bg: "normal",
    accent: "bold",
    pulse: "underline",
    warn: "reverse",
    muted: "underline",
    border: "normal",
    selection: "reverse",
    success: "bold",
    error: "reverse",
    heartbeat: "underline",
    breathGlow: "bold",
    guarded: "reverse",
    soulIdle: "normal",
    soulThinking: "underline",
    soulSpeaking: "bold",
    soulGuarded: "reverse"
  }
);

const NEON_VEIN = buildPlatformKeys(
  {
    bg: "#09070F",
    fg: "#F4F2FF",
    accent: "#C084FC",
    pulse: "#22D3EE",
    warn: "#FB7185",
    muted: "#7C7AA0",
    border: "#3B2B55",
    selection: "#312E81",
    success: "#34D399",
    error: "#F87171",
    heartbeat: "#22D3EE",
    breathGlow: "#C084FC",
    guarded: "#FB7185"
  },
  { bg: 16, fg: 255, accent: 177, pulse: 45, warn: 204, muted: 103, border: 54, selection: 18, success: 78, error: 210, heartbeat: 45, breathGlow: 177, guarded: 204, soulIdle: 255, soulThinking: 103, soulSpeaking: 177, soulGuarded: 204 },
  {
    fg: "normal",
    bg: "normal",
    accent: "bold",
    pulse: "bold",
    warn: "reverse",
    muted: "normal",
    border: "normal",
    selection: "reverse",
    success: "bold",
    error: "reverse",
    heartbeat: "bold",
    breathGlow: "reverse",
    guarded: "reverse",
    soulIdle: "normal",
    soulThinking: "normal",
    soulSpeaking: "bold",
    soulGuarded: "reverse"
  }
);

const DAWN_GLASS = buildPlatformKeys(
  {
    bg: "#111827",
    fg: "#F9FAFB",
    accent: "#60A5FA",
    pulse: "#34D399",
    warn: "#F59E0B",
    muted: "#94A3B8",
    border: "#334155",
    selection: "#1D4ED8",
    success: "#4ADE80",
    error: "#F87171",
    heartbeat: "#34D399",
    breathGlow: "#60A5FA",
    guarded: "#F59E0B"
  },
  { bg: 234, fg: 231, accent: 75, pulse: 78, warn: 214, muted: 109, border: 238, selection: 26, success: 114, error: 210, heartbeat: 78, breathGlow: 75, guarded: 214, soulIdle: 231, soulThinking: 109, soulSpeaking: 75, soulGuarded: 214 },
  {
    fg: "normal",
    bg: "normal",
    accent: "bold",
    pulse: "bold",
    warn: "reverse",
    muted: "dotted",
    border: "normal",
    selection: "reverse",
    success: "bold",
    error: "reverse",
    heartbeat: "bold",
    breathGlow: "bold",
    guarded: "reverse",
    soulIdle: "normal",
    soulThinking: "dotted",
    soulSpeaking: "bold",
    soulGuarded: "reverse"
  }
);

function legacyColorsFromPlatform(tc, semanticTokens) {
  return {
    text: tc.fg,
    background: tc.bg,
    muted: tc.muted,
    border: tc.border,
    primary: tc.accent,
    accent: tc.pulse,
    success: tc.success,
    warning: tc.warn,
    error: tc.error,
    selection: tc.selection,
    heartbeat: tc.heartbeat,
    breathGlow: tc.breathGlow,
    guarded: tc.guarded,
    ...semanticTokens
  };
}

function composeThemeDefinition(name, platformMapBase) {
  const semanticTokens = {
    ...semanticFromPalette(platformMapBase.truecolor)
  };
  const colors = legacyColorsFromPlatform(platformMapBase.truecolor, semanticTokens);
  return {
    name,
    semanticTokens,
    platformMap: platformMapBase,
    colors
  };
}

export const THEMES = Object.freeze({
  "moon-white-flow": Object.freeze(composeThemeDefinition("moon-white-flow", MOON_WHITE)),
  "neon-vein": Object.freeze(composeThemeDefinition("neon-vein", NEON_VEIN)),
  "dawn-glass": Object.freeze(composeThemeDefinition("dawn-glass", DAWN_GLASS))
});

export const DEFAULT_THEME = THEMES["moon-white-flow"];

export function resolveTheme(config = {}, caps = {}) {
  const named = THEMES[config.theme?.name] || DEFAULT_THEME;
  const raw = { ...(config.theme?.tokens || {}), ...(config.theme?.colors || {}) };
  const nestedSemantic = raw.semanticTokens && typeof raw.semanticTokens === "object" ? raw.semanticTokens : {};
  const mergedSemantic = { ...named.semanticTokens, ...nestedSemantic };
  const flatOverrides = Object.fromEntries(Object.entries(raw).filter(([key]) => key !== "semanticTokens"));
  for (const key of SEMANTIC_TOKEN_ROLES) {
    if (flatOverrides[key] !== undefined) mergedSemantic[key] = flatOverrides[key];
  }
  const colors = { ...named.colors, ...flatOverrides };
  for (const key of SEMANTIC_TOKEN_ROLES) {
    if (mergedSemantic[key]) colors[key] = mergedSemantic[key];
  }
  const respectNoColor = config.accessibility?.respectNoColor !== false && config.theme?.respectNoColor !== false;
  if (respectNoColor && caps.noColor) {
    return {
      name: config.theme?.name || named.name,
      colors: mapValues(colors, () => null),
      semanticTokens: mapValues(mergedSemantic, () => null),
      platformMap: named.platformMap,
      noColor: true
    };
  }
  return {
    name: config.theme?.name || named.name,
    colors,
    semanticTokens: mergedSemantic,
    platformMap: named.platformMap,
    noColor: false
  };
}

export function ansiColor(code, caps = {}) {
  if (caps.noColor || !code) return "";
  return `\u001b[${code}m`;
}

export function getSemanticColor(theme, role, caps = {}) {
  if (!theme || caps.noColor || theme.noColor) return null;
  const hex = theme.semanticTokens?.[role] || theme.colors?.[role];
  if (!hex || typeof hex !== "string" || !hex.startsWith("#")) return null;
  return hex;
}

export function colorizeByDepth(text, role, theme, caps = {}) {
  if (caps.noColor || theme?.noColor) return text;
  const depth = Number(caps.colorDepth);
  if (depth >= 24) {
    const hex = resolveRoleHex(theme, role);
    if (!hex) return text;
    const rgb = hexToRgb(hex);
    if (!rgb) return text;
    return `\u001b[38;2;${rgb.r};${rgb.g};${rgb.b}m${text}\u001b[0m`;
  }
  if (depth >= 8) {
    const idx = resolveRoleAnsi256(theme, role);
    if (idx == null) return text;
    return `\u001b[38;5;${idx}m${text}\u001b[0m`;
  }
  return applyMonoStyles(text, role, theme);
}

export function colorize(text, role, theme, caps = {}) {
  return colorizeByDepth(text, role, theme, caps);
}

export function contrastRatio(foreground, background) {
  const fg = hexToRgb(foreground);
  const bg = hexToRgb(background);
  if (!fg || !bg) return 1;
  const fgL = relativeLuminance(fg);
  const bgL = relativeLuminance(bg);
  const light = Math.max(fgL, bgL);
  const dark = Math.min(fgL, bgL);
  return (light + 0.05) / (dark + 0.05);
}

export function themeContrastReport(theme = DEFAULT_THEME, minimumOrOpts = 4.5) {
  const minimum = typeof minimumOrOpts === "object" && minimumOrOpts !== null
    ? (minimumOrOpts.highContrast === true ? 7 : Number(minimumOrOpts.minimum ?? 4.5))
    : Number(minimumOrOpts);
  const colors = theme?.colors || {};
  const background = colors.background || DEFAULT_THEME.colors.background;
  const roles = ["text", "muted", "primary", "accent", "heartbeat", "warning", "error"];
  return roles
    .filter((role) => colors[role])
    .map((role) => {
      const ratio = contrastRatio(colors[role], background);
      return {
        role,
        ratio,
        pass: ratio >= minimum
      };
    });
}

export function validateThemeContrast(theme, mode = "normal") {
  const minimum = mode === "high" ? 7 : 4.5;
  const report = themeContrastReport(theme, minimum);
  return {
    mode,
    minimum,
    report,
    pass: report.every((entry) => entry.pass)
  };
}

function resolveRoleHex(theme, role) {
  const platKey = ROLE_TO_PLATFORM[role] || role;
  const fromPlat = theme?.platformMap?.truecolor?.[platKey];
  if (fromPlat && fromPlat.startsWith("#")) return fromPlat;
  const semantic = theme?.semanticTokens?.[role];
  if (semantic && semantic.startsWith("#")) return semantic;
  const hex = theme?.colors?.[role];
  return hex?.startsWith?.("#") ? hex : null;
}

function resolveRoleAnsi256(theme, role) {
  const platKey = ROLE_TO_PLATFORM[role] || role;
  const map = theme?.platformMap?.color256;
  if (map && map[platKey] != null && Number.isFinite(map[platKey])) return map[platKey];
  const hex = resolveRoleHex(theme, role);
  const rgb = hexToRgb(hex || "");
  return rgb ? rgbToAnsi256(rgb) : null;
}

function applyMonoStyles(text, role, theme) {
  const platKey = ROLE_TO_PLATFORM[role] || role;
  const styleName = theme?.platformMap?.mono?.[platKey] || theme?.platformMap?.mono?.fg || "normal";
  const open = MONO_CODES[styleName] ?? "";
  if (!open) return text;
  return `${open}${text}\u001b[0m`;
}

function hexToRgb(hex) {
  if (!hex || typeof hex !== "string") return null;
  const match = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex.trim());
  if (!match) return null;
  return {
    r: Number.parseInt(match[1], 16),
    g: Number.parseInt(match[2], 16),
    b: Number.parseInt(match[3], 16)
  };
}

function relativeLuminance({ r, g, b }) {
  const values = [r, g, b].map((value) => {
    const channel = value / 255;
    return channel <= 0.03928 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * values[0] + 0.7152 * values[1] + 0.0722 * values[2];
}

function mapValues(object, fn) {
  return Object.fromEntries(Object.entries(object).map(([key, value]) => [key, fn(value, key)]));
}

function rgbToAnsi256({ r, g, b }) {
  const grayAverage = (r + g + b) / 3;
  if (Math.max(r, g, b) - Math.min(r, g, b) < 10) {
    if (grayAverage < 8) return 16;
    if (grayAverage > 248) return 231;
    return Math.round(((grayAverage - 8) / 247) * 24) + 232;
  }
  const toCube = (value) => Math.round((value / 255) * 5);
  return 16 + 36 * toCube(r) + 6 * toCube(g) + toCube(b);
}

// ─── Extended Styling API ─────────────────────────────────────────────

const RESET = "\u001b[0m";
const BOLD = "\u001b[1m";
const DIM = "\u001b[2m";
const ITALIC = "\u001b[3m";
const UNDERLINE = "\u001b[4m";
const INVERSE = "\u001b[7m";
const STRIKETHROUGH = "\u001b[9m";

export function bold(text) { return `${BOLD}${text}${RESET}`; }
export function dim(text) { return `${DIM}${text}${RESET}`; }
export function italic(text) { return `${ITALIC}${text}${RESET}`; }
export function underline(text) { return `${UNDERLINE}${text}${RESET}`; }
export function inverse(text) { return `${INVERSE}${text}${RESET}`; }
export function strikethrough(text) { return `${STRIKETHROUGH}${text}${RESET}`; }

export function fg256(idx, text) {
  return `\u001b[38;5;${idx}m${text}${RESET}`;
}

export function bg256(idx, text) {
  return `\u001b[48;5;${idx}m${text}${RESET}`;
}

export function fgRgb(r, g, b, text) {
  return `\u001b[38;2;${r};${g};${b}m${text}${RESET}`;
}

export function bgRgb(r, g, b, text) {
  return `\u001b[48;2;${r};${g};${b}m${text}${RESET}`;
}

export function style(text, { fg, bg, isBold, isDim, isItalic, isUnderline, isInverse } = {}) {
  let seq = "";
  if (isBold) seq += BOLD;
  if (isDim) seq += DIM;
  if (isItalic) seq += ITALIC;
  if (isUnderline) seq += UNDERLINE;
  if (isInverse) seq += INVERSE;
  if (fg) {
    const rgb = typeof fg === "string" && fg.startsWith("#") ? hexToRgbLocal(fg) : null;
    if (rgb) seq += `\u001b[38;2;${rgb.r};${rgb.g};${rgb.b}m`;
    else if (typeof fg === "number") seq += `\u001b[38;5;${fg}m`;
  }
  if (bg) {
    const rgb = typeof bg === "string" && bg.startsWith("#") ? hexToRgbLocal(bg) : null;
    if (rgb) seq += `\u001b[48;2;${rgb.r};${rgb.g};${rgb.b}m`;
    else if (typeof bg === "number") seq += `\u001b[48;5;${bg}m`;
  }
  if (!seq) return text;
  return `${seq}${text}${RESET}`;
}

function hexToRgbLocal(hex) {
  if (!hex || typeof hex !== "string") return null;
  const match = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex.trim());
  if (!match) return null;
  return { r: Number.parseInt(match[1], 16), g: Number.parseInt(match[2], 16), b: Number.parseInt(match[3], 16) };
}

export function gradientText(text, fromHex, toHex, caps = {}) {
  if (caps.noColor || !text) return text;
  const from = hexToRgbLocal(fromHex);
  const to = hexToRgbLocal(toHex);
  if (!from || !to) return text;
  const chars = Array.from(text);
  const len = Math.max(1, chars.length - 1);
  return chars.map((ch, i) => {
    const t = i / len;
    const r = Math.round(from.r + (to.r - from.r) * t);
    const g = Math.round(from.g + (to.g - from.g) * t);
    const b = Math.round(from.b + (to.b - from.b) * t);
    return `\u001b[38;2;${r};${g};${b}m${ch}`;
  }).join("") + RESET;
}

export function progressBar(value, width, { filledChar = "█", emptyChar = "░", filledColor, emptyColor, caps = {} } = {}) {
  const v = Math.max(0, Math.min(1, Number(value) || 0));
  const w = Math.max(1, Math.floor(width));
  const filled = Math.round(v * w);
  let filledStr = filledChar.repeat(filled);
  let emptyStr = emptyChar.repeat(Math.max(0, w - filled));
  if (!caps.noColor) {
    if (filledColor) {
      const rgb = hexToRgbLocal(filledColor);
      if (rgb) filledStr = `\u001b[38;2;${rgb.r};${rgb.g};${rgb.b}m${filledStr}${RESET}`;
    }
    if (emptyColor) {
      const rgb = hexToRgbLocal(emptyColor);
      if (rgb) emptyStr = `\u001b[38;2;${rgb.r};${rgb.g};${rgb.b}m${emptyStr}${RESET}`;
    }
  }
  return filledStr + emptyStr;
}

export function sparkline(values, width, { color, caps = {} } = {}) {
  const chars = "▁▂▃▄▅▆▇█";
  const arr = Array.isArray(values) ? values : [];
  if (arr.length === 0) return " ".repeat(width);
  const max = Math.max(...arr.map(v => Math.abs(Number(v) || 0)), 0.001);
  const sampled = arr.length <= width ? arr : arr.slice(-width);
  let line = sampled.map(v => {
    const norm = Math.max(0, Math.min(1, (Number(v) || 0) / max));
    return chars[Math.min(7, Math.floor(norm * 8))];
  }).join("");
  if (line.length < width) line = " ".repeat(width - line.length) + line;
  if (!caps.noColor && color) {
    const rgb = hexToRgbLocal(color);
    if (rgb) return `\u001b[38;2;${rgb.r};${rgb.g};${rgb.b}m${line}${RESET}`;
  }
  return line;
}

export function sectionHeader(label, width, theme, caps) {
  if (!label) return "";
  const is24bit = caps && (caps.colorDepth || 0) >= 24;
  const labelStr = ` ${label} `;
  const labelLen = labelStr.length;
  const lineLen = Math.max(0, width - labelLen - 1);
  const line = "─".repeat(Math.max(1, lineLen));
  if (is24bit) {
    const labelColored = style(labelStr, { fg: "#C8D6E5", isBold: true });
    const lineColored = style(line, { fg: "#5A6A7A" });
    return `${labelColored}${lineColored}`;
  }
  return colorize(`${labelStr}${line}`, "accent", theme, caps);
}

export const SOUL_PALETTE = Object.freeze({
  mood: { primary: "#C084FC", secondary: "#8B5CF6", bg: "#1E1533" },
  pulse: { primary: "#22D3EE", secondary: "#06B6D4", bg: "#0C1B24", stress: "#F87171", recovery: "#34D399" },
  presence: { primary: "#60A5FA", secondary: "#3B82F6", bg: "#111827" },
  host: { primary: "#A78BFA", secondary: "#7C3AED", bg: "#14101F" },
  memory: { primary: "#FBBF24", secondary: "#F59E0B", bg: "#1C1508" },
  signal: { primary: "#34D399", secondary: "#10B981", bg: "#0A1F15" },
  danger: "#F87171",
  success: "#4ADE80",
  warn: "#FBBF24",
  muted: "#6B7280"
});
