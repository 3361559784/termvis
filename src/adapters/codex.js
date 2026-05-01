import { join } from "node:path";

export function renderCodexConfig(options = {}) {
  const defaults = defaultMcpRuntime();
  const command = options.command ?? defaults.command;
  const args = options.args ?? defaults.args;
  return [
    "# Add this to ~/.codex/config.toml or a project .codex/config.toml",
    "[mcp_servers.termvis]",
    `command = ${tomlString(command)}`,
    `args = [${args.map(tomlString).join(", ")}]`,
    "env = { TERMVIS_HOST = \"codex\" }"
  ].join("\n");
}

function tomlString(value) {
  return JSON.stringify(String(value));
}

function defaultMcpRuntime() {
  const cwd = process.cwd();
  return {
    command: process.execPath,
    args: [join(cwd, "bin", "termvis.js"), "mcp"]
  };
}
