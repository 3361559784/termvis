import { renderClaudePluginFiles } from "./claude-code.js";
import { renderCopilotWorkspaceFiles } from "./copilot.js";
import { renderCodexConfig } from "./codex.js";
import { renderGeminiExtensionFiles, renderGeminiSettings } from "./gemini.js";
import { renderOpenCodeConfig } from "./opencode.js";

const HOSTS = Object.freeze({
  codex: {
    id: "codex",
    label: "Codex",
    coupling: "mcp-stdio-config",
    artifacts: ["config.toml snippet"],
    render: () => ({ kind: "snippet", host: "codex", content: renderCodexConfig() })
  },
  "claude-code": {
    id: "claude-code",
    aliases: ["claude"],
    label: "Claude Code",
    coupling: "plugin-bundled-mcp",
    artifacts: ["plugin.json", ".mcp.json", "skill"],
    render: () => ({ kind: "files", host: "claude-code", files: renderClaudePluginFiles() })
  },
  copilot: {
    id: "copilot",
    aliases: ["github-copilot", "copilot-cli", "gh-copilot"],
    label: "GitHub Copilot CLI",
    coupling: "mcp-config-or-wrapper",
    artifacts: [".copilot/termvis-mcp-config.json", ".mcp.json", "termvis run wrapper"],
    render: () => ({ kind: "files", host: "copilot", files: renderCopilotWorkspaceFiles() })
  },
  gemini: {
    id: "gemini",
    aliases: ["gemini-cli", "google-gemini"],
    label: "Gemini CLI",
    coupling: "project-settings-mcp",
    artifacts: [".gemini/settings.json snippet", "Gemini extension files"],
    render: () => ({
      kind: "files",
      host: "gemini",
      files: [
        { path: ".gemini/settings.json", content: renderGeminiSettings() },
        ...renderGeminiExtensionFiles()
      ]
    })
  },
  opencode: {
    id: "opencode",
    label: "OpenCode",
    coupling: "jsonc-local-mcp",
    artifacts: ["opencode.jsonc snippet"],
    render: () => ({ kind: "snippet", host: "opencode", content: renderOpenCodeConfig() })
  }
});

export function listHostIntegrations() {
  return Object.values(HOSTS).map(({ render, ...host }) => host);
}

export function normalizeHost(host) {
  const wanted = String(host || "").toLowerCase();
  if (HOSTS[wanted]) return wanted;
  const found = Object.values(HOSTS).find((entry) => entry.aliases?.includes(wanted));
  return found?.id || null;
}

export function renderHostIntegration(host) {
  const id = normalizeHost(host);
  if (!id) throw new Error(`Unknown adapter "${host}".`);
  return HOSTS[id].render();
}

export function renderAllHostIntegrations() {
  return Object.keys(HOSTS).map((id) => renderHostIntegration(id));
}
