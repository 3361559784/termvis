import test from "node:test";
import assert from "node:assert/strict";
import {
  createMoodFrame,
  normalizeMoodFrame,
  lerpMoodFrame,
  createCharacterProfile,
  createSoulResponse,
  createSoulState,
  applySoulEvent,
  getExpression,
  EXPRESSIONS,
  MOOD_PRESETS,
  SOUL_PHASES,
  resolveDiscreteMood,
  formatSoulMoodLabel,
  soulMoodToDisplayString,
  renderSoulAltText
} from "../../src/life/soul.js";

test("createMoodFrame returns frozen MoodFrame with all continuous+discrete fields", () => {
  const frame = createMoodFrame({ discrete: "calm" });
  assert.equal(frame.discrete, "calm");
  assert.equal(typeof frame.valence, "number");
  assert.equal(typeof frame.arousal, "number");
  assert.equal(typeof frame.dominance, "number");
  assert.equal(typeof frame.heartbeatBpm, "number");
  assert.equal(typeof frame.breathMs, "number");
  assert.ok(frame.valence >= -1 && frame.valence <= 1);
  assert.ok(frame.arousal >= 0 && frame.arousal <= 1);
  assert.ok(frame.dominance >= 0 && frame.dominance <= 1);
  assert.ok(frame.heartbeatBpm >= 40 && frame.heartbeatBpm <= 160);
  assert.ok(frame.breathMs >= 600);
  assert.ok(Object.isFrozen(frame));
});

test("MOOD_PRESETS match report specifications for each discrete mood", () => {
  assert.deepEqual(Object.keys(MOOD_PRESETS).sort(), ["calm", "curious", "delighted", "focused", "guarded", "tired"]);

  const calm = MOOD_PRESETS.calm;
  assert.equal(calm.discrete, "calm");
  assert.equal(calm.valence, 0.3);
  assert.equal(calm.arousal, 0.2);
  assert.equal(calm.breathMs, 4800);
  assert.ok(calm.bpmMin === 58 && calm.bpmMax === 66);

  const focused = MOOD_PRESETS.focused;
  assert.equal(focused.valence, 0.2);
  assert.equal(focused.arousal, 0.4);
  assert.equal(focused.breathMs, 3800);

  const guarded = MOOD_PRESETS.guarded;
  assert.equal(guarded.valence, -0.2);
  assert.equal(guarded.arousal, 0.6);
  assert.equal(guarded.breathMs, 3200);

  const delighted = MOOD_PRESETS.delighted;
  assert.equal(delighted.valence, 0.8);
  assert.equal(delighted.arousal, 0.6);
  assert.equal(delighted.breathMs, 3400);

  const tired = MOOD_PRESETS.tired;
  assert.equal(tired.valence, -0.1);
  assert.equal(tired.arousal, 0.15);
  assert.equal(tired.breathMs, 5200);
});

test("lerpMoodFrame enforces Δarousal ≤ 0.18 per step", () => {
  const from = createMoodFrame({ discrete: "calm" });
  const to = createMoodFrame({ discrete: "guarded" });
  const lerped = lerpMoodFrame(from, to, 1.0);
  const delta = Math.abs(lerped.arousal - from.arousal);
  assert.ok(delta <= 0.18 + 0.001, `Δarousal=${delta} exceeds 0.18`);
});

test("lerpMoodFrame produces intermediate values at t=0.5", () => {
  const from = createMoodFrame({ discrete: "calm" });
  const to = createMoodFrame({ discrete: "delighted" });
  const mid = lerpMoodFrame(from, to, 0.5);
  assert.ok(mid.valence > from.valence && mid.valence < to.valence);
  assert.ok(mid.heartbeatBpm >= from.heartbeatBpm);
});

test("createMoodFrame upgrades legacy mood strings via alias mapping", () => {
  const recovering = createMoodFrame({ discrete: "recovering" });
  assert.equal(recovering.discrete, "tired");

  const busy = createMoodFrame({ discrete: "busy" });
  assert.equal(busy.discrete, "focused");

  const celebrate = createMoodFrame({ discrete: "celebrate" });
  assert.equal(celebrate.discrete, "delighted");
});

test("SOUL_PHASES contains all report state machine phases", () => {
  assert.deepEqual(
    Object.keys(SOUL_PHASES).sort(),
    ["attentive", "dormant", "guarded", "idle", "reflecting", "speaking", "thinking"]
  );
});

test("createCharacterProfile produces complete CharacterProfile", () => {
  const profile = createCharacterProfile({
    name: "Mika",
    corePurpose: "companion",
    archetype: "warm-scout",
    traits: ["calm", "observant", "dry-humor"],
    boundaries: { romance: "forbid", persuasion: "warn", proactiveStart: "low" },
    speakingStyle: { brevity: 2, warmth: 3, metaphor: 1, emoji: 0 }
  });

  assert.equal(profile.name, "Mika");
  assert.equal(profile.corePurpose, "companion");
  assert.equal(profile.archetype, "warm-scout");
  assert.deepEqual(profile.traits, ["calm", "observant", "dry-humor"]);
  assert.equal(profile.boundaries.romance, "forbid");
  assert.equal(profile.boundaries.persuasion, "warn");
  assert.equal(profile.boundaries.proactiveStart, "low");
  assert.equal(profile.speakingStyle.brevity, 2);
  assert.equal(profile.speakingStyle.warmth, 3);
  assert.equal(profile.speakingStyle.emoji, 0);
  assert.ok(Object.isFrozen(profile));
  assert.ok(Object.isFrozen(profile.boundaries));
  assert.ok(Object.isFrozen(profile.speakingStyle));
});

test("createCharacterProfile normalizes invalid corePurpose/archetype to defaults", () => {
  const p = createCharacterProfile({ corePurpose: "invalid", archetype: "bad" });
  assert.equal(p.corePurpose, "hybrid");
  assert.equal(p.archetype, "quiet-oracle");
});

test("createCharacterProfile infers from legacy persona fields", () => {
  const p = createCharacterProfile({
    role: "coding assistant",
    style: "warm, gentle",
    boundary: "visual only"
  });
  assert.equal(p.corePurpose, "coding-assistant");
  assert.equal(p.archetype, "warm-scout");
  assert.ok(p.traits.includes("warm"));
});

test("createSoulResponse produces structured output with all required fields", () => {
  const response = createSoulResponse({
    speech: { main: "Test failed due to snapshot mismatch.", aside: "hmm", tone: "guarded" },
    mood: { discrete: "focused", valence: 0.2, arousal: 0.4, dominance: 0.55, heartbeatBpm: 71, breathMs: 3800 },
    renderHints: { expression: "think", intensity: 2, showHeartbeat: true },
    safety: { requiresConsent: false, risk: "low" }
  });

  assert.equal(response.speech.main, "Test failed due to snapshot mismatch.");
  assert.equal(response.speech.aside, "hmm");
  assert.equal(response.speech.tone, "guarded");
  assert.equal(response.mood.discrete, "focused");
  assert.equal(response.mood.valence, 0.2);
  assert.equal(response.renderHints.expression, "thinking");
  assert.equal(response.renderHints.intensity, 2);
  assert.equal(response.safety.requiresConsent, false);
  assert.equal(response.safety.risk, "low");
  assert.ok(Object.isFrozen(response));
});

test("EXPRESSIONS contains all report-specified ASCII face sequences", () => {
  assert.equal(EXPRESSIONS.idle, "( •‿• )");
  assert.equal(EXPRESSIONS.blink, "( -‿- )");
  assert.equal(EXPRESSIONS.thinking, "( •_• ) …");
  assert.equal(EXPRESSIONS.speaking, "( •◡• ) >");
  assert.equal(EXPRESSIONS.warm, "( ◕‿◕ )");
  assert.equal(EXPRESSIONS.guarded, "( •_• ) !");
  assert.equal(EXPRESSIONS.sleepy, "( -_- )");
});

test("getExpression maps discrete moods to correct expression faces", () => {
  assert.equal(getExpression("idle"), EXPRESSIONS.idle);
  assert.equal(getExpression("thinking"), EXPRESSIONS.thinking);
  assert.equal(getExpression("guarded"), EXPRESSIONS.guarded);
  assert.equal(getExpression({ discrete: "calm" }), EXPRESSIONS.idle);
  assert.equal(getExpression({ discrete: "focused" }), EXPRESSIONS.thinking);
  assert.equal(getExpression({ discrete: "delighted" }), EXPRESSIONS.warm);
  assert.equal(getExpression({ discrete: "tired" }), EXPRESSIONS.sleepy);
  assert.equal(getExpression("idle", { blink: true }), EXPRESSIONS.blink);
});

test("createSoulState produces MoodFrame for mood and CharacterProfile for persona", () => {
  const state = createSoulState({
    mood: "focused",
    persona: { name: "Mika", traits: ["calm"] }
  });
  assert.equal(typeof state.mood, "object");
  assert.equal(state.mood.discrete, "focused");
  assert.equal(typeof state.mood.valence, "number");
  assert.equal(typeof state.mood.breathMs, "number");
  assert.equal(state.persona.name, "Mika");
  assert.ok(Array.isArray(state.persona.traits));
  assert.equal(typeof state.persona.corePurpose, "string");
  assert.equal(typeof state.persona.archetype, "string");
  assert.ok(state.soulPhase);
  assert.ok(state.renderHints);
});

test("applySoulEvent uses lerp for smooth mood transitions", () => {
  let state = createSoulState({ mood: "calm" });
  const before = state.mood.arousal;
  state = applySoulEvent(state, { mood: "guarded", source: "system-state" });
  const delta = Math.abs(state.mood.arousal - before);
  assert.ok(delta <= 0.18 + 0.001, `Smooth transition violated: Δarousal=${delta}`);
});

test("resolveDiscreteMood handles both string and MoodFrame input", () => {
  assert.equal(resolveDiscreteMood("calm"), "calm");
  assert.equal(resolveDiscreteMood("recovering"), "tired");
  assert.equal(resolveDiscreteMood({ discrete: "focused" }), "focused");
});

test("formatSoulMoodLabel extracts discrete label from MoodFrame state", () => {
  const state = createSoulState({ mood: "delighted" });
  assert.equal(formatSoulMoodLabel(state), "delighted");
});

test("soulMoodToDisplayString renders compact mood summary", () => {
  const state = createSoulState({ mood: "focused" });
  const display = soulMoodToDisplayString(state);
  assert.match(display, /focused/);
  assert.match(display, /v0\.\d+/);
});

test("renderSoulAltText produces structured XML and plain summary per report template", () => {
  const soul = createSoulState({
    mood: "focused",
    presence: "active",
    reply: "Analyzing test failure.",
    persona: { name: "Mika" }
  });
  const snapshot = {
    ...{ title: "test", host: "codex", state: "reasoning" },
    soul
  };
  const text = renderSoulAltText(soul, snapshot);

  assert.match(text, /<soul persona="Mika"/);
  assert.match(text, /<pulse bpm="/);
  assert.match(text, /breathingMs="/);
  assert.match(text, /<mood valence=".*" arousal=".*" dominance=".*" discrete="focused"/);
  assert.match(text, /<host name="codex" state="reasoning"/);
  assert.match(text, /<speech tone="plain">Analyzing test failure\.<\/speech>/);
  assert.match(text, /<\/soul>/);

  assert.match(text, /Plain: Soul Mika/);
  assert.match(text, /heartbeat \d+ bpm/);
  assert.match(text, /breath \d+ ms/);
});
