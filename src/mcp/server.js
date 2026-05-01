import { appendFileSync } from "node:fs";
import { DEFAULT_CONFIG } from "../core/config.js";
import { TermvisEngine } from "../application/termvis-engine.js";
import { appendSoulEvent, renderLivingFrame } from "../life/index.js";
import { sanitizeSessionId, createSoulState } from "../life/soul.js";
import { SoulBiosSessionManager } from "../life/soul-bios-bridge.js";

const SERVER_INFO = { name: "termvis", version: "0.1.0" };

/** @type {Map<string, SoulBiosSessionManager>} */
const soulBiosManagersByCwd = new Map();

function getSoulBiosManager(cwd) {
  const key = cwd || process.cwd();
  let manager = soulBiosManagersByCwd.get(key);
  if (!manager) {
    manager = new SoulBiosSessionManager({ cwd: key, config: structuredClone(DEFAULT_CONFIG) });
    soulBiosManagersByCwd.set(key, manager);
  }
  return manager;
}

function resolveMcpSoulSessionId(raw) {
  if (raw != null && String(raw).trim()) return sanitizeSessionId(raw);
  return createSoulState({}).sessionId;
}

export async function runMcpServer({ stdin = process.stdin, stdout = process.stdout, stderr = process.stderr, env = process.env, cwd = process.cwd() } = {}) {
  traceMcp(env, "ready", { cwd });
  const transport = createMcpStdioTransport({ stdin, stdout, env });
  transport.onMessage(async (message) => {
    try {
      traceMcp(env, "message", { method: message?.method, id: message?.id });
      const response = await handleMcpMessage(message, { env, cwd });
      if (response) {
        traceMcp(env, "send", { id: response.id, ok: !response.error, method: message?.method });
        transport.send(response);
      }
    } catch (error) {
      traceMcp(env, "error", { message: error.message || String(error) });
      transport.send({
        jsonrpc: "2.0",
        id: message?.id ?? null,
        error: { code: -32603, message: error.message || String(error) }
      });
    }
  });
  if (env.TERMVIS_MCP_DEBUG === "1") stderr.write?.("termvis MCP server ready\n");
  stdin.resume?.();
  await new Promise((resolve) => {
    stdin.on?.("end", () => {
      traceMcp(env, "stdin-end", {});
      resolve();
    });
    stdin.on?.("close", () => {
      traceMcp(env, "stdin-close", {});
      resolve();
    });
  });
  traceMcp(env, "exit", {});
}

export async function handleMcpMessage(message, { env = process.env, cwd = process.cwd() } = {}) {
  const id = message.id;
  switch (message.method) {
    case "initialize":
      return {
        jsonrpc: "2.0",
        id,
        result: {
          protocolVersion: message.params?.protocolVersion || "2024-11-05",
          capabilities: { tools: {} },
          serverInfo: SERVER_INFO
        }
      };
    case "notifications/initialized":
      return null;
    case "ping":
      return {
        jsonrpc: "2.0",
        id,
        result: {}
      };
    case "tools/list":
      return {
        jsonrpc: "2.0",
        id,
        result: {
          tools: [
            {
              name: "termvis_probe",
              description: "Probe terminal visual capabilities.",
              inputSchema: { type: "object", properties: {} }
            },
            {
              name: "termvis_render_card",
              description: "Render a terminal-safe card from text.",
              inputSchema: {
                type: "object",
                properties: {
                  title: { type: "string" },
                  body: { type: "string" },
                  width: { type: "number" }
                }
              }
            },
            {
              name: "termvis_render_image",
              description: "Render an image path through chafa when available, otherwise return a text fallback.",
              inputSchema: {
                type: "object",
                required: ["path"],
                properties: {
                  path: { type: "string" },
                  alt: { type: "string" }
                }
              }
            },
            {
              name: "termvis_life_frame",
              description: "Render a chafa-symbolic living terminal frame for an AI CLI state.",
              inputSchema: {
                type: "object",
                properties: {
                  title: { type: "string" },
                  host: { type: "string" },
                  state: {
                    type: "string",
                    enum: ["awakening", "listening", "reasoning", "acting", "observing", "waiting", "succeeded", "failed"]
                  },
                  message: { type: "string" },
                  avatar: { type: "string" },
                  width: { type: "number" },
                  avatarWidth: { type: "number" },
                  avatarHeight: { type: "number" }
                }
              }
            },
            {
              name: "termvis_soul_event",
              description: "Append an LLM-observed soul event. Runtime cognition decides how it affects visual state.",
              inputSchema: {
                type: "object",
                properties: {
                  sessionId: { type: "string" },
                  mood: { type: "string" },
                  presence: { type: "string" },
                  narration: { type: "string" },
                  reply: { type: "string" },
                  recovery: { type: "string" },
                  heartBpm: { type: "number" },
                  persona: { type: "object" },
                  source: { type: "string" }
                }
              }
            },
            {
              name: "termvis_soul_config",
              description: "Update the running soul persona, speaking style, or avatar renderer settings.",
              inputSchema: {
                type: "object",
                properties: {
                  sessionId: { type: "string" },
                  persona: { type: "object" },
                  avatar: { type: "string" },
                  avatarFit: { enum: ["contain", "cover", "stretch"] },
                  avatarAlign: { type: "string" },
                  avatarScale: { type: "string" },
                  avatarWidth: { type: "number" },
                  avatarHeight: { type: "number" },
                  source: { type: "string" }
                }
              }
            },
            {
              name: "termvis_signal_ingest",
              description: "Ingest a batch of normalized signal events into the soul bios engine.",
              inputSchema: {
                type: "object",
                required: ["events"],
                properties: {
                  sessionId: { type: "string" },
                  events: {
                    type: "array",
                    items: {
                      type: "object",
                      properties: {
                        source: { type: "string" },
                        kind: { type: "string" },
                        priority: { type: "number" },
                        payload: { type: "object" }
                      }
                    }
                  }
                }
              }
            },
            {
              name: "termvis_soul_tick",
              description: "Advance the soul bios engine by one tick and return the current SoulFrame.",
              inputSchema: {
                type: "object",
                properties: {
                  sessionId: { type: "string" }
                }
              }
            }
          ]
        }
      };
    case "tools/call":
      return {
        jsonrpc: "2.0",
        id,
        result: await callTool(message.params?.name, message.params?.arguments || {}, { env, cwd })
      };
    default:
      return {
        jsonrpc: "2.0",
        id,
        error: { code: -32601, message: `Unknown method: ${message.method}` }
      };
  }
}

async function callTool(name, args, { env, cwd }) {
  const engine = new TermvisEngine({ env, config: DEFAULT_CONFIG });
  if (name === "termvis_probe") {
    return asTextContent(JSON.stringify(engine.probeCapabilities(), null, 2));
  }
  if (name === "termvis_render_card") {
    const result = await engine.layoutCard(args);
    return asTextContent(result.lines.join("\n"));
  }
  if (name === "termvis_render_image") {
    const result = await engine.renderBlock({
      source: { type: "file", path: args.path },
      alt: args.alt || "Image preview"
    });
    return asTextContent(result.payload);
  }
  if (name === "termvis_life_frame") {
    const frame = await renderLivingFrame({
      engine,
      title: args.title || "termvis living shell",
      host: args.host || env.TERMVIS_HOST || "ai-cli",
      state: args.state || "reasoning",
      message: args.message,
      avatar: args.avatar,
      width: args.width,
      avatarWidth: args.avatarWidth,
      avatarHeight: args.avatarHeight,
      symbolic: true,
      strict: false
    });
    return asTextContent(frame);
  }
  if (name === "termvis_soul_event") {
    const result = await appendSoulEvent({
      cwd,
      sessionId: args.sessionId,
      event: {
        type: "soul.llm",
        mood: args.mood,
        presence: args.presence,
        narration: args.narration,
        reply: args.reply,
        recovery: args.recovery,
        heartBpm: args.heartBpm,
        persona: args.persona,
        source: args.source || env.TERMVIS_HOST || "llm"
      }
    });
    return asTextContent(JSON.stringify({
      ok: true,
      sessionId: result.sessionId,
      event: result.event
    }, null, 2));
  }
  if (name === "termvis_soul_config") {
    const result = await appendSoulEvent({
      cwd,
      sessionId: args.sessionId,
      event: {
        type: "soul.config",
        persona: args.persona,
        avatar: args.avatar,
        avatarFit: args.avatarFit,
        avatarAlign: args.avatarAlign,
        avatarScale: args.avatarScale,
        avatarWidth: args.avatarWidth,
        avatarHeight: args.avatarHeight,
        source: args.source || env.TERMVIS_HOST || "config"
      }
    });
    return asTextContent(JSON.stringify({
      ok: true,
      sessionId: result.sessionId,
      event: result.event
    }, null, 2));
  }
  if (name === "termvis_signal_ingest") {
    const bios = getSoulBiosManager(cwd);
    const sessionId = resolveMcpSoulSessionId(args.sessionId);
    if (!Array.isArray(args.events)) throw new Error("termvis_signal_ingest requires an events array");
    const result = await bios.ingest(sessionId, args.events);
    return asTextContent(JSON.stringify({ ok: true, sessionId, ...result }, null, 2));
  }
  if (name === "termvis_soul_tick") {
    const bios = getSoulBiosManager(cwd);
    const sessionId = resolveMcpSoulSessionId(args.sessionId);
    const frame = await bios.tick(sessionId);
    return asTextContent(JSON.stringify({ ok: true, sessionId, frame }, null, 2));
  }
  throw new Error(`Unknown tool: ${name}`);
}

function traceMcp(env, event, data) {
  if (!env.TERMVIS_MCP_TRACE_FILE) return;
  try {
    appendFileSync(env.TERMVIS_MCP_TRACE_FILE, `${JSON.stringify({ at: new Date().toISOString(), event, ...data })}\n`);
  } catch {
    // Tracing must never interfere with MCP protocol stdout.
  }
}

function asTextContent(text) {
  return { content: [{ type: "text", text: String(text) }] };
}

export function createMcpStdioTransport({ stdin, stdout, env = {} }) {
  let buffer = Buffer.alloc(0);
  let outputMode = "content-length";
  const listeners = new Set();

  stdin.on?.("data", (chunk) => {
    traceMcp(env, "stdin-data", { bytes: Buffer.byteLength(chunk) });
    buffer = Buffer.concat([buffer, Buffer.from(chunk)]);
    while (true) {
      const parsed = readFrame(buffer);
      if (parsed) {
        outputMode = "content-length";
        buffer = parsed.rest;
        dispatchMessage(JSON.parse(parsed.body.toString("utf8")));
        continue;
      }

      if (looksLikePartialHeader(buffer)) break;
      const newline = buffer.indexOf("\n");
      if (newline === -1) break;
      const line = buffer.subarray(0, newline).toString("utf8").replace(/\r$/, "").trim();
      buffer = buffer.subarray(newline + 1);
      if (!line) continue;
      outputMode = "line";
      dispatchMessage(JSON.parse(line));
    }
  });

  return {
    onMessage(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    send(message) {
      const text = JSON.stringify(message);
      if (outputMode === "line") {
        stdout.write(`${text}\n`);
        return;
      }
      const body = Buffer.from(text, "utf8");
      stdout.write(`Content-Length: ${body.length}\r\n\r\n`);
      stdout.write(body);
    }
  };

  function dispatchMessage(message) {
    for (const listener of listeners) listener(message);
  }
}

function readFrame(buffer) {
  let separator = buffer.indexOf("\r\n\r\n");
  let separatorLength = 4;
  if (separator === -1) {
    separator = buffer.indexOf("\n\n");
    separatorLength = 2;
  }
  if (separator === -1) return null;
  const header = buffer.subarray(0, separator).toString("ascii");
  const match = /content-length:\s*(\d+)/i.exec(header);
  if (!match) throw new Error("Missing Content-Length header");
  const length = Number(match[1]);
  const start = separator + separatorLength;
  const end = start + length;
  if (buffer.length < end) return null;
  return {
    body: buffer.subarray(start, end),
    rest: buffer.subarray(end)
  };
}

function looksLikePartialHeader(buffer) {
  const probe = buffer.subarray(0, Math.min(buffer.length, "content-length:".length)).toString("ascii").toLowerCase();
  return "content-length:".startsWith(probe) || probe.startsWith("content-length:");
}
