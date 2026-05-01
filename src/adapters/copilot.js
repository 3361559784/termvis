import { join } from "node:path";

export function renderCopilotMcpConfig(options = {}) {
  const defaults = defaultMcpRuntime();
  const command = options.command ?? defaults.command;
  const args = options.args ?? defaults.args;
  const cwd = options.cwd ?? defaults.cwd;
  return JSON.stringify({
    mcpServers: {
      termvis: {
        type: "local",
        command,
        args,
        cwd,
        env: {
          TERMVIS_HOST: "copilot"
        },
        tools: [
          "termvis_probe",
          "termvis_render_card",
          "termvis_render_image",
          "termvis_life_frame",
          "termvis_soul_event",
          "termvis_soul_config"
        ],
        timeout: 30000
      }
    }
  }, null, 2);
}

export function renderCopilotWorkspaceFiles() {
  const content = renderCopilotMcpConfig();
  return [
    {
      path: ".copilot/termvis-mcp-config.json",
      content
    },
    {
      path: ".mcp.json",
      content
    }
  ];
}

function defaultMcpRuntime() {
  const cwd = process.cwd();
  return {
    command: process.execPath,
    args: [join(cwd, "bin", "termvis.js"), "mcp"],
    cwd
  };
}
