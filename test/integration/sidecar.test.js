import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { createLineJsonRpcHandler } from "../../src/protocol/json-rpc.js";
import { createSidecarMethods } from "../../src/sidecar/server.js";

test("sidecar answers newline-framed JSON-RPC requests", async () => {
  const responses = [];
  const handle = createLineJsonRpcHandler(createSidecarMethods(), (response) => responses.push(response));
  await handle(Buffer.from('{"jsonrpc":"2.0","id":1,"method":"layoutCard","params":{"title":"A","body":"B","width":16}}\n'));
  assert.equal(responses[0].id, 1);
  assert.ok(Array.isArray(responses[0].result.lines));
  assert.match(responses[0].result.lines.join("\n"), /A/);
});

test("sidecar exposes soul control-plane methods with alt text", async () => {
  const cwd = await mkdtemp(join(tmpdir(), "termvis-sidecar-soul-"));
  const methods = createSidecarMethods({ cwd });
  const init = await methods["soul.init"]({
    mood: "curious shimmer",
    presence: "near the prompt",
    reply: "I am visible beside the host."
  });
  assert.ok(init.sessionId.startsWith("soul-"));

  const state = await methods["soul.getState"]({ sessionId: init.sessionId });
  assert.equal(state.state.mood.discrete, "curious");

  const tick = await methods["soul.renderTick"]({ sessionId: init.sessionId, width: 36, height: 12 });
  assert.match(tick.diff, /curious/);
  assert.match(tick.altText, /heartbeat/);
});
