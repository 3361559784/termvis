import test from "node:test";
import assert from "node:assert/strict";
import { cellWidth, padCells, stripAnsi, truncateCells, wrapCells } from "../../src/core/width.js";

test("cellWidth handles ASCII, CJK, combining marks, emoji, and ANSI", () => {
  assert.equal(cellWidth("abc"), 3);
  assert.equal(cellWidth("中文"), 4);
  assert.equal(cellWidth("a中"), 3);
  assert.equal(cellWidth("e\u0301"), 1);
  assert.equal(cellWidth("🙂"), 2);
  assert.equal(cellWidth("\u001b[31m红\u001b[0m"), 2);
});

test("cellWidth treats legacy dingbat hearts/stars/music as single-column", () => {
  assert.equal(cellWidth("\u2661"), 1);
  assert.equal(cellWidth("\u2665"), 1);
  assert.equal(cellWidth("\u266a"), 1);
  assert.equal(cellWidth("\u2605"), 1);
  assert.equal(cellWidth("  \u2572\u2500\u2500\u2661\u2661\u2500\u2500\u256f  "), 12);
});

test("stripAnsi removes CSI and OSC sequences", () => {
  assert.equal(stripAnsi("\u001b[31mred\u001b[0m"), "red");
  assert.equal(stripAnsi("\u001b]52;c;abc\u0007text"), "text");
  assert.equal(stripAnsi("\u001bPqpayload\u001b\\text"), "text");
  assert.equal(stripAnsi("\u001bcreset"), "reset");
});

test("padCells and truncateCells preserve target terminal width", () => {
  assert.equal(cellWidth(padCells("中", 4)), 4);
  assert.equal(truncateCells("abcdef", 4, "…"), "abc…");
  assert.equal(cellWidth(truncateCells("中文abc", 5, "…")), 5);
});

test("wrapCells wraps by cell width", () => {
  assert.deepEqual(wrapCells("ab中文cde", 4).map((line) => cellWidth(line)), [4, 4, 4]);
});
