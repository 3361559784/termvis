/**
 * Cognition layer: embedding providers and similarity utilities.
 *
 * Providers:
 *   - OpenAIEmbeddingProvider   — text-embedding-3-small (1536d) by default
 *   - OllamaEmbeddingProvider   — nomic-embed-text (768d) by default
 *   - LexicalEmbeddingProvider  — deterministic local hashing+TF provider
 *   - CachedEmbedder            — SHA-256 keyed memory + optional file cache
 *   - createEmbeddingProvider() — auto-detect composite factory
 *
 * Zero-dependency: only Node 20+ globals + `node:crypto` + `node:fs/promises`.
 *
 * @typedef {Object} EmbeddingProvider
 * @property {string}    name
 * @property {boolean}   available
 * @property {number}    dimensions
 * @property {(text: string)        => Promise<Float32Array>} embed
 * @property {(texts: string[])     => Promise<Float32Array[]>} embedBatch
 */

import { createHash } from "node:crypto";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { dirname } from "node:path";

import { LLMError } from "./llm-provider.js";

const DEFAULT_TIMEOUT_MS = 30_000;

/* ────────────────────────── helpers ───────────────────────────── */

function nowMs() {
  if (typeof performance !== "undefined" && typeof performance.now === "function") {
    return performance.now();
  }
  return Date.now();
}

/**
 * @param {(signal: AbortSignal) => Promise<Response>} fn
 * @param {{ timeoutMs?: number, signal?: AbortSignal, provider: string, kind?: string }} ctx
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
    throw new LLMError(
      `${ctx.provider} HTTP ${response.status}: ${text.slice(0, 200)}`,
      { provider: ctx.provider, status: response.status, kind: "http" }
    );
  }
  if (!text) {
    throw new LLMError(`${ctx.provider} returned empty body`, {
      provider: ctx.provider,
      kind: "parse"
    });
  }
  try {
    return JSON.parse(text);
  } catch (err) {
    throw new LLMError(`${ctx.provider} response is not valid JSON`, {
      provider: ctx.provider,
      status: response.status,
      kind: "parse",
      cause: err
    });
  }
}

function toFloat32(values, dimensions) {
  if (values instanceof Float32Array) return values;
  if (!Array.isArray(values)) {
    throw new LLMError("embedding response did not include a numeric vector", {
      kind: "parse"
    });
  }
  const out = new Float32Array(dimensions ?? values.length);
  const n = Math.min(out.length, values.length);
  for (let i = 0; i < n; i++) {
    const v = Number(values[i]);
    out[i] = Number.isFinite(v) ? v : 0;
  }
  return out;
}

/* ────────────────────────── vector utilities ─────────────────── */

/**
 * Cosine similarity in [-1, 1]. Tolerates dimension mismatch by truncating to
 * the shorter vector. Returns 0 when either vector has zero norm.
 *
 * @param {Float32Array | number[]} a
 * @param {Float32Array | number[]} b
 * @returns {number}
 */
export function cosineSimilarity(a, b) {
  if (!a || !b) return 0;
  const len = Math.min(a.length, b.length);
  if (len === 0) return 0;
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < len; i++) {
    const x = +a[i] || 0;
    const y = +b[i] || 0;
    dot += x * y;
    na += x * x;
    nb += y * y;
  }
  if (na === 0 || nb === 0) return 0;
  const sim = dot / (Math.sqrt(na) * Math.sqrt(nb));
  if (sim > 1) return 1;
  if (sim < -1) return -1;
  return sim;
}

/**
 * Mutates `vec` in place to unit L2 length (no-op for zero vectors).
 * @param {Float32Array | number[]} vec
 * @returns {Float32Array | number[]} the same reference, normalized
 */
export function l2Normalize(vec) {
  if (!vec || vec.length === 0) return vec;
  let sum = 0;
  for (let i = 0; i < vec.length; i++) {
    const v = +vec[i] || 0;
    sum += v * v;
  }
  if (sum === 0) return vec;
  const inv = 1 / Math.sqrt(sum);
  for (let i = 0; i < vec.length; i++) {
    vec[i] = (+vec[i] || 0) * inv;
  }
  return vec;
}

/* ────────────────────────── OpenAI embeddings ─────────────────── */

export class OpenAIEmbeddingProvider {
  /**
   * @param {{ apiKey?: string, baseURL?: string, model?: string, dimensions?: number, env?: NodeJS.ProcessEnv }} [options]
   */
  constructor({ apiKey, baseURL, model, dimensions, env = process.env } = {}) {
    this.name = "openai";
    this.apiKey = apiKey || env.OPENAI_API_KEY || "";
    this.baseURL = (baseURL || env.OPENAI_BASE_URL || "https://api.openai.com/v1").replace(/\/+$/, "");
    this.model = model || env.TERMVIS_EMBEDDING_MODEL || "text-embedding-3-small";
    this.dimensions = Number.isFinite(dimensions) ? dimensions : 1536;
    this.available = Boolean(this.apiKey);
  }

  /**
   * @param {string} text
   * @param {{ timeoutMs?: number, signal?: AbortSignal }} [options]
   */
  async embed(text, options = {}) {
    const [vec] = await this.embedBatch([text], options);
    return vec;
  }

  /**
   * Embed up to 256 texts per request (OpenAI hard limit is 2048).
   * @param {string[]} texts
   * @param {{ timeoutMs?: number, signal?: AbortSignal }} [options]
   * @returns {Promise<Float32Array[]>}
   */
  async embedBatch(texts, options = {}) {
    if (!this.available) {
      throw new LLMError("OpenAI embedding provider missing OPENAI_API_KEY", {
        provider: this.name,
        kind: "config"
      });
    }
    const list = Array.isArray(texts) ? texts.map((t) => String(t ?? "")) : [];
    if (list.length === 0) return [];
    const { timeoutMs, signal } = options;
    /** @type {Float32Array[]} */
    const out = new Array(list.length);
    const BATCH = 256;
    for (let i = 0; i < list.length; i += BATCH) {
      const slice = list.slice(i, i + BATCH);
      const body = {
        input: slice,
        model: this.model,
        dimensions: this.dimensions
      };
      const json = await withAbort(
        (sig) =>
          postJson(
            `${this.baseURL}/embeddings`,
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
        { timeoutMs, signal, provider: this.name, kind: "embed" }
      );
      const data = Array.isArray(json?.data) ? json.data : [];
      if (data.length !== slice.length) {
        throw new LLMError(
          `OpenAI embeddings returned ${data.length} vectors for ${slice.length} inputs`,
          { provider: this.name, kind: "parse" }
        );
      }
      for (let j = 0; j < data.length; j++) {
        const item = data[j];
        out[i + j] = toFloat32(item?.embedding, this.dimensions);
      }
    }
    return out;
  }
}

/* ────────────────────────── Ollama embeddings ─────────────────── */

export class OllamaEmbeddingProvider {
  /**
   * @param {{ baseURL?: string, model?: string, dimensions?: number, env?: NodeJS.ProcessEnv }} [options]
   */
  constructor({ baseURL, model, dimensions, env = process.env } = {}) {
    this.name = "ollama";
    this.baseURL = (baseURL || env.OLLAMA_HOST || env.OLLAMA_BASE_URL || "http://localhost:11434").replace(/\/+$/, "");
    this.model = model || env.TERMVIS_EMBEDDING_MODEL || "nomic-embed-text";
    this.dimensions = Number.isFinite(dimensions) ? dimensions : 768;
    this.available = false;
  }

  /**
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
          return response;
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
   * @param {string} text
   * @param {{ timeoutMs?: number, signal?: AbortSignal }} [options]
   */
  async embed(text, options = {}) {
    const [vec] = await this.embedBatch([text], options);
    return vec;
  }

  /**
   * @param {string[]} texts
   * @param {{ timeoutMs?: number, signal?: AbortSignal }} [options]
   * @returns {Promise<Float32Array[]>}
   */
  async embedBatch(texts, options = {}) {
    const list = Array.isArray(texts) ? texts.map((t) => String(t ?? "")) : [];
    if (list.length === 0) return [];
    const { timeoutMs, signal } = options;
    const body = { model: this.model, input: list };
    const json = await withAbort(
      (sig) =>
        postJson(
          `${this.baseURL}/api/embed`,
          {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify(body),
            signal: sig
          },
          { provider: this.name, signal: sig }
        ),
      { timeoutMs, signal, provider: this.name, kind: "embed" }
    );
    const arr = Array.isArray(json?.embeddings)
      ? json.embeddings
      : Array.isArray(json?.embedding)
        ? [json.embedding]
        : null;
    if (!arr || arr.length === 0) {
      throw new LLMError("Ollama /api/embed returned no embeddings", {
        provider: this.name,
        kind: "parse"
      });
    }
    return arr.map((vec) => toFloat32(vec, vec?.length || this.dimensions));
  }
}

/* ────────────────────────── Lexical provider ─────────────────── */

/**
 * Deterministic hashing-based local embedding provider. It preserves
 * "same-text → same-vector" and gives non-trivial
 * cosine similarity for documents that share tokens.
 *
 * Algorithm (feature hashing + sublinear TF + L2 normalisation):
 *   1. Lowercase, tokenize on \W+, drop empties, count token frequencies.
 *   2. For each token occurrence, hash with SHA-1, take the first 32 bits as
 *      an unsigned int, bucket = `hash mod dimensions`.
 *   3. `vec[bucket] += 1 / sqrt(freq[token])` per occurrence — equivalent to
 *      adding `sqrt(freq)` once per unique token type.
 *   4. L2-normalise the resulting vector.
 */
export class LexicalEmbeddingProvider {
  /**
   * @param {{ dimensions?: number }} [options]
   */
  constructor({ dimensions = 256 } = {}) {
    this.name = "lexical";
    this.dimensions = Math.max(8, Math.floor(Number(dimensions) || 256));
    this.available = true;
  }

  /**
   * @param {string} text
   * @returns {Promise<Float32Array>}
   */
  async embed(text) {
    const out = new Float32Array(this.dimensions);
    const tokens = tokenize(String(text ?? ""));
    if (tokens.length === 0) return out;
    /** @type {Map<string, number>} */
    const freq = new Map();
    for (const t of tokens) freq.set(t, (freq.get(t) || 0) + 1);
    for (const t of tokens) {
      const idx = hashBucket(t, this.dimensions);
      const f = freq.get(t) || 1;
      out[idx] += 1 / Math.sqrt(f);
    }
    l2Normalize(out);
    return out;
  }

  /**
   * @param {string[]} texts
   * @returns {Promise<Float32Array[]>}
   */
  async embedBatch(texts) {
    const list = Array.isArray(texts) ? texts : [];
    return Promise.all(list.map((t) => this.embed(t)));
  }
}

function tokenize(text) {
  if (!text) return [];
  return text
    .toLowerCase()
    .split(/[^a-z0-9_]+/u)
    .filter((t) => t.length > 0);
}

function hashBucket(token, dimensions) {
  const digest = createHash("sha1").update(token).digest();
  const word = digest.readUInt32BE(0);
  return word % dimensions;
}

/* ────────────────────────── Cached wrapper ────────────────────── */

/**
 * Wraps any `EmbeddingProvider` with a SHA-256-keyed in-memory cache and an
 * optional disk-backed JSON cache. Cache eviction is FIFO by insertion order
 * once `cacheSize` is exceeded.
 *
 * Disk persistence is *opt-in* and *manual*: call `await cached.flush()` to
 * write the cache to disk; `await cached.load()` (or `await cached.ready` after
 * construction) to read it back. This keeps `embed()` synchronous-ish and
 * avoids surprise I/O on every call.
 */
export class CachedEmbedder {
  /**
   * @param {EmbeddingProvider} provider
   * @param {{ cacheSize?: number, persistPath?: string, autoLoad?: boolean }} [options]
   */
  constructor(provider, { cacheSize = 5000, persistPath, autoLoad = true } = {}) {
    if (!provider || typeof provider.embed !== "function") {
      throw new TypeError("CachedEmbedder requires a provider with embed()");
    }
    this.provider = provider;
    this.name = provider.name;
    this.dimensions = provider.dimensions;
    this.available = provider.available;
    this.cacheSize = Math.max(0, Math.floor(Number(cacheSize) || 0));
    this.persistPath = persistPath || null;
    /** @type {Map<string, Float32Array>} */
    this.cache = new Map();
    this.hits = 0;
    this.misses = 0;
    /** @type {Promise<void> | null} */
    this.ready = autoLoad && this.persistPath ? this.load().catch(() => undefined) : null;
  }

  /**
   * @param {string} text
   * @returns {Promise<Float32Array>}
   */
  async embed(text) {
    if (this.ready) await this.ready;
    const key = this.#cacheKey(text);
    const cached = this.cache.get(key);
    if (cached) {
      this.hits++;
      this.cache.delete(key);
      this.cache.set(key, cached);
      return cached;
    }
    this.misses++;
    const vec = await this.provider.embed(String(text ?? ""));
    this.#put(key, vec);
    return vec;
  }

  /**
   * @param {string[]} texts
   * @returns {Promise<Float32Array[]>}
   */
  async embedBatch(texts) {
    if (this.ready) await this.ready;
    const list = Array.isArray(texts) ? texts.map((t) => String(t ?? "")) : [];
    /** @type {Float32Array[]} */
    const out = new Array(list.length);
    /** @type {number[]} */
    const missIdx = [];
    /** @type {string[]} */
    const missText = [];
    for (let i = 0; i < list.length; i++) {
      const key = this.#cacheKey(list[i]);
      const cached = this.cache.get(key);
      if (cached) {
        this.hits++;
        this.cache.delete(key);
        this.cache.set(key, cached);
        out[i] = cached;
      } else {
        this.misses++;
        missIdx.push(i);
        missText.push(list[i]);
      }
    }
    if (missIdx.length > 0) {
      const vecs =
        typeof this.provider.embedBatch === "function"
          ? await this.provider.embedBatch(missText)
          : await Promise.all(missText.map((t) => this.provider.embed(t)));
      for (let j = 0; j < missIdx.length; j++) {
        const i = missIdx[j];
        const vec = vecs[j];
        out[i] = vec;
        this.#put(this.#cacheKey(list[i]), vec);
      }
    }
    return out;
  }

  /** Hit-rate (0..1). Returns 0 when there have been no calls. */
  hitRate() {
    const total = this.hits + this.misses;
    return total === 0 ? 0 : this.hits / total;
  }

  /** Empty the cache and reset counters (does not touch disk). */
  clear() {
    this.cache.clear();
    this.hits = 0;
    this.misses = 0;
  }

  /**
   * Read the cache from `persistPath` (no-op if not configured).
   * Silently ignores missing files and corrupt JSON.
   */
  async load() {
    if (!this.persistPath) return;
    let text;
    try {
      text = await readFile(this.persistPath, "utf8");
    } catch (err) {
      if (err && err.code === "ENOENT") return;
      throw err;
    }
    let data;
    try {
      data = JSON.parse(text);
    } catch {
      return;
    }
    if (!data || typeof data !== "object" || !Array.isArray(data.entries)) return;
    if (Number.isFinite(data.dimensions) && data.dimensions !== this.dimensions) return;
    this.cache.clear();
    for (const entry of data.entries) {
      if (!entry || typeof entry.k !== "string" || !Array.isArray(entry.v)) continue;
      this.cache.set(entry.k, Float32Array.from(entry.v));
      if (this.cacheSize > 0 && this.cache.size > this.cacheSize) {
        const firstKey = this.cache.keys().next().value;
        if (firstKey !== undefined) this.cache.delete(firstKey);
      }
    }
  }

  /** Write the cache to `persistPath` (no-op if not configured). */
  async flush() {
    if (!this.persistPath) return;
    /** @type {{ k: string, v: number[] }[]} */
    const entries = [];
    for (const [k, v] of this.cache.entries()) {
      entries.push({ k, v: Array.from(v) });
    }
    const payload = {
      version: 1,
      provider: this.provider.name,
      dimensions: this.dimensions,
      entries
    };
    await mkdir(dirname(this.persistPath), { recursive: true }).catch(() => undefined);
    await writeFile(this.persistPath, JSON.stringify(payload));
  }

  #put(key, vec) {
    if (this.cacheSize <= 0) return;
    this.cache.set(key, vec);
    while (this.cache.size > this.cacheSize) {
      const firstKey = this.cache.keys().next().value;
      if (firstKey === undefined) break;
      this.cache.delete(firstKey);
    }
  }

  #cacheKey(text) {
    return createHash("sha256").update(String(text ?? "")).digest("hex");
  }
}

/* ────────────────────────── Auto-detect ──────────────────────── */

/**
 * Choose the best available embedding provider.
 *
 *   OPENAI_API_KEY            → OpenAIEmbeddingProvider
 *   OLLAMA_HOST/_BASE_URL set → OllamaEmbeddingProvider (after probe)
 *   else                      → LexicalEmbeddingProvider
 *
 * Pass `config.cognition.cache = { size?, path? }` to wrap with `CachedEmbedder`.
 *
 * @param {{
 *   env?: NodeJS.ProcessEnv,
 *   config?: { cognition?: { embedding?: { provider?: string, model?: string, dimensions?: number, probeOllama?: boolean }, cache?: { size?: number, path?: string, autoLoad?: boolean } } },
 *   probeOllama?: boolean,
 *   cache?: { size?: number, path?: string, autoLoad?: boolean } | false
 * }} [options]
 * @returns {Promise<EmbeddingProvider>}
 */
export async function createEmbeddingProvider({ env = process.env, config = {}, probeOllama, cache } = {}) {
  const cognitionCfg = (config && config.cognition) || {};
  const embCfg = cognitionCfg.embedding || {};
  const cacheCfg = cache === false ? null : cache || cognitionCfg.cache || null;
  const preferred = embCfg.provider;

  /** @type {EmbeddingProvider} */
  let chosen;
  const wantOllamaProbe =
    probeOllama !== undefined ? Boolean(probeOllama) : Boolean(embCfg.probeOllama ?? true);

  if (preferred === "openai" || (!preferred && env.OPENAI_API_KEY)) {
    if (env.OPENAI_API_KEY) {
      chosen = new OpenAIEmbeddingProvider({
        env,
        model: embCfg.model,
        dimensions: embCfg.dimensions
      });
    } else if (preferred === "openai") {
      throw new LLMError("OpenAI embedding requested but OPENAI_API_KEY is not set", {
        provider: "openai",
        kind: "config"
      });
    }
  }

  if (!chosen && (preferred === "ollama" || (!preferred && (env.OLLAMA_HOST || env.OLLAMA_BASE_URL)))) {
    const ollama = new OllamaEmbeddingProvider({
      env,
      model: embCfg.model,
      dimensions: embCfg.dimensions
    });
    if (wantOllamaProbe) {
      await ollama.probe();
    } else {
      ollama.available = true;
    }
    if (ollama.available) {
      chosen = ollama;
    } else if (preferred === "ollama") {
      throw new LLMError("Ollama embedding requested but daemon is not reachable", {
        provider: "ollama",
        kind: "config"
      });
    }
  }

  if (!chosen) {
    chosen = new LexicalEmbeddingProvider({ dimensions: embCfg.dimensions });
  }

  if (cacheCfg) {
    return new CachedEmbedder(chosen, {
      cacheSize: cacheCfg.size,
      persistPath: cacheCfg.path,
      autoLoad: cacheCfg.autoLoad !== false
    });
  }
  return chosen;
}
