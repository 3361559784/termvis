import { join } from "node:path";

export function renderClaudePluginFiles(options = {}) {
  const defaults = defaultMcpRuntime();
  const command = options.command ?? defaults.command;
  const args = options.args ?? defaults.args;
  return [
    {
      path: ".claude-plugin/plugin.json",
      content: JSON.stringify({
        name: "termvis",
        version: "0.1.0",
        description: "Terminal visual rendering tools backed by chafa when available."
      }, null, 2)
    },
    {
      path: ".claude-plugin/.mcp.json",
      content: JSON.stringify({
        mcpServers: {
          termvis: {
            command,
            args,
            env: {
              TERMVIS_HOST: "claude-code"
            }
          }
        }
      }, null, 2)
    },
    {
      path: ".claude-plugin/skills/termvis/SKILL.md",
      content: [
        "# termvis",
        "",
        "Use the `termvis_probe`, `termvis_render_card`, `termvis_render_image`, `termvis_life_frame`, `termvis_soul_event`, and `termvis_soul_config` MCP tools when terminal-safe visual previews, living terminal state frames, companion narration, or runtime soul configuration are useful.",
        "Prefer symbolic chafa frames for the CLI persona and use text fallbacks only when the active terminal cannot display color graphics."
      ].join("\n")
    }
  ];
}

function defaultMcpRuntime() {
  const cwd = process.cwd();
  return {
    command: process.execPath,
    args: [join(cwd, "bin", "termvis.js"), "mcp"]
  };
}
