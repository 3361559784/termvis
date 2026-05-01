import test from "node:test";
import assert from "node:assert/strict";
import { renderCard, renderLayout, renderLayoutToString } from "../../src/core/layout.js";
import { cellWidth } from "../../src/core/width.js";

test("renderCard keeps every line at the requested cell width", () => {
  const lines = renderCard({ title: "标题", body: "中文 body wraps correctly", width: 24 });
  assert.ok(lines.length >= 3);
  assert.deepEqual(lines.map(cellWidth), Array(lines.length).fill(24));
});

test("renderLayout supports row split without width drift", () => {
  const lines = renderLayout({
    type: "split",
    direction: "row",
    children: [
      { type: "card", title: "A", body: "left" },
      { type: "card", title: "B", body: "right" }
    ]
  }, { width: 50, height: 5 });
  assert.equal(lines.length, 5);
  assert.deepEqual(lines.map(cellWidth), Array(5).fill(50));
});

test("renderLayoutToString renders stacked content", () => {
  const output = renderLayoutToString({
    type: "stack",
    children: [
      { type: "text", text: "one" },
      { type: "text", text: "two" }
    ]
  }, { width: 10 });
  assert.match(output, /one/);
  assert.match(output, /two/);
});
