#!/usr/bin/env node
/**
 * node-pty ships a native `spawn-helper` that must be executable on Unix.
 * npm pack / some extractors drop the +x bit, which breaks macOS/Linux with
 * `posix_spawnp failed` or `EACCES`. This is a no-op on Windows.
 */
import { chmodSync, existsSync, readdirSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { createRequire } from "node:module";

if (process.platform === "win32") process.exit(0);

const require = createRequire(import.meta.url);
let rootDir;
try {
  rootDir = dirname(require.resolve("node-pty/package.json"));
} catch {
  process.exit(0);
}

function chmodIfHelper(path) {
  try {
    if (!existsSync(path)) return;
    const st = statSync(path);
    if (!st.isFile()) return;
    chmodSync(path, st.mode | 0o111);
  } catch {
    /* ignore */
  }
}

function walk(dir) {
  let entries;
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const ent of entries) {
    const p = join(dir, ent.name);
    if (ent.isDirectory()) walk(p);
    else if (ent.name === "spawn-helper") chmodIfHelper(p);
  }
}

walk(join(rootDir, "build"));
walk(join(rootDir, "prebuilds"));
