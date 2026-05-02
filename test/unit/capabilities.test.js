import test from "node:test";
import assert from "node:assert/strict";
import { detectPixelProtocol, detectTerminalCapabilities } from "../../src/core/capabilities.js";

test("detectTerminalCapabilities reads TTY shape and truecolor", () => {
  const caps = detectTerminalCapabilities({
    env: { TERM: "xterm-256color", COLORTERM: "truecolor", LANG: "zh_CN.UTF-8" },
    stdout: { isTTY: true, columns: 120, rows: 40, getColorDepth: () => 24 },
    stdin: { isTTY: true }
  });
  assert.equal(caps.isTTY, true);
  assert.equal(caps.cols, 120);
  assert.equal(caps.rows, 40);
  assert.equal(caps.colorDepth, 24);
  assert.equal(caps.unicodeLevel, "unicode-wide");
});

test("NO_COLOR forces monochrome capability", () => {
  const caps = detectTerminalCapabilities({
    env: { TERM: "xterm-256color", NO_COLOR: "1" },
    stdout: { isTTY: true, columns: 80, rows: 24, getColorDepth: () => 24 },
    stdin: { isTTY: true }
  });
  assert.equal(caps.noColor, true);
  assert.equal(caps.colorDepth, 1);
});

test("FORCE_COLOR=3 maps to truecolor depth when terminal is not dumb", () => {
  const caps = detectTerminalCapabilities({
    env: { TERM: "xterm-256color", FORCE_COLOR: "3" },
    stdout: { isTTY: false, columns: 80, rows: 24 },
    stdin: { isTTY: false }
  });
  assert.equal(caps.forceColor, true);
  assert.equal(caps.colorDepth, 24);
});

test("pixel protocol can be detected or overridden", () => {
  assert.equal(detectPixelProtocol({ KITTY_WINDOW_ID: "1" }, { isTTY: true }), "kitty");
  assert.equal(detectPixelProtocol({ TERM_PROGRAM: "iTerm.app" }, { isTTY: true }), "iterm");
  assert.equal(detectPixelProtocol({ TERMVIS_PIXEL_PROTOCOL: "sixels" }, { isTTY: false }), "sixels");
});
