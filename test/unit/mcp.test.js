import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { PassThrough, Writable } from "node:stream";
import { handleMcpMessage, runMcpServer } from "../../src/mcp/server.js";

test("MCP initialize returns server info and tool capability", async () => {
  const response = await handleMcpMessage({ jsonrpc: "2.0", id: 1, method: "initialize", params: {} });
  assert.equal(response.result.serverInfo.name, "termvis");
  assert.deepEqual(response.result.capabilities, { tools: {} });
});

test("MCP tools/list exposes probe, card, image, and life tools", async () => {
  const response = await handleMcpMessage({ jsonrpc: "2.0", id: 2, method: "tools/list" });
  assert.deepEqual(response.result.tools.map((tool) => tool.name), [
    "termvis_probe",
    "termvis_render_card",
    "termvis_render_image",
    "termvis_life_frame",
    "termvis_soul_event",
    "termvis_soul_config",
    "termvis_signal_ingest",
    "termvis_soul_tick"
  ]);
});

test("MCP ping returns an empty success result for client health checks", async () => {
  const response = await handleMcpMessage({ jsonrpc: "2.0", id: 20, method: "ping" });
  assert.deepEqual(response, { jsonrpc: "2.0", id: 20, result: {} });
});

test("MCP termvis_render_card returns text content", async () => {
  const response = await handleMcpMessage({
    jsonrpc: "2.0",
    id: 3,
    method: "tools/call",
    params: { name: "termvis_render_card", arguments: { title: "T", body: "B", width: 12 } }
  });
  assert.match(response.result.content[0].text, /T/);
  assert.match(response.result.content[0].text, /B/);
});

test("MCP termvis_life_frame returns living terminal frame", async () => {
  const response = await handleMcpMessage({
    jsonrpc: "2.0",
    id: 4,
    method: "tools/call",
    params: { name: "termvis_life_frame", arguments: { title: "Life", host: "codex", state: "reasoning" } }
  });
  assert.match(response.result.content[0].text, /Life/);
  assert.match(response.result.content[0].text, /host\s+codex/);
  assert.match(response.result.content[0].text, /state reasoning/);
});

test("MCP termvis_soul_event appends cognition-observed soul events", async () => {
  const cwd = await mkdtemp(join(tmpdir(), "termvis-soul-mcp-"));
  const response = await handleMcpMessage({
    jsonrpc: "2.0",
    id: 5,
    method: "tools/call",
    params: {
      name: "termvis_soul_event",
      arguments: {
        sessionId: "unit-session",
        mood: "recovering",
        presence: "recover",
        narration: "I will stay visible while the host recovers.",
        source: "unit-llm"
      }
    }
  }, { cwd, env: { TERMVIS_HOST: "unit" } });

  const result = JSON.parse(response.result.content[0].text);
  assert.equal(result.ok, true);
  assert.equal(result.sessionId, "unit-session");
  const text = await readFile(join(cwd, ".termvis", "soul-events", "unit-session.jsonl"), "utf8");
  assert.match(text, /"mood":"tired"/);
  assert.match(text, /unit-llm/);
});

test("MCP termvis_soul_config appends runtime soul configuration", async () => {
  const cwd = await mkdtemp(join(tmpdir(), "termvis-soul-config-mcp-"));
  const response = await handleMcpMessage({
    jsonrpc: "2.0",
    id: 50,
    method: "tools/call",
    params: {
      name: "termvis_soul_config",
      arguments: {
        sessionId: "unit-session",
        persona: { name: "Noa", speakingStyle: { brevity: 3, warmth: 1 } },
        avatar: "examples/avatar-soft.svg",
        avatarFit: "cover",
        avatarAlign: "top,left",
        avatarScale: "max"
      }
    }
  }, { cwd, env: { TERMVIS_HOST: "unit" } });

  const result = JSON.parse(response.result.content[0].text);
  assert.equal(result.ok, true);
  assert.equal(result.event.type, "soul.config");
  assert.equal(result.event.persona.name, "Noa");
  assert.equal(result.event.avatarFit, "cover");
});

test("MCP stdio server stays alive long enough to answer initialize", async () => {
  const stdin = new PassThrough();
  const stdout = collectableWritable();
  const stderr = collectableWritable();
  const server = runMcpServer({ stdin, stdout, stderr, env: { ...process.env } });

  writeMcpFrame(stdin, {
    jsonrpc: "2.0",
    id: 10,
    method: "initialize",
    params: { protocolVersion: "2024-11-05", capabilities: {}, clientInfo: { name: "unit", version: "0" } }
  });

  await waitFor(() => stdout.text.includes("Content-Length:"));
  stdin.end();
  await server;

  const response = readFirstMcpFrame(stdout.text);
  assert.equal(response.id, 10);
  assert.equal(response.result.serverInfo.name, "termvis");
  assert.equal(stderr.text, "");
});

test("MCP stdio server accepts newline-delimited JSON clients", async () => {
  const stdin = new PassThrough();
  const stdout = collectableWritable();
  const stderr = collectableWritable();
  const server = runMcpServer({ stdin, stdout, stderr, env: { ...process.env } });

  stdin.write(`${JSON.stringify({
    jsonrpc: "2.0",
    id: 11,
    method: "initialize",
    params: { protocolVersion: "2024-11-05", capabilities: {}, clientInfo: { name: "line-client", version: "0" } }
  })}\n`);

  await waitFor(() => stdout.text.includes("\n"));
  stdin.end();
  await server;

  const response = JSON.parse(stdout.text.trim().split("\n")[0]);
  assert.equal(response.id, 11);
  assert.equal(response.result.serverInfo.name, "termvis");
  assert.equal(stderr.text, "");
});

function writeMcpFrame(stream, message) {
  const body = Buffer.from(JSON.stringify(message), "utf8");
  stream.write(`Content-Length: ${body.length}\r\n\r\n`);
  stream.write(body);
}

function readFirstMcpFrame(text) {
  const separator = text.indexOf("\r\n\r\n");
  assert.ok(separator > -1, "MCP response must include header separator");
  const header = text.slice(0, separator);
  const match = /content-length:\s*(\d+)/i.exec(header);
  assert.ok(match, "MCP response must include Content-Length");
  const start = separator + 4;
  const length = Number(match[1]);
  return JSON.parse(text.slice(start, start + length));
}

function collectableWritable() {
  const chunks = [];
  const stream = new Writable({
    write(chunk, _encoding, callback) {
      chunks.push(Buffer.from(chunk));
      callback();
    }
  });
  Object.defineProperty(stream, "text", {
    get() {
      return Buffer.concat(chunks).toString("utf8");
    }
  });
  return stream;
}

async function waitFor(predicate, timeoutMs = 1000) {
  const started = Date.now();
  while (!predicate()) {
    if (Date.now() - started > timeoutMs) throw new Error("Timed out waiting for MCP response");
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
}
