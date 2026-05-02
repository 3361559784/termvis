import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import assert from "node:assert/strict";

const fixtureDir = join(dirname(fileURLToPath(import.meta.url)), "..", "fixtures", "workspace-mcp");

test("workspace Copilot MCP config exposes termvis tools", async () => {
  const config = JSON.parse(await readFile(join(fixtureDir, "mcp.json"), "utf8"));
  assert.equal(config.mcpServers.termvis.command, "termvis");
  assert.deepEqual(config.mcpServers.termvis.args, ["mcp"]);
  assert.equal(config.mcpServers.termvis.cwd, undefined);
  assert.deepEqual(config.mcpServers.termvis.tools, [
    "termvis_probe",
    "termvis_render_card",
    "termvis_render_image",
    "termvis_life_frame",
    "termvis_soul_event",
    "termvis_soul_config"
  ]);
});

test("workspace Gemini settings exposes termvis MCP server", async () => {
  const config = JSON.parse(await readFile(join(fixtureDir, "gemini-settings.json"), "utf8"));
  assert.equal(config.mcpServers.termvis.command, "termvis");
  assert.deepEqual(config.mcpServers.termvis.args, ["mcp"]);
  assert.equal(config.mcpServers.termvis.cwd, undefined);
  assert.deepEqual(config.mcpServers.termvis.includeTools, [
    "termvis_probe",
    "termvis_render_card",
    "termvis_render_image",
    "termvis_life_frame",
    "termvis_soul_event",
    "termvis_soul_config"
  ]);
});

test("Gemini extension exposes termvis MCP server and context", async () => {
  const extension = JSON.parse(await readFile(join(fixtureDir, "gemini-extension.json"), "utf8"));
  assert.equal(extension.name, "termvis");
  assert.equal(extension.contextFileName, "GEMINI.md");
  assert.equal(extension.mcpServers.termvis.cwd, "${workspacePath}");
  assert.deepEqual(extension.mcpServers.termvis.args, [
    "${workspacePath}${/}bin${/}termvis.js",
    "mcp"
  ]);
  assert.deepEqual(extension.mcpServers.termvis.includeTools, [
    "termvis_probe",
    "termvis_render_card",
    "termvis_render_image",
    "termvis_life_frame",
    "termvis_soul_event",
    "termvis_soul_config"
  ]);

  const context = await readFile(join(fixtureDir, "GEMINI.md"), "utf8");
  assert.match(context, /termvis MCP tools/);
  assert.match(context, /termvis_soul_event/);
  assert.match(context, /termvis_soul_config/);
});
