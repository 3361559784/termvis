import { spawn, spawnSync } from "node:child_process";
import { accessSync, constants } from "node:fs";
import { basename, delimiter, isAbsolute, join, resolve } from "node:path";
import { performance } from "node:perf_hooks";
import { DEFAULT_CONFIG } from "../core/config.js";
import { modeToChafaArgs, selectRenderMode } from "../core/fallback.js";
import { renderPlainResult, renderTextFallback } from "./text-renderer.js";

export function findChafa({ env = process.env, executable = "chafa", config, cwd = process.cwd() } = {}) {
  const configured = config?.render?.chafaPath;
  if (configured) {
    const configuredPath = isAbsolute(configured) ? configured : resolve(cwd, configured);
    return canExecute(configuredPath)
      ? { available: true, path: configuredPath, source: "config" }
      : { available: false, path: configuredPath, source: "config", reason: "not executable" };
  }

  if (env.TERMVIS_CHAFA) {
    return canExecute(env.TERMVIS_CHAFA)
      ? { available: true, path: env.TERMVIS_CHAFA, source: "env" }
      : { available: false, path: env.TERMVIS_CHAFA, source: "env", reason: "not executable" };
  }

  for (const dir of String(env.PATH || "").split(delimiter)) {
    if (!dir) continue;
    for (const candidate of executableCandidates(executable)) {
      const fullPath = join(dir, candidate);
      if (canExecute(fullPath)) return { available: true, path: fullPath, source: "PATH" };
    }
  }

  if (process.platform === "win32") {
    const found = resolveViaWhere(executable);
    if (found) return { available: true, path: found, source: "where" };
  }

  return { available: false, path: null, source: "PATH", reason: `${executable} not found` };
}

export async function renderVisual({
  source,
  alt = "Image preview",
  caps,
  config = DEFAULT_CONFIG,
  env = process.env,
  cwd = process.cwd(),
  spawnImpl = spawn,
  strict = false,
  image
}) {
  const started = performance.now();
  const modeSelection = selectRenderMode(caps, config);
  if (["plain", "ascii", "mono"].includes(modeSelection.mode) || config.render?.backend === "disabled") {
    if (strict) throw new Error(`non-visual render mode selected: ${modeSelection.reason}`);
    return renderPlainResult({
      alt,
      source: source?.path,
      reason: modeSelection.reason
    });
  }

  if (Array.isArray(config.security?.execAllowlist) && !config.security.execAllowlist.includes("chafa")) {
    if (strict) throw new Error("chafa execution is not allowed by security.execAllowlist");
    return renderPlainResult({
      alt,
      source: source?.path,
      reason: "chafa execution is not allowed by security.execAllowlist"
    });
  }

  const chafa = findChafa({ env, config, cwd });
  if (!chafa.available) {
    if (strict) throw new Error(`chafa unavailable: ${chafa.reason}`);
    return {
      mode: "plain",
      payload: renderTextFallback({ alt, source: source?.path, caps, reason: chafa.reason }),
      altText: alt,
      metrics: { renderMs: performance.now() - started, fallback: true }
    };
  }

  if (!source || source.type !== "file" || !source.path) {
    throw new Error("renderVisual currently requires source: { type: 'file', path }");
  }

  const args = [
    ...modeToChafaArgs(modeSelection.mode, caps, config, { image }),
    source.path
  ];
  const result = await runChafa(chafa.path, args, {
    spawnImpl,
    env,
    timeoutMs: config.render?.timeoutMs || 5000
  });

  return {
    mode: modeSelection.mode,
    payload: result.stdout,
    altText: alt,
    command: basename(chafa.path),
    args,
    metrics: {
      renderMs: performance.now() - started,
      fallback: false,
      stderr: result.stderr
    }
  };
}

export function runChafa(command, args, { spawnImpl = spawn, env = process.env, timeoutMs = 5000 } = {}) {
  return new Promise((resolve, reject) => {
    const child = spawnImpl(command, args, {
      env,
      stdio: ["ignore", "pipe", "pipe"]
    });
    let stdout = "";
    let stderr = "";
    const timer = setTimeout(() => {
      child.kill("SIGTERM");
      reject(new Error(`chafa timed out after ${timeoutMs}ms`));
    }, timeoutMs);

    child.stdout?.on("data", (chunk) => {
      stdout += chunk.toString("utf8");
    });
    child.stderr?.on("data", (chunk) => {
      stderr += chunk.toString("utf8");
    });
    child.on("error", (error) => {
      clearTimeout(timer);
      reject(error);
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      if (code === 0) resolve({ stdout, stderr });
      else reject(new Error(`chafa failed with exit code ${code}: ${stderr}`));
    });
  });
}

function resolveViaWhere(name) {
  try {
    const result = spawnSync("where", [name], { stdio: ["ignore", "pipe", "ignore"], timeout: 3000 });
    if (result.status === 0 && result.stdout) {
      const first = result.stdout.toString("utf8").split(/\r?\n/)[0].trim();
      if (first) return first;
    }
  } catch { /* ignore */ }
  return null;
}

function canExecute(path) {
  try {
    if (process.platform === "win32") {
      accessSync(path, constants.R_OK);
      return true;
    }
    accessSync(path, constants.X_OK);
    return true;
  } catch {
    return false;
  }
}

function executableCandidates(name) {
  if (process.platform !== "win32") return [name];
  const extensions = ["", ".exe", ".cmd", ".bat"];
  return extensions.map((ext) => name.toLowerCase().endsWith(ext) ? name : `${name}${ext}`);
}
