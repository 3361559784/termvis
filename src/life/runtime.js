import { mkdir, writeFile, appendFile } from "node:fs/promises";
import { spawn } from "node:child_process";
import { basename, join } from "node:path";
import { performance } from "node:perf_hooks";
import fs from "node:fs";
import { createTermvisEngine } from "../application/termvis-engine.js";
import { findChafa } from "../render/chafa-runner.js";
import { createLifeSnapshot, applyLifeEvent, inferLifeEventFromChunk, serializeLifeEvent } from "./state.js";
import { DEFAULT_LIFE_AVATAR_PATH, renderLifeFrame, renderLifeStatusLine, terminalTitle } from "./frame.js";
import { createLifeTui, soulFrameToTuiSnapshot, terminalModeResetSequence } from "./tui.js";
import {
  createSoulEventStore,
  createSoulState,
  readSoulEvents,
  renderSoulReaderTraceLine
} from "./soul.js";
import { createIntelligentSoulEngine } from "../soul-bios/engine.js";
import { createSignalEvent, createSoulBiosCaps } from "../soul-bios/types.js";
import { normalizeToolOutput, classifyUserInput, normalizeHostLifecycle, normalizeUserInput } from "../soul-bios/signal.js";

export async function runLivingCommand({
  command,
  args = [],
  io,
  avatar,
  title,
  message,
  strict,
  symbolic,
  trace,
  pulse,
  avatarWidth,
  avatarHeight,
  avatarFit,
  avatarAlign,
  avatarScale,
  width,
  soulEnabled,
  soulMode,
  soulName,
  soulNarration,
  soulReply,
  soulSession,
  readerMode
} = {}) {
  if (!command) throw new Error("runLivingCommand requires a command");
  const engine = await createTermvisEngine({ cwd: io.cwd, env: io.env });
  const lifeConfig = engine.config?.life || {};
  const transparentHostMode = shouldPassthroughHostCommand(command);
  let runtimeAvatar = avatar || lifeConfig.avatar || DEFAULT_LIFE_AVATAR_PATH;
  const runtimeTitle = title || "termvis living shell";
  const runtimeStrict = strict ?? lifeConfig.strict ?? true;
  const runtimeSymbolic = symbolic ?? lifeConfig.symbolic ?? true;
  const runtimeTrace = trace ?? lifeConfig.trace ?? true;
  const runtimePulse = pulse || lifeConfig.pulse || "title";
  let runtimeAvatarWidth = avatarWidth ?? lifeConfig.avatarWidth;
  let runtimeAvatarHeight = avatarHeight ?? lifeConfig.avatarHeight;
  let runtimeAvatarFit = avatarFit || lifeConfig.avatarFit || "contain";
  let runtimeAvatarAlign = avatarAlign || lifeConfig.avatarAlign || "mid,mid";
  let runtimeAvatarScale = avatarScale || lifeConfig.avatarScale || "max";
  const runtimeLayout = lifeConfig.layout || {};
  const reduceMotion = Boolean(engine.config.accessibility?.reduceMotion);
  const runtimeReaderMode = Boolean(readerMode || engine.config.accessibility?.screenReaderMode);
  const soulConfig = lifeConfig.soul || {};
  const pty = await loadNodePty();
  const caps = engine.probeCapabilities({ stdout: io.stdout, stdin: io.stdin, env: io.env });
  const chafa = findChafa({ env: io.env, config: engine.config, cwd: io.cwd });
  const readiness = {
    tty: runtimeReaderMode || Boolean(caps.isTTY && !caps.termDumb),
    color: runtimeReaderMode || Boolean(!caps.noColor && caps.colorDepth >= 8),
    chafa: runtimeReaderMode || Boolean(chafa.available),
    // Reader/plain trace can fall back to piped host I/O when node-pty is unavailable (Windows/npm CI).
    nodePty: runtimeReaderMode || Boolean(pty)
  };

  if (runtimeStrict) {
    const missing = Object.entries(readiness).filter(([, ok]) => !ok).map(([name]) => name);
    if (missing.length > 0) {
      throw new Error(`termvis life requires strict visual runtime; missing: ${missing.join(", ")}`);
    }
  }

  const host = [command, ...args].join(" ");
  let snapshot = createLifeSnapshot({
    title: runtimeTitle,
    host,
    avatar: runtimeAvatar,
    state: "awakening",
    message: message || "awakening the terminal presence"
  });
  let soulState = createSoulState({
    enabled: transparentHostMode ? false : (soulEnabled ?? soulConfig.enabled ?? true),
    mode: soulMode || soulConfig.mode || "companion",
    sessionId: soulSession,
    narration: soulNarration || message || soulConfig.narration || "awake beside the terminal stream",
    reply: soulReply || soulConfig.reply,
    persona: {
      ...(soulConfig.persona || {}),
      ...(soulName ? { name: soulName } : {})
    }
  });
  snapshot = { ...snapshot, soul: soulState };
  const tracePath = runtimeTrace ? await createTrace(io.cwd, snapshot) : null;
  const soulStore = soulState.enabled ? await createSoulEventStore({ cwd: io.cwd, sessionId: soulState.sessionId, state: soulState }) : null;
  let soulOffset = soulStore?.offset || 0;
  let closing = false;
  let exitHandled = false;

  const cognitionConfig = engine.config.cognition || {};
  const cognitionEnabled = Boolean(soulState.enabled) && !transparentHostMode;
  /** @type {Awaited<ReturnType<import("../soul-bios/engine.js").createIntelligentSoulEngine>> | null} */
  let biosEngine = null;
  let biosTimer = null;
  let biosTickInFlight = false;
  let biosTickSuppressed = false;
  let lastBiosTraceSignature = "";
  if (cognitionEnabled) {
    const hostId = host.split(/\s+/)[0] || "terminal";
    try {
      biosEngine = await createIntelligentSoulEngine({
        env: io.env,
        config: engine.config,
        cwd: io.cwd,
        sessionId: soulState.sessionId,
        requireLlm: false,
        strictLlmVisuals: false,
        llmPreferred: chooseLifeLlmProvider(cognitionConfig),
        persona: cognitionConfig.persona || soulConfig.persona || { name: soulName || "Termvis Soul", speakingStyle: { brevity: 2, warmth: 1, metaphor: 0, emoji: 0 } },
        memoryAllowReflective: Boolean(cognitionConfig.memory?.reflective),
        safetyJudge: Boolean(cognitionConfig.safetyJudge),
        tickIntervalForReflection: typeof cognitionConfig.reflectionTickInterval === "number" ? cognitionConfig.reflectionTickInterval : 20,
        onDiagnostic: (msg) => { try { io.stderr.write(msg + "\n"); } catch { /* ignore */ } }
      });
      await biosEngine.init(createSoulBiosCaps({ hostId, transport: "stdio" }));
      await biosEngine.ingest(normalizeHostLifecycle({ event: "host.lifecycle.start", host }));
      snapshot = await nextBiosSnapshot(snapshot);
    } catch (error) {
      biosEngine = null;
      const safeError = sanitizeErrorMessage(error?.message || String(error));
      const llmProvider = cognitionConfig.llm?.provider || cognitionConfig.provider || "auto";
      const llmModel = cognitionConfig.llm?.model || cognitionConfig.model || "";
      await writeTrace(tracePath, snapshot, {
        type: "bios-error",
        at: new Date(),
        diagnostic: {
          stage: "init",
          llm: { provider: llmProvider, model: llmModel },
          error: safeError
        }
      }).catch(() => {});
      if (llmProvider !== "none") {
        const envHint = cognitionConfig.llm?.apiKeyEnv
          ? `Ensure ${cognitionConfig.llm.apiKeyEnv} is set in your environment.`
          : "Run 'termvis verify' to diagnose.";
        io.stderr?.write?.(`[termvis] Soul engine init failed for provider="${llmProvider}": ${safeError}\n` +
          `  ${envHint}\n`);
      }
    }
  }
  const useTui = Boolean(!transparentHostMode && !runtimeReaderMode && pty && io.stdin.isTTY && io.stdout.isTTY);
  const useReaderPty = Boolean(runtimeReaderMode && pty && io.stdin.isTTY && io.stdout.isTTY);
  const useTransparentPty = Boolean(transparentHostMode && pty && io.stdin.isTTY && io.stdout.isTTY);
  const tui = useTui ? await createLifeTui({
    io,
    engine,
    snapshot,
    avatar: runtimeAvatar,
    width,
    avatarWidth: runtimeAvatarWidth,
    avatarHeight: runtimeAvatarHeight,
    avatarFit: runtimeAvatarFit,
    avatarAlign: runtimeAvatarAlign,
    avatarScale: runtimeAvatarScale,
    symbolic: runtimeSymbolic,
    reduceMotion,
    minHostCols: runtimeLayout.minHostCols,
    minRailWidth: runtimeLayout.minRailWidth,
    maxRailWidth: runtimeLayout.maxRailWidth
  }) : null;

  const handleProcessExit = () => {
    if (exitHandled) return;
    exitHandled = true;
    try {
      if (tui && !transparentHostMode && !runtimeReaderMode) {
        fs.writeSync(1, terminalModeResetSequence());
      }
    } catch { /* ignore */ }
  };

  process.on("exit", handleProcessExit);
  const sigHandler = () => {
    cleanupRuntime().finally(() => process.exit(0));
  };
  const crashHandler = (err) => {
    if (exitHandled) return;
    exitHandled = true;
    // Attempt graceful terminal reset before exiting with error
    try {
      if (tui && !transparentHostMode && !runtimeReaderMode) {
        fs.writeSync(1, terminalModeResetSequence());
      }
    } catch { /* ignore */ }
    console.error(`\n[termvis] Fatal error:`, err);
    process.exit(1);
  };
  process.on("SIGINT", sigHandler);
  process.on("SIGTERM", sigHandler);
  process.on("uncaughtException", crashHandler);
  process.on("unhandledRejection", crashHandler);

  if (tui) tui.start(snapshot);
  else if (runtimeReaderMode) writeReaderLine(io, snapshot);
  else if (!transparentHostMode) await writeLifeFrame(io, engine, snapshot, { avatar: runtimeAvatar, width, avatarWidth: runtimeAvatarWidth, avatarHeight: runtimeAvatarHeight, symbolic: runtimeSymbolic, strict: false });
  await writeTrace(tracePath, snapshot, { type: "life-start", at: new Date() });
  if (!transparentHostMode) writeTitle(io, snapshot);
  let userInputBuffer = "";
  let lastTypingSignalAt = 0;
  const soulPoller = soulStore && !transparentHostMode && (tui || runtimeReaderMode) ? setInterval(() => {
    pollSoulEvents().catch(() => {});
  }, 500) : null;
  soulPoller?.unref?.();

  // Bios tick scheduler: ingests recent host output as signals and produces a SoulFrame
  if (biosEngine && !transparentHostMode && (tui || runtimeReaderMode)) {
    biosTimer = setInterval(() => {
      tickBios().catch(() => {});
    }, 800);
    biosTimer?.unref?.();
  }

  const started = performance.now();
  try {
    const exitCode = useTui
      ? await runWithPty(pty, command, args, io, {
        cols: tui.hostCols,
        rows: tui.hostRows,
        inputTransform: (input) => {
          const transformed = tui.translateInput(input);
          if (biosEngine && !closing && transformed && !isEmptyInput(transformed)) {
            ingestUserInputSignal(transformed).catch(() => {});
          }
          return transformed;
        },
        resetTerminalOnCleanup: false,
        onOutput: async (chunk) => {
          if (closing) return;
          tui.writeHost(chunk);
          ingestChunkAsSignal(chunk).catch(() => {});
          snapshot = await observeChunk(snapshot, chunk, tracePath, applyDerivedSoulEvent);
          if (closing) return;
          tui.update(snapshot);
          writeTitle(io, snapshot);
          if (runtimePulse === "line") io.stderr.write?.(`${renderLifeStatusLine(snapshot, io.stdout.columns || 80)}\n`);
        },
        onResize: () => tui.resize()
      })
      : useReaderPty
        ? await runWithPlainPty(pty, command, args, io, {
          onOutput: async (chunk) => {
            if (closing) return;
            const previousState = snapshot.state;
            snapshot = await observeChunk(snapshot, chunk, tracePath, applyDerivedSoulEvent);
            if (closing) return;
            writeTitle(io, snapshot);
            if (snapshot.state !== previousState) writeReaderLine(io, snapshot);
          }
        })
      : useTransparentPty
        ? await runWithPty(pty, command, args, io, {
          cols: io.stdout.columns || 80,
          rows: io.stdout.rows || 25,
          resetTerminalOnCleanup: false,
          mirrorHostOutput: true,
          onOutput: async (chunk) => {
            if (closing) return;
            const previousState = snapshot.state;
            snapshot = await observeChunk(snapshot, chunk, tracePath, applyDerivedSoulEvent);
            if (closing) return;
            if (!transparentHostMode) writeTitle(io, snapshot);
            if (runtimeReaderMode && snapshot.state !== previousState) writeReaderLine(io, snapshot);
          }
        })
      : await runWithPipes(command, args, io, async (chunk) => {
        if (closing) return;
        const previousState = snapshot.state;
        snapshot = await observeChunk(snapshot, chunk, tracePath, applyDerivedSoulEvent);
        if (closing) return;
        if (!transparentHostMode) writeTitle(io, snapshot);
        if (runtimeReaderMode && snapshot.state !== previousState) writeReaderLine(io, snapshot);
        if (runtimePulse === "line") io.stderr.write?.(`${renderLifeStatusLine(snapshot, io.stdout.columns || 80)}\n`);
      });
    const exitEvent = {
      type: "life-exit",
      state: exitCode === 0 ? "succeeded" : "failed",
      message: `${host} exited with code ${exitCode}`,
      at: new Date()
    };
    snapshot = applyLifeEvent(snapshot, exitEvent);
    snapshot = applyDerivedSoulEvent(snapshot, {
      ...exitEvent,
      type: exitCode === 0 ? "success" : "error"
    });
    if (biosEngine) {
      biosTickSuppressed = true;
      if (biosTimer) {
        clearInterval(biosTimer);
        biosTimer = null;
      }
      await biosEngine.ingest(normalizeHostLifecycle({ event: "host.lifecycle.exit", host }));
      snapshot = await nextBiosSnapshot(snapshot);
    }
    await writeTrace(tracePath, snapshot, { type: "life-exit", at: new Date() });
    await cleanupRuntime();
    return {
      exitCode,
      tracePath,
      elapsedMs: performance.now() - started,
      snapshot
    };
  } catch (error) {
    snapshot = applyLifeEvent(snapshot, {
      type: "life-error",
      state: "failed",
      message: error?.message || String(error),
      at: new Date()
    });
    snapshot = applyDerivedSoulEvent(snapshot, {
      type: "error",
      state: "failed",
      message: error?.message || String(error),
      at: new Date()
    });
    await writeTrace(tracePath, snapshot, { type: "life-error", at: new Date() });
    await cleanupRuntime();
    throw error;
  }

  async function cleanupRuntime() {
    if (closing) return;
    closing = true;
    if (soulPoller) clearInterval(soulPoller);
    if (biosTimer) clearInterval(biosTimer);
    if (biosEngine) await biosEngine.dispose().catch(() => {});
    if (tui) tui.stop(snapshot);
    else if (runtimeReaderMode) writeReaderLine(io, snapshot);
    else if (!transparentHostMode) await writeLifeFrame(io, engine, snapshot, { avatar: runtimeAvatar, width, avatarWidth: runtimeAvatarWidth, avatarHeight: runtimeAvatarHeight, symbolic: runtimeSymbolic, strict: false });
  }

  async function pollSoulEvents() {
    if (closing) return;
    if (!soulStore || !soulState.enabled) return;
    const result = await readSoulEvents({ cwd: io.cwd, sessionId: soulState.sessionId, offset: soulOffset });
    if (closing) return;
    soulOffset = result.offset;
    if (result.events.length === 0) return;
    const signalEvents = [];
    for (const event of result.events) {
      if (isSoulConfigEvent(event)) {
        await applyRuntimeSoulConfig(event);
        signalEvents.push(event);
      } else {
        signalEvents.push(event);
      }
    }
    if (biosEngine) {
      await biosEngine.ingest(signalEvents.map((event) => createSignalEvent({
        source: "telemetry",
        kind: isSoulConfigEvent(event) ? "soul.config" : "soul.external",
        priority: 4,
        payload: event
      })));
      return;
    }
  }

  async function ingestChunkAsSignal(chunk) {
    if (closing) return;
    if (!biosEngine) return;
    try {
      const text = String(chunk || "").slice(-2000);
      if (!text.trim()) return;
      const events = normalizeToolOutput({ text, sourceTool: host, ts: new Date().toISOString() });
      if (events.length > 0) await biosEngine.ingest(events);
    } catch {
      // never let bios crash the host stream
    }
  }

  async function ingestUserInputSignal(input) {
    if (!biosEngine || closing) return;
    const text = Buffer.isBuffer(input) ? input.toString("utf8") : String(input || "");
    if (!text) return;
    if (text.includes("\u001b")) return;
    const now = Date.now();
    const events = [];
    for (const ch of Array.from(text)) {
      if (ch === "\r" || ch === "\n") {
        const submitted = userInputBuffer;
        userInputBuffer = "";
        events.push(classifyUserInput(submitted));
      } else if (ch === "\u0003") {
        userInputBuffer = "";
        events.push(createSignalEvent({
          source: "user.input",
          kind: "user.interrupt",
          priority: 5,
          reliability: 0.95,
          payload: { text: "^C", isSubmit: true }
        }));
      } else if (ch === "\u007f" || ch === "\b") {
        userInputBuffer = Array.from(userInputBuffer).slice(0, -1).join("");
      } else if (ch >= " " && ch !== "\u001b") {
        userInputBuffer += ch;
      }
    }
    if (userInputBuffer && now - lastTypingSignalAt > 350) {
      lastTypingSignalAt = now;
      events.push(...normalizeUserInput({ text: userInputBuffer, isSubmit: false }));
    }
    if (events.length > 0) await biosEngine.ingest(events);
  }

  async function tickBios() {
    if (closing) return;
    if (!biosEngine) return;
    if (biosTickSuppressed) return;
    if (biosTickInFlight) return;
    biosTickInFlight = true;
    try {
      const next = await nextBiosSnapshot(snapshot);
      if (closing || biosTickSuppressed) return;
      await writeBiosDiagnosticTrace(next);
      if (stableSnapshotSignature(next) === stableSnapshotSignature(snapshot)) return;
      snapshot = next;
      tui?.update(snapshot);
      if (runtimeReaderMode) writeReaderLine(io, snapshot);
    } catch (error) {
      await writeTrace(tracePath, snapshot, {
        type: "bios-error",
        at: new Date(),
        error: sanitizeErrorMessage(error)
      }).catch(() => {});
    } finally {
      biosTickInFlight = false;
    }
  }

  async function writeBiosDiagnosticTrace(next) {
    const diagnostic = biosDiagnostic(next);
    const signature = JSON.stringify(diagnostic);
    if (signature === lastBiosTraceSignature) return;
    lastBiosTraceSignature = signature;
    await writeTrace(tracePath, next, { type: "bios-tick", at: new Date(), diagnostic }).catch(() => {});
  }

  function applyDerivedSoulEvent(nextSnapshot, event) {
    if (closing) return nextSnapshot;
    if (!soulState.enabled) return { ...nextSnapshot, soul: soulState };
    if (biosEngine && event && (event.message || event.state)) {
      ingestChunkAsSignal(event.message || `state:${event.state}`).catch(() => {});
      return nextSnapshot;
    }
    return nextSnapshot;
  }

  async function nextBiosSnapshot(baseSnapshot) {
    if (closing) return baseSnapshot;
    const frame = await biosEngine.tick();
    const inspect = typeof biosEngine.inspect === "function" ? biosEngine.inspect() : null;
    const richSoulSnap = soulFrameToTuiSnapshot(frame, {
      persona: soulState.persona || undefined,
      personaName: soulState.persona?.name || soulName || "Termvis Soul",
      title: baseSnapshot.title,
      llmStats: inspect?.llm || null,
      memoryStats: inspect?.memory || null,
      lastSignal: baseSnapshot.lastSignal,
      v2Frame: frame.v2Frame || null
    });
    return {
      ...baseSnapshot,
      soul: {
        ...richSoulSnap.soul,
        persona: {
          ...richSoulSnap.soul.persona,
          ...(soulState.persona || {}),
          name: soulState.persona?.name || richSoulSnap.soul.persona.name
        }
      }
    };
  }

  async function applyRuntimeSoulConfig(event) {
    if (closing) return;
    if (event.persona && typeof event.persona === "object") {
      soulState = {
        ...soulState,
        persona: mergePersonaPatch(soulState.persona, event.persona)
      };
      if (typeof biosEngine?.configure === "function") {
        biosEngine.configure({ persona: soulState.persona });
      }
    }
    let avatarChanged = false;
    if (event.avatar) {
      runtimeAvatar = event.avatar;
      avatarChanged = true;
    }
    if (event.avatarFit) {
      runtimeAvatarFit = event.avatarFit;
      avatarChanged = true;
    }
    if (event.avatarAlign) {
      runtimeAvatarAlign = event.avatarAlign;
      avatarChanged = true;
    }
    if (event.avatarScale) {
      runtimeAvatarScale = event.avatarScale;
      avatarChanged = true;
    }
    if (event.avatarWidth) {
      runtimeAvatarWidth = event.avatarWidth;
      avatarChanged = true;
    }
    if (event.avatarHeight) {
      runtimeAvatarHeight = event.avatarHeight;
      avatarChanged = true;
    }
    snapshot = {
      ...snapshot,
      avatar: runtimeAvatar,
      soul: snapshot.soul
        ? {
            ...snapshot.soul,
            persona: {
              ...snapshot.soul.persona,
              ...(soulState.persona || {})
            }
          }
        : undefined
    };
    if (avatarChanged) {
      if (tui) await tui.configureAvatar({
        avatar: runtimeAvatar,
        avatarFit: runtimeAvatarFit,
        avatarAlign: runtimeAvatarAlign,
        avatarScale: runtimeAvatarScale,
        avatarWidth: runtimeAvatarWidth,
        avatarHeight: runtimeAvatarHeight
      });
    }
  }
}

async function loadNodePty() {
  try {
    const pty = await import("node-pty");
    return pty.default || pty;
  } catch {
    return null;
  }
}

async function createTrace(cwd, snapshot) {
  const dir = join(cwd, ".termvis", "life-traces");
  await mkdir(dir, { recursive: true });
  const filename = `${new Date().toISOString().replace(/[:.]/g, "-")}.jsonl`;
  const path = join(dir, filename);
  await writeFile(path, serializeLifeEvent(snapshot, { type: "life-start", at: new Date() }) + "\n");
  return path;
}

async function writeTrace(path, snapshot, event) {
  if (!path) return;
  const line = serializeLifeEvent(snapshot, event);
  await appendFile(path, line + "\n");
}

function writeReaderLine(io, snapshot) {
  const line = renderSoulReaderTraceLine(snapshot.soul, snapshot);
  io.stderr.write(`${line}\n`);
}

async function observeChunk(snapshot, chunk, tracePath, applyDerivedSoulEvent) {
  const event = inferLifeEventFromChunk(chunk);
  if (event) {
    const nextSnapshot = applyLifeEvent(snapshot, event);
    const soulSnapshot = applyDerivedSoulEvent(nextSnapshot, event);
    await writeTrace(tracePath, soulSnapshot, event);
    return soulSnapshot;
  }
  return snapshot;
}

function runWithPty(pty, command, args, io, {
  cols,
  rows,
  onOutput,
  onResize,
  inputTransform,
  mirrorHostOutput = false,
  resetTerminalOnCleanup = true
} = {}) {
  return new Promise((resolve, reject) => {
    const pending = [];
    let settled = false;
    const wasRaw = Boolean(io.stdin?.isRaw);
    const resolved = resolveCommandForPty(command, args, io.env);
    const child = pty.spawn(resolved.command, resolved.args, {
      name: io.env.TERM || "xterm-256color",
      cols: cols || io.stdout.columns || 80,
      rows: rows || io.stdout.rows || 25,
      cwd: io.cwd,
      env: io.env
    });

    const dataDisposable = child.onData((chunk) => {
    const pending = new Set();
    // ... inside onData callback
    const dataDisposable = child.onData((chunk) => {
      const p = Promise.allSettled([
        mirrorHostOutput ? writeStream(io.stdout, chunk) : Promise.resolve(),
        onOutput?.(chunk).catch(() => {})
      ]);
      pending.add(p);
      p.finally(() => pending.delete(p));
    });
    });
    const exitDisposable = child.onExit(async ({ exitCode }) => {
      if (settled) return;
      settled = true;
      cleanup();
      await Promise.allSettled(pending);
      resolve(exitCode);
    });

    const onInput = (buffer) => {
      try {
        const input = inputTransform ? inputTransform(buffer) : buffer;
        if (isEmptyInput(input)) return;
        child.write(input);
      } catch {
        try {
          child.write(buffer);
        } catch {}
      }
    };
    const handleResize = () => {
      const next = onResize?.() || {};
      try {
        child.resize(next.cols || cols || io.stdout.columns || 80, next.rows || rows || io.stdout.rows || 25);
      } catch {}
    };
    const signalHandlers = installChildSignalHandlers(child);
    io.stdin.setRawMode?.(true);
    io.stdin.resume();
    io.stdin.on("data", onInput);
    io.stdout.on?.("resize", handleResize);
    const errorDisposable = child.onError?.((error) => {
      if (settled) return;
      settled = true;
      cleanup();
      reject(error);
    });

    function cleanup() {
      dataDisposable?.dispose?.();
      exitDisposable?.dispose?.();
      errorDisposable?.dispose?.();
      io.stdin.off?.("data", onInput);
      io.stdout.off?.("resize", handleResize);
      removeChildSignalHandlers(signalHandlers);
      if (resetTerminalOnCleanup) io.stdout?.write?.(terminalModeResetSequence());
      io.stdin.setRawMode?.(wasRaw);
      io.stdin.pause?.();
    }
  });
}

function runWithPlainPty(pty, command, args, io, { onOutput } = {}) {
  return new Promise((resolve, reject) => {
    const pending = [];
    let settled = false;
    const wasRaw = Boolean(io.stdin?.isRaw);
    const resolved = resolveCommandForPty(command, args, io.env);
    const child = pty.spawn(resolved.command, resolved.args, {
      name: io.env.TERM || "xterm-256color",
      cols: io.stdout.columns || 80,
      rows: io.stdout.rows || 25,
      cwd: io.cwd,
      env: io.env
    });

    const dataDisposable = child.onData((chunk) => {
      pending.push(Promise.allSettled([
        writeStream(io.stdout, chunk),
        onOutput?.(chunk).catch(() => {})
      ]));
    });
    const exitDisposable = child.onExit(async ({ exitCode }) => {
      if (settled) return;
      settled = true;
      cleanup();
      await Promise.allSettled(pending);
      resolve(exitCode);
    });

    const onInput = (buffer) => {
      try {
        child.write(buffer);
      } catch {}
    };
    const handleResize = () => {
      try {
        child.resize(io.stdout.columns || 80, io.stdout.rows || 25);
      } catch {}
    };
    const signalHandlers = installChildSignalHandlers(child);
    io.stdin.setRawMode?.(true);
    io.stdin.resume();
    io.stdin.on("data", onInput);
    io.stdout.on?.("resize", handleResize);
    const errorDisposable = child.onError?.((error) => {
      if (settled) return;
      settled = true;
      cleanup();
      reject(error);
    });

    function cleanup() {
      dataDisposable?.dispose?.();
      exitDisposable?.dispose?.();
      errorDisposable?.dispose?.();
      io.stdin.off?.("data", onInput);
      io.stdout.off?.("resize", handleResize);
      removeChildSignalHandlers(signalHandlers);
      io.stdout?.write?.(terminalModeResetSequence());
      io.stdin.setRawMode?.(wasRaw);
      io.stdin.pause?.();
    }
  });
}

function isEmptyInput(input) {
  if (input == null) return true;
  if (Buffer.isBuffer(input)) return input.length === 0;
  return String(input).length === 0;
}

function installChildSignalHandlers(child) {
  const signals = ["SIGINT", "SIGTERM", "SIGHUP"];
  const handlers = signals.map((signal) => {
    const handler = () => {
      try {
        child.kill(signal);
      } catch {
        // The child may already have exited.
      }
    };
    process.once(signal, handler);
    return { signal, handler };
  });
  return handlers;
}

function removeChildSignalHandlers(handlers = []) {
  for (const { signal, handler } of handlers) process.off?.(signal, handler);
}

function runWithPipes(command, args, io, onOutput) {
  return new Promise((resolve, reject) => {
    const pending = [];
      const resolved = resolveCommandForPty(command, args, io.env);
      const useShell = process.platform === "win32";
      const child = spawn(resolved.command, resolved.args, {
        cwd: io.cwd,
        env: io.env,
        stdio: [io.stdin?.isTTY ? "pipe" : "ignore", "pipe", "pipe"],
        shell: useShell
      });
      if (io.stdin?.isTTY && child.stdin) io.stdin.pipe?.(child.stdin);
      child.stdout.on("data", (chunk) => {
        pending.push(Promise.allSettled([
          writeStream(io.stdout, chunk),
          onOutput(chunk.toString("utf8")).catch(() => {})
        ]));
      });
      child.stderr.on("data", (chunk) => {
        pending.push(Promise.allSettled([
          writeStream(io.stderr, chunk),
          onOutput(chunk.toString("utf8")).catch(() => {})
        ]));
      });
      child.on("error", reject);
      child.on("close", async (code) => {
        await Promise.allSettled(pending);
        resolve(code);
      });
  });
}

function writeStream(stream, chunk) {
  return new Promise((resolve) => {
    if (!stream?.write) {
      resolve();
      return;
    }
    if (stream.write(chunk)) {
      resolve();
      return;
    }
    stream.once?.("drain", resolve);
  });
}

function writeTitle(io, snapshot) {
  if (!io.stdout?.isTTY) return;
  io.stdout.write(`\u001b]0;${terminalTitle(snapshot)}\u0007`);
}

export function shouldPassthroughHostCommand(command = "") {
  const name = basename(String(command || "")).toLowerCase();
  return /^codex(?:$|[-_.])/u.test(name);
}

/**
 * On Windows, node-pty's ConPTY cannot resolve bare command names through
 * PATH. This always delegates to cmd.exe /c which handles PATH, PATHEXT,
 * .cmd/.bat wrappers, and Node.js shims correctly.
 * On non-Windows, returns the command unchanged.
 */
function resolveCommandForPty(command, args, env = process.env) {
  if (process.platform !== "win32") return { command, args };
  const shell = env.COMSPEC || "cmd.exe";
  return { command: shell, args: ["/c", command, ...args] };
}

function stableSnapshotSignature(snap) {
  return `${snap.state}:${snap.message}:${snap.soul?.mood?.discrete || ""}`;
}

function biosDiagnostic(snap) {
  return {
    state: snap.state,
    soul: {
      mood: snap.soul?.mood?.discrete,
      arousal: snap.soul?.mood?.arousal,
      valence: snap.soul?.mood?.valence
    }
  };
}

function sanitizeErrorMessage(msg) {
  return String(msg || "").replace(/\u001b\[[0-9;]*m/g, "");
}

export function chooseLifeLlmProvider(cognition) {
  return cognition.llm?.provider || cognition.provider || "auto";
}

function isSoulConfigEvent(event) {
  return event && (event.persona || event.avatar);
}

function mergePersonaPatch(base = {}, patch = {}) {
  return {
    ...base,
    ...patch,
    speakingStyle: {
      ...(base.speakingStyle || {}),
      ...(patch.speakingStyle || {})
    }
  };
}
