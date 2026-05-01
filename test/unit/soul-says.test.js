import test from "node:test";
import assert from "node:assert/strict";
import { createSoulSaysEngine, generateLLMCandidates } from "../../src/soul-says/index.js";
import { ScriptedLLMProvider } from "../support/scripted-llm.js";

const INPUT = Object.freeze({
  intent: "micro_status",
  mood: {
    mood: { primary: "focused" },
    core: { valence: 0.2, arousal: 0.5, dominance: 0.4 }
  },
  pulse: { bpm: 72, pulseEvent: "quickening" },
  presence: { mode: "ambient", stance: "observe" },
  host: { session: { taskPhase: "editing" } },
  memory: { working: { recentMoodPath: ["calm", "focused"] } },
  signals: [{ id: "sig1", kind: "tool-call" }],
  style: { language: "zh", warmth: 2, playfulness: 2 }
});

const RESPONSE = Object.freeze({
  candidates: [{
    text: "我看到工具流正在变密，先把线索收束住，别让终端的节奏把重点冲散。",
    intent: "micro_status",
    tone: "focused",
    shouldDisplay: true,
    intensity: 0.8,
    factualBasis: ["tool-call"]
  }]
});

test("Soul Says parses structured complete() candidates from the real provider contract", async () => {
  const llm = new ScriptedLLMProvider({
    responses: { soul_says_candidates: RESPONSE }
  });

  const candidates = await generateLLMCandidates(INPUT, llm);

  assert.equal(candidates.length, 1);
  assert.equal(candidates[0].text, RESPONSE.candidates[0].text);
  assert.equal(candidates[0].source, "llm");
  assert.equal(llm.callLog[0].kind, "complete");
  assert.equal(llm.callLog[0].schemaName, "soul_says_candidates");
});

test("Soul Says parses chat() text wrappers when complete() is unavailable", async () => {
  const llm = {
    available: true,
    chat: async () => ({ text: JSON.stringify(RESPONSE), runId: "chat-unit" })
  };

  const candidates = await generateLLMCandidates(INPUT, llm);

  assert.equal(candidates.length, 1);
  assert.equal(candidates[0].text, RESPONSE.candidates[0].text);
});

test("Soul Says speaks during user typing and busy host output without cooldown blocking", async () => {
  let call = 0;
  const llm = {
    available: true,
    complete: async () => {
      call += 1;
      return {
        data: {
          candidates: [{
            text: `交互信号已经进入视野，我会直接把当前终端状态说出来。#${call}`,
            intent: "tool_watch",
            tone: "focused",
            shouldDisplay: true,
            intensity: 0.8,
            factualBasis: ["user.typing", "host-output"]
          }]
        },
        runId: `says-${call}`
      };
    }
  };
  const engine = createSoulSaysEngine({ llm });
  const now = Date.now();
  const input = {
    ...INPUT,
    now,
    signals: [
      { id: "typing", kind: "user.typing", priority: 2, ts: now },
      { id: "host", kind: "host.output.final", priority: 4, ts: now }
    ],
    host: { session: { taskPhase: "responding" }, pressure: { stdoutRate: 1 }, tty: {} },
    presence: { mode: "ambient", stance: "observe", silenceBias: 1 },
    memory: { working: { recentSignalCount: 10 } }
  };

  const first = await engine.tick(input);
  const second = await engine.tick({ ...input, now: now + 10 });

  assert.equal(first.action, "speak");
  assert.equal(second.action, "speak");
  assert.equal(call, 2);
  assert.match(second.frame.text, /#2$/);
  assert.equal(engine.getHistory().length, 1);
});
