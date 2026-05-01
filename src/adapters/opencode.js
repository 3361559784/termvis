import { join } from "node:path";

export function renderOpenCodeConfig(options = {}) {
  const defaults = defaultMcpRuntime();
  const command = options.command ?? defaults.command;
  return JSON.stringify({
    mcp: {
      termvis: {
        type: "local",
        command,
        enabled: true,
        environment: {
          TERMVIS_HOST: "opencode"
        }
      }
    },
    tools: {
      termvis_probe: true,
      termvis_render_card: true,
      termvis_render_image: true,
      termvis_life_frame: true,
      termvis_soul_event: true,
      termvis_soul_config: true
    }
  }, null, 2);
}

function defaultMcpRuntime() {
  const cwd = process.cwd();
  return {
    command: [process.execPath, join(cwd, "bin", "termvis.js"), "mcp"]
  };
}
