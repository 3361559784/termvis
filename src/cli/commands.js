import { listHostIntegrations, renderAllHostIntegrations, renderHostIntegration } from "../adapters/index.js";

const ADAPTER_HELP = `Usage:
  termvis adapter list [--json]
  termvis adapter all [--json]
  termvis adapter <codex|claude|copilot|gemini|opencode> [--json]

Adapters only print host integration artifacts. They do not edit host configs
or launch AI CLIs, keeping the terminal soul layer externally low-coupled.
`;

export async function runAdapterCommand(argv, io) {
  const host = argv[0];
  const asJson = argv.includes("--json");
  if (host === "-h" || host === "--help") {
    io.stdout.write(ADAPTER_HELP);
    return { help: true };
  }
  if (!host || host === "list") {
    const payload = listHostIntegrations();
    if (asJson) io.stdout.write(`${JSON.stringify(payload, null, 2)}\n`);
    else io.stdout.write(`${payload.map((item) => `${item.id}\t${item.coupling}`).join("\n")}\n`);
    return payload;
  }

  const payload = host === "all" ? renderAllHostIntegrations() : createAdapterPayload(host);
  if (asJson) {
    io.stdout.write(`${JSON.stringify(payload, null, 2)}\n`);
    return payload;
  }

  if (Array.isArray(payload)) {
    for (const item of payload) writeAdapterPayload(item, io);
    return payload;
  }
  writeAdapterPayload(payload, io);
  return payload;
}

function writeAdapterPayload(payload, io) {
  if (payload.kind === "files") {
    for (const file of payload.files) {
      io.stdout.write(`--- ${file.path}\n${file.content}\n`);
    }
    return;
  }

  io.stdout.write(`${payload.content}\n`);
}

function createAdapterPayload(host) {
  return renderHostIntegration(host);
}
