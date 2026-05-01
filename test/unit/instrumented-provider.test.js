/**
 * Tests for InstrumentedLLMProvider that tracks LLM call status,
 * latency, and statistics for the TUI rail to display.
 */

import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { InstrumentedLLMProvider, noProviderStats } from "../../src/cognition/instrumented-provider.js";
import { ScriptedLLMProvider } from "../support/scripted-llm.js";

describe("InstrumentedLLMProvider", () => {
  test("wraps an inner provider and reports name/model/available", () => {
    const inner = new ScriptedLLMProvider();
    inner.model = "test-model";
    const wrap = new InstrumentedLLMProvider(inner);
    assert.equal(wrap.name, "scripted");
    assert.equal(wrap.model, "test-model");
    assert.equal(wrap.available, true);
  });

  test("noProviderStats wraps a null inner gracefully", () => {
    const stats = noProviderStats();
    assert.equal(stats.providerName, "none");
    assert.equal(stats.available, false);
    assert.equal(stats.state, "idle");
  });

  test("tracks a successful complete() call", async () => {
    const inner = new ScriptedLLMProvider({ defaultResponse: { ok: true } });
    const wrap = new InstrumentedLLMProvider(inner);
    const result = await wrap.complete({
      system: "s",
      messages: [],
      schema: {},
      schemaName: "TestSchema"
    });
    assert.ok(result.runId);
    const stats = wrap.stats();
    assert.equal(stats.state, "idle");
    assert.equal(stats.totalCalls, 1);
    assert.equal(stats.totalErrors, 0);
    assert.equal(stats.recentCalls.length, 1);
    assert.equal(stats.recentCalls[0].schemaName, "TestSchema");
    assert.equal(stats.recentCalls[0].ok, true);
  });

  test("tracks a failed complete() call as error state", async () => {
    const inner = {
      name: "bad",
      available: true,
      model: "bad-model",
      complete: async () => {
        throw new Error("simulated failure");
      }
    };
    const wrap = new InstrumentedLLMProvider(inner);
    await assert.rejects(() => wrap.complete({ system: "s", messages: [], schema: {}, schemaName: "X" }));
    const stats = wrap.stats();
    assert.equal(stats.state, "error");
    assert.equal(stats.totalErrors, 1);
    assert.equal(stats.recentCalls[0].ok, false);
    assert.match(stats.recentCalls[0].error || "", /simulated/);
  });

  test("emits onChange events around calls", async () => {
    const inner = new ScriptedLLMProvider();
    const wrap = new InstrumentedLLMProvider(inner);
    const states = [];
    wrap.onChange((s) => states.push(s.state));
    await wrap.complete({ system: "s", messages: [], schema: {}, schemaName: "X" });
    assert.ok(states.includes("calling"));
    assert.equal(states[states.length - 1], "idle");
  });

  test("keeps only the latest N records (default 8)", async () => {
    const inner = new ScriptedLLMProvider();
    const wrap = new InstrumentedLLMProvider(inner, { keepRecent: 3 });
    for (let i = 0; i < 5; i++) {
      await wrap.complete({ system: "s", messages: [], schema: {}, schemaName: `Schema${i}` });
    }
    const stats = wrap.stats();
    assert.equal(stats.recentCalls.length, 3);
    // Most recent first
    assert.equal(stats.recentCalls[0].schemaName, "Schema4");
  });

  test("computes avgLatencyMs across multiple calls", async () => {
    const inner = new ScriptedLLMProvider();
    const wrap = new InstrumentedLLMProvider(inner);
    await wrap.complete({ system: "s", messages: [], schema: {}, schemaName: "A" });
    await wrap.complete({ system: "s", messages: [], schema: {}, schemaName: "B" });
    const stats = wrap.stats();
    assert.equal(stats.totalCalls, 2);
    assert.ok(typeof stats.avgLatencyMs === "number");
  });

  test("tracks chat() calls separately", async () => {
    const inner = new ScriptedLLMProvider();
    const wrap = new InstrumentedLLMProvider(inner);
    const r = await wrap.chat({ system: "s", messages: [{ role: "user", content: "hi" }] });
    assert.ok(r.text);
    const stats = wrap.stats();
    assert.equal(stats.totalCalls, 1);
    assert.equal(stats.recentCalls[0].schemaName, "chat");
  });

  test("currentCall is null between calls", async () => {
    const inner = new ScriptedLLMProvider();
    const wrap = new InstrumentedLLMProvider(inner);
    assert.equal(wrap.currentCall, null);
    await wrap.complete({ system: "s", messages: [], schema: {}, schemaName: "X" });
    assert.equal(wrap.currentCall, null);
  });
});

describe("Rich TUI snapshot wiring", () => {
  test("soulFrameToTuiSnapshot embeds llmStats and memoryStats", async () => {
    const { soulFrameToTuiSnapshot } = await import("../../src/life/tui.js");
    const { createSoulFrame, createSoulBiosCaps } = await import("../../src/soul-bios/types.js");
    const frame = createSoulFrame({ sessionId: "test", entityVersion: 1 });
    const llmStats = {
      providerName: "openai",
      model: "gpt-4o-mini",
      available: true,
      state: "idle",
      currentCall: null,
      recentCalls: [{ runId: "r1", latencyMs: 200, ok: true, schemaName: "IntentPlan", totalTokens: 80 }],
      totalCalls: 1,
      totalErrors: 0,
      totalTokens: 80,
      avgLatencyMs: 200
    };
    const memoryStats = { working: 5, episodic: 12, semantic: 3, reflective: 0, quarantine: 1 };
    const snap = soulFrameToTuiSnapshot(frame, { llmStats, memoryStats, personaName: "Mika" });
    assert.equal(snap.soul.persona.name, "Mika");
    assert.deepEqual(snap.soul.llmStats, llmStats);
    assert.deepEqual(snap.soul.memoryStats, memoryStats);
    assert.ok(snap.soul.mood.tags); // rich format detected
  });

  test("renderLifeTuiPanel displays mood section with soul state", async () => {
    const { renderLifeTuiPanel, soulFrameToTuiSnapshot } = await import("../../src/life/tui.js");
    const { createSoulFrame } = await import("../../src/soul-bios/types.js");
    const frame = createSoulFrame({ sessionId: "test", entityVersion: 1 });
    const snap = soulFrameToTuiSnapshot(frame, { personaName: "Mika" });
    const panel = renderLifeTuiPanel({
      snapshot: snap,
      width: 44,
      height: 80,
      terminalCols: 140,
      caps: { noColor: true }
    });
    const text = panel.join("\n");
    assert.match(text, /Mood/);
    assert.match(text, /Pulse/);
    assert.match(text, /[♥♡◕◉◆✦➤]/);
  });

  test("renderLifeTuiPanel renders without LLM stats gracefully", async () => {
    const { renderLifeTuiPanel, soulFrameToTuiSnapshot } = await import("../../src/life/tui.js");
    const { createSoulFrame } = await import("../../src/soul-bios/types.js");
    const frame = createSoulFrame({ sessionId: "test", entityVersion: 1 });
    const snap = soulFrameToTuiSnapshot(frame, {});
    const panel = renderLifeTuiPanel({
      snapshot: snap,
      width: 44,
      height: 80,
      terminalCols: 140,
      caps: { noColor: true }
    });
    const text = panel.join("\n");
    assert.match(text, /Mood/);
    assert.ok(panel.length > 5);
  });

  test("renderLifeTuiPanel renders anime art when no avatarPayload provided", async () => {
    const { renderLifeTuiPanel, soulFrameToTuiSnapshot } = await import("../../src/life/tui.js");
    const { createSoulFrame } = await import("../../src/soul-bios/types.js");
    const frame = createSoulFrame({ sessionId: "test", entityVersion: 1, mood: { tags: ["delighted"] } });
    const snap = soulFrameToTuiSnapshot(frame, {});
    const panel = renderLifeTuiPanel({
      snapshot: snap,
      width: 44,
      height: 22,
      terminalCols: 140,
      caps: { noColor: true }
    });
    const text = panel.join("\n");
    // Should contain anime art glyphs (decorative chars from the art catalogue)
    assert.match(text, /[╱╲│╭╮╰╯◕]/);
  });

  test("renderLifeTuiPanel adds expression badge and mood sections", async () => {
    const { renderLifeTuiPanel, soulFrameToTuiSnapshot } = await import("../../src/life/tui.js");
    const { createSoulFrame } = await import("../../src/soul-bios/types.js");
    const frame = createSoulFrame({ sessionId: "test", entityVersion: 2, mood: { tags: ["curious"] } });
    const snap = soulFrameToTuiSnapshot(frame, {
      memoryStats: { working: 1, episodic: 0, semantic: 0 }
    });
    const panel = renderLifeTuiPanel({
      snapshot: snap,
      width: 44,
      height: 80,
      terminalCols: 140,
      caps: { noColor: true },
      now: new Date("2026-05-01T00:00:00Z")
    });
    const text = panel.join("\n");
    assert.match(text, /Mood/);
    assert.match(text, /Presence/);
    assert.match(text, /soul voice ready/);
    assert.doesNotMatch(text, /Memory/);
    assert.doesNotMatch(text, /Host/);
  });
});
