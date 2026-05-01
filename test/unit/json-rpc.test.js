import test from "node:test";
import assert from "node:assert/strict";
import { createErrorResponse, createLineJsonRpcHandler, dispatchJsonRpc, JsonRpcError } from "../../src/protocol/json-rpc.js";

test("dispatchJsonRpc invokes registered method", async () => {
  const result = await dispatchJsonRpc({ jsonrpc: "2.0", id: 1, method: "sum", params: [2, 3] }, {
    sum: async ([a, b]) => a + b
  });
  assert.equal(result, 5);
});

test("createErrorResponse normalizes JsonRpcError", () => {
  const response = createErrorResponse("x", new JsonRpcError(-32000, "bad"));
  assert.equal(response.error.code, -32000);
  assert.equal(response.error.message, "bad");
});

test("createLineJsonRpcHandler supports newline framed messages", async () => {
  const responses = [];
  const handle = createLineJsonRpcHandler({ ping: async () => "pong" }, (response) => responses.push(response));
  await handle(Buffer.from('{"jsonrpc":"2.0","id":7,"method":"ping"}\n'));
  assert.deepEqual(responses[0], { jsonrpc: "2.0", id: 7, result: "pong" });
});
