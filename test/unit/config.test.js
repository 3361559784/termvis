import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import assert from "node:assert/strict";
import { loadConfig, mergeConfig, parseJsonc } from "../../src/core/config.js";

test("parseJsonc strips line and block comments without touching strings", () => {
  const parsed = parseJsonc(`{
    // comment
    "url": "https://example.test/a//b",
    /* block */
    "render": { "backend": "disabled" }
  }`);
  assert.equal(parsed.url, "https://example.test/a//b");
  assert.equal(parsed.render.backend, "disabled");
});

test("mergeConfig recursively merges plain objects", () => {
  assert.deepEqual(mergeConfig({ a: { b: 1, c: 2 } }, { a: { c: 3 } }), { a: { b: 1, c: 3 } });
});

test("loadConfig finds termvis.config.jsonc up the directory tree", async () => {
  const root = await mkdtemp(join(tmpdir(), "termvis-config-"));
  const child = join(root, "child");
  await writeFile(join(root, "termvis.config.jsonc"), `{ "render": { "backend": "disabled" } }`);
  await import("node:fs/promises").then((fs) => fs.mkdir(child));
  const loaded = await loadConfig({ cwd: child });
  assert.equal(loaded.value.render.backend, "disabled");
  assert.equal(loaded.defaults, false);
});
