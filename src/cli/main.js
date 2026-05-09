import { readFileSync } from "node:fs";
import { runAdapterCommand } from "./commands.js";
import { runAvatar } from "./avatar.js";
import { runDoctor } from "./doctor.js";
import { runLife } from "./life.js";
import { runPersona } from "./persona.js";
import { runWrappedCommand } from "./run.js";
import { runRender } from "./render.js";
import { runSchema } from "./schema.js";
import { runSidecar } from "./sidecar.js";
import { runMcpServer } from "../mcp/server.js";
import { renderLayoutDemo } from "../core/layout.js";
import { runSetupWizard } from "./setup-wizard.js";
import { runSettingsPanel } from "./settings-panel.js";
import { runVerify } from "./verify.js";

const HELP = `termvis - terminal visual layer powered by chafa when available

Usage:
  termvis setup                   Interactive first-time configuration wizard
  termvis setting                 Interactive settings panel
  termvis settings                Alias for setting
  termvis verify [--json]         Verify config, LLM, and system readiness
  termvis --version               Print package version
  termvis doctor [--json]         Check system capabilities
  termvis life [options] -- <cmd> Living shell with soul dynamics
  termvis persona [options] -- <cmd>  Persona-aware shell wrapper
  termvis run -- <command>        Basic command wrapper
  termvis render <image> [--json] Render image to terminal
  termvis avatar <image> [opts]   Avatar image preview
  termvis sidecar [--socket]      Sidecar mode
  termvis mcp                     MCP server mode
  termvis adapter <host> [--json] Host integration adapters
  termvis schema [--compact]      JSON schema output
  termvis layout-demo             Layout demonstration

Life options:
  --avatar <image>        Custom avatar image file
  --avatar-fit <mode>     contain|cover|stretch
  --avatar-align <x,y>    Alignment (e.g. mid,mid)
  --avatar-scale <n|max>  Scale factor
  --state <state>         Initial state
  --reader|--plain        Plain trace: one-line soul status on stderr (no XML HUD)

API configuration:
  Set via 'termvis setup' or environment variables: 
  OPENAI_API_KEY, DEEPSEEK_API_KEY, ANTHROPIC_API_KEY, OLLAMA_BASE_URL,
  TERMVIS_CODEX_BIN, TERMVIS_CODEX_MODEL

Config: ~/.config/termvis/config.json
Docs:   docs/guides/quickstart.md
`;

export async function main(argv, io) {
  const [command, ...rest] = argv;

  if (!command || command === "-h" || command === "--help") {
    io.stdout.write(HELP);
    return;
  }

  if (command === "-v" || command === "--version" || command === "version") {
    io.stdout.write(`${readPackageVersion()}\n`);
    return;
  }

  switch (command) {
    case "doctor":
      await runDoctor(rest, io);
      return;
    case "life":
      await runLife(rest, io);
      return;
    case "persona":
      await runPersona(rest, io);
      return;
    case "run":
      await runWrappedCommand(rest, io);
      return;
    case "render":
      await runRender(rest, io);
      return;
    case "avatar":
      await runAvatar(rest, io);
      return;
    case "sidecar":
      await runSidecar(rest, io);
      return;
    case "mcp":
      await runMcpServer({ stdin: io.stdin, stdout: io.stdout, stderr: io.stderr, env: io.env, cwd: io.cwd });
      return;
    case "adapter":
      await runAdapterCommand(rest, io);
      return;
    case "schema":
      await runSchema(rest, io);
      return;
    case "layout-demo":
      io.stdout.write(`${renderLayoutDemo(io.stdout.columns || 80)}\n`);
      return;
    case "setup":
      await runSetupWizard(rest, io);
      return;
    case "setting":
    case "settings":
      await runSettingsPanel(rest, io);
      return;
    case "verify":
    case "check":
      await runVerify(rest, io);
      return;
    default:
      throw new Error(`Unknown command "${command}". Run "termvis --help".`);
  }
}

function readPackageVersion() {
  try {
    const pkg = JSON.parse(readFileSync(new URL("../../package.json", import.meta.url), "utf8"));
    return pkg.version || "0.0.0";
  } catch {
    return "0.0.0";
  }
}
