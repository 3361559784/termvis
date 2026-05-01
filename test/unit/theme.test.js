import test from "node:test";
import assert from "node:assert/strict";
import { colorize, contrastRatio, resolveTheme, themeContrastReport } from "../../src/core/theme.js";

test("resolveTheme uses the quiet living terminal theme by default", () => {
  const theme = resolveTheme({}, { noColor: false, colorDepth: 24 });
  assert.equal(theme.name, "moon-white-flow");
  assert.equal(theme.colors.primary.toLowerCase(), "#8fd3ff");
});

test("colorize emits truecolor, 256-color, or plain text according to capabilities", () => {
  const theme = resolveTheme({ theme: { name: "moon-white-flow" } }, { noColor: false, colorDepth: 24 });
  assert.match(colorize("pulse", "heartbeat", theme, { colorDepth: 24 }), /\u001b\[38;2;/);
  assert.match(colorize("pulse", "heartbeat", theme, { colorDepth: 8 }), /\u001b\[38;5;/);
});

test("colorize applies monochrome emphasis below 256 colors when color is enabled", () => {
  const theme = resolveTheme({ theme: { name: "moon-white-flow" } }, { noColor: false, colorDepth: 1 });
  assert.match(colorize("label", "primary", theme, { noColor: false, colorDepth: 1 }), /\u001b\[1m/);
});

test("default living theme keeps core roles above WCAG contrast threshold", () => {
  const theme = resolveTheme({ theme: { name: "moon-white-flow" } }, { noColor: false, colorDepth: 24 });
  assert.ok(contrastRatio(theme.colors.text, theme.colors.background) >= 4.5);
  const report = themeContrastReport(theme, 4.5);
  const requiredRoles = new Set(["text", "primary", "accent", "heartbeat", "warning", "error"]);
  for (const entry of report.filter((item) => requiredRoles.has(item.role))) {
    assert.equal(entry.pass, true, `${entry.role} contrast ${entry.ratio}`);
  }
});
