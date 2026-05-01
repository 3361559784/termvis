import { join } from "node:path";

export function renderGeminiSettings(options = {}) {
  const defaults = defaultMcpRuntime();
  const command = options.command ?? defaults.command;
  const args = options.args ?? defaults.args;
  const cwd = options.cwd ?? defaults.cwd;
  return JSON.stringify({
    mcpServers: {
      termvis: {
        command,
        args,
        cwd,
        timeout: 30000,
        trust: false,
        includeTools: [
          "termvis_probe",
          "termvis_render_card",
          "termvis_render_image",
          "termvis_life_frame",
          "termvis_soul_event",
          "termvis_soul_config"
        ],
        env: {
          TERMVIS_HOST: "gemini"
        }
      }
    }
  }, null, 2);
}

export function renderGeminiExtensionFiles({ command = "node" } = {}) {
  return [
    {
      path: ".gemini/extensions/termvis/gemini-extension.json",
      content: JSON.stringify({
        name: "termvis",
        version: "0.1.0",
        mcpServers: {
          termvis: {
            command,
            args: ["${workspacePath}${/}bin${/}termvis.js", "mcp"],
            cwd: "${workspacePath}",
            timeout: 30000,
            includeTools: [
              "termvis_probe",
              "termvis_render_card",
              "termvis_render_image",
              "termvis_life_frame",
              "termvis_soul_event",
              "termvis_soul_config"
            ],
            env: {
              TERMVIS_HOST: "gemini"
            }
          }
        },
        contextFileName: "GEMINI.md"
      }, null, 2)
    },
    {
      path: ".gemini/extensions/termvis/GEMINI.md",
      content: [
        "# termvis",
        "",
        "Use the termvis MCP tools when terminal-safe visual previews, terminal capability probes, image-to-terminal rendering, living terminal state frames, soul events, or runtime soul configuration are useful.",
        "Prefer `termvis_probe` before assuming that the user's terminal supports color, Unicode, or pixel protocols.",
        "",
        "`termvis_soul_event` is observed by the soul cognition layer. Use `termvis_soul_config` for persona, speakingStyle, avatar, fit, align, and scale. Neither tool sends commands or text into the real CLI session."
      ].join("\n")
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
