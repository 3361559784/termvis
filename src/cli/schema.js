import { createConfigSchema } from "../core/schema.js";

export async function runSchema(argv, io) {
  const compact = argv.includes("--compact");
  io.stdout.write(`${JSON.stringify(createConfigSchema(), null, compact ? 0 : 2)}\n`);
}
