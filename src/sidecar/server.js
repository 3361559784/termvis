import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DEFAULT_CONFIG } from "../core/config.js";
import { TermvisEngine } from "../application/termvis-engine.js";
import { createLineJsonRpcHandler } from "../protocol/json-rpc.js";
import {
  applySoulEvent,
  appendSoulEvent,
  createLifeSnapshot,
  createSoulEventStore,
  createSoulState,
  readSoulEvents,
  renderLifeTuiPanel,
  renderSoulAltText
} from "../life/index.js";
import { SoulBiosSessionManager } from "../life/soul-bios-bridge.js";

export async function startSidecarServer({ socketPath = createDefaultSocketPath(), host, port, env = process.env, cwd = process.cwd(), config = DEFAULT_CONFIG } = {}) {
  const server = createServer((socket) => {
    const methods = createSidecarMethods({ env, cwd, config });
    const handleChunk = createLineJsonRpcHandler(methods, (response) => {
      socket.write(`${JSON.stringify(response)}\n`);
    });
    socket.on("data", (chunk) => {
      handleChunk(chunk).catch((error) => {
        socket.write(`${JSON.stringify({ jsonrpc: "2.0", id: null, error: { code: -32603, message: error.message } })}\n`);
      });
    });
  });

  await new Promise((resolve, reject) => {
    server.once("error", reject);
    if (port !== undefined) server.listen({ host: host || "127.0.0.1", port }, resolve);
    else server.listen(socketPath, resolve);
  });

  return {
    socketPath: port === undefined ? socketPath : null,
    address: server.address(),
    server,
    close: () => new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()))
  };
}

export function createSidecarMethods({ env = process.env, cwd = process.cwd(), config = DEFAULT_CONFIG } = {}) {
  const engine = new TermvisEngine({ env, cwd, config });
  const soulSessions = new Map();
  const soulBios = new SoulBiosSessionManager({ cwd, config });

  /** @returns {Promise<string>} resolved session key from legacy soulSessions */
  async function resolveSoulSessionKey(paramsSessionId, sessionCwd) {
    const current = await getSoulSession(paramsSessionId, sessionCwd);
    return current.state.sessionId;
  }

  return {
    ping: async () => ({ ok: true }),
    probeCaps: async (params = {}) => engine.probeCapabilities({ env: params.env, stdout: params.stdout, stdin: params.stdin }),
    layoutCard: async (params = {}) => engine.layoutCard(params),
    renderBlock: async (params = {}) => engine.renderBlock(params),
    "soul.init": async (params = {}) => {
      const state = createSoulState({
        sessionId: params.sessionId,
        mode: params.mode,
        mood: params.mood,
        presence: params.presence,
        narration: params.narration,
        reply: params.reply,
        persona: params.persona
      });
      const store = await createSoulEventStore({ cwd: params.cwd || cwd, sessionId: state.sessionId, state });
      soulSessions.set(state.sessionId, { state, offset: store.offset, cwd: params.cwd || cwd });
      return { sessionId: state.sessionId };
    },
    "soul.getState": async (params = {}) => {
      const current = await getSoulSession(params.sessionId, params.cwd || cwd);
      return { state: current.state };
    },
    "soul.renderTick": async (params = {}) => {
      const current = await getSoulSession(params.sessionId, params.cwd || cwd);
      const snapshot = {
        ...createLifeSnapshot({
          title: params.title || "termvis soul",
          host: params.host || "sidecar",
          state: params.state || "listening",
          message: params.message
        }),
        soul: current.state
      };
      return {
        diff: renderLifeTuiPanel({
          snapshot,
          width: params.width || 34,
          height: params.height || 18,
          avatarWidth: params.avatarWidth,
          avatarHeight: params.avatarHeight
        }).join("\n"),
        altText: renderSoulAltText(current.state, snapshot)
      };
    },
    "soul.setTheme": async (params = {}) => ({ ok: true, themeId: params.themeId || config.theme?.name || "moon-white-flow" }),
    "soul.consent": async (params = {}) => ({ ok: true, kind: params.kind || "unspecified", granted: Boolean(params.granted) }),
    "soul.configure": async (params = {}) => {
      const sessionId = await resolveSoulSessionKey(params.sessionId, params.cwd || cwd);
      const result = await appendSoulEvent({
        cwd: params.cwd || cwd,
        sessionId,
        event: {
          type: "soul.config",
          persona: params.persona,
          avatar: params.avatar,
          avatarFit: params.avatarFit,
          avatarAlign: params.avatarAlign,
          avatarScale: params.avatarScale,
          avatarWidth: params.avatarWidth,
          avatarHeight: params.avatarHeight,
          source: params.source || "sidecar"
        }
      });
      return { ok: true, sessionId, event: result.event };
    },
    "signal.ingest": async (params = {}) => {
      const sessionId = await resolveSoulSessionKey(params.sessionId, params.cwd || cwd);
      const events = Array.isArray(params.events) ? params.events : [];
      return soulBios.ingest(sessionId, events);
    },
    "soul.tick": async (params = {}) => {
      const sessionId = await resolveSoulSessionKey(params.sessionId, params.cwd || cwd);
      const now = typeof params.now === "string" ? params.now : new Date().toISOString();
      return soulBios.tick(sessionId, now);
    },
    "memory.snapshot.export": async (params = {}) => {
      const sessionId = await resolveSoulSessionKey(params.sessionId, params.cwd || cwd);
      const scope = params.scope || "all";
      return soulBios.memorySnapshot(sessionId, scope);
    },
    cwd: async () => ({ cwd })
  };

  async function getSoulSession(sessionId, sessionCwd) {
    let id = sessionId;
    if (!id) {
      const state = createSoulState({});
      const store = await createSoulEventStore({ cwd: sessionCwd, state });
      soulSessions.set(state.sessionId, { state, offset: store.offset, cwd: sessionCwd });
      id = state.sessionId;
    }
    const existing = soulSessions.get(id) || { state: createSoulState({ sessionId: id }), offset: 0, cwd: sessionCwd };
    const result = await readSoulEvents({ cwd: existing.cwd || sessionCwd, sessionId: id, offset: existing.offset || 0 });
    let state = existing.state;
    for (const event of result.events) state = applySoulEvent(state, event);
    const next = { state, offset: result.offset, cwd: existing.cwd || sessionCwd };
    soulSessions.set(id, next);
    return next;
  }
}

export function createDefaultSocketPath(env = process.env) {
  if (process.platform === "win32") {
    return `\\\\.\\pipe\\termvis-${process.pid}`;
  }
  return join(env.XDG_RUNTIME_DIR || tmpdir(), `termvis-${process.pid}.sock`);
}
