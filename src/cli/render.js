import { stat } from "node:fs/promises";
import { createTermvisEngine } from "../application/termvis-engine.js";
import { hasFlag, readOption, withoutFlags } from "./args.js";

export async function runRender(argv, io) {
  const asJson = hasFlag(argv, "--json");
  const alt = readOption(argv, "--alt", "Image preview");
  const positional = withoutFlags(argv, new Map([
    ["--json", { takesValue: false }],
    ["--alt", { takesValue: true }]
  ]));
  const input = positional[0];
  if (!input) throw new Error("Usage: termvis render <image-file> [--alt <text>] [--json]");

  await stat(input);
  const engine = await createTermvisEngine({ cwd: io.cwd, env: io.env });
  const result = await engine.renderBlock({
    source: { type: "file", path: input },
    alt
  }, io);

  if (asJson) {
    io.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    return result;
  }

  io.stdout.write(result.payload || "");
  if (!String(result.payload || "").endsWith("\n")) io.stdout.write("\n");
  return result;
}
