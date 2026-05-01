import { readOption } from "./args.js";
import { createDefaultSocketPath, startSidecarServer } from "../sidecar/server.js";

export async function runSidecar(argv, io) {
  const socketPath = readOption(argv, "--socket", createDefaultSocketPath(io.env));
  const server = await startSidecarServer({ socketPath, env: io.env, cwd: io.cwd });
  io.stdout.write(`termvis sidecar listening on ${server.socketPath}\n`);
  await new Promise((resolve) => {
    const shutdown = () => {
      server.close().finally(resolve);
    };
    process.once("SIGINT", shutdown);
    process.once("SIGTERM", shutdown);
  });
}
