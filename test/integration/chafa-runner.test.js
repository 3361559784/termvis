import { chmod, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { delimiter, join } from "node:path";
import test from "node:test";
import assert from "node:assert/strict";
import { findChafa, renderVisual } from "../../src/render/chafa-runner.js";

async function installFakeChafaPath(dir, kind = "echo") {
  if (process.platform === "win32") {
    const jsPath = join(dir, "_termvis_fake_chafa.js");
    await writeFile(
      jsPath,
      kind === "hang"
        ? "setInterval(() => {}, 1 << 30);\n"
        : "console.log('FAKE_CHAFA', process.argv.slice(1).join(' '));\n",
      "utf8"
    );
    const cmdPath = join(dir, "chafa.cmd");
    await writeFile(cmdPath, `@echo off\r\nnode ${JSON.stringify(jsPath)} %*\r\n`, "utf8");
    return cmdPath;
  }
  const shPath = join(dir, "chafa");
  await writeFile(
    shPath,
    kind === "hang"
      ? "#!/usr/bin/env sh\nsleep 120\n"
      : "#!/usr/bin/env sh\necho FAKE_CHAFA \"$@\"\n",
    "utf8"
  );
  await chmod(shPath, 0o755);
  return shPath;
}

test("renderVisual executes chafa-compatible binary with selected arguments", async () => {
  const dir = await mkdtemp(join(tmpdir(), "termvis-chafa-"));
  await installFakeChafaPath(dir, "echo");
  const image = join(dir, "image.fake");
  await writeFile(image, "not a real image; fake renderer does not care", "utf8");

  const env = { PATH: `${dir}${delimiter}${process.env.PATH || ""}` };
  const found = findChafa({ env });
  assert.equal(found.available, true);

  const result = await renderVisual({
    source: { type: "file", path: image },
    alt: "fake",
    caps: {
      isTTY: true,
      noColor: false,
      termDumb: false,
      unicodeLevel: "unicode-wide",
      colorDepth: 24,
      pixelProtocol: "none",
      cols: 90,
      rows: 20
    },
    env
  });

  assert.equal(result.mode, "symbols-truecolor");
  assert.match(result.payload, /FAKE_CHAFA/);
  assert.match(result.payload, /--format symbols/);
  assert.match(result.payload, /--view-size 90x20/);
});

test("findChafa resolves configured project-local executable paths", async () => {
  const dir = await mkdtemp(join(tmpdir(), "termvis-configured-chafa-"));
  const fakeChafa =
    process.platform === "win32"
      ? await (async () => {
          const jsPath = join(dir, "_local_chafa.js");
          await writeFile(jsPath, "console.log('configured');\n", "utf8");
          const cmdPath = join(dir, "local-chafa.cmd");
          await writeFile(cmdPath, `@echo off\r\nnode ${JSON.stringify(jsPath)} %*\r\n`, "utf8");
          return cmdPath;
        })()
      : await (async () => {
          const shPath = join(dir, "local-chafa");
          await writeFile(shPath, "#!/usr/bin/env sh\necho configured\n", "utf8");
          await chmod(shPath, 0o755);
          return shPath;
        })();
  const { findChafa } = await import("../../src/render/chafa-runner.js");
  const found = findChafa({
    cwd: dir,
    config: { render: { chafaPath: process.platform === "win32" ? "local-chafa.cmd" : "local-chafa" } },
    env: { PATH: "" }
  });
  assert.equal(found.source, "config");
  assert.equal(found.available, true);
  assert.equal(found.path, fakeChafa);
});

test("renderVisual falls back when chafa times out and strict is false", async () => {
  const dir = await mkdtemp(join(tmpdir(), "termvis-chafa-slow-"));
  await installFakeChafaPath(dir, "hang");
  const image = join(dir, "image.fake");
  await writeFile(image, "x", "utf8");
  const env = { PATH: `${dir}${delimiter}${process.env.PATH || ""}` };
  const result = await renderVisual({
    source: { type: "file", path: image },
    alt: "slow",
    caps: {
      isTTY: true,
      noColor: false,
      termDumb: false,
      unicodeLevel: "unicode-wide",
      colorDepth: 24,
      pixelProtocol: "none",
      cols: 80,
      rows: 24
    },
    env,
    config: {
      render: { timeoutMs: 120, fallbackChain: ["symbols-truecolor", "plain"] },
      security: { execAllowlist: ["chafa"] }
    },
    strict: false
  });
  assert.equal(result.mode, "plain");
  assert.equal(result.metrics?.fallback, true);
  const detail = String(result.metrics?.stderr || result.payload || "");
  assert.match(detail, /timed out/i);
});

test("renderVisual falls back when security policy does not allow chafa", async () => {
  const result = await renderVisual({
    source: { type: "file", path: "/tmp/image.fake" },
    alt: "blocked",
    caps: {
      isTTY: true,
      noColor: false,
      termDumb: false,
      unicodeLevel: "unicode-wide",
      colorDepth: 24,
      pixelProtocol: "none",
      cols: 80,
      rows: 24
    },
    config: {
      render: {
        backend: "auto",
        fallbackChain: ["symbols-truecolor", "plain"]
      },
      security: {
        execAllowlist: []
      }
    }
  });
  assert.equal(result.mode, "plain");
  assert.match(result.payload, /not allowed/);
});
