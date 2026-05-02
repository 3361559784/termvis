import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { cellWidth, stripAnsi } from "../../src/core/width.js";
import {
  appendSoulEvent,
  applyLifeEvent,
  applySoulEvent,
  createHostViewport,
  createSoulEventStore,
  createLifeSnapshot,
  createSoulState,
  deriveSoulEventFromLifeEvent,
  inferLifeEventFromChunk,
  getLifePulse,
  getSoulPulse,
  normalizeLifeState,
  readSoulEvents,
  renderLifeFrame,
  renderLivingFrame,
  renderLifeTuiPanel,
  renderSoulSaysStrip,
  renderSoulAltText,
  renderSoulReaderTraceLine,
  LifeTui,
  extractTerminalModePassthrough,
  terminalMouseEnableSequence,
  terminalModeResetSequence,
  transformHostOutputForTui,
  translateHostInputForTui
} from "../../src/life/index.js";

test("life state normalizes and infers host signals", () => {
  assert.equal(normalizeLifeState("acting"), "acting");
  assert.equal(normalizeLifeState("not-real"), "listening");

  assert.equal(inferLifeEventFromChunk("Thinking about the plan").state, "reasoning");
  assert.equal(inferLifeEventFromChunk("Do you want to allow this command?").state, "waiting");
  assert.equal(inferLifeEventFromChunk("npm test passed").state, "acting");
  assert.equal(inferLifeEventFromChunk("fatal error").state, "failed");
});

test("life snapshot separates real heart pulse from host event counts", () => {
  const first = createLifeSnapshot({ title: "Life", host: "codex" });
  const next = applyLifeEvent(first, {
    type: "host-output",
    state: "observing",
    message: "stream",
    output: "hello"
  });
  assert.equal(next.heartbeat, 0);
  assert.equal(next.heartBpm, 66);
  assert.equal(next.events, 1);
  assert.equal(next.outputBytes, 5);
  assert.match(next.lastDigest, /^[a-f0-9]{12}$/);

  const pulse = getLifePulse(next, new Date(new Date(next.startedAt).getTime() + 1000));
  assert.equal(pulse.bpm, 66);
  assert.ok(pulse.beat >= 1 && pulse.beat <= 2);
});

test("life frame composes state panel with symbolic avatar payload", async () => {
  const engine = {
    probeCapabilities: () => ({
      isTTY: true,
      termDumb: false,
      noColor: false,
      colorDepth: 24,
      cols: 64,
      rows: 24,
      pixelProtocol: "kitty",
      unicodeLevel: "unicode-wide"
    }),
    renderBlock: async (params) => {
      assert.equal(params.caps.pixelProtocol, "none");
      return { payload: "avatar-symbols\n" };
    }
  };
  const frame = await renderLifeFrame({
    engine,
    snapshot: createLifeSnapshot({ title: "Digital Soul", host: "gemini", state: "reasoning" }),
    width: 64,
    avatarWidth: 24,
    avatarHeight: 8
  });
  assert.match(frame, /Digital Soul/);
  assert.match(frame, /host\s+gemini/);
  assert.match(frame, /state reasoning/);
  assert.match(frame, /heart 72 bpm/);
  assert.match(frame, /avatar-symbols/);
});

test("living frame honors configured avatar and persona when CLI does not override", async () => {
  const renderCalls = [];
  const engine = {
    config: {
      life: {
        avatar: "configured-avatar.png",
        symbolic: true,
        strict: false,
        soul: {
          enabled: true,
          mode: "companion",
          reply: "configured soul says",
          persona: { id: "custom", name: "Configured Soul", language: "zh" }
        }
      }
    },
    probeCapabilities: () => ({
      isTTY: true,
      termDumb: false,
      noColor: false,
      colorDepth: 24,
      cols: 72,
      rows: 24,
      pixelProtocol: "kitty",
      unicodeLevel: "unicode-wide"
    }),
    renderBlock: async (params) => {
      renderCalls.push(params);
      return { payload: "configured-avatar\n" };
    }
  };

  const frame = await renderLivingFrame({
    engine,
    title: "Configured Life",
    host: "codex",
    state: "listening",
    width: 72,
    avatarWidth: 24,
    avatarHeight: 8
  });

  assert.equal(renderCalls[0].source.path, "configured-avatar.png");
  assert.match(frame, /Configured Life/);
  assert.match(frame, /configured-avatar/);
  assert.match(frame, /soul\s+Configured Soul/);
  assert.match(frame, /says configured soul says/);
});

test("life TUI panel keeps avatar and status in a fixed-size left rail", () => {
  const soul = createSoulState({
    mood: "thinking",
    presence: "focus",
    narration: "I am watching the terminal breathe.",
    persona: { name: "Mika", trustMode: "companion" }
  });
  const panel = renderLifeTuiPanel({
    snapshot: {
      ...createLifeSnapshot({ title: "Digital Soul", host: "codex", state: "acting", message: "editing files" }),
      soul
    },
    avatarPayload: "\u001b[?25lface-line-1\nface-line-2\u001b[?25h",
    width: 34,
    height: 16,
    avatarWidth: 18,
    terminalCols: 96,
    caps: { noColor: true }
  });

  assert.ok(panel.length <= 16);
  assert.deepEqual(panel.map((line) => cellWidth(line)), Array(panel.length).fill(34));
  assert.match(panel.join("\n"), /Digital Soul/);
  assert.match(panel.join("\n"), /Mika/);
  assert.match(panel.join("\n"), /mood\s+focused · v/);
  assert.match(panel.join("\n"), /presence\s+focus/);
  assert.match(panel.join("\n"), /I am watching/);
  assert.doesNotMatch(panel.join("\n"), /host\s+acting/);
  assert.match(panel.join("\n"), /face-line-1/);
  assert.doesNotMatch(panel.join("\n"), /\u001b\[\?25[hl]/);
});

test("life TUI panel preserves full avatar rows without filler status rows or blank gaps", () => {
  const soul = createSoulState({
    mood: "thinking",
    presence: "focus",
    narration: "awake beside the terminal stream",
    persona: { name: "Mika" }
  });
  const avatarPayload = Array.from({ length: 9 }, (_, index) => `face-line-${index + 1}`).join("\n");
  const panel = renderLifeTuiPanel({
    snapshot: {
      ...createLifeSnapshot({ title: "Digital Soul", host: "codex", state: "acting" }),
      soul
    },
    avatarPayload,
    width: 38,
    height: 24,
    avatarWidth: 18,
    avatarHeight: 9,
    terminalCols: 110,
    caps: { noColor: true }
  });

  assert.ok(panel.length <= 24);
  assert.deepEqual(panel.map((line) => cellWidth(line)), Array(panel.length).fill(38));
  assert.match(panel.join("\n"), /face-line-9/);
  assert.doesNotMatch(panel.join("\n"), /flow\s+(steady|watching|acting|reasoning|waiting|succeeded|failed)/);
  assert.doesNotMatch(panel.join("\n"), /call\s+/);
  assert.doesNotMatch(panel.join("\n"), /voice\s+/);
  assert.doesNotMatch(panel.join("\n"), /aura\s+/);
  assert.doesNotMatch(panel.join("\n"), /motion\s+/);

  let currentBlankRun = 0;
  let maxBlankRun = 0;
  for (const line of panel.slice(0, -1)) {
    const interior = stripAnsi(line).slice(1, -1).trim();
    if (!interior) currentBlankRun += 1;
    else currentBlankRun = 0;
    maxBlankRun = Math.max(maxBlankRun, currentBlankRun);
  }
  assert.ok(maxBlankRun <= 1, `expected no large blank gap, got run ${maxBlankRun}`);
});

test("life TUI panel pins footer and wraps reply without breaking words", () => {
  const soul = {
    ...createSoulState({
      mood: "curious shimmer",
      presence: "near the prompt",
      reply: "I stay quiet beside the host stream while it works.",
      persona: { name: "Mika" }
    }),
    events: 1,
    systemEvents: 2
  };
  const panel = renderLifeTuiPanel({
    snapshot: {
      ...createLifeSnapshot({ title: "SOTA Rail Check", host: "codex", state: "acting" }),
      outputBytes: 41,
      soul
    },
    avatarPayload: "face-line-1\nface-line-2\nface-line-3\nface-line-4",
    width: 36,
    height: 64,
    avatarWidth: 18,
    terminalCols: 100,
    caps: { noColor: true, colorDepth: 1 }
  });

  assert.ok(panel.length <= 64);
  assert.deepEqual(panel.map((line) => cellWidth(line)), Array(panel.length).fill(36));
  assert.match(panel.join("\n"), /41b/);
  assert.match(panel.join("\n"), /curious.*near the prompt/);
  assert.doesNotMatch(panel.join("\n"), /1 llm · 2 sys/);
  assert.match(panel.join("\n"), /I stay quiet beside the host/);
  assert.match(panel.join("\n"), /stream while it works\./);
  assert.doesNotMatch(panel.join("\n"), /besi\n.*de/);
});

test("life TUI renders explicit Soul Says text and localized rail labels", () => {
  const soul = {
    ...createSoulState({
      mood: "focused",
      presence: "foreground",
      reply: "I am visible in the Soul Says strip.",
      persona: { name: "Ling", language: "zh" }
    }),
    mood: {
      discrete: "focused",
      valence: 0.2,
      arousal: 0.45,
      dominance: 0.4,
      tags: ["focused"],
      heartbeatBpm: 72
    },
    llmStats: null
  };
  const panel = renderLifeTuiPanel({
    snapshot: {
      ...createLifeSnapshot({ title: "Localized", host: "codex", state: "acting" }),
      soul
    },
    avatarPayload: "face",
    width: 72,
    height: 28,
    avatarWidth: 20,
    terminalCols: 130,
    caps: { noColor: true, colorDepth: 1 },
    language: "zh"
  });
  const text = panel.join("\n");

  assert.match(text, /情绪/);
  assert.match(text, /灵魂说/);
  assert.match(text, /I am visible in the Soul Says strip/);
});

test("Soul Says strip wraps paragraphs and keeps archived speech visible", () => {
  const paragraph = "这是一段会留在底部的灵魂发言，会结合当前终端状态慢慢展开，而不是一闪而过。";
  const strip = renderSoulSaysStrip({
    action: "speak",
    state: "speaking",
    frame: {
      text: paragraph,
      visibility: "normal",
      intent: "mood_reflection",
      meta: { mood: "focused", pulseBpm: 72, pulseEvent: "steady", presenceMode: "ambient", stance: "observe" }
    }
  }, 42, undefined, { noColor: true, colorDepth: 1 }, "zh");
  const cleanStrip = strip.map(stripAnsi).join("\n");

  assert.ok(strip.length > 4);
  assert.match(cleanStrip, /灵魂说/);
  assert.match(cleanStrip, /这是一段会留在底部/);
  assert.match(cleanStrip, /不是一闪而过/);

  const soul = {
    ...createSoulState({ persona: { name: "Ling", language: "zh" } }),
    mood: { discrete: "focused", tags: ["focused"], valence: 0.2, arousal: 0.4, dominance: 0.5, heartbeatBpm: 72 },
    llmStats: null,
    v2Frame: {
      soulSays: {
        action: "silent",
        state: "cooling",
        history: [{
          text: paragraph,
          visibility: "normal",
          intent: "mood_reflection",
          meta: { mood: "focused", pulseBpm: 72, pulseEvent: "steady", presenceMode: "ambient", stance: "observe" }
        }]
      }
    }
  };
  const panel = renderLifeTuiPanel({
    snapshot: { ...createLifeSnapshot({ title: "Soul Says", host: "codex", state: "acting" }), soul },
    avatarPayload: "face",
    width: 54,
    height: 30,
    terminalCols: 130,
    caps: { noColor: true, colorDepth: 1 },
    language: "zh"
  });
  assert.match(panel.map(stripAnsi).join("\n"), /不是一闪而过/);
});

test("rich TUI compacts appraisal and pulse telemetry rows", () => {
  const soul = {
    ...createSoulState({ persona: { name: "Mika" } }),
    mood: { discrete: "focused", tags: ["focused"], valence: 0.2, arousal: 0.4, dominance: 0.5, heartbeatBpm: 72 },
    llmStats: null,
    v2Frame: {
      mood: { caap: { appraisal: { risk: 0.42, uncertainty: 0.24, goalProgress: 0.67 }, tendency: {} } },
      pulse: { bpm: 72, hrvMs: 61, stressLoad: 0.2, recoveryLoad: 0.3 },
      visual: {
        pulse: { eventName: "steady", beatWave: "▁▂▃▄", sympatheticPct: 34, parasympatheticPct: 66 },
        presence: { modeText: "ambient", stanceText: "observe", gazeText: "terminal", attentionPct: 20, proximityPct: 30, agencyPct: 40 }
      },
      soulSays: { action: "silent", state: "silent", history: [] }
    },
    v2Visual: {
      pulse: { eventName: "steady", beatWave: "▁▂▃▄", sympatheticPct: 34, parasympatheticPct: 66 },
      presence: { modeText: "ambient", stanceText: "observe", gazeText: "terminal", attentionPct: 20, proximityPct: 30, agencyPct: 40 }
    }
  };
  const panel = renderLifeTuiPanel({
    snapshot: { ...createLifeSnapshot({ title: "Metrics", host: "codex", state: "acting" }), soul },
    avatarPayload: "face",
    width: 64,
    height: 36,
    terminalCols: 140,
    caps: { noColor: true, colorDepth: 1 },
    language: "en"
  });
  const text = panel.map(stripAnsi).join("\n");

  assert.match(text, /risk:42%  unc:24%  prog:67%/);
  assert.match(text, /HRV:61ms  symp:34%  para:66%/);
});

test("life TUI uses alternate screen so the rail does not accumulate in scrollback", () => {
  const writes = [];
  const stdout = { columns: 80, rows: 18, write: (value) => writes.push(String(value)) };
  const tui = new LifeTui({
    io: { stdout },
    avatarPayload: "face",
    cols: 80,
    rows: 18,
    sideWidth: 32,
    hostLeft: 34,
    hostCols: 47,
    hostRows: 18,
    avatarWidth: 30,
    avatarHeight: 8,
    caps: { noColor: true }
  });
  const snapshot = {
    ...createLifeSnapshot({ title: "Digital Soul", host: "codex", state: "listening" }),
    soul: createSoulState({ persona: { name: "Mika" } })
  };

  tui.start(snapshot);
  tui.writeHost("hello");
  tui.stop(snapshot);

  const text = writes.join("");
  assert.match(text, /\u001b\[\?1049h/);
  assert.match(text, /\u001b\[\?1000h/);
  assert.match(text, /\u001b\[\?1006h/);
  assert.match(text, /\u001b\[\?1049l/);
});

test("life TUI forwards host input modes without forwarding host drawing modes", () => {
  const passthrough = extractTerminalModePassthrough(
    "\u001b[?1000;1006h\u001b[?2004h\u001b[?1049h\u001b[?25l\u001b=\u001b[>4;1m\u001b[>1u"
  );

  assert.match(passthrough, /\u001b\[\?1000;1006h/);
  assert.match(passthrough, /\u001b\[\?2004h/);
  assert.match(passthrough, /\u001b=/);
  assert.match(passthrough, /\u001b\[>4;1m/);
  assert.match(passthrough, /\u001b\[>1u/);
  assert.doesNotMatch(passthrough, /\?1049/);
  assert.doesNotMatch(passthrough, /\?25l/);
});

test("life TUI maps terminal mouse coordinates into the host viewport", () => {
  const inside = translateHostInputForTui("\u001b[<64;40;7M", {
    hostLeft: 34,
    hostCols: 47,
    hostRows: 18
  });
  const outside = translateHostInputForTui("\u001b[<64;12;7M", {
    hostLeft: 34,
    hostCols: 47,
    hostRows: 18
  });
  const x10 = translateHostInputForTui(Buffer.from([0x1b, 0x5b, 0x4d, 32, 40 + 32, 7 + 32]), {
    hostLeft: 34,
    hostCols: 47,
    hostRows: 18
  });

  assert.equal(inside, "\u001b[<64;7;7M");
  assert.equal(outside, "");
  assert.deepEqual([...x10], [0x1b, 0x5b, 0x4d, 32, 7 + 32, 7 + 32]);
});

test("life TUI consumes rail mouse wheel and forwards host wheel", () => {
  const stdout = { columns: 80, rows: 18, write: () => {} };
  const tui = new LifeTui({
    io: { stdout },
    avatarPayload: "face",
    cols: 80,
    rows: 18,
    sideWidth: 32,
    hostLeft: 34,
    hostCols: 47,
    hostRows: 18,
    avatarWidth: 30,
    avatarHeight: 8,
    caps: { noColor: true }
  });

  const rail = tui.translateInput("\u001b[<65;12;7M");
  const host = tui.translateInput("\u001b[<64;40;7M");

  assert.equal(rail, "");
  assert.equal(tui.railScrollOffset, 1);
  assert.equal(host, "\u001b[<64;7;7M");
});

test("life TUI cleanup resets terminal input modes", () => {
  assert.match(terminalMouseEnableSequence(), /\u001b\[\?1000h/);
  assert.match(terminalMouseEnableSequence(), /\u001b\[\?1006h/);
  const reset = terminalModeResetSequence();

  assert.match(reset, /\u001b\[\?1000l/);
  assert.match(reset, /\u001b\[\?1006l/);
  assert.match(reset, /\u001b\[\?2004l/);
  assert.match(reset, /\u001b>/);
  assert.match(reset, /\u001b\[\?25h/);
});

test("renderSoulReaderTraceLine is single-line plain summary for stderr traces", () => {
  const soul = createSoulState({
    mood: "focused",
    presence: "near the prompt",
    reply: "I will stay quiet beside the command stream.",
    persona: { name: "Mika" }
  });
  const snapshot = {
    ...createLifeSnapshot({ title: "Reader", host: "gemini", state: "reasoning" }),
    soul
  };
  const line = renderSoulReaderTraceLine(snapshot);
  assert.equal(line.includes("\n"), false);
  assert.match(line, /Soul Mika/);
  assert.match(line, /Host gemini is reasoning/);
});

test("soul alt text mirrors visual state for reader mode", () => {
  const soul = createSoulState({
    mood: "focused",
    presence: "near the prompt",
    reply: "I will stay quiet beside the command stream.",
    persona: { name: "Mika" }
  });
  const snapshot = {
    ...createLifeSnapshot({ title: "Reader", host: "gemini", state: "reasoning" }),
    soul
  };

  const text = renderSoulAltText(soul, snapshot);
  assert.match(text, /Soul Mika/);
  assert.match(text, /Host gemini is reasoning/);
  assert.match(text, /presence near the prompt/);
  assert.match(text, /Reply: I will stay quiet/);
});

test("soul events update mood and narration without changing host events", async () => {
  const cwd = await mkdtemp(join(tmpdir(), "termvis-soul-"));
  let soul = createSoulState({ sessionId: "unit-soul", mood: "calm", narration: "awake" });
  const store = await createSoulEventStore({ cwd, state: soul });

  await appendSoulEvent({
    cwd,
    sessionId: "unit-soul",
    event: {
      mood: "recovering",
      presence: "recover",
      narration: "I will keep the light steady.",
      source: "unit-llm"
    }
  });

  const result = await readSoulEvents({ cwd, sessionId: "unit-soul", offset: store.offset });
  assert.equal(result.events.length, 1);
  soul = applySoulEvent(soul, result.events[0]);
  assert.equal(soul.mood.discrete, "tired");
  assert.equal(soul.presence, "recover");
  assert.equal(soul.narration, "I will keep the light steady.");
  assert.equal(soul.events, 1);
  assert.ok(Math.abs(getSoulPulse(soul).bpm - soul.mood.heartbeatBpm) < 15);

  const text = await readFile(store.path, "utf8");
  assert.match(text, /unit-llm/);
});

test("LLM soul events can provide custom mood, presence, and parallel reply", () => {
  let soul = createSoulState({ mood: "calm", narration: "awake" });
  soul = applySoulEvent(soul, {
    mood: "curious shimmer",
    presence: "near the prompt",
    reply: "I am listening beside the command stream.",
    heartBpm: 73,
    source: "unit-llm"
  });

  assert.equal(soul.mood.discrete, "curious");
  assert.equal(soul.presence, "near the prompt");
  assert.equal(soul.reply, "I am listening beside the command stream.");
  assert.equal(soul.events, 1);
  assert.equal(getSoulPulse(soul).bpm, 73);
});

test("soul derives visual mood from life events without pretending to be host logic", () => {
  let soul = createSoulState({ mood: "calm" });
  soul = applySoulEvent(soul, deriveSoulEventFromLifeEvent({ type: "tool-call" }));
  assert.equal(soul.mood.discrete, "focused");
  assert.equal(soul.presence, "active");
  assert.equal(soul.events, 0);
  assert.equal(soul.systemEvents, 1);

  soul = applySoulEvent(soul, deriveSoulEventFromLifeEvent({ type: "error" }));
  assert.equal(soul.mood.discrete, "tired");
  assert.equal(soul.presence, "recover");
  assert.equal(soul.events, 0);
  assert.equal(soul.systemEvents, 2);
});

test("life TUI transforms host fullscreen control sequences into the host viewport", () => {
  const transformed = transformHostOutputForTui("\u001b[?1049h\u001b[2J\u001b[1;1Hhello\r\n\u001b[3;4Hworld", {
    hostLeft: 25,
    hostRows: 16,
    hostCols: 56,
    terminalCols: 80
  });

  assert.doesNotMatch(transformed, /\?1049/);
  assert.match(transformed, /\u001b\[1;25Hhello/);
  assert.match(transformed, /\u001b\[3;25H\s{3}world/);
  assert.doesNotMatch(transformed, /\u001b\[[0-9]+;1H(?:hello|world)/);
});

test("host viewport wraps and scrolls inside the right-side rail boundary", () => {
  const viewport = createHostViewport({ cols: 5, rows: 2 });
  viewport.write("abcde");
  viewport.write("fghij");
  let output = viewport.render({ hostLeft: 10, force: true });
  assert.match(output, /\u001b\[1;10Habcde/);
  assert.match(output, /\u001b\[2;10Hfghij/);
  assert.doesNotMatch(output, /\u001b\[[0-9]+;1H[abcdefghij]/);

  viewport.write("\r\nthree");
  output = viewport.render({ hostLeft: 10, force: true });
  assert.match(output, /\u001b\[1;10Hfghij/);
  assert.match(output, /\u001b\[2;10Hthree/);
  assert.doesNotMatch(output, /\n/);
});

test("host viewport keeps CJK and emoji cell widths aligned", () => {
  const viewport = createHostViewport({ cols: 6, rows: 2 });
  viewport.write("你好🙂ab");
  const output = viewport.render({ hostLeft: 7, force: true });
  assert.match(output, /\u001b\[1;7H你好🙂/);
  assert.match(output, /\u001b\[2;7Hab/);
});
