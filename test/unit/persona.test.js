import test from "node:test";
import assert from "node:assert/strict";
import { normalizePersonaState, renderPersonaFrame } from "../../src/persona/persona-shell.js";

test("persona state normalization falls back to idle", () => {
  assert.equal(normalizePersonaState("thinking"), "thinking");
  assert.equal(normalizePersonaState("unknown"), "idle");
  assert.equal(normalizePersonaState(), "idle");
});

test("persona frame combines status and rendered avatar payload", async () => {
  const calls = [];
  const engine = {
    probeCapabilities: () => ({
      isTTY: true,
      termDumb: false,
      noColor: false,
      colorDepth: 24,
      hasColors: true,
      cols: 60,
      rows: 24,
      pixelProtocol: "none",
      unicodeLevel: "unicode-wide"
    }),
    renderBlock: async (params) => {
      calls.push(params);
      return { payload: `avatar ${params.caps.cols}x${params.caps.rows}\n`, mode: "symbols-truecolor" };
    }
  };

  const frame = await renderPersonaFrame({
    engine,
    avatar: "avatar.svg",
    title: "Cute CLI",
    state: "thinking",
    message: "composing a response",
    width: 60,
    avatarHeight: 9,
    command: "copilot"
  });

  assert.match(frame, /Cute CLI/);
  assert.match(frame, /state: thinking/);
  assert.match(frame, /mood: composing a response/);
  assert.match(frame, /host: copilot/);
  assert.match(frame, /avatar 25x9/);
  assert.equal(calls[0].source.path, "avatar.svg");
});
