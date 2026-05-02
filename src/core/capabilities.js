const TRUECOLOR_TERMS = new Set(["24bit", "truecolor"]);

export function detectTerminalCapabilities({ env = process.env, stdout = process.stdout, stdin = process.stdin } = {}) {
  const isTTY = Boolean(stdout?.isTTY);
  const cols = Number(stdout?.columns || env.COLUMNS || 80);
  const rows = Number(stdout?.rows || env.LINES || 24);
  const noColor = "NO_COLOR" in env && env.NO_COLOR !== "0";
  const forceColor = normalizeForceColor(env.FORCE_COLOR);
  const term = String(env.TERM || "");
  const termProgram = String(env.TERM_PROGRAM || "");
  const termDumb = term === "dumb";

  let colorDepth = 1;
  if (!noColor && !termDumb) {
    if (forceColor) colorDepth = forceColor;
    else if (typeof stdout?.getColorDepth === "function") colorDepth = stdout.getColorDepth(env);
    else if (TRUECOLOR_TERMS.has(String(env.COLORTERM || "").toLowerCase())) colorDepth = 24;
    else if (/256color/i.test(term)) colorDepth = 8;
    else if (isTTY) colorDepth = 4;
  }

  return {
    isTTY,
    stdinTTY: Boolean(stdin?.isTTY),
    cols: Math.max(1, cols),
    rows: Math.max(1, rows),
    colorDepth,
    hasColors: colorDepth > 1,
    noColor,
    forceColor: Boolean(forceColor),
    term,
    termProgram,
    termDumb,
    pixelProtocol: detectPixelProtocol(env, { isTTY, term, termProgram }),
    unicodeLevel: detectUnicodeLevel(env),
    platform: process.platform
  };
}

export function detectPixelProtocol(env = process.env, base = {}) {
  const explicit = String(env.TERMVIS_PIXEL_PROTOCOL || "").toLowerCase();
  if (["kitty", "iterm", "sixels", "none"].includes(explicit)) return explicit;
  if (!base.isTTY && !env.TERMVIS_ASSUME_TTY) return "none";

  const term = String(base.term ?? env.TERM ?? "");
  const termProgram = String(base.termProgram ?? env.TERM_PROGRAM ?? "");
  if (env.KITTY_WINDOW_ID || /xterm-kitty/i.test(term)) return "kitty";
  if (/iTerm\.app/i.test(termProgram) || env.ITERM_SESSION_ID) return "iterm";
  if (/sixel/i.test(term) || env.TERMVIS_SIXEL === "1") return "sixels";
  return "none";
}

export function detectUnicodeLevel(env = process.env) {
  const locale = `${env.LC_ALL || env.LC_CTYPE || env.LANG || ""}`;
  if (/^(C|POSIX)(\.|$)?/.test(locale)) return "ascii";
  if (/UTF-?8/i.test(locale)) return "unicode-wide";
  if (process.platform === "win32") return "unicode-basic";
  return "unicode-wide";
}

/** FORCE_COLOR: 0 off; 1 sixteen ANSI colors; 2 256 colors; 3 truecolor (24-bit). */
function normalizeForceColor(value) {
  if (value === undefined || value === "" || value === "0") return 0;
  if (value === "1") return 4;
  if (value === "2") return 8;
  if (value === "3") return 24;
  if (value === "true") return 4;
  return 4;
}
