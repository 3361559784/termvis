import test from "node:test";
import assert from "node:assert/strict";
import { listHostIntegrations, normalizeHost, renderAllHostIntegrations, renderHostIntegration } from "../../src/adapters/index.js";

test("host integration registry normalizes aliases and keeps host coupling explicit", () => {
  assert.equal(normalizeHost("claude"), "claude-code");
  assert.equal(normalizeHost("gh-copilot"), "copilot");
  assert.equal(normalizeHost("gemini-cli"), "gemini");
  assert.equal(normalizeHost("codex"), "codex");
  assert.equal(normalizeHost("unknown"), null);
  assert.deepEqual(listHostIntegrations().map((item) => item.id), ["codex", "claude-code", "copilot", "gemini", "opencode"]);
});

test("host integration registry renders all adapter artifacts", () => {
  const all = renderAllHostIntegrations();
  assert.deepEqual(all.map((item) => item.host), ["codex", "claude-code", "copilot", "gemini", "opencode"]);
  assert.match(renderHostIntegration("codex").content, /mcp_servers\.termvis/);
  assert.match(renderHostIntegration("copilot").files[0].content, /"type": "local"/);
  assert.match(renderHostIntegration("gemini").files[0].content, /"mcpServers"/);
});
