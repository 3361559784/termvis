const ANSI_PATTERN = /(?:\u001b\[[0-?]*[ -/]*[@-~]|\u009b[0-?]*[ -/]*[@-~]|\u001b\][\s\S]*?(?:\u0007|\u001b\\)|\u009d[\s\S]*?(?:\u0007|\u001b\\)|\u001b[P_X^][\s\S]*?(?:\u0007|\u001b\\)|[\u0090\u0098-\u009f][\s\S]*?(?:\u0007|\u001b\\)|\u001bc|\u001b[@-Z\\-_])/g;
const segmenter = typeof Intl !== "undefined" && Intl.Segmenter
  ? new Intl.Segmenter(undefined, { granularity: "grapheme" })
  : null;

export function stripAnsi(input) {
  return String(input).replace(ANSI_PATTERN, "");
}

export function cellWidth(input) {
  const text = stripAnsi(input);
  if (!text) return 0;
  if (segmenter) {
    let width = 0;
    for (const { segment } of segmenter.segment(text)) {
      width += graphemeWidth(segment);
    }
    return width;
  }
  let width = 0;
  for (const char of text) width += codePointWidth(char.codePointAt(0));
  return width;
}

export function padCells(input, width, align = "left") {
  const text = String(input);
  const current = cellWidth(text);
  if (current >= width) return truncateCells(text, width);
  const gap = width - current;
  if (align === "right") return `${" ".repeat(gap)}${text}`;
  if (align === "center") {
    const left = Math.floor(gap / 2);
    return `${" ".repeat(left)}${text}${" ".repeat(gap - left)}`;
  }
  return `${text}${" ".repeat(gap)}`;
}

export function truncateCells(input, width, suffix = "") {
  const text = String(input);
  if (cellWidth(text) <= width) return text;
  const suffixWidth = cellWidth(suffix);
  const target = Math.max(0, width - suffixWidth);
  let output = "";
  let used = 0;
  const pieces = segmenter ? Array.from(segmenter.segment(stripAnsi(text)), (part) => part.segment) : Array.from(stripAnsi(text));
  for (const piece of pieces) {
    const pieceWidth = graphemeWidth(piece);
    if (used + pieceWidth > target) break;
    output += piece;
    used += pieceWidth;
  }
  return `${output}${suffix}`;
}

export function wrapCells(input, width) {
  const lines = [];
  for (const rawLine of String(input).split(/\r?\n/)) {
    let line = "";
    let used = 0;
    const tokens = tokenizeAnsi(rawLine);
    for (const token of tokens) {
      if (token.isAnsi) {
        line += token.text;
        continue;
      }
      const segments = segmenter
        ? Array.from(segmenter.segment(token.text), (part) => part.segment)
        : Array.from(token.text);
      for (const seg of segments) {
        const w = graphemeWidth(seg);
        if (used > 0 && used + w > width) {
          lines.push(padCells(line, width));
          line = "";
          used = 0;
        }
        line += seg;
        used += w;
      }
    }
    lines.push(padCells(line, width));
  }
  return lines;
}

function tokenizeAnsi(str) {
  const tokens = [];
  let last = 0;
  const re = new RegExp(ANSI_PATTERN.source, "g");
  let m;
  while ((m = re.exec(str)) !== null) {
    if (m.index > last) tokens.push({ text: str.slice(last, m.index), isAnsi: false });
    tokens.push({ text: m[0], isAnsi: true });
    last = re.lastIndex;
  }
  if (last < str.length) tokens.push({ text: str.slice(last), isAnsi: false });
  return tokens;
}

function graphemeWidth(segment) {
  if (!segment) return 0;
  if (/[\u200d\ufe0f]/u.test(segment)) return 2;
  const scalarWidths = [];
  for (const char of segment) scalarWidths.push(codePointWidth(char.codePointAt(0)));
  const codeSum = scalarWidths.reduce((a, b) => a + b, 0);
  const minSeg = Math.min(Math.max(codeSum, 0), 2);
  if (!hasEmoji(segment)) return minSeg;
  /** Unicode marks many dingbats as Extended_Pictographic even though common monospace fonts render them as single-column (playing-card suits, ♪, ★, etc.). Prefer EastAsianWidth-style counting for lone scalars to match terminal columns on Windows/macOS. */
  const scalars = [...segment];
  if (
    scalars.length === 1 &&
    legacyEmojiStyledSymbolSingleCell(scalars[0].codePointAt(0))
  ) {
    return minSeg;
  }
  return 2;
}

function codePointWidth(code) {
  if (code === undefined) return 0;
  if (code === 0) return 0;
  if (code < 32 || (code >= 0x7f && code < 0xa0)) return 0;
  if (isCombining(code) || isVariationSelector(code)) return 0;
  if (isWide(code)) return 2;
  return 1;
}

function hasEmoji(segment) {
  return /\p{Extended_Pictographic}/u.test(segment);
}

function legacyEmojiStyledSymbolSingleCell(code) {
  if (code === undefined) return false;
  if (code >= 0x2660 && code <= 0x266f) return true;
  if (code === 0x2605 || code === 0x2606) return true;
  return false;
}

function isCombining(code) {
  return (
    (code >= 0x0300 && code <= 0x036f) ||
    (code >= 0x1ab0 && code <= 0x1aff) ||
    (code >= 0x1dc0 && code <= 0x1dff) ||
    (code >= 0x20d0 && code <= 0x20ff) ||
    (code >= 0xfe20 && code <= 0xfe2f)
  );
}

function isVariationSelector(code) {
  return (code >= 0xfe00 && code <= 0xfe0f) || (code >= 0xe0100 && code <= 0xe01ef);
}

function isWide(code) {
  return (
    code >= 0x1100 && (
      code <= 0x115f ||
      code === 0x2329 ||
      code === 0x232a ||
      (code >= 0x2e80 && code <= 0xa4cf && code !== 0x303f) ||
      (code >= 0xac00 && code <= 0xd7a3) ||
      (code >= 0xf900 && code <= 0xfaff) ||
      (code >= 0xfe10 && code <= 0xfe19) ||
      (code >= 0xfe30 && code <= 0xfe6f) ||
      (code >= 0xff00 && code <= 0xff60) ||
      (code >= 0xffe0 && code <= 0xffe6) ||
      (code >= 0x1f300 && code <= 0x1f64f) ||
      (code >= 0x1f900 && code <= 0x1f9ff) ||
      (code >= 0x20000 && code <= 0x3fffd)
    )
  );
}
