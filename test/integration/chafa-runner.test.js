import { chmod, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { delimiter, join } from "node:path";
import test from "node:test";
import assert from "node:assert/strict";
import { findChafa, renderVisual } from "../../src/render/chafa-runner.js";

test("renderVisual executes chafa-compatible binary with selected arguments", async () => {
  const dir = await mkdtemp(join(tmpdir(), "termvis-chafa-"));
  const fakeChafa = join(dir, "chafa");
  const image = join(dir, "image.fake");
  await writeFile(fakeChafa, "#!/usr/bin/env sh\necho FAKE_CHAFA \"$@\"\n", "utf8");
  await chmod(fakeChafa, 0o755);
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
  const fakeChafa = join(dir, "local-chafa");
  await writeFile(fakeChafa, "#!/usr/bin/env sh\necho configured\n", "utf8");
  await chmod(fakeChafa, 0o755);
  const { findChafa } = await import("../../src/render/chafa-runner.js");
  const found = findChafa({
    cwd: dir,
    config: { render: { chafaPath: "local-chafa" } },
    env: { PATH: "" }
  });
  assert.equal(found.source, "config");
  assert.equal(found.available, true);
  assert.equal(found.path, fakeChafa);
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
