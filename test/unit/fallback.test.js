import test from "node:test";
import assert from "node:assert/strict";
import { modeToChafaArgs, selectRenderMode } from "../../src/core/fallback.js";

test("selectRenderMode chooses plain for non-TTY", () => {
  assert.deepEqual(selectRenderMode({ isTTY: false }), { mode: "plain", reason: "non-interactive terminal" });
});

test("selectRenderMode respects NO_COLOR and Unicode fallback", () => {
  const result = selectRenderMode({
    isTTY: true,
    noColor: true,
    unicodeLevel: "unicode-wide",
    colorDepth: 1,
    pixelProtocol: "kitty"
  });
  assert.equal(result.mode, "mono");
});

test("selectRenderMode prefers pixel protocol when available", () => {
  const result = selectRenderMode({
    isTTY: true,
    noColor: false,
    unicodeLevel: "unicode-wide",
    colorDepth: 24,
    pixelProtocol: "kitty"
  });
  assert.equal(result.mode, "kitty");
});

test("modeToChafaArgs maps terminal mode to chafa CLI arguments", () => {
  const args = modeToChafaArgs("symbols-256", { cols: 100, rows: 30, colorDepth: 8 }, {});
  assert.deepEqual(args.slice(0, 6), ["--format", "symbols", "--colors", "256", "--view-size", "100x30"]);
});

test("modeToChafaArgs supports avatar cover alignment with high-detail processing", () => {
  const args = modeToChafaArgs("symbols-truecolor", { cols: 34, rows: 12, colorDepth: 24 }, {}, {
    image: { fit: "cover", align: "top,left", scale: "1.25" }
  });
  assert.match(args.join(" "), /--size 34x12/);
  assert.match(args.join(" "), /--scale 1\.25/);
  assert.match(args.join(" "), /--align top,left/);
  assert.match(args.join(" "), /--fit-width/);
  assert.match(args.join(" "), /--dither diffusion/);
  assert.match(args.join(" "), /--dither-grain 2x2/);
  assert.match(args.join(" "), /--dither-intensity 0\.75/);
  assert.match(args.join(" "), /--preprocess on/);
  assert.match(args.join(" "), /--work 9/);
  assert.match(args.join(" "), /--color-space din99d/);
});
