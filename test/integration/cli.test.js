import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Writable, Readable } from "node:stream";
import { main } from "../../src/cli/main.js";

test("CLI doctor --json reports fallback-capable runtime", async () => {
  const stdout = collectableWritable();
  await main(["doctor", "--json"], fakeIo(stdout));
  const report = JSON.parse(stdout.text);
  assert.equal(report.node, process.version);
  assert.equal(report.config.valid, true);
  assert.ok("terminal" in report);
});

test("CLI adapter codex prints MCP config snippet", async () => {
  const stdout = collectableWritable();
  await main(["adapter", "codex"], fakeIo(stdout));
  assert.match(stdout.text, /\[mcp_servers\.termvis\]/);
  assert.match(stdout.text, /command = ".+(?:node|nodejs)(?:\.exe)?"/i);
  assert.match(stdout.text, /termvis\.js.+mcp/s);
});

test("CLI schema prints JSON schema", async () => {
  const stdout = collectableWritable();
  await main(["schema", "--compact"], fakeIo(stdout));
  const schema = JSON.parse(stdout.text);
  assert.equal(schema.$id, "https://termvis.dev/schema/config.json");
});

test("CLI --version prints package version", async () => {
  const stdout = collectableWritable();
  await main(["--version"], fakeIo(stdout));
  assert.match(stdout.text.trim(), /^\d+\.\d+\.\d+$/);
});

test("CLI avatar prints life-ready crop settings as JSON", async () => {
  const stdout = collectableWritable();
  await main(["avatar", "examples/avatar-soft.svg", "--json", "--width", "34", "--height", "12", "--fit", "cover", "--align", "top,left"], fakeIo(stdout));
  const result = JSON.parse(stdout.text);
  assert.equal(result.avatar, "examples/avatar-soft.svg");
  assert.equal(result.avatarWidth, 34);
  assert.equal(result.avatarHeight, 12);
  assert.equal(result.avatarFit, "cover");
  assert.equal(result.avatarAlign, "top,left");
  assert.match(result.command, /termvis life --avatar examples\/avatar-soft\.svg/);
});

test("CLI adapter list exposes low-coupling integration modes", async () => {
  const stdout = collectableWritable();
  await main(["adapter", "list"], fakeIo(stdout));
  assert.match(stdout.text, /codex\tmcp-stdio-config/);
  assert.match(stdout.text, /copilot\tmcp-config-or-wrapper/);
  assert.match(stdout.text, /gemini\tproject-settings-mcp/);
  assert.match(stdout.text, /opencode\tjsonc-local-mcp/);
});

test("CLI adapter help describes integration-only behavior", async () => {
  const stdout = collectableWritable();
  await main(["adapter", "--help"], fakeIo(stdout));
  assert.match(stdout.text, /termvis adapter <codex\|claude\|copilot\|gemini\|opencode>/);
  assert.match(stdout.text, /do not edit host configs/);
});

test("CLI persona renders a static avatar shell", async () => {
  const stdout = collectableWritable();
  await main(["persona", "--title", "Cute CLI", "--message", "awake"], fakeIo(stdout));
  assert.match(stdout.text, /Cute CLI/);
  assert.match(stdout.text, /state: idle/);
  assert.match(stdout.text, /mood: awake/);
  assert.match(stdout.text, /\[visual: Cute CLI avatar/);
});

test("CLI life can render a fallback-permitted static living shell", async () => {
  const stdout = collectableWritable();
  await main(["life", "--allow-fallback", "--title", "Living CLI", "--message", "awake"], fakeIo(stdout));
  assert.match(stdout.text, /Living CLI/);
  assert.match(stdout.text, /state awakening/);
  assert.match(stdout.text, /soul\s+Termvis Soul/);
  assert.match(stdout.text, /says awake/);
});

test("CLI life static frame uses project config persona when no CLI override is present", async () => {
  const cwd = await mkdtemp(join(tmpdir(), "termvis-cli-config-"));
  await writeFile(join(cwd, "termvis.config.json"), JSON.stringify({
    life: {
      strict: false,
      symbolic: true,
      avatar: "configured-avatar.png",
      soul: {
        enabled: true,
        reply: "configured speech",
        persona: { name: "Configured CLI Soul", id: "cli", language: "zh" }
      }
    }
  }), "utf8");

  const stdout = collectableWritable();
  await main(["life", "--allow-fallback", "--title", "Configured CLI"], fakeIo(stdout, undefined, { cwd }));

  assert.match(stdout.text, /Configured CLI/);
  assert.match(stdout.text, /soul\s+Configured CLI Soul/);
  assert.match(stdout.text, /says configured speech/);
  assert.doesNotMatch(stdout.text, /soul\s+Termvis Soul/);
});

test("CLI life can render without the visual soul layer", async () => {
  const stdout = collectableWritable();
  await main(["life", "--allow-fallback", "--soul-off", "--title", "Living CLI", "--message", "awake"], fakeIo(stdout));
  assert.match(stdout.text, /Living CLI/);
  assert.match(stdout.text, /voice awake/);
  assert.doesNotMatch(stdout.text, /soul\s+Termvis Soul/);
});

const readerSmokeHost = ["node", "-e", "process.stdout.write('hi')"];

test("CLI life reader mode runs gracefully without a real LLM", async () => {
  const stdout = collectableWritable();
  const stderr = collectableWritable();
  await main(["life", "--reader", "--title", "Reader CLI", "--", ...readerSmokeHost], fakeIo(stdout, stderr));
  assert.equal(stdout.text, "hi");
});

test("CLI life reader mode can run host stdout with soul disabled", async () => {
  const stdout = collectableWritable();
  const stderr = collectableWritable();
  await main(["life", "--reader", "--soul-off", "--title", "Reader CLI", "--", ...readerSmokeHost], fakeIo(stdout, stderr));
  assert.equal(stdout.text, "hi");
  assert.match(stderr.text, /\[termvis\].*Soul Termvis Soul/s);
  assert.match(stderr.text, /Host node -e process\.stdout\.write\('hi'\) is succeeded/);
});

function fakeIo(stdout, stderr = collectableWritable(), overrides = {}) {
  const stdin = Readable.from([]);
  stdin.isTTY = false;
  stdout.isTTY = false;
  return {
    stdin,
    stdout,
    stderr,
    env: {
      ...process.env,
      TERM: "dumb",
      TERMVIS_NO_USER_CONFIG: "1",
      TERMVIS_CODEX_LLM: "0",
      OPENAI_API_KEY: "",
      DEEPSEEK_API_KEY: "",
      ANTHROPIC_API_KEY: "",
      OLLAMA_HOST: "",
      OLLAMA_BASE_URL: ""
    },
    cwd: overrides.cwd || process.cwd()
  };
}

function collectableWritable() {
  const chunks = [];
  const stream = new Writable({
    write(chunk, _encoding, callback) {
      chunks.push(Buffer.from(chunk));
      callback();
    }
  });
  Object.defineProperty(stream, "text", {
    get() {
      return Buffer.concat(chunks).toString("utf8");
    }
  });
  return stream;
}
