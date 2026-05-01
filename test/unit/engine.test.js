import test from "node:test";
import assert from "node:assert/strict";
import { TermvisEngine } from "../../src/application/termvis-engine.js";

test("TermvisEngine aggregates probe, plugin hooks, renderer, and sanitizer", async () => {
  const calls = [];
  const engine = new TermvisEngine({
    config: { security: { trustedPlugins: ["p"], execAllowlist: ["chafa"], network: false, fileReadAllowlist: ["."] } },
    capabilityProbe: () => ({ isTTY: true, cols: 80, rows: 24, colorDepth: 24, pixelProtocol: "none", noColor: false }),
    renderer: async (ctx) => {
      calls.push(ctx.alt);
      return { mode: "plain", payload: `ok\u001b]52;c;secret\u0007:${ctx.alt}`, altText: ctx.alt, metrics: {} };
    },
    plugins: [{
      name: "p",
      beforeRender: async (ctx) => ({ ...ctx, alt: "patched" }),
      afterRender: async (ctx) => ({ result: { ...ctx.result, altText: "after" } })
    }]
  });

  const result = await engine.renderBlock({ source: { type: "file", path: "x" }, alt: "before" });
  assert.deepEqual(calls, ["patched"]);
  assert.equal(result.payload, "ok:patched");
  assert.equal(result.altText, "after");
});

test("TermvisEngine renders card through aggregate layout method", async () => {
  const engine = new TermvisEngine();
  const result = await engine.layoutCard({ title: "T", body: "B", width: 16 });
  assert.ok(result.lines.length >= 3);
  assert.match(result.lines.join("\n"), /T/);
});
