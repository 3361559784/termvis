import { cellWidth } from "../core/width.js";

const ESC = "\u001b";
const CSI_8BIT = "\u009b";
const OSC_8BIT = "\u009d";
const DCS_8BIT = "\u0090";
const SOS_8BIT = "\u0098";
const PM_8BIT = "\u009e";
const APC_8BIT = "\u009f";
const STRING_8BIT = new Set([DCS_8BIT, SOS_8BIT, PM_8BIT, APC_8BIT]);
const segmenter = typeof Intl !== "undefined" && Intl.Segmenter
  ? new Intl.Segmenter(undefined, { granularity: "grapheme" })
  : null;

export function createHostViewport(options = {}) {
  return new HostViewport(options);
}

export class HostViewport {
  constructor({ cols = 80, rows = 24 } = {}) {
    this.cols = Math.max(1, Number(cols || 80));
    this.rows = Math.max(1, Number(rows || 24));
    this.normal = createScreen(this.rows, this.cols);
    this.alternate = createScreen(this.rows, this.cols);
    this.screen = this.normal;
    this.usingAlternate = false;
    this.cursorRow = 1;
    this.cursorCol = 1;
    this.savedCursor = { row: 1, col: 1 };
    this.scrollTop = 1;
    this.scrollBottom = this.rows;
    this.attr = "";
    this.pending = "";
    this.wrapPending = false;
    this.lastRendered = null;
  }

  resize({ cols = this.cols, rows = this.rows } = {}) {
    const nextCols = Math.max(1, Number(cols || this.cols));
    const nextRows = Math.max(1, Number(rows || this.rows));
    if (nextCols === this.cols && nextRows === this.rows) return;
    this.cols = nextCols;
    this.rows = nextRows;
    this.normal = resizeScreen(this.normal, this.rows, this.cols);
    this.alternate = resizeScreen(this.alternate, this.rows, this.cols);
    this.screen = this.usingAlternate ? this.alternate : this.normal;
    this.cursorRow = clamp(this.cursorRow, 1, this.rows);
    this.cursorCol = clamp(this.cursorCol, 1, this.cols);
    this.scrollTop = 1;
    this.scrollBottom = this.rows;
    this.lastRendered = null;
  }

  write(chunk) {
    this.pending += String(chunk || "");
    let index = 0;
    while (index < this.pending.length) {
      const char = this.pending[index];
      if (char === ESC) {
        const parsed = this.parseEsc(index);
        if (!parsed) break;
        index = parsed;
        continue;
      }
      if (char === CSI_8BIT) {
        const parsed = this.parseCsi(index, 1);
        if (!parsed) break;
        index = parsed;
        continue;
      }
      if (char === OSC_8BIT || STRING_8BIT.has(char)) {
        const parsed = this.skipString(index, 1);
        if (!parsed) break;
        index = parsed;
        continue;
      }
      if (isControl(char)) {
        this.handleControl(char);
        index += 1;
        continue;
      }

      const nextControl = findNextControl(this.pending, index);
      this.writeText(this.pending.slice(index, nextControl));
      index = nextControl;
    }
    this.pending = this.pending.slice(index);
  }

  clear() {
    this.screen = createScreen(this.rows, this.cols);
    if (this.usingAlternate) this.alternate = this.screen;
    else this.normal = this.screen;
    this.cursorRow = 1;
    this.cursorCol = 1;
    this.wrapPending = false;
    this.lastRendered = null;
  }

  render({ hostLeft = 1, rowOffset = 0, force = false } = {}) {
    const left = Math.max(1, Number(hostLeft || 1));
    const top = Math.max(0, Number(rowOffset || 0));
    const rows = [];
    if (!this.lastRendered || this.lastRendered.length !== this.rows) {
      this.lastRendered = Array(this.rows).fill("");
      force = true;
    }
    for (let row = 1; row <= this.rows; row += 1) {
      const key = rowKey(this.screen[row - 1]);
      if (force || key !== this.lastRendered[row - 1]) {
        rows.push(`${cursorTo(row + top, left)}${renderRow(this.screen[row - 1])}\u001b[0m`);
        this.lastRendered[row - 1] = key;
      }
    }
    return rows.join("");
  }

  cursorSequence({ hostLeft = 1 } = {}) {
    return cursorTo(this.cursorRow, Math.max(1, Number(hostLeft || 1)) + this.cursorCol - 1);
  }

  parseEsc(index) {
    if (index + 1 >= this.pending.length) return null;
    const next = this.pending[index + 1];
    if (next === "[") return this.parseCsi(index, 2);
    if (next === "]") return this.skipString(index, 2);
    if (["P", "X", "^", "_"].includes(next)) return this.skipString(index, 2);

    if (next === "c") {
      this.resetTerminal();
      return index + 2;
    }
    if (next === "7") {
      this.saveCursor();
      return index + 2;
    }
    if (next === "8") {
      this.restoreCursor();
      return index + 2;
    }
    if (next === "D") {
      this.lineFeed();
      return index + 2;
    }
    if (next === "E") {
      this.cursorCol = 1;
      this.lineFeed();
      return index + 2;
    }
    if (next === "M") {
      this.reverseIndex();
      return index + 2;
    }

    if (["(", ")", "*", "+", "-", ".", "/"].includes(next)) {
      return index + (index + 2 < this.pending.length ? 3 : 2);
    }
    return index + 2;
  }

  parseCsi(index, prefixLength) {
    let cursor = index + prefixLength;
    while (cursor < this.pending.length) {
      const code = this.pending.charCodeAt(cursor);
      if (code >= 0x40 && code <= 0x7e) {
        const body = this.pending.slice(index + prefixLength, cursor);
        const params = body.replace(/[ -/]+$/u, "");
        const final = this.pending[cursor];
        this.handleCsi(params, final);
        return cursor + 1;
      }
      cursor += 1;
    }
    return null;
  }

  skipString(index, prefixLength) {
    let cursor = index + prefixLength;
    while (cursor < this.pending.length) {
      const char = this.pending[cursor];
      if (char === "\u0007") return cursor + 1;
      if (char === ESC && this.pending[cursor + 1] === "\\") return cursor + 2;
      cursor += 1;
    }
    return null;
  }

  handleControl(char) {
    if (char === "\n" || char === "\u000b" || char === "\u000c") this.lineFeed();
    else if (char === "\r") {
      this.cursorCol = 1;
      this.wrapPending = false;
    } else if (char === "\b") {
      this.cursorCol = Math.max(1, this.cursorCol - 1);
      this.wrapPending = false;
    } else if (char === "\t") {
      const nextTab = Math.min(this.cols, this.cursorCol + (8 - ((this.cursorCol - 1) % 8)));
      while (this.cursorCol < nextTab) this.putGrapheme(" ");
    }
  }

  handleCsi(params, final) {
    if (final === "m") {
      this.setSgr(params);
      return;
    }
    if (final === "h" || final === "l") {
      this.setMode(params, final === "h");
      return;
    }

    const values = numericParams(params);
    const first = values[0];
    if (final === "H" || final === "f") {
      this.cursorRow = clamp(first || 1, 1, this.rows);
      this.cursorCol = clamp(values[1] || 1, 1, this.cols);
      this.wrapPending = false;
    } else if (final === "A") this.cursorRow = clamp(this.cursorRow - (first || 1), 1, this.rows);
    else if (final === "B") this.cursorRow = clamp(this.cursorRow + (first || 1), 1, this.rows);
    else if (final === "C") this.cursorCol = clamp(this.cursorCol + (first || 1), 1, this.cols);
    else if (final === "D") this.cursorCol = clamp(this.cursorCol - (first || 1), 1, this.cols);
    else if (final === "E") {
      this.cursorRow = clamp(this.cursorRow + (first || 1), 1, this.rows);
      this.cursorCol = 1;
    } else if (final === "F") {
      this.cursorRow = clamp(this.cursorRow - (first || 1), 1, this.rows);
      this.cursorCol = 1;
    } else if (final === "G") this.cursorCol = clamp(first || 1, 1, this.cols);
    else if (final === "d") this.cursorRow = clamp(first || 1, 1, this.rows);
    else if (final === "J") this.clearDisplay(first || 0);
    else if (final === "K") this.clearLine(first || 0);
    else if (final === "L") this.insertLines(first || 1);
    else if (final === "M") this.deleteLines(first || 1);
    else if (final === "P") this.deleteChars(first || 1);
    else if (final === "@") this.insertChars(first || 1);
    else if (final === "S") this.scrollUp(first || 1, this.scrollTop, this.scrollBottom);
    else if (final === "T") this.scrollDown(first || 1, this.scrollTop, this.scrollBottom);
    else if (final === "r") this.setScrollRegion(values);
    else if (final === "s") this.saveCursor();
    else if (final === "u") this.restoreCursor();
    this.wrapPending = false;
  }

  setSgr(params) {
    const values = params ? params.split(";").filter((part) => part !== "") : ["0"];
    if (values.length === 0 || values.includes("0")) {
      this.attr = "";
      const remaining = values.filter((part) => part !== "0");
      if (remaining.length > 0) this.attr = `${ESC}[${remaining.join(";")}m`;
      return;
    }
    this.attr = `${ESC}[${values.join(";")}m`;
  }

  setMode(params, enabled) {
    const values = String(params || "").split(";").map((part) => part.trim()).filter(Boolean);
    const privateValues = values.map((part) => part.startsWith("?") ? part.slice(1) : part);
    if (privateValues.some((value) => ["47", "1047", "1048", "1049"].includes(value))) {
      if (enabled) this.enterAlternateScreen(privateValues.includes("1049") || privateValues.includes("1048"));
      else this.leaveAlternateScreen(privateValues.includes("1049") || privateValues.includes("1048"));
    }
  }

  enterAlternateScreen(saveCursor = true) {
    if (saveCursor) this.saveCursor();
    this.usingAlternate = true;
    this.alternate = createScreen(this.rows, this.cols);
    this.screen = this.alternate;
    this.cursorRow = 1;
    this.cursorCol = 1;
    this.scrollTop = 1;
    this.scrollBottom = this.rows;
    this.wrapPending = false;
    this.lastRendered = null;
  }

  leaveAlternateScreen(restoreCursor = true) {
    this.usingAlternate = false;
    this.screen = this.normal;
    if (restoreCursor) this.restoreCursor();
    this.scrollTop = 1;
    this.scrollBottom = this.rows;
    this.wrapPending = false;
    this.lastRendered = null;
  }

  resetTerminal() {
    this.normal = createScreen(this.rows, this.cols);
    this.alternate = createScreen(this.rows, this.cols);
    this.screen = this.normal;
    this.usingAlternate = false;
    this.cursorRow = 1;
    this.cursorCol = 1;
    this.savedCursor = { row: 1, col: 1 };
    this.scrollTop = 1;
    this.scrollBottom = this.rows;
    this.attr = "";
    this.wrapPending = false;
    this.lastRendered = null;
  }

  writeText(text) {
    for (const part of splitGraphemes(text)) this.putGrapheme(part);
  }

  putGrapheme(part) {
    const width = cellWidth(part);
    if (width <= 0) {
      const previousCol = Math.max(1, this.cursorCol - 1);
      const cell = this.screen[this.cursorRow - 1][previousCol - 1];
      if (cell && !cell.continuation) cell.text += part;
      return;
    }

    if (this.wrapPending || this.cursorCol + width - 1 > this.cols) {
      this.cursorCol = 1;
      this.lineFeed();
    }

    const row = this.screen[this.cursorRow - 1];
    row[this.cursorCol - 1] = { text: part, attr: this.attr, continuation: false };
    for (let offset = 1; offset < width && this.cursorCol - 1 + offset < this.cols; offset += 1) {
      row[this.cursorCol - 1 + offset] = { text: "", attr: this.attr, continuation: true };
    }
    this.cursorCol += width;
    this.wrapPending = this.cursorCol > this.cols;
    if (this.wrapPending) this.cursorCol = this.cols;
  }

  lineFeed() {
    if (this.cursorRow >= this.scrollBottom) {
      this.scrollUp(1, this.scrollTop, this.scrollBottom);
      this.cursorRow = this.scrollBottom;
    } else {
      this.cursorRow = clamp(this.cursorRow + 1, 1, this.rows);
    }
    this.wrapPending = false;
  }

  reverseIndex() {
    if (this.cursorRow <= this.scrollTop) {
      this.scrollDown(1, this.scrollTop, this.scrollBottom);
      this.cursorRow = this.scrollTop;
    } else {
      this.cursorRow = clamp(this.cursorRow - 1, 1, this.rows);
    }
    this.wrapPending = false;
  }

  clearDisplay(mode = 0) {
    if (mode === 2 || mode === 3) {
      this.screen = createScreen(this.rows, this.cols);
      if (this.usingAlternate) this.alternate = this.screen;
      else this.normal = this.screen;
      return;
    }
    if (mode === 1) {
      for (let row = 1; row < this.cursorRow; row += 1) this.clearWholeLine(row);
      this.clearLine(1);
      return;
    }
    this.clearLine(0);
    for (let row = this.cursorRow + 1; row <= this.rows; row += 1) this.clearWholeLine(row);
  }

  clearLine(mode = 0) {
    const row = this.screen[this.cursorRow - 1];
    if (mode === 2) {
      this.clearWholeLine(this.cursorRow);
      return;
    }
    const start = mode === 1 ? 1 : this.cursorCol;
    const end = mode === 1 ? this.cursorCol : this.cols;
    for (let col = start; col <= end; col += 1) row[col - 1] = blankCell();
  }

  clearWholeLine(rowIndex) {
    this.screen[rowIndex - 1] = createRow(this.cols);
  }

  insertChars(count) {
    const row = this.screen[this.cursorRow - 1];
    const at = this.cursorCol - 1;
    const blanks = Array.from({ length: count }, () => blankCell());
    this.screen[this.cursorRow - 1] = [...row.slice(0, at), ...blanks, ...row.slice(at)].slice(0, this.cols);
  }

  deleteChars(count) {
    const row = this.screen[this.cursorRow - 1];
    const at = this.cursorCol - 1;
    const blanks = Array.from({ length: count }, () => blankCell());
    this.screen[this.cursorRow - 1] = [...row.slice(0, at), ...row.slice(at + count), ...blanks].slice(0, this.cols);
  }

  insertLines(count) {
    const top = clamp(this.cursorRow, this.scrollTop, this.scrollBottom);
    const bottom = this.scrollBottom;
    const insert = Array.from({ length: count }, () => createRow(this.cols));
    const region = this.screen.slice(top - 1, bottom);
    this.screen.splice(top - 1, bottom - top + 1, ...[...insert, ...region].slice(0, bottom - top + 1));
  }

  deleteLines(count) {
    const top = clamp(this.cursorRow, this.scrollTop, this.scrollBottom);
    const bottom = this.scrollBottom;
    const region = this.screen.slice(top - 1, bottom);
    const blanks = Array.from({ length: count }, () => createRow(this.cols));
    this.screen.splice(top - 1, bottom - top + 1, ...[...region.slice(count), ...blanks].slice(0, bottom - top + 1));
  }

  scrollUp(count = 1, top = this.scrollTop, bottom = this.scrollBottom) {
    const safeTop = clamp(top, 1, this.rows);
    const safeBottom = clamp(bottom, safeTop, this.rows);
    const amount = clamp(count, 1, safeBottom - safeTop + 1);
    const region = this.screen.slice(safeTop - 1, safeBottom);
    const blanks = Array.from({ length: amount }, () => createRow(this.cols));
    this.screen.splice(safeTop - 1, safeBottom - safeTop + 1, ...[...region.slice(amount), ...blanks]);
  }

  scrollDown(count = 1, top = this.scrollTop, bottom = this.scrollBottom) {
    const safeTop = clamp(top, 1, this.rows);
    const safeBottom = clamp(bottom, safeTop, this.rows);
    const amount = clamp(count, 1, safeBottom - safeTop + 1);
    const region = this.screen.slice(safeTop - 1, safeBottom);
    const blanks = Array.from({ length: amount }, () => createRow(this.cols));
    this.screen.splice(safeTop - 1, safeBottom - safeTop + 1, ...[...blanks, ...region.slice(0, region.length - amount)]);
  }

  setScrollRegion(values) {
    const top = clamp(values[0] || 1, 1, this.rows);
    const bottom = clamp(values[1] || this.rows, top, this.rows);
    this.scrollTop = top;
    this.scrollBottom = bottom;
    this.cursorRow = 1;
    this.cursorCol = 1;
    this.wrapPending = false;
  }

  saveCursor() {
    this.savedCursor = { row: this.cursorRow, col: this.cursorCol };
  }

  restoreCursor() {
    this.cursorRow = clamp(this.savedCursor.row, 1, this.rows);
    this.cursorCol = clamp(this.savedCursor.col, 1, this.cols);
    this.wrapPending = false;
  }
}

export function renderHostViewportOnce(chunk, options = {}) {
  const viewport = new HostViewport({ cols: options.hostCols || options.cols || 80, rows: options.hostRows || 24 });
  viewport.write(chunk);
  return viewport.render({ hostLeft: options.hostLeft || 1, rowOffset: options.rowOffset || 0, force: true });
}

function renderRow(row) {
  let output = "";
  let attr = "";
  for (const cell of row) {
    if (cell.continuation) continue;
    if (cell.attr !== attr) {
      output += cell.attr ? `\u001b[0m${cell.attr}` : "\u001b[0m";
      attr = cell.attr;
    }
    output += cell.text || " ";
  }
  return output;
}

function rowKey(row) {
  return row.map((cell) => `${cell.attr}\u0000${cell.text}\u0000${cell.continuation ? "1" : "0"}`).join("\u0001");
}

function createScreen(rows, cols) {
  return Array.from({ length: rows }, () => createRow(cols));
}

function resizeScreen(screen, rows, cols) {
  const resized = screen.slice(0, rows).map((row) => {
    const next = row.slice(0, cols);
    while (next.length < cols) next.push(blankCell());
    return next;
  });
  while (resized.length < rows) resized.push(createRow(cols));
  return resized;
}

function createRow(cols) {
  return Array.from({ length: cols }, () => blankCell());
}

function blankCell() {
  return { text: " ", attr: "", continuation: false };
}

function splitGraphemes(text) {
  if (!text) return [];
  if (segmenter) return Array.from(segmenter.segment(text), (part) => part.segment);
  return Array.from(text);
}

function numericParams(params = "") {
  if (!params || params.startsWith("?")) return [];
  return params.split(";").map((part) => {
    const value = Number.parseInt(part.split(":")[0], 10);
    return Number.isFinite(value) ? value : undefined;
  });
}

function isControl(char) {
  const code = char.codePointAt(0);
  return code < 0x20 || (code >= 0x7f && code <= 0x9f);
}

function findNextControl(text, start) {
  let index = start;
  while (index < text.length) {
    if (text[index] === ESC || isControl(text[index])) return index;
    index += 1;
  }
  return text.length;
}

function cursorTo(row, col) {
  return `\u001b[${row};${col}H`;
}

function clamp(value, min, max) {
  return Math.min(Math.max(Number(value) || min, min), max);
}
