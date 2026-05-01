/**
 * Cognition layer: multi-provider LLM abstraction.
 *
 * Providers covered:
 *   - OpenAILLMProvider     — Chat Completions + structured outputs (json_schema)
 *   - DeepSeekLLMProvider   — DeepSeek OpenAI-compatible chat completions
 *   - AnthropicLLMProvider  — Messages API + 2026 GA structured outputs (output_config)
 *   - OllamaLLMProvider     — Local /api/chat with `format` schema field
 *   - CodexCliLLMProvider   — Local Codex CLI via `codex exec`
 *   - createLLMProvider()   — Auto-detect composite factory
 *
 * Zero-dependency: only uses Node 20+ globals and built-ins.
 *
 * @typedef {Object} ChatMessage
 * @property {"user"|"assistant"} role
 * @property {string} content
 *
 * @typedef {Object} CompleteOptions
 * @property {string}        system        System prompt (may be empty).
 * @property {ChatMessage[]} messages      Conversation history.
 * @property {Object}        schema        JSON Schema for structured output.
 * @property {string}        schemaName    Human/programmatic name for the schema.
 * @property {number}        [temperature] 0..1, default 0.4
 * @property {number}        [maxTokens]   default 1024
 * @property {string}        [runId]       Optional caller-provided id.
 * @property {number}        [timeoutMs]   default 30_000
 * @property {AbortSignal}   [signal]      Caller-supplied abort signal.
 *
 * @typedef {Object} CompleteResult
 * @property {Object} data       Validated JSON object.
 * @property {string} raw        Raw textual response.
 * @property {string} runId      Unique id for this call.
 * @property {string} provider   Provider name.
 * @property {number} elapsed    Wall-clock ms.
 * @property {{ promptTokens:number, completionTokens:number, totalTokens:number }} usage
 *
 * @typedef {Object} ChatOptions
 * @property {string}        system
 * @property {ChatMessage[]} messages
 * @property {number}        [temperature]
 * @property {number}        [maxTokens]
 * @property {string}        [runId]
 * @property {number}        [timeoutMs]
 * @property {AbortSignal}   [signal]
 *
 * @typedef {Object} ChatResult
 * @property {string} text
 * @property {string} runId
 * @property {string} provider
 * @property {number} elapsed
 * @property {{ promptTokens:number, completionTokens:number, totalTokens:number }} [usage]
 */

import { spawn, spawnSync } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

const DEFAULT_TIMEOUT_MS = 30_000;

/* ────────────────────────── error type ────────────────────────── */

export class LLMError extends Error {
  /**
   * @param {string} message
   * @param {{ provider?: string, status?: number, cause?: unknown, kind?: string }} [meta]
   */
  constructor(message, { provider, status, cause, kind } = {}) {
    super(message);
    this.name = "LLMError";
    this.provider = provider || "unknown";
    this.status = typeof status === "number" ? status : undefined;
    this.kind = kind || "generic";
    if (cause !== undefined) this.cause = cause;
  }
}

/* ────────────────────────── helpers ───────────────────────────── */

const RANDOM6 = () => Math.random().toString(36).slice(2, 8).padEnd(6, "x").slice(0, 6);

/**
 * Generate a stable run id of the form `{provider}-{timestamp}-{random6}`.
 * @param {string} provider
 * @param {string} [override]
 */
export function makeRunId(provider, override) {
  if (typeof override === "string" && override.trim()) return override.trim();
  return `${provider}-${Date.now()}-${RANDOM6()}`;
}

/**
 * Race a promise against a timeout, surfacing AbortController for cancellation.
 * @template T
 * @param {(signal: AbortSignal) => Promise<T>} fn
 * @param {{ timeoutMs?: number, signal?: AbortSignal, provider: string, kind?: string }} options
 * @returns {Promise<T>}
 */
async function withAbort(fn, { timeoutMs = DEFAULT_TIMEOUT_MS, signal, provider, kind = "request" }) {
  const ac = new AbortController();
  const onAbort = () => ac.abort(signal?.reason);
  if (signal) {
    if (signal.aborted) ac.abort(signal.reason);
    else signal.addEventListener("abort", onAbort, { once: true });
  }
  const timer = setTimeout(() => {
    ac.abort(new LLMError(`${provider} ${kind} timed out after ${timeoutMs}ms`, {
      provider,
      kind: "timeout"
    }));
  }, timeoutMs);
  try {
    return await fn(ac.signal);
  } finally {
    clearTimeout(timer);
    if (signal) signal.removeEventListener("abort", onAbort);
  }
}

/**
 * Strict-mode JSON parse that throws an LLMError on failure.
 * @param {string} text
 * @param {string} provider
 * @returns {unknown}
 */
function parseJsonOrThrow(text, provider) {
  try {
    return JSON.parse(text);
  } catch (err) {
    throw new LLMError(`${provider} returned non-JSON content: ${truncate(text, 200)}`, {
      provider,
      kind: "parse",
      cause: err
    });
  }
}

function truncate(s, n) {
  const str = typeof s === "string" ? s : String(s ?? "");
  return str.length > n ? `${str.slice(0, n)}…` : str;
}

/**
 * Shallow JSON-Schema validator: checks that the value is an object, all
 * `required` keys are present, and the type of each named property matches the
 * declared `type` (or the first entry of a `type` array).
 *
 * Not a full validator — just enough to catch obvious provider mistakes.
 *
 * @param {unknown} data
 * @param {Object} schema
 * @returns {{ valid: boolean, errors: string[] }}
 */
export function validateSchemaShallow(data, schema) {
  const errors = [];
  if (!schema || typeof schema !== "object") {
    return { valid: true, errors };
  }
  const declaredType = Array.isArray(schema.type) ? schema.type[0] : schema.type;
  if (declaredType && declaredType !== "object") {
    if (!matchesType(data, declaredType)) {
      errors.push(`expected top-level type ${declaredType}, got ${actualType(data)}`);
    }
    return { valid: errors.length === 0, errors };
  }
  if (data === null || typeof data !== "object" || Array.isArray(data)) {
    errors.push(`expected object, got ${actualType(data)}`);
    return { valid: false, errors };
  }
  const required = Array.isArray(schema.required) ? schema.required : [];
  for (const key of required) {
    if (!Object.prototype.hasOwnProperty.call(data, key)) {
      errors.push(`missing required field "${key}"`);
    }
  }
  const props = schema.properties && typeof schema.properties === "object" ? schema.properties : {};
  for (const [key, propSchema] of Object.entries(props)) {
    if (!Object.prototype.hasOwnProperty.call(data, key)) continue;
    const t = propSchema && (Array.isArray(propSchema.type) ? propSchema.type[0] : propSchema.type);
    if (!t) continue;
    const value = /** @type {Record<string, unknown>} */ (data)[key];
    if (!matchesType(value, t)) {
      errors.push(`field "${key}" expected ${t}, got ${actualType(value)}`);
    }
  }
  return { valid: errors.length === 0, errors };
}

function matchesType(value, type) {
  switch (type) {
    case "string":
      return typeof value === "string";
    case "number":
      return typeof value === "number" && Number.isFinite(value);
    case "integer":
      return typeof value === "number" && Number.isInteger(value);
    case "boolean":
      return typeof value === "boolean";
    case "array":
      return Array.isArray(value);
    case "object":
      return value !== null && typeof value === "object" && !Array.isArray(value);
    case "null":
      return value === null;
    default:
      return true;
  }
}

function actualType(value) {
  if (value === null) return "null";
  if (Array.isArray(value)) return "array";
  return typeof value;
}

/**
 * Wrap raw fetch + JSON request handling, throwing LLMError on non-2xx or
 * non-JSON responses.
 *
 * @param {string} url
 * @param {Object} init
 * @param {{ provider: string, signal?: AbortSignal }} ctx
 */
async function postJson(url, init, ctx) {
  let response;
  try {
    response = await globalThis.fetch(url, init);
  } catch (err) {
    if (err instanceof LLMError) throw err;
    if (err?.name === "AbortError") {
      const cause = ctx.signal?.reason;
      if (cause instanceof LLMError) throw cause;
      throw new LLMError(`${ctx.provider} request aborted`, {
        provider: ctx.provider,
        kind: "abort",
        cause: err
      });
    }
    throw new LLMError(`${ctx.provider} network error: ${err?.message || err}`, {
      provider: ctx.provider,
      kind: "network",
      cause: err
    });
  }
  const text = await response.text().catch(() => "");
  if (!response.ok) {
    throw new LLMError(`${ctx.provider} HTTP ${response.status}: ${truncate(text, 300)}`, {
      provider: ctx.provider,
      status: response.status,
      kind: "http"
    });
  }
  if (!text) {
    throw new LLMError(`${ctx.provider} returned an empty body`, {
      provider: ctx.provider,
      status: response.status,
      kind: "parse"
    });
  }
  try {
    return JSON.parse(text);
  } catch (err) {
    throw new LLMError(`${ctx.provider} response is not valid JSON: ${truncate(text, 200)}`, {
      provider: ctx.provider,
      status: response.status,
      kind: "parse",
      cause: err
    });
  }
}

function nowMs() {
  if (typeof performance !== "undefined" && typeof performance.now === "function") {
    return performance.now();
  }
  return Date.now();
}

/**
 * @param {{ system?: string, messages: ChatMessage[] }} input
 * @returns {ChatMessage[]}
 */
function normalizeMessages(input) {
  const arr = Array.isArray(input?.messages) ? input.messages : [];
  /** @type {ChatMessage[]} */
  const out = [];
  for (const msg of arr) {
    if (!msg || typeof msg.content !== "string") continue;
    const role = msg.role === "assistant" ? "assistant" : "user";
    out.push({ role, content: msg.content });
  }
  return out;
}

function emptyUsage() {
  return { promptTokens: 0, completionTokens: 0, totalTokens: 0 };
}

/* ────────────────────────── OpenAI ────────────────────────────── */

export class OpenAILLMProvider {
  /**
   * @param {{ apiKey?: string, baseURL?: string, model?: string, env?: NodeJS.ProcessEnv }} [options]
   */
  constructor({ apiKey, baseURL, model, env = process.env } = {}) {
    this.name = "openai";
    this.apiKey = apiKey || env.OPENAI_API_KEY || "";
    this.baseURL = (baseURL || env.OPENAI_BASE_URL || "https://api.openai.com/v1").replace(/\/+$/, "");
    this.model = model || env.TERMVIS_LLM_MODEL || "gpt-4o-mini";
    this.available = Boolean(this.apiKey);
  }

  /**
   * @param {CompleteOptions} options
   * @returns {Promise<CompleteResult>}
   */
  async complete(options) {
    if (!this.available) {
      throw new LLMError("OpenAI provider missing OPENAI_API_KEY", {
        provider: this.name,
        kind: "config"
      });
    }
    const {
      system = "",
      messages = [],
      schema,
      schemaName,
      temperature = 0.4,
      maxTokens = 1024,
      runId,
      timeoutMs,
      signal
    } = options || {};
    if (!schema || typeof schema !== "object") {
      throw new LLMError("OpenAI complete() requires schema", {
        provider: this.name,
        kind: "config"
      });
    }
    if (typeof schemaName !== "string" || !schemaName.trim()) {
      throw new LLMError("OpenAI complete() requires schemaName", {
        provider: this.name,
        kind: "config"
      });
    }

    const id = makeRunId(this.name, runId);
    const start = nowMs();
    const body = {
      model: this.model,
      temperature,
      max_tokens: maxTokens,
      messages: [
        ...(system ? [{ role: "system", content: system }] : []),
        ...normalizeMessages({ messages })
      ],
      response_format: {
        type: "json_schema",
        json_schema: { name: schemaName, strict: true, schema }
      }
    };

    const json = await withAbort(
      (sig) =>
        postJson(
          `${this.baseURL}/chat/completions`,
          {
            method: "POST",
            headers: {
              "content-type": "application/json",
              authorization: `Bearer ${this.apiKey}`
            },
            body: JSON.stringify(body),
            signal: sig
          },
          { provider: this.name, signal: sig }
        ),
      { timeoutMs, signal, provider: this.name, kind: "complete" }
    );

    const raw = extractText(json?.choices?.[0]?.message?.content);
    if (!raw) {
      throw new LLMError("OpenAI returned empty content", {
        provider: this.name,
        kind: "parse"
      });
    }
    const data = parseJsonOrThrow(raw, this.name);
    const validation = validateSchemaShallow(data, schema);
    if (!validation.valid) {
      throw new LLMError(
        `OpenAI response failed schema validation: ${validation.errors.join("; ")}`,
        { provider: this.name, kind: "validation" }
      );
    }
    const usage = json?.usage ?? {};
    return {
      data,
      raw,
      runId: id,
      provider: this.name,
      elapsed: Math.round(nowMs() - start),
      usage: {
        promptTokens: Number(usage.prompt_tokens ?? 0) || 0,
        completionTokens: Number(usage.completion_tokens ?? 0) || 0,
        totalTokens: Number(usage.total_tokens ?? 0) || 0
      }
    };
  }

  /**
   * @param {ChatOptions} options
   * @returns {Promise<ChatResult>}
   */
  async chat(options) {
    if (!this.available) {
      throw new LLMError("OpenAI provider missing OPENAI_API_KEY", {
        provider: this.name,
        kind: "config"
      });
    }
    const {
      system = "",
      messages = [],
      temperature = 0.4,
      maxTokens = 1024,
      runId,
      timeoutMs,
      signal
    } = options || {};
    const id = makeRunId(this.name, runId);
    const start = nowMs();
    const body = {
      model: this.model,
      temperature,
      max_tokens: maxTokens,
      messages: [
        ...(system ? [{ role: "system", content: system }] : []),
        ...normalizeMessages({ messages })
      ]
    };
    const json = await withAbort(
      (sig) =>
        postJson(
          `${this.baseURL}/chat/completions`,
          {
            method: "POST",
            headers: {
              "content-type": "application/json",
              authorization: `Bearer ${this.apiKey}`
            },
            body: JSON.stringify(body),
            signal: sig
          },
          { provider: this.name, signal: sig }
        ),
      { timeoutMs, signal, provider: this.name, kind: "chat" }
    );
    const text = extractText(json?.choices?.[0]?.message?.content);
    const usage = json?.usage ?? {};
    return {
      text: text || "",
      runId: id,
      provider: this.name,
      elapsed: Math.round(nowMs() - start),
      usage: {
        promptTokens: Number(usage.prompt_tokens ?? 0) || 0,
        completionTokens: Number(usage.completion_tokens ?? 0) || 0,
        totalTokens: Number(usage.total_tokens ?? 0) || 0
      }
    };
  }
}

export class DeepSeekLLMProvider extends OpenAILLMProvider {
  /**
   * @param {{ apiKey?: string, baseURL?: string, model?: string, env?: NodeJS.ProcessEnv }} [options]
   */
  constructor({ apiKey, baseURL, model, env = process.env } = {}) {
    const key = apiKey ?? env.DEEPSEEK_API_KEY ?? "";
    super({
      env: { ...env, OPENAI_API_KEY: "", OPENAI_BASE_URL: "" },
      apiKey: key,
      baseURL: baseURL || env.DEEPSEEK_BASE_URL || "https://api.deepseek.com/v1",
      model: model || env.DEEPSEEK_MODEL || "deepseek-chat"
    });
    this.name = "deepseek";
    this.apiKey = key;
    this.available = Boolean(key);
  }

  async complete(options) {
    if (!this.available) {
      throw new LLMError("DeepSeek provider missing DEEPSEEK_API_KEY", {
        provider: this.name,
        kind: "config"
      });
    }
    const {
      system = "",
      messages = [],
      schema,
      schemaName,
      temperature = 0.4,
      maxTokens = 1024,
      runId,
      timeoutMs,
      signal
    } = options || {};
    if (!schema || typeof schema !== "object") {
      throw new LLMError("DeepSeek complete() requires schema", {
        provider: this.name,
        kind: "config"
      });
    }

    const id = makeRunId(this.name, runId);
    const start = nowMs();
    const schemaInstruction = `\n\n[JSON Schema: ${schemaName || "StructuredOutput"}]\nYou MUST respond with a valid JSON object matching this schema:\n${JSON.stringify(schema)}\nReturn ONLY raw JSON. No markdown fences, no commentary.`;
    const body = {
      model: this.model,
      temperature,
      max_tokens: maxTokens,
      messages: [
        ...(system ? [{ role: "system", content: system + schemaInstruction }] : [{ role: "system", content: schemaInstruction.trim() }]),
        ...normalizeMessages({ messages })
      ],
      response_format: { type: "json_object" }
    };

    const json = await withAbort(
      (sig) =>
        postJson(
          `${this.baseURL}/chat/completions`,
          {
            method: "POST",
            headers: {
              "content-type": "application/json",
              authorization: `Bearer ${this.apiKey}`
            },
            body: JSON.stringify(body),
            signal: sig
          },
          { provider: this.name, signal: sig }
        ),
      { timeoutMs, signal, provider: this.name, kind: "complete" }
    );

    const raw = extractText(json?.choices?.[0]?.message?.content);
    if (!raw) {
      throw new LLMError("DeepSeek returned empty content", {
        provider: this.name,
        kind: "parse"
      });
    }
    const data = parseJsonOrThrow(raw, this.name);
    const validation = validateSchemaShallow(data, schema);
    if (!validation.valid) {
      throw new LLMError(
        `DeepSeek response failed schema validation: ${validation.errors.join("; ")}`,
        { provider: this.name, kind: "validation" }
      );
    }
    const usage = json?.usage ?? {};
    return {
      data,
      raw,
      runId: id,
      provider: this.name,
      elapsed: Math.round(nowMs() - start),
      usage: {
        promptTokens: Number(usage.prompt_tokens ?? 0) || 0,
        completionTokens: Number(usage.completion_tokens ?? 0) || 0,
        totalTokens: Number(usage.total_tokens ?? 0) || 0
      }
    };
  }

  async chat(options) {
    if (!this.available) {
      throw new LLMError("DeepSeek provider missing DEEPSEEK_API_KEY", {
        provider: this.name,
        kind: "config"
      });
    }
    return super.chat(options);
  }
}

function extractText(content) {
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    return content
      .map((part) => {
        if (typeof part === "string") return part;
        if (part && typeof part === "object" && typeof part.text === "string") return part.text;
        return "";
      })
      .join("");
  }
  return "";
}

/* ────────────────────────── Anthropic ─────────────────────────── */

export class AnthropicLLMProvider {
  /**
   * @param {{ apiKey?: string, baseURL?: string, model?: string, env?: NodeJS.ProcessEnv, version?: string }} [options]
   */
  constructor({ apiKey, baseURL, model, env = process.env, version } = {}) {
    this.name = "anthropic";
    this.apiKey = apiKey || env.ANTHROPIC_API_KEY || "";
    this.baseURL = (baseURL || env.ANTHROPIC_BASE_URL || "https://api.anthropic.com/v1").replace(/\/+$/, "");
    this.model = model || env.TERMVIS_LLM_MODEL || "claude-haiku-4.5";
    this.version = version || env.ANTHROPIC_VERSION || "2023-06-01";
    this.available = Boolean(this.apiKey);
  }

  /**
   * @param {CompleteOptions} options
   * @returns {Promise<CompleteResult>}
   */
  async complete(options) {
    if (!this.available) {
      throw new LLMError("Anthropic provider missing ANTHROPIC_API_KEY", {
        provider: this.name,
        kind: "config"
      });
    }
    const {
      system = "",
      messages = [],
      schema,
      schemaName,
      temperature = 0.4,
      maxTokens = 1024,
      runId,
      timeoutMs,
      signal
    } = options || {};
    if (!schema || typeof schema !== "object") {
      throw new LLMError("Anthropic complete() requires schema", {
        provider: this.name,
        kind: "config"
      });
    }
    if (typeof schemaName !== "string" || !schemaName.trim()) {
      throw new LLMError("Anthropic complete() requires schemaName", {
        provider: this.name,
        kind: "config"
      });
    }
    const id = makeRunId(this.name, runId);
    const start = nowMs();
    const body = {
      model: this.model,
      max_tokens: maxTokens,
      temperature,
      messages: normalizeMessages({ messages }),
      output_config: {
        format: { type: "json_schema", json_schema: { name: schemaName, schema } }
      }
    };
    if (system) body.system = system;
    const json = await withAbort(
      (sig) =>
        postJson(
          `${this.baseURL}/messages`,
          {
            method: "POST",
            headers: {
              "content-type": "application/json",
              "x-api-key": this.apiKey,
              "anthropic-version": this.version
            },
            body: JSON.stringify(body),
            signal: sig
          },
          { provider: this.name, signal: sig }
        ),
      { timeoutMs, signal, provider: this.name, kind: "complete" }
    );
    const raw = extractAnthropicText(json);
    if (!raw) {
      throw new LLMError("Anthropic returned no text content", {
        provider: this.name,
        kind: "parse"
      });
    }
    const data = parseJsonOrThrow(raw, this.name);
    const validation = validateSchemaShallow(data, schema);
    if (!validation.valid) {
      throw new LLMError(
        `Anthropic response failed schema validation: ${validation.errors.join("; ")}`,
        { provider: this.name, kind: "validation" }
      );
    }
    const usage = json?.usage ?? {};
    const promptTokens = Number(usage.input_tokens ?? 0) || 0;
    const completionTokens = Number(usage.output_tokens ?? 0) || 0;
    return {
      data,
      raw,
      runId: id,
      provider: this.name,
      elapsed: Math.round(nowMs() - start),
      usage: {
        promptTokens,
        completionTokens,
        totalTokens: promptTokens + completionTokens
      }
    };
  }

  /**
   * @param {ChatOptions} options
   * @returns {Promise<ChatResult>}
   */
  async chat(options) {
    if (!this.available) {
      throw new LLMError("Anthropic provider missing ANTHROPIC_API_KEY", {
        provider: this.name,
        kind: "config"
      });
    }
    const {
      system = "",
      messages = [],
      temperature = 0.4,
      maxTokens = 1024,
      runId,
      timeoutMs,
      signal
    } = options || {};
    const id = makeRunId(this.name, runId);
    const start = nowMs();
    const body = {
      model: this.model,
      max_tokens: maxTokens,
      temperature,
      messages: normalizeMessages({ messages })
    };
    if (system) body.system = system;
    const json = await withAbort(
      (sig) =>
        postJson(
          `${this.baseURL}/messages`,
          {
            method: "POST",
            headers: {
              "content-type": "application/json",
              "x-api-key": this.apiKey,
              "anthropic-version": this.version
            },
            body: JSON.stringify(body),
            signal: sig
          },
          { provider: this.name, signal: sig }
        ),
      { timeoutMs, signal, provider: this.name, kind: "chat" }
    );
    const text = extractAnthropicText(json) || "";
    const usage = json?.usage ?? {};
    const promptTokens = Number(usage.input_tokens ?? 0) || 0;
    const completionTokens = Number(usage.output_tokens ?? 0) || 0;
    return {
      text,
      runId: id,
      provider: this.name,
      elapsed: Math.round(nowMs() - start),
      usage: {
        promptTokens,
        completionTokens,
        totalTokens: promptTokens + completionTokens
      }
    };
  }
}

function extractAnthropicText(json) {
  const blocks = Array.isArray(json?.content) ? json.content : [];
  let out = "";
  for (const block of blocks) {
    if (!block) continue;
    if (block.type === "text" && typeof block.text === "string") {
      out += block.text;
    } else if (block.type === "json" && block.json !== undefined) {
      try {
        out += JSON.stringify(block.json);
      } catch {
        /* ignore */
      }
    }
  }
  return out;
}

/* ────────────────────────── Ollama ────────────────────────────── */

export class OllamaLLMProvider {
  /**
   * @param {{ baseURL?: string, model?: string, env?: NodeJS.ProcessEnv }} [options]
   */
  constructor({ baseURL, model, env = process.env } = {}) {
    this.name = "ollama";
    this.baseURL = (baseURL || env.OLLAMA_HOST || env.OLLAMA_BASE_URL || "http://localhost:11434").replace(/\/+$/, "");
    this.model = model || env.TERMVIS_LLM_MODEL || "llama3.2";
    this.available = false;
  }

  /**
   * Probe `/api/tags` to detect a running Ollama daemon. Updates `this.available`.
   * @param {{ timeoutMs?: number, signal?: AbortSignal }} [options]
   */
  async probe({ timeoutMs = 2000, signal } = {}) {
    try {
      await withAbort(
        async (sig) => {
          const response = await globalThis.fetch(`${this.baseURL}/api/tags`, {
            method: "GET",
            signal: sig
          });
          if (!response.ok) {
            throw new LLMError(`probe HTTP ${response.status}`, {
              provider: this.name,
              status: response.status,
              kind: "http"
            });
          }
          await response.text().catch(() => "");
        },
        { timeoutMs, signal, provider: this.name, kind: "probe" }
      );
      this.available = true;
    } catch {
      this.available = false;
    }
    return this.available;
  }

  /**
   * @param {CompleteOptions} options
   * @returns {Promise<CompleteResult>}
   */
  async complete(options) {
    const {
      system = "",
      messages = [],
      schema,
      schemaName,
      temperature = 0.4,
      maxTokens = 1024,
      runId,
      timeoutMs,
      signal
    } = options || {};
    if (!schema || typeof schema !== "object") {
      throw new LLMError("Ollama complete() requires schema", {
        provider: this.name,
        kind: "config"
      });
    }
    if (typeof schemaName !== "string" || !schemaName.trim()) {
      throw new LLMError("Ollama complete() requires schemaName", {
        provider: this.name,
        kind: "config"
      });
    }
    const id = makeRunId(this.name, runId);
    const start = nowMs();
    const body = {
      model: this.model,
      stream: false,
      messages: [
        ...(system ? [{ role: "system", content: system }] : []),
        ...normalizeMessages({ messages })
      ],
      format: schema,
      options: { temperature, num_predict: maxTokens }
    };
    const json = await withAbort(
      (sig) =>
        postJson(
          `${this.baseURL}/api/chat`,
          {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify(body),
            signal: sig
          },
          { provider: this.name, signal: sig }
        ),
      { timeoutMs, signal, provider: this.name, kind: "complete" }
    );
    const raw = typeof json?.message?.content === "string" ? json.message.content : "";
    if (!raw) {
      throw new LLMError("Ollama returned empty message content", {
        provider: this.name,
        kind: "parse"
      });
    }
    const data = parseJsonOrThrow(raw, this.name);
    const validation = validateSchemaShallow(data, schema);
    if (!validation.valid) {
      throw new LLMError(
        `Ollama response failed schema validation: ${validation.errors.join("; ")}`,
        { provider: this.name, kind: "validation" }
      );
    }
    const promptTokens = Number(json?.prompt_eval_count ?? 0) || 0;
    const completionTokens = Number(json?.eval_count ?? 0) || 0;
    return {
      data,
      raw,
      runId: id,
      provider: this.name,
      elapsed: Math.round(nowMs() - start),
      usage: {
        promptTokens,
        completionTokens,
        totalTokens: promptTokens + completionTokens
      }
    };
  }

  /**
   * @param {ChatOptions} options
   * @returns {Promise<ChatResult>}
   */
  async chat(options) {
    const {
      system = "",
      messages = [],
      temperature = 0.4,
      maxTokens = 1024,
      runId,
      timeoutMs,
      signal
    } = options || {};
    const id = makeRunId(this.name, runId);
    const start = nowMs();
    const body = {
      model: this.model,
      stream: false,
      messages: [
        ...(system ? [{ role: "system", content: system }] : []),
        ...normalizeMessages({ messages })
      ],
      options: { temperature, num_predict: maxTokens }
    };
    const json = await withAbort(
      (sig) =>
        postJson(
          `${this.baseURL}/api/chat`,
          {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify(body),
            signal: sig
          },
          { provider: this.name, signal: sig }
        ),
      { timeoutMs, signal, provider: this.name, kind: "chat" }
    );
    const text = typeof json?.message?.content === "string" ? json.message.content : "";
    const promptTokens = Number(json?.prompt_eval_count ?? 0) || 0;
    const completionTokens = Number(json?.eval_count ?? 0) || 0;
    return {
      text,
      runId: id,
      provider: this.name,
      elapsed: Math.round(nowMs() - start),
      usage: {
        promptTokens,
        completionTokens,
        totalTokens: promptTokens + completionTokens
      }
    };
  }
}

/* ────────────────────────── Codex CLI ────────────────────────── */

export class CodexCliLLMProvider {
  /**
   * @param {{ bin?: string, model?: string|null, cwd?: string, env?: NodeJS.ProcessEnv }} [options]
   */
  constructor({ bin, model, cwd, env = process.env } = {}) {
    this.name = "codex";
    this.bin = bin || env.TERMVIS_CODEX_BIN || "codex";
    this.model = model || env.TERMVIS_CODEX_MODEL || "";
    this.cwd = cwd || process.cwd();
    this.env = env;
    this.available = env.TERMVIS_CODEX_LLM === "0" ? false : isExecutableAvailable(this.bin, env);
  }

  /**
   * @param {CompleteOptions} options
   * @returns {Promise<CompleteResult>}
   */
  async complete(options) {
    if (!this.available) {
      throw new LLMError("Codex CLI provider unavailable", { provider: this.name, kind: "config" });
    }
    const {
      system = "",
      messages = [],
      schema,
      schemaName,
      temperature = 0.2,
      maxTokens = 1024,
      runId,
      timeoutMs,
      signal
    } = options || {};
    if (!schema || typeof schema !== "object") {
      throw new LLMError("Codex CLI complete() requires schema", { provider: this.name, kind: "config" });
    }
    const id = makeRunId(this.name, runId);
    const start = nowMs();
    const dir = await mkdtemp(join(tmpdir(), "termvis-codex-"));
    try {
      const outputPath = join(dir, "last-message.json");
      const schemaPath = join(dir, "schema.json");
      await writeFile(schemaPath, JSON.stringify(schema), "utf8");
      const prompt = [
        "You are the intelligence layer for termvis soul rendering.",
        "Return only a JSON object that matches the schema below.",
        "Do not edit files, run commands, use tools, or include Markdown.",
        `Schema name: ${schemaName || "StructuredOutput"}`,
        `Temperature hint: ${temperature}; max token hint: ${maxTokens}.`,
        "",
        "[JSON Schema]",
        JSON.stringify(schema),
        "",
        "[System]",
        system,
        "",
        "[Messages]",
        renderPromptMessages(messages)
      ].join("\n");
      await runCodexExec({
        bin: this.bin,
        cwd: this.cwd,
        env: this.env,
        model: this.model,
        prompt,
        schemaPath,
        outputPath,
        timeoutMs,
        signal
      });
      const raw = (await readFile(outputPath, "utf8")).trim();
      const data = parseJsonOrThrow(extractJsonObjectText(raw), this.name);
      const validation = validateSchemaShallow(data, schema);
      if (!validation.valid) {
        throw new LLMError(`Codex CLI response failed schema validation: ${validation.errors.join("; ")}`, {
          provider: this.name,
          kind: "validation"
        });
      }
      return {
        data,
        raw,
        runId: id,
        provider: this.name,
        elapsed: Math.round(nowMs() - start),
        usage: emptyUsage()
      };
    } finally {
      await rm(dir, { recursive: true, force: true }).catch(() => {});
    }
  }

  /**
   * @param {ChatOptions} options
   * @returns {Promise<ChatResult>}
   */
  async chat(options) {
    if (!this.available) {
      throw new LLMError("Codex CLI provider unavailable", { provider: this.name, kind: "config" });
    }
    const {
      system = "",
      messages = [],
      runId,
      timeoutMs,
      signal
    } = options || {};
    const id = makeRunId(this.name, runId);
    const start = nowMs();
    const dir = await mkdtemp(join(tmpdir(), "termvis-codex-"));
    try {
      const outputPath = join(dir, "last-message.txt");
      const prompt = [
        "You are the intelligence layer for termvis.",
        "Respond directly and do not edit files, run commands, or use tools.",
        "",
        "[System]",
        system,
        "",
        "[Messages]",
        renderPromptMessages(messages)
      ].join("\n");
      await runCodexExec({
        bin: this.bin,
        cwd: this.cwd,
        env: this.env,
        model: this.model,
        prompt,
        outputPath,
        timeoutMs,
        signal
      });
      const text = (await readFile(outputPath, "utf8")).trim();
      return {
        text,
        runId: id,
        provider: this.name,
        elapsed: Math.round(nowMs() - start),
        usage: emptyUsage()
      };
    } finally {
      await rm(dir, { recursive: true, force: true }).catch(() => {});
    }
  }
}

function renderPromptMessages(messages = []) {
  return normalizeMessages({ messages })
    .map((message) => `${message.role.toUpperCase()}: ${message.content}`)
    .join("\n\n");
}

function isExecutableAvailable(bin, env) {
  try {
    const result = spawnSync(bin, ["--version"], {
      env,
      stdio: "ignore",
      timeout: 3000
    });
    return result.status === 0;
  } catch {
    return false;
  }
}

async function runCodexExec({
  bin,
  cwd,
  env,
  model,
  prompt,
  outputPath,
  schemaPath,
  timeoutMs,
  signal
}) {
  const args = [
    "exec",
    "--skip-git-repo-check",
    "--ephemeral",
    "--color", "never",
    "--sandbox", "read-only",
    "--ignore-rules",
    "--output-last-message", outputPath
  ];
  if (schemaPath) args.push("--output-schema", schemaPath);
  if (model) args.push("-m", model);
  if (cwd) args.push("-C", cwd);
  args.push("-");

  await new Promise((resolve, reject) => {
    const child = spawn(bin, args, {
      cwd,
      env,
      stdio: ["pipe", "pipe", "pipe"]
    });
    let stdout = "";
    let stderr = "";
    let settled = false;
    const timer = setTimeout(() => {
      child.kill("SIGTERM");
      finish(new LLMError(`Codex CLI timed out after ${timeoutMs || DEFAULT_TIMEOUT_MS}ms`, {
        provider: "codex",
        kind: "timeout"
      }));
    }, timeoutMs || DEFAULT_TIMEOUT_MS);
    const onAbort = () => {
      child.kill("SIGTERM");
      finish(new LLMError("Codex CLI request aborted", { provider: "codex", kind: "abort" }));
    };
    if (signal) {
      if (signal.aborted) onAbort();
      else signal.addEventListener("abort", onAbort, { once: true });
    }
    child.stdout.on("data", (chunk) => {
      stdout = truncateCapture(stdout + chunk.toString("utf8"));
    });
    child.stderr.on("data", (chunk) => {
      stderr = truncateCapture(stderr + chunk.toString("utf8"));
    });
    child.on("error", (error) => {
      finish(new LLMError(`Codex CLI failed to start: ${error?.message || error}`, {
        provider: "codex",
        kind: "spawn",
        cause: error
      }));
    });
    child.on("close", (code, sig) => {
      if (code === 0) finish();
      else finish(new LLMError(`Codex CLI exited with ${code ?? sig}: ${truncate(stderr || stdout, 500)}`, {
        provider: "codex",
        kind: "process"
      }));
    });
    child.stdin.end(prompt);

    function finish(error) {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (signal) signal.removeEventListener("abort", onAbort);
      if (error) reject(error);
      else resolve(undefined);
    }
  });
}

function truncateCapture(value) {
  const text = String(value || "");
  return text.length > 8192 ? text.slice(-8192) : text;
}

function extractJsonObjectText(text) {
  const raw = String(text || "").trim();
  if (raw.startsWith("{") && raw.endsWith("}")) return raw;
  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
  if (fenced?.[1]) return extractJsonObjectText(fenced[1]);
  const start = raw.indexOf("{");
  const end = raw.lastIndexOf("}");
  if (start !== -1 && end > start) return raw.slice(start, end + 1);
  return raw;
}

/* ────────────────────────── Composite / auto-detect ─────────── */

/**
 * Auto-detect the best available provider following this priority:
 *
 *   `preferred` (if its env is configured)
 *   → OpenAI (OPENAI_API_KEY)
 *   → DeepSeek (DEEPSEEK_API_KEY)
 *   → Anthropic (ANTHROPIC_API_KEY)
 *   → Ollama (probed lazily)
 *
 * If `config.cognition.requireReal === true` and no real provider is available,
 * throws `LLMError`.
 *
 * @param {{
 *   env?: NodeJS.ProcessEnv,
 *   config?: { cognition?: { requireReal?: boolean, llm?: { provider?: string, model?: string|null }, ollama?: { probe?: boolean } } },
 *   preferred?: "openai"|"anthropic"|"ollama"|"codex"|"deepseek"|"none"|"auto",
 *   probeOllama?: boolean
 *   cwd?: string
 * }} [options]
 * @returns {Promise<OpenAILLMProvider|DeepSeekLLMProvider|AnthropicLLMProvider|OllamaLLMProvider|CodexCliLLMProvider|null>}
 */
export async function createLLMProvider({ env = process.env, config = {}, preferred, probeOllama, cwd } = {}) {
  const cognitionCfg = (config && config.cognition) || {};
  const llmCfg = cognitionCfg.llm || {};
  const configuredProvider = normalizePreferredProvider(preferred ?? cognitionCfg.llm?.provider);
  const requireReal = Boolean(cognitionCfg.requireReal);
  const shouldProbeOllama =
    probeOllama !== undefined ? Boolean(probeOllama) : Boolean(cognitionCfg.ollama?.probe ?? true);
  if (configuredProvider === "none") return null;

  const apiKeyFor = (defaultEnvName) => {
    const configuredEnvName = typeof llmCfg.apiKeyEnv === "string" && isEnvVarName(llmCfg.apiKeyEnv.trim())
      ? llmCfg.apiKeyEnv.trim()
      : "";
    const envName = configuredEnvName || defaultEnvName;
    return (envName ? env[envName] : "") || "";
  };

  const factories = {
      openai: () => {
      const p = new OpenAILLMProvider({
        env,
        apiKey: apiKeyFor("OPENAI_API_KEY"),
        baseURL: llmCfg.baseURL || llmCfg.apiBase,
        model: llmCfg.model
      });
        return p.available ? p : null;
      },
    deepseek: () => {
      const p = new DeepSeekLLMProvider({
        env,
        apiKey: apiKeyFor("DEEPSEEK_API_KEY"),
        baseURL: llmCfg.baseURL || llmCfg.apiBase,
        model: llmCfg.model
      });
      return p.available ? p : null;
    },
      anthropic: () => {
      const p = new AnthropicLLMProvider({
        env,
        apiKey: apiKeyFor("ANTHROPIC_API_KEY"),
        baseURL: llmCfg.baseURL || llmCfg.apiBase,
        model: llmCfg.model,
        version: llmCfg.version
      });
      return p.available ? p : null;
    },
    ollama: async () => {
      const p = new OllamaLLMProvider({
        env,
        baseURL: llmCfg.baseURL || llmCfg.apiBase,
        model: llmCfg.model
      });
      if (shouldProbeOllama) {
        await p.probe();
      } else if (env.OLLAMA_HOST || env.OLLAMA_BASE_URL) {
        p.available = true;
      }
      return p.available ? p : null;
    },
    codex: () => {
      const p = new CodexCliLLMProvider({ env, model: llmCfg.model, cwd });
      return p.available ? p : null;
    }
  };

  const baseOrder = ["openai", "deepseek", "anthropic", "ollama"];
  const order = configuredProvider === "auto"
    ? baseOrder
    : [configuredProvider, ...baseOrder.filter((name) => name !== configuredProvider)];
  for (const name of order) {
    const f = factories[name];
    if (!f) continue;
    try {
      const provider = await f();
      if (provider) {
        return provider;
      }
    } catch {
      /* skip and continue */
    }
  }

  if (requireReal) {
    throw new LLMError("No real LLM provider available (set OPENAI_API_KEY/DEEPSEEK_API_KEY/ANTHROPIC_API_KEY/OLLAMA_HOST or use cognition.llm.provider=codex)", {
      provider: "composite",
      kind: "config"
    });
  }
  return null;
}

function normalizePreferredProvider(provider) {
  const value = String(provider || "auto").toLowerCase();
  return ["auto", "openai", "deepseek", "anthropic", "ollama", "codex", "none"].includes(value) ? value : "auto";
}

function isEnvVarName(value) {
  return /^[A-Za-z_][A-Za-z0-9_]*$/.test(String(value || ""));
}
