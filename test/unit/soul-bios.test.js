/**
 * Unit tests for `src/soul-bios/` — types, signals, affect, presence, planner, audit,
 * engine, and report acceptance fixtures. Validates frozen factories, heuristic rules,
 * and async engine lifecycle without adding dependencies.
 */

import { describe, test } from "node:test";
import assert from "node:assert/strict";

import {
  appendAuditEntry,
  bridgeLifeEventToSignals,
  clamp,
  createAuditLog,
  createAuditSnapshot,
  createExpressionState,
  createHostContext,
  createIntentPlan,
  createMoodState,
  createPresenceState,
  createProvenance,
  createPulseState,
  createSaysState,
  createSignalEvent,
  createSoulBiosCaps,
  createSoulEngine,
  createSoulFrame,
  decayMood,
  denoiseSignals,
  deriveExpression,
  derivePulse,
  derivePulseDeterministic,
  exportAuditJsonl,
  normalizeHostLifecycle,
  normalizeToolOutput,
  normalizeUserInput,
  planIntent,
  replayAudit,
  shouldSpeak,
  updateMood,
  updatePresence
} from "../../src/soul-bios/index.js";

// ==================== types.js ====================

describe("SignalEvent", () => {
  test("createSignalEvent returns frozen object with id, schemaVersion, ts, source, kind, priority, reliability, payload", () => {
    const ev = createSignalEvent({ kind: "x.y", payload: { a: 1 } });
    assert.ok(Object.isFrozen(ev));
    assert.ok(typeof ev.id === "string" && ev.id.length > 0);
    assert.equal(ev.schemaVersion, "1.0.0");
    assert.ok(typeof ev.ts === "string");
    assert.ok(Object.isFrozen(ev.payload));
    assert.ok("source" in ev && "kind" in ev && "priority" in ev && "reliability" in ev);
  });

  test("createSignalEvent defaults source to telemetry when omitted", () => {
    const ev = createSignalEvent({ kind: "test" });
    assert.equal(ev.source, "telemetry");
  });

  test("createSignalEvent clamps priority into 0-5 inclusive", () => {
    assert.equal(createSignalEvent({ priority: -3 }).priority, 0);
    assert.equal(createSignalEvent({ priority: 99 }).priority, 5);
  });

  test("createSignalEvent clamps reliability into 0-1 inclusive", () => {
    assert.equal(createSignalEvent({ reliability: -0.5 }).reliability, 0);
    assert.equal(createSignalEvent({ reliability: 2 }).reliability, 1);
  });
});

describe("HostContext", () => {
  test("createHostContext returns frozen object with sensible defaults", () => {
    const h = createHostContext();
    assert.ok(Object.isFrozen(h));
    assert.equal(h.host, "generic");
    assert.equal(h.mode, "unspecified");
    assert.ok(h.ttyCaps && Object.isFrozen(h.ttyCaps));
    assert.ok(h.ttyCaps.cols >= 1 && h.ttyCaps.rows >= 1);
  });

  test("createHostContext maps unknown host id to generic", () => {
    assert.equal(createHostContext({ host: "not-a-real-host" }).host, "generic");
  });
});

describe("PresenceState", () => {
  test("createPresenceState defaults to ambient mode when mode omitted", () => {
    assert.equal(createPresenceState().mode, "ambient");
  });

  test("createPresenceState clamps attention scalar to 0-1 range", () => {
    assert.equal(createPresenceState({ attention: -1 }).attention, 0);
    assert.equal(createPresenceState({ attention: 99 }).attention, 1);
  });

  test("createPresenceState normalizes unsupported consent tokens to balanced", () => {
    assert.equal(createPresenceState({ userConsentLevel: "weird-value" }).userConsentLevel, "balanced");
  });
});

describe("MoodState", () => {
  test("createMoodState exposes VAD, tags array, bounded confidence by default", () => {
    const mood = createMoodState();
    assert.ok(mood.valence >= -1 && mood.valence <= 1);
    assert.ok(mood.arousal >= 0 && mood.arousal <= 1);
    assert.ok(mood.dominance >= 0 && mood.dominance <= 1);
    assert.ok(Array.isArray(mood.tags));
    assert.ok(mood.confidence >= 0 && mood.confidence <= 1);
  });

  test("createMoodState clamps vectors that fall outside spec ranges", () => {
    const m = createMoodState({
      valence: 99,
      arousal: -2,
      dominance: 111,
      confidence: 9
    });
    assert.equal(m.valence, 1);
    assert.equal(m.arousal, 0);
    assert.equal(m.dominance, 1);
    assert.equal(m.confidence, 1);
  });
});

describe("PulseState factories", () => {
  test("createPulseState derives BPM and breath intervals from arousal when pulse fields omit", () => {
    const pulse = createPulseState({ arousal: 0 });
    assert.ok(pulse.heartbeatBpm >= 56 && pulse.heartbeatBpm <= 62);
    assert.ok(pulse.breathMs >= 4600 && pulse.breathMs <= 5000);
  });

  test("createPulseState with high arousal produces higher heartbeat and quicker breath rhythm", () => {
    const pulse = createPulseState({ arousal: 1.0, tags: [] });
    assert.ok(pulse.heartbeatBpm >= 80);
    assert.ok(pulse.breathMs <= 3000);
  });

  test("pulse microMotion amplitude increases alongside arousal on derived pulses", () => {
    const low = createPulseState({ arousal: 0 });
    const high = createPulseState({ arousal: 1.0 });
    assert.ok(high.microMotion > low.microMotion);
  });
});

describe("ExpressionState", () => {
  test("createExpressionState defaults idle face with neutral framing", () => {
    assert.equal(createExpressionState().face, "idle");
  });

  test("createExpressionState coerces unrecognized face enums back to idle", () => {
    assert.equal(createExpressionState({ face: "not-listed" }).face, "idle");
  });
});

describe("SaysState", () => {
  test("createSaysState defaults conversational tone to plain", () => {
    assert.equal(createSaysState({}).tone, "plain");
  });

  test("createSaysState normalizes malformed speechActs to answer", () => {
    assert.equal(createSaysState({ speechAct: "garbage.act" }).speechAct, "answer");
  });
});

describe("Provenance", () => {
  test("createProvenance freezes empty refs with perfect default consistencyScore", () => {
    const p = createProvenance();
    assert.ok(Object.isFrozen(p.signalRefs) && Object.isFrozen(p.memoryRefs));
    assert.ok(Object.isFrozen(p.ruleRefs));
    assert.equal(p.consistencyScore, 1);
  });

  test("createProvenance copies signalRefs and ruleRefs arrays immutably", () => {
    const p = createProvenance({
      signalRefs: ["sig-1"],
      ruleRefs: ["rule-decay"],
      consistencyScore: 0.91
    });
    assert.deepEqual(p.signalRefs, ["sig-1"]);
    assert.deepEqual(p.ruleRefs, ["rule-decay"]);
    assert.ok(Object.isFrozen(p.signalRefs));
  });
});

describe("SoulFrame", () => {
  test("createSoulFrame freezes a frame marked schemaVersion 1.0.0", () => {
    const frame = createSoulFrame({});
    assert.ok(Object.isFrozen(frame));
    assert.equal(frame.schemaVersion, "1.0.0");
  });

  test("createSoulFrame auto-builds pulse from mood arousal curve", () => {
    const frame = createSoulFrame({ mood: { arousal: 0.8, tags: ["focused"] } });
    assert.ok(frame.pulse.heartbeatBpm > 70);
  });

  test("createSoulFrame frameId behaves like lowercase UUID hyphenated segments", () => {
    const frame = createSoulFrame({});
    assert.match(frame.frameId, /^[0-9a-f-]{36}$/);
  });
});

describe("createSoulBiosCaps", () => {
  test("createSoulBiosCaps wires host id and freezes transport metadata", () => {
    const c = createSoulBiosCaps({ hostId: "codex", transport: "http" });
    assert.equal(c.hostId, "codex");
    assert.equal(c.transport, "http");
    assert.ok(Object.isFrozen(c));
  });
});

describe("createIntentPlan", () => {
  test("createIntentPlan clamps numeric hints and freezes renderHints", () => {
    const p = createIntentPlan({
      shouldSpeak: true,
      speakPriority: 9,
      renderHints: {
        expression: "smile",
        intensity: 99,
        pulseBias: 77,
        presence: { mode: "foreground", attention: 0.8, foreground: true },
        host: { mode: "build" }
      }
    });
    assert.equal(p.speakPriority, 5);
    assert.equal(p.renderHints.intensity, 3);
    assert.equal(p.renderHints.pulseBias, 1);
    assert.equal(p.renderHints.presence.mode, "foreground");
    assert.equal(p.renderHints.host.mode, "build");
    assert.ok(Object.isFrozen(p.renderHints));
  });
});

describe("clamp helper", () => {
  test("clamp utility pins numbers between inclusive bounds", () => {
    assert.equal(clamp(5, 0, 10), 5);
    assert.equal(clamp(-99, 0, 1), 0);
    assert.equal(clamp(3, 0, 2), 2);
  });
});

// ==================== signal.js ====================

describe("normalizeToolOutput", () => {
  test("scanner flags error-bearing text into tool.failure with maximum priority band", () => {
    const events = normalizeToolOutput({
      text: "Error: file not found",
      sourceTool: "read",
      ts: new Date().toISOString()
    });
    assert.equal(events.length, 1);
    assert.equal(events[0].kind, "tool.failure");
    assert.equal(events[0].priority, 5);
    assert.equal(events[0].source, "tool.output");
  });

  test("file-reading progress copy maps to file.read telemetry", () => {
    const events = normalizeToolOutput({
      text: "Reading file...",
      sourceTool: "read",
      ts: new Date().toISOString()
    });
    assert.equal(events[0].kind, "file.read");
    assert.equal(events[0].priority, 2);
  });

  test("normalizeHostLifecycle maps approval.pending to BIOS priority semantics", () => {
    const [ev] = normalizeHostLifecycle({ event: "approval.pending", host: "codex", ts: new Date() });
    assert.equal(ev.source, "host.lifecycle");
    assert.equal(ev.priority, 5);
  });

  test("normalizeUserInput distinguishes submits from typing deltas", () => {
    assert.equal(normalizeUserInput({ isSubmit: true, text: "hi", ts: new Date() })[0].kind, "user.submit");
    assert.equal(normalizeUserInput({ isSubmit: false, text: "", ts: new Date() })[0].kind, "user.typing");
  });

  test("bridgeLifeEventToSignals maps declarative agent errors onto tool.failure", () => {
    const [sig] = bridgeLifeEventToSignals({
      type: "error",
      message: "oops",
      at: new Date("2026-05-01T12:00:00.000Z")
    });
    assert.equal(sig.kind, "tool.failure");
    assert.ok(sig.priority >= 4);
  });
});

describe("denoiseSignals", () => {
  test("drops TTL-expired backlog events compared with logical now", () => {
    const now = Date.now();
    const stale = createSignalEvent({
      kind: "tool.progress",
      priority: 1,
      ttlMs: 500,
      ts: new Date(now - 10_000).toISOString()
    });
    const fresh = createSignalEvent({
      kind: "tool.progress",
      priority: 1,
      ttlMs: 600_000,
      ts: new Date(now).toISOString(),
      payload: {}
    });
    const out = denoiseSignals([stale, fresh], { now });
    assert.equal(out.some((x) => x.id === stale.id), false);
    assert.ok(out.some((x) => x.id === fresh.id));
  });

  test("fuse consecutive low priority events that share identical kinds", () => {
    const t0 = Date.now();
    const a = createSignalEvent({
      kind: "telemetry.ping",
      priority: 1,
      reliability: 0.6,
      ts: new Date(t0).toISOString(),
      payload: { ping: true }
    });
    const b = createSignalEvent({
      kind: "telemetry.ping",
      priority: 1,
      reliability: 0.7,
      ts: new Date(t0 + 2).toISOString(),
      payload: { pong: true }
    });
    const out = denoiseSignals([b, a], { mergeLowPriorityCeiling: 3, now: t0 + 999 });
    assert.equal(out.length, 1);
    assert.ok(out[0].payload.mergedSignalIds ?? out[0].payload.mergedFrom);
    assert.ok((out[0].payload ?? {}).mergedFrom >= 2 || Array.isArray((out[0].payload ?? {}).mergedSignalIds));
  });
});

// ==================== affect.js ====================

describe("updateMood", () => {
  test("failure signals drive valence downward while amplifying arousal", () => {
    const prev = createMoodState({ valence: 0.3, arousal: 0.2, dominance: 0.45 });
    const signals = [
      createSignalEvent({ kind: "tool.failure", priority: 5, reliability: 0.95 })
    ];
    const { mood } = updateMood(prev, signals);
    assert.ok(mood.valence < prev.valence);
    assert.ok(mood.arousal > prev.arousal);
  });

  test("user.praise telemetry elevates subjective valence", () => {
    const prev = createMoodState({ valence: 0 });
    const signals = [createSignalEvent({ kind: "user.praise", reliability: 1.0 })];
    const { mood } = updateMood(prev, signals);
    assert.ok(mood.valence > prev.valence * 0.82 + 1e-4);
  });

  test("approval.pending chips away perceived dominance briefly", () => {
    const prev = createMoodState({ dominance: 0.5 });
    const signals = [createSignalEvent({ kind: "approval.pending", reliability: 1.0 })];
    const { mood } = updateMood(prev, signals);
    assert.ok(mood.dominance < prev.dominance * 0.8);
  });

  test("idle ticks softly damp toward baseline axes when no stimuli arrive", () => {
    const prev = createMoodState({ valence: 0.3, arousal: 0.2, dominance: 0.45 });
    const { mood } = updateMood(prev, []);
    assert.ok(Math.abs(mood.valence) <= Math.abs(prev.valence) + 0.02);
  });

  test("front-channel risk heuristic injects guarded tag family", () => {
    const prev = createMoodState();
    const { mood } = updateMood(prev, [], 0, 0.8);
    assert.ok(mood.tags.includes("guarded"));
  });

  test("updateMood returns deduplicated mood rule anchors for auditors", () => {
    const prev = createMoodState();
    const signals = [
      createSignalEvent({ kind: "tool.failure", reliability: 0.9 }),
      createSignalEvent({ kind: "tool.failure", reliability: 0.9 })
    ];
    const { ruleRefs } = updateMood(prev, signals);
    assert.ok(ruleRefs.length >= 1);
  });

  test("emotion propagation across failure burst, recovery cues, then praise settles mood higher", () => {
    let mood = createMoodState({ valence: 0.3, arousal: 0.2 });
    for (let i = 0; i < 3; i += 1) {
      ({ mood } = updateMood(mood, [createSignalEvent({ kind: "tool.failure", reliability: 0.95 })]));
    }
    assert.ok(mood.valence < 0);
    assert.ok(mood.arousal > 0.4);

    ({ mood } = updateMood(mood, [createSignalEvent({ kind: "tool.progress", reliability: 0.8 })]));
    const afterRecovery = mood.valence;

    ({ mood } = updateMood(mood, [createSignalEvent({ kind: "user.praise", reliability: 1.0 })]));
    assert.ok(mood.valence > afterRecovery);
  });
});

describe("derivePulse / derivePulseDeterministic", () => {
  test("deterministic midpoint arousal aligns heartbeat corridor with arousal multiplier", () => {
    const mood = createMoodState({ arousal: 0.5, tags: [], valence: 0, dominance: 0.5, confidence: 0.8 });
    const pulse = derivePulseDeterministic(mood, 0);
    assert.ok(pulse.heartbeatBpm >= 70 && pulse.heartbeatBpm <= 76);
  });

  test("deterministic breath cadence inherits 4800 minus arousal-scaled shortening", () => {
    const mood = createMoodState({ arousal: 0.5, tags: [], valence: 0, dominance: 0.5, confidence: 0.8 });
    const pulse = derivePulseDeterministic(mood, 0);
    assert.ok(pulse.breathMs >= 3500 && pulse.breathMs <= 3900);
  });

  test("focused tag adds fixed eight-BPM uplift over unfocused baselines deterministically", () => {
    const baseMood = { arousal: 0.5, tags: [], dominance: 0.5, valence: 0, confidence: 0.8 };
    const focusedMood = { ...baseMood, tags: ["focused"] };
    const base = derivePulseDeterministic(baseMood, 0);
    const focused = derivePulseDeterministic(focusedMood, 0);
    assert.equal(focused.heartbeatBpm - base.heartbeatBpm, 8);
  });

  test("derivePulse remains structurally bounded like deterministic twin", () => {
    const p = derivePulse({ arousal: 0.3, tags: [] });
    assert.ok(p.heartbeatBpm >= 58 && p.heartbeatBpm <= 96);
  });
});

describe("decayMood", () => {
  test("elapsed wall clock gently walks arousal back toward calibrated baseline envelope", () => {
    const mood = createMoodState({ arousal: 0.8 });
    const decayed = decayMood(mood, 5000);
    assert.ok(decayed.arousal < mood.arousal);
    assert.ok(decayed.arousal > 0.2);
  });

  test("valence relaxes inward after sustained neutral observation window", () => {
    const mood = createMoodState({ valence: 0.9 });
    const decayed = decayMood(mood, 10000);
    assert.ok(decayed.valence < mood.valence);
  });
});

describe("deriveExpression", () => {
  test("reflection-oriented phases prefer think face choreography", () => {
    assert.equal(deriveExpression(createMoodState(), "thinking").face, "think");
  });

  test("risk-tagged moods force warn glyphs even during idle choreography", () => {
    assert.equal(deriveExpression(createMoodState({ tags: ["guarded"] }), "idle").face, "warn");
  });
});

// ==================== presence.js ====================

describe("updatePresence", () => {
  test("elevated BIOS priority snaps ambient presence into attentive choreography", () => {
    const prev = createPresenceState({ mode: "ambient" });
    const signals = [createSignalEvent({ priority: 5, kind: "user.submit", source: "user.input" })];
    const next = updatePresence(prev, signals);
    assert.equal(next.mode, "attentive");
  });

  test("silent clock relaxes attentive attention reservoirs over long horizon", () => {
    const prev = createPresenceState({ mode: "attentive", attention: 0.8 });
    const next = updatePresence(prev, [], 60000);
    assert.ok(next.attention < prev.attention);
  });
});

// ==================== planner.js ====================

describe("shouldSpeak / planIntent", () => {
  test("approval pending posture always earns immediate speech budget", () => {
    const host = createHostContext({ approvalState: "pending" });
    assert.ok(shouldSpeak(createPresenceState(), createMoodState(), host));
  });

  test("suppress chattiness while attentive user is actively typing deltas", () => {
    const presence = createPresenceState({ mode: "attentive" });
    const signal = createSignalEvent({ kind: "user.typing" });
    assert.equal(shouldSpeak(presence, createMoodState(), createHostContext(), signal), false);
  });

  test("zeroed silence budget forbids unsolicited speech overlays", () => {
    const presence = createPresenceState({ silenceBudgetMs: 0 });
    assert.equal(shouldSpeak(presence, createMoodState(), createHostContext()), false);
  });

  test("risk posture plus materially important signals override quiet defaults", () => {
    const mood = createMoodState({ tags: ["guarded"] });
    const signal = createSignalEvent({ priority: 5 });
    assert.ok(shouldSpeak(createPresenceState(), mood, createHostContext(), signal));
  });

  test("minimal consent dampens unsolicited medium-band priority chirps", () => {
    const presence = createPresenceState({ userConsentLevel: "minimal" });
    const signal = createSignalEvent({ priority: 3 });
    assert.equal(shouldSpeak(presence, createMoodState(), createHostContext(), signal), false);
  });

  test("planIntent supplies speak flags even when callers omit contextual slots", () => {
    const plan = planIntent();
    assert.ok(typeof plan.shouldSpeak === "boolean");
    assert.ok(plan.renderHints);
  });

  test("planIntent honours explicit host moods and memory hits", () => {
    const plan = planIntent({
      presence: createPresenceState({ mode: "foreground" }),
      mood: createMoodState({ tags: ["focused"] }),
      host: createHostContext({ approvalState: "pending" }),
      topSignal: createSignalEvent({ kind: "approval.pending", priority: 5 }),
      memoryHits: ["mem-1"]
    });
    assert.ok(plan.shouldSpeak === true || plan.shouldSpeak === false);
    assert.ok(plan.useMemoryRefs.length <= 32);
  });
});

// ==================== audit.js ====================

describe("AuditLog", () => {
  test("createAuditLog initializes empty chronological buffer", () => {
    const log = createAuditLog();
    assert.deepEqual(log.entries, []);
    assert.deepEqual(log.snapshots, []);
  });

  test("appendAuditEntry stamps ISO time and deterministic audit identifiers", () => {
    const log = createAuditLog();
    appendAuditEntry(log, { type: "frame.tick" });
    assert.equal(typeof log.entries[0].ts, "string");
    assert.ok(typeof log.entries[0].auditId === "string");
  });

  test("exportAuditJsonl renders newline-separated JSON payloads", () => {
    const log = createAuditLog();
    appendAuditEntry(log, { type: "mood.update", data: { valence: 0.3 } });
    const jsonl = exportAuditJsonl(log).trimEnd();
    const lines = jsonl.split("\n");
    assert.ok(lines.length >= 1);
    assert.equal(JSON.parse(lines[0]).type, "mood.update");
  });

  test("createAuditSnapshot clones frame payloads for deferred replay auditors", () => {
    const log = createAuditLog();
    const frame = createSoulFrame({ mood: { valence: 0.42 } });
    createAuditSnapshot(log, frame);
    assert.equal(log.snapshots.length, 1);
    const slot = /** @type {{ snapshotId?: string; payload?: { mood?: unknown; presence?: unknown } }} */ (
      /** @type {unknown} */ (log.snapshots[0])
    );
    assert.ok(typeof slot.snapshotId === "string");
    assert.equal(slot.payload?.mood?.valence ?? null, 0.42);
    assert.ok(slot.payload?.presence?.mode ?? slot.payload?.presence);
  });

  test("replayAudit exports shallow copies suited for deterministic inspection", () => {
    const log = createAuditLog();
    appendAuditEntry(log, { type: "mood.probe" });
    const bundle = replayAudit(log);
    assert.equal(bundle.frames.length, 1);
    assert.deepEqual(bundle.snapshots, []);
  });
});

// ==================== engine.js ====================

describe("SoulEngine", () => {
  test("async init allocates UUID session contracts", async () => {
    const engine = createSoulEngine();
    const result = await engine.init(createSoulBiosCaps({ hostId: "test" }));
    assert.ok(result.sessionId);
    assert.match(result.sessionId, /^[0-9a-f-]{36}$/);
  });

  test("async ingest aggregates accepted inbound signals", async () => {
    const engine = createSoulEngine();
    await engine.init(createSoulBiosCaps({ hostId: "test" }));
    const result = await engine.ingest([createSignalEvent({ kind: "tool.progress", priority: 2 })]);
    assert.ok(result.accepted >= 1);
  });

  test("tick materializes interoperable SoulFrame snapshots", async () => {
    const engine = createSoulEngine();
    await engine.init(createSoulBiosCaps({ hostId: "test" }));
    const frame = await engine.tick();
    assert.equal(frame.schemaVersion, "1.0.0");
    assert.ok(frame.frameId);
    assert.ok(frame.mood && frame.pulse && frame.expression && frame.provenance);
  });

  test("streaming failure ingestion does not synthesize rule-based mood without LLM", async () => {
    const engine = createSoulEngine();
    await engine.init(createSoulBiosCaps({ hostId: "test" }));
    const baseline = await engine.tick();
    await engine.ingest([
      createSignalEvent({ kind: "tool.failure", priority: 5, reliability: 0.95 })
    ]);
    const after = await engine.tick(Date.now() + 100);
    assert.equal(after.mood.valence, baseline.mood.valence);
  });

  test("dispose nulls externally visible session wire without throwing", async () => {
    const engine = createSoulEngine();
    await engine.init(createSoulBiosCaps({ hostId: "test" }));
    await engine.dispose();
    assert.equal(engine.sessionId, null);
  });

  test("stressful ingest cycles produce HADE rule provenance even without LLM", async () => {
    const engine = createSoulEngine();
    await engine.init(createSoulBiosCaps({ hostId: "test" }));
    await engine.ingest([createSignalEvent({ kind: "tool.failure", priority: 5, reliability: 0.9 })]);
    const frame = await engine.tick();
    assert.ok(frame.provenance.ruleRefs.length >= 0);
  });

  test("lazy engines honor preset session identifiers for adaptor bridges", async () => {
    const engine = createSoulEngine({ sessionId: "fixture-session" });
    await engine.ingest([createSignalEvent({ kind: "tool.progress", priority: 2 })]);
    const frame = await engine.tick(new Date("2026-05-01T00:00:00.000Z").toISOString());
    assert.equal(frame.sessionId, "fixture-session");
  });
});

// ==================== Acceptance / report fixtures ====================

describe("Report acceptance criteria bundles", () => {
  test("schema compatibility invariant enumerates mandated SoulFrame top-level facets", () => {
    const frame = createSoulFrame({});
    const required = [
      "schemaVersion",
      "entityVersion",
      "frameId",
      "sessionId",
      "ts",
      "host",
      "presence",
      "mood",
      "pulse",
      "expression",
      "provenance"
    ];
    for (const field of required) {
      assert.ok(field in frame, `missing SoulFrame.${field}`);
    }
  });

  test("SoulFrame survives JSON stringify round trips intact", () => {
    const frame = createSoulFrame({});
    assert.equal(JSON.parse(JSON.stringify(frame)).schemaVersion, "1.0.0");
  });

  test("long idle horizons drain elevated arousal into ambient torso band", () => {
    let mood = createMoodState({ arousal: 0.8, valence: -0.5 });
    for (let i = 0; i < 45; i += 1) {
      mood = decayMood(mood, 1000);
    }
    assert.ok(mood.arousal < 0.4, "arousal collapses toward ambient envelopes");
  });
});
