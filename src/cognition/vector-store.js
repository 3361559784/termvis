/**
 * Cognition layer: pure-JS vector store with linear cosine search.
 *
 * Designed for single-user CLI scale (≤ ~10k vectors). No native dependencies,
 * no ANN index. Persistable as a single JSON document.
 *
 *   const store = new VectorStore({ dimensions: 128 });
 *   store.add({ id: "doc-1", vector: vec, metadata: { source: "memory" } });
 *   const hits = store.search(query, { topK: 5, threshold: 0.2 });
 *
 * `PersistedVectorStore` adds `load()` / `save()` helpers backed by
 * `fs/promises`.
 */

import { readFile, writeFile, mkdir } from "node:fs/promises";
import { dirname } from "node:path";

import { cosineSimilarity } from "./embeddings.js";

/**
 * @typedef {Object} VectorEntry
 * @property {string}                              id
 * @property {Float32Array}                        vector
 * @property {Record<string, unknown>}             metadata
 *
 * @typedef {Object} VectorAddInput
 * @property {string}                              id
 * @property {Float32Array | number[]}             vector
 * @property {Record<string, unknown>}             [metadata]
 *
 * @typedef {Object} SearchHit
 * @property {string}                              id
 * @property {number}                              similarity
 * @property {Record<string, unknown>}             metadata
 *
 * @typedef {Object} SearchOptions
 * @property {number}                                              [topK]
 * @property {number}                                              [threshold]
 * @property {(metadata: Record<string, unknown>, id: string) => boolean} [filter]
 */

export class VectorStore {
  /**
   * @param {{ dimensions?: number, scope?: string }} [options]
   */
  constructor({ dimensions, scope = "default" } = {}) {
    this.dimensions = Number.isFinite(dimensions) ? dimensions : null;
    this.scope = String(scope || "default");
    /** @type {Map<string, VectorEntry>} */
    this.items = new Map();
  }

  /**
   * Add or replace a vector entry. If `dimensions` was unset on construction,
   * the first added vector locks it in.
   *
   * @param {VectorAddInput} entry
   */
  add(entry) {
    if (!entry || typeof entry.id !== "string" || !entry.id) {
      throw new Error("VectorStore.add requires a non-empty id");
    }
    const vec =
      entry.vector instanceof Float32Array ? entry.vector : Float32Array.from(entry.vector || []);
    if (this.dimensions === null) this.dimensions = vec.length;
    if (this.dimensions !== null && vec.length !== this.dimensions) {
      throw new Error(
        `VectorStore.add: expected ${this.dimensions}-dim vector, got ${vec.length} (id="${entry.id}")`
      );
    }
    this.items.set(entry.id, {
      id: entry.id,
      vector: vec,
      metadata:
        entry.metadata && typeof entry.metadata === "object" ? { ...entry.metadata } : {}
    });
  }

  /**
   * Bulk add. Returns the number of inserted/replaced entries.
   * @param {VectorAddInput[]} entries
   */
  addAll(entries) {
    if (!Array.isArray(entries)) return 0;
    let n = 0;
    for (const entry of entries) {
      this.add(entry);
      n++;
    }
    return n;
  }

  /** @param {string} id */
  remove(id) {
    return this.items.delete(id);
  }

  /** @param {string} id */
  has(id) {
    return this.items.has(id);
  }

  /** @param {string} id */
  get(id) {
    return this.items.get(id) || null;
  }

  size() {
    return this.items.size;
  }

  clear() {
    this.items.clear();
  }

  /** @returns {Iterable<VectorEntry>} */
  values() {
    return this.items.values();
  }

  /**
   * Linear cosine search over all stored vectors. Returns hits sorted by
   * descending similarity, with at most `topK` entries. Hits below
   * `threshold` are skipped.
   *
   * @param {Float32Array | number[]} queryVector
   * @param {SearchOptions} [options]
   * @returns {SearchHit[]}
   */
  search(queryVector, { topK = 5, threshold = 0, filter } = {}) {
    if (!queryVector) return [];
    const q =
      queryVector instanceof Float32Array ? queryVector : Float32Array.from(queryVector);
    /** @type {SearchHit[]} */
    const results = [];
    for (const item of this.items.values()) {
      if (typeof filter === "function" && !filter(item.metadata, item.id)) continue;
      const sim = cosineSimilarity(q, item.vector);
      if (sim >= threshold) {
        results.push({ id: item.id, similarity: sim, metadata: item.metadata });
      }
    }
    results.sort((a, b) => b.similarity - a.similarity);
    if (Number.isFinite(topK) && topK > 0) results.length = Math.min(results.length, topK);
    return results;
  }

  /**
   * Serialize to a JSON string suitable for `deserialize()`.
   * @returns {string}
   */
  serialize() {
    /** @type {{ id: string, vector: number[], metadata: Record<string, unknown> }[]} */
    const arr = [];
    for (const item of this.items.values()) {
      arr.push({
        id: item.id,
        vector: Array.from(item.vector),
        metadata: item.metadata
      });
    }
    return JSON.stringify({
      version: 1,
      scope: this.scope,
      dimensions: this.dimensions,
      items: arr
    });
  }

  /** Convenience for callers that prefer a structured payload. */
  toJSON() {
    return JSON.parse(this.serialize());
  }

  /**
   * Build a new `VectorStore` from a JSON string or already-parsed object.
   * @param {string | { scope?: string, dimensions?: number, items?: Array<{ id: string, vector: number[], metadata?: Record<string, unknown> }> }} json
   */
  static deserialize(json) {
    const data = typeof json === "string" ? JSON.parse(json) : json;
    const store = new VectorStore({
      scope: data?.scope,
      dimensions: Number.isFinite(data?.dimensions) ? data.dimensions : undefined
    });
    const items = Array.isArray(data?.items) ? data.items : [];
    for (const item of items) {
      if (!item || typeof item.id !== "string") continue;
      if (!Array.isArray(item.vector)) continue;
      store.add({
        id: item.id,
        vector: Float32Array.from(item.vector),
        metadata: item.metadata && typeof item.metadata === "object" ? item.metadata : {}
      });
    }
    return store;
  }
}

/**
 * `VectorStore` with disk persistence helpers. Use `await store.load()` after
 * construction to populate from disk, and `await store.save()` to flush.
 */
export class PersistedVectorStore extends VectorStore {
  /**
   * @param {{ dimensions?: number, scope?: string, path: string }} options
   */
  constructor({ dimensions, scope, path } = /** @type {any} */ ({})) {
    super({ dimensions, scope });
    if (typeof path !== "string" || !path) {
      throw new Error("PersistedVectorStore requires a non-empty path");
    }
    this.path = path;
  }

  /**
   * Read the JSON file at `path` and populate the store. Missing files are
   * silently treated as "empty store"; corrupt JSON is also tolerated so the
   * caller is never blocked by a bad cache.
   */
  async load() {
    let text;
    try {
      text = await readFile(this.path, "utf8");
    } catch (err) {
      if (err && /** @type {NodeJS.ErrnoException} */ (err).code === "ENOENT") return false;
      throw err;
    }
    let data;
    try {
      data = JSON.parse(text);
    } catch {
      return false;
    }
    if (!data || typeof data !== "object") return false;
    if (typeof data.scope === "string") this.scope = data.scope;
    if (Number.isFinite(data.dimensions)) this.dimensions = data.dimensions;
    this.items.clear();
    const items = Array.isArray(data.items) ? data.items : [];
    for (const item of items) {
      if (!item || typeof item.id !== "string") continue;
      if (!Array.isArray(item.vector)) continue;
      this.add({
        id: item.id,
        vector: Float32Array.from(item.vector),
        metadata: item.metadata && typeof item.metadata === "object" ? item.metadata : {}
      });
    }
    return true;
  }

  /** Write the store as JSON to `path`. Parent directory is created on demand. */
  async save() {
    await mkdir(dirname(this.path), { recursive: true }).catch(() => undefined);
    await writeFile(this.path, this.serialize());
  }
}

export { cosineSimilarity } from "./embeddings.js";
