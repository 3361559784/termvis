import { detectTerminalCapabilities } from "../core/capabilities.js";
import { loadConfig } from "../core/config.js";
import { findChafa } from "../render/chafa-runner.js";
import { verifyLlmConfig } from "./setup-wizard.js";

export async function runDoctor(argv, io) {
  const asJson = argv.includes("--json");
  const strict = argv.includes("--strict");
  const config = await loadConfig({ cwd: io.cwd, env: io.env });
  const caps = detectTerminalCapabilities({ env: io.env, stdout: io.stdout, stdin: io.stdin });
  const chafa = findChafa({ env: io.env, config: config.value, cwd: io.cwd });
  const nodePty = await hasOptionalNodePty();
  const llmResult = await verifyLlmConfig(config.value || {}, { env: io.env, cwd: io.cwd });
  const readiness = {
    nonFallbackReady: Boolean(chafa.available && nodePty && caps.isTTY && !caps.termDumb && !caps.noColor && caps.colorDepth >= 8),
    requirements: {
      chafa: Boolean(chafa.available),
      nodePty,
      tty: Boolean(caps.isTTY),
      interactiveColor: Boolean(!caps.termDumb && !caps.noColor && caps.colorDepth >= 8),
      projectConfig: Boolean(config.path),
      llm: llmResult.ok
    },
    fallbackReasons: []
  };
  if (!readiness.requirements.chafa) readiness.fallbackReasons.push(chafa.reason || "chafa unavailable");
  if (!readiness.requirements.nodePty) readiness.fallbackReasons.push("node-pty unavailable");
  if (!readiness.requirements.tty) readiness.fallbackReasons.push("stdout is not a TTY");
  if (!readiness.requirements.interactiveColor) readiness.fallbackReasons.push("terminal color/interactive capability insufficient");
  if (!readiness.requirements.projectConfig) readiness.fallbackReasons.push("project config not found");
  if (!readiness.requirements.llm) readiness.fallbackReasons.push(`LLM: ${llmResult.message}`);
  const report = {
    ok: true,
    node: process.version,
    cwd: io.cwd,
    config: config.path ? { path: config.path, valid: true } : { path: null, valid: true },
    chafa,
    terminal: caps,
    llm: llmResult,
    readiness,
    optional: {
      nodePty
    }
  };

  report.ok = Boolean(report.terminal) && report.config.valid && (!strict || readiness.nonFallbackReady);

  if (asJson) {
    io.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
    if (strict && !readiness.nonFallbackReady) {
      throw new Error("Strict non-fallback readiness check failed");
    }
    return report;
  }

  io.stdout.write(`termvis doctor\n`);
  io.stdout.write(`  node:       ${report.node}\n`);
  io.stdout.write(`  cwd:        ${report.cwd}\n`);
  io.stdout.write(`  config:     ${report.config.path || "not found; defaults active"}\n`);
  io.stdout.write(`  chafa:      ${chafa.available ? chafa.path : "not found; text fallback active"}\n`);
  io.stdout.write(`  node-pty:   ${report.optional.nodePty ? "available" : "not installed; pipe fallback active"}\n`);
  io.stdout.write(`  terminal:   ${caps.isTTY ? `${caps.cols}x${caps.rows}, ${caps.colorDepth}-bit color` : "non-TTY"}\n`);
  io.stdout.write(`  protocol:   ${caps.pixelProtocol}\n`);
  io.stdout.write(`  no color:   ${caps.noColor ? "yes" : "no"}\n`);
  io.stdout.write(`  llm:        ${llmResult.ok ? `✓ ${llmResult.provider || "ok"}` : `✗ ${llmResult.message}`}\n`);
  io.stdout.write(`  nonfallback:${readiness.nonFallbackReady ? "ready" : "not ready"}\n`);
  if (readiness.fallbackReasons.length > 0) {
    io.stdout.write(`  reasons:    ${readiness.fallbackReasons.join("; ")}\n`);
  }
  if (strict && !readiness.nonFallbackReady) {
    throw new Error("Strict non-fallback readiness check failed");
  }
  return report;
}

async function hasOptionalNodePty() {
  try {
    await import("node-pty");
    return true;
  } catch {
    return false;
  }
}
