#!/usr/bin/env node
import { injectSecretsIntoEnv } from "../src/core/config.js";
import { main } from "../src/cli/main.js";

injectSecretsIntoEnv(process.env);

main(process.argv.slice(2), {
  stdin: process.stdin,
  stdout: process.stdout,
  stderr: process.stderr,
  env: process.env,
  cwd: process.cwd()
}).catch((error) => {
  process.stderr.write(`${error?.stack || error?.message || String(error)}\n`);
  process.exitCode = 1;
});
