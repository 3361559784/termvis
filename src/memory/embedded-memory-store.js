/**
 * Memory layer: smart, embedding-aware memory store.
 *
 * Concepts implemented:
 *   - 5-tier layering (working / episodic / semantic / reflective / quarantine)
 *   - MemoryBank-style Ebbinghaus retention and reinforcement on access
 *   - Quarantine-by-default for new episodic entries; explicit promotion only
 *   - Embedding-based recall with lexical/recency scoring when embeddings are unavailable
 *   - Conflict detection via cosine similarity (delegated to ./conflict.js)
 *   - JSON serialisation and per-session persistence
 */

import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";

import { VectorStore } from "../cognition/vector-store.js";
import {
  createMemoryRecord,
  computeRetention,
  decayMemory,
  reinforceMemory
} from "./memory-record.js";
import { detectConflicts } from "./conflict.js";

/* ────────────────────────── public constants ────────────────── */

/** @typedef {import("./memory-record.js").MemoryRecord} MemoryRecord */
/** @typedef {import("./memory-record.js").MemoryLayer}  MemoryLayer */

export const MEMORY_LAYERS = Object.freeze([
  "working",
  "episodic",
  "semantic",
  "reflective",
  "quarantine"
]);

export const DEFAULT_LIMITS = Object.freeze({
  working: 20,
  episodic: 200,
  semantic: 100,
  reflective: 64,
  quarantine: 32
});

function makeVectorStore({ dimensions, scope }) {
  return new VectorStore({ dimensions, scope });
}

/* ────────────────────────── EmbeddedMemoryStore ─────────────── */

/**
 * Smart memory store with embedding-based retrieval, Ebbinghaus decay,
 * and quarantine for new entries.
 */
export class EmbeddedMemoryStore {
  /**
   * @param {{
   *   embedder: { embed: (text: string) => Promise<Float32Array>, dimensions: number, available: boolean },
   *   limits?: typeof DEFAULT_LIMITS,
   *   sessionId?: string,
   *   persistDir?: string,
   *   allowReflective?: boolean,
   *   quarantineMs?: number,
   *   conflictThreshold?: number
   * }} options
   */
  constructor({
    embedder,
    limits = DEFAULT_LIMITS,
    sessionId = "default",
    persistDir,
    allowReflective = false,
    quarantineMs = 600_000,
    conflictThreshold = 0.92
  } = /** @type {any} */ ({})) {
    if (!embedder || typeof embedder.embed !== "function") {
      throw new TypeError("EmbeddedMemoryStore requires an embedder with embed(text)");
    }
    this.embedder = embedder;
    this.limits = Object.freeze({ ...DEFAULT_LIMITS, ...(limits || {}) });
    this.sessionId = String(sessionId || "default");
    this.persistDir = persistDir ? String(persistDir) : null;
    this.allowReflective = Boolean(allowReflective);
    this.quarantineMs = Math.max(0, Number(quarantineMs) || 0);
    this.conflictThreshold = clamp01(conflictThreshold, 0.92);

    /** @type {Map<MemoryLayer, MemoryRecord[]>} */
    this.records = new Map(MEMORY_LAYERS.map((l) => [l, []]));
    /** @type {Map<MemoryLayer, any>} */
    this.vectors = new Map();

    if (embedder.available) {
      for (const layer of MEMORY_LAYERS) {
        this.vectors.set(layer, makeVectorStore({ dimensions: embedder.dimensions, scope: layer }));
      }
    }

    /** @type {Map<string, Float32Array>} */
    this._embeddingCache = new Map();
    this._ready = Promise.resolve().then(() => this._maybeRebuildVectorStores());
  }

  /** Resolves once vector stores have been initialized. Optional to await. */
  ready() {
    return this._ready;
  }

  /** Convenience: number of records in a given layer. */
  count(layer) {
    const arr = this.records.get(layer);
    return arr ? arr.length : 0;
  }

  /**
   * Insert a working-memory entry. Working memory is not quarantined and is
   * pruned by capacity, not by retention.
   *
   * @param {string} text
   * @param {Partial<MemoryRecord> & { sourceSignalId?: string|null }} [options]
   * @returns {Promise<string|null>} record id (or null if text empty)
   */
  async addWorking(text, options = {}) {
    const cleaned = sanitizeText(text);
    if (!cleaned) return null;
    const record = createMemoryRecord({
      ...options,
      text: cleaned,
      layer: "working",
      strength: options.strength ?? 1.0,
      importance: options.importance ?? 0.4,
      confidence: options.confidence ?? 0.8,
      sourceSignalId: options.sourceSignalId ?? null
    });
    this.records.get("working").push(record);
    this._capLayer("working");
    await this._index(record);
    return record.id;
  }

  /**
   * New episodic memories enter quarantine first. They become eligible for
   * promotion after `quarantineMs` and provided no high-similarity duplicate
   * exists.
   *
   * @param {string} text
   * @param {Partial<MemoryRecord> & { sourceSignalId?: string|null }} [options]
   * @returns {Promise<string|null>}
   */
  async addEpisodic(text, options = {}) {
    const cleaned = sanitizeText(text);
    if (!cleaned) return null;
    const record = createMemoryRecord({
      ...options,
      text: cleaned,
      layer: "quarantine",
      sourceSignalId: options.sourceSignalId ?? null,
      metadata: { ...(options.metadata || {}), originLayer: "episodic" }
    });
    this.records.get("quarantine").push(record);
    this._capLayer("quarantine");
    await this._index(record);
    return record.id;
  }

  /**
   * Semantic facts go straight to the semantic layer. If a near-duplicate
   * already exists the new record is *kept* but its `confidence` is reduced
   * by 0.2 and `metadata.conflicts` lists the offending record ids — this
   * matches the report's "do not silently overwrite" rule.
   *
   * @param {string} text
   * @param {Partial<MemoryRecord> & { sourceSignalId?: string|null }} [options]
   * @returns {Promise<string|null>}
   */
  async addSemantic(text, options = {}) {
    const cleaned = sanitizeText(text);
    if (!cleaned) return null;

    /** @type {Array<{ id: string, similarity: number, kind: string, layer?: string }>} */
    let conflicts = [];
    let candidateVec = null;
    if (this.embedder.available) {
      candidateVec = await this._embed(cleaned);
      conflicts = await this._findConflicts({ text: cleaned, embedding: candidateVec }, { layers: ["semantic", "episodic"] });
    }

    const baseConfidence = clamp01(options.confidence ?? 0.7, 0.7);
    const adjustedConfidence = conflicts.length > 0 ? clamp01(baseConfidence - 0.2, 0) : baseConfidence;

    const record = createMemoryRecord({
      ...options,
      text: cleaned,
      layer: "semantic",
      confidence: adjustedConfidence,
      sourceSignalId: options.sourceSignalId ?? null,
      metadata: {
        ...(options.metadata || {}),
        ...(conflicts.length
          ? {
              conflicts: conflicts.map((c) => ({
                id: c.id,
                similarity: c.similarity,
                kind: c.kind,
                layer: c.layer
              }))
            }
          : {})
      }
    });

    this.records.get("semantic").push(record);
    this._capLayer("semantic");
    await this._index(record, candidateVec);
    return record.id;
  }

  /**
   * Reflective memories require explicit `allowReflective` consent at
   * construction time. Without it, `addReflective` is a no-op returning null.
   *
   * @param {string} text
   * @param {Partial<MemoryRecord>} [options]
   * @returns {Promise<string|null>}
   */
  async addReflective(text, options = {}) {
    if (!this.allowReflective) return null;
    const cleaned = sanitizeText(text);
    if (!cleaned) return null;
    const record = createMemoryRecord({
      ...options,
      text: cleaned,
      layer: "reflective",
      importance: options.importance ?? 0.7,
      confidence: options.confidence ?? 0.85,
      sourceSignalId: options.sourceSignalId ?? null
    });
    this.records.get("reflective").push(record);
    this._capLayer("reflective");
    await this._index(record);
    return record.id;
  }

  /**
   * Promote a quarantined record into a target layer (default: episodic).
   * The target layer's capacity is enforced after insertion.
   *
   * @param {string} id
   * @param {MemoryLayer} [targetLayer="episodic"]
   * @returns {Promise<string|null>} new record id (always equal to input id)
   */
  async promote(id, targetLayer = "episodic") {
    if (!id) return null;
    const target = MEMORY_LAYERS.includes(targetLayer) && targetLayer !== "quarantine" ? targetLayer : "episodic";
    if (target === "reflective" && !this.allowReflective) return null;

    const quarantine = this.records.get("quarantine");
    const idx = quarantine.findIndex((r) => r.id === id);
    if (idx < 0) return null;
    const old = quarantine[idx];
    quarantine.splice(idx, 1);

    const promoted = createMemoryRecord({
      ...old,
      tags: [...old.tags],
      metadata: { ...old.metadata, promotedFrom: "quarantine" },
      layer: target
    });
    // preserve original id so the vector index can be re-keyed cheaply
    const reKeyed = Object.freeze({ ...promoted, id: old.id });
    this.records.get(target).push(reKeyed);
    this._capLayer(target);

    if (this.embedder.available) {
      const cached = this._embeddingCache.get(old.id);
      this._removeFromVectorStore("quarantine", old.id);
      await this._index(reKeyed, cached);
    }
    return reKeyed.id;
  }

  /**
   * Remove a quarantined record without promotion.
   *
   * @param {string} id
   * @returns {boolean} true if a record was removed
   */
  reject(id) {
    if (!id) return false;
    const quarantine = this.records.get("quarantine");
    const idx = quarantine.findIndex((r) => r.id === id);
    if (idx < 0) return false;
    quarantine.splice(idx, 1);
    if (this.embedder.available) this._removeFromVectorStore("quarantine", id);
    this._embeddingCache.delete(id);
    return true;
  }

  /**
   * Promote all quarantine records that are older than `quarantineMs` and
   * have no high-similarity duplicate in episodic/semantic. Conflicting
   * records are rejected (caller can re-add explicitly if desired).
   *
   * @param {number} [now=Date.now()]
   * @returns {Promise<{ promoted: string[], rejected: string[] }>}
   */
  async promoteEligible(now = Date.now()) {
    /** @type {{ promoted: string[], rejected: string[] }} */
    const out = { promoted: [], rejected: [] };
    const snapshot = [...(this.records.get("quarantine") || [])];

    for (const r of snapshot) {
      if (now - (r.createdAt || 0) < this.quarantineMs) continue;
      let conflicts = [];
      if (this.embedder.available) {
        const vec = this._embeddingCache.get(r.id) || (await this._embed(r.text));
        conflicts = await this._findConflicts(
          { text: r.text, embedding: vec },
          { layers: ["episodic", "semantic"] }
        );
      }
      if (conflicts.length > 0) {
        this.reject(r.id);
        out.rejected.push(r.id);
      } else {
        const promotedId = await this.promote(r.id, "episodic");
        if (promotedId) out.promoted.push(promotedId);
      }
    }
    return out;
  }

  /**
   * Smart recall. When the embedder is available and a query is provided we
   * use cosine similarity; otherwise we fall back to substring + recency.
   *
   * @param {{
   *   query?: string,
   *   layers?: MemoryLayer[],
   *   topK?: number,
   *   threshold?: number,
   *   includeReflective?: boolean,
   *   reinforce?: boolean
   * }} [options]
   * @returns {Promise<{
   *   working: string[],
   *   episodic: Array<{ id: string, text: string, score: number, layer: string }>,
   *   semantic: Array<{ id: string, text: string, score: number, layer: string }>,
   *   reflective?: Array<{ id: string, text: string, score: number, layer: string }>
   * }>}
   */
  async recall({
    query = "",
    layers = ["working", "episodic", "semantic"],
    topK = 5,
    threshold = 0.2,
    includeReflective = false,
    reinforce = true
  } = {}) {
    const k = Math.max(1, Math.floor(Number(topK) || 1));
    /** @type {{ working: string[], episodic: any[], semantic: any[], reflective?: any[] }} */
    const result = { working: [], episodic: [], semantic: [] };

    if (layers.includes("working")) {
      const wm = this.records.get("working");
      result.working = wm.slice(-k).map((r) => r.text);
    }

    const useEmbed = this.embedder.available && typeof query === "string" && query.trim().length > 0;
    const targetLayers = ["episodic", "semantic"].filter((l) => layers.includes(l));

    if (useEmbed) {
      const qvec = await this._embed(query);
      for (const layer of targetLayers) {
        const vs = this.vectors.get(/** @type {MemoryLayer} */ (layer));
        if (!vs) {
          result[layer] = [];
          continue;
        }
        const hits = vs.search(qvec, { topK: k, threshold });
        const records = this.records.get(/** @type {MemoryLayer} */ (layer));
        const byId = new Map(records.map((r) => [r.id, r]));
        const out = [];
        for (const hit of hits) {
          const rec = byId.get(hit.id);
          if (!rec) continue;
          out.push({ id: rec.id, text: rec.text, score: round6(hit.similarity), layer });
          if (reinforce) this._reinforceById(hit.id, /** @type {MemoryLayer} */ (layer));
        }
        result[layer] = out;
      }
    } else {
      const q = String(query || "").toLowerCase();
      const now = Date.now();
      for (const layer of targetLayers) {
        const records = this.records.get(/** @type {MemoryLayer} */ (layer));
        const scored = [];
        for (const r of records) {
          let score = 0;
          if (q && r.text.toLowerCase().includes(q)) score += 0.7;
          // recency boost: 7-day half-life
          const age = Math.max(0, now - (r.lastAccessed || r.createdAt));
          score += 0.3 * Math.exp(-age / (86_400_000 * 7));
          if (score >= threshold) {
            scored.push({ id: r.id, text: r.text, score: round6(score), layer });
          }
        }
        scored.sort((a, b) => b.score - a.score);
        const top = scored.slice(0, k);
        if (reinforce) {
          for (const item of top) this._reinforceById(item.id, /** @type {MemoryLayer} */ (layer));
        }
        result[layer] = top;
      }
    }

    if (includeReflective && this.allowReflective && layers.includes("reflective")) {
      result.reflective = await this._recallReflective({ query, topK: k, threshold, useEmbed, reinforce });
    }

    return result;
  }

  /**
   * Apply Ebbinghaus decay across decay-eligible layers, then prune anything
   * whose retention falls below `pruneThreshold`. Reflective memories never
   * get pruned (they remain even when weakened).
   *
   * @param {{ pruneThreshold?: number, now?: number }} [options]
   * @returns {{ decayed: number, pruned: number }}
   */
  decay({ pruneThreshold = 0.05, now = Date.now() } = {}) {
    const cut = clamp01(pruneThreshold, 0.05);
    let decayedCount = 0;
    let prunedCount = 0;

    for (const layer of MEMORY_LAYERS) {
      const records = this.records.get(layer);
      if (!records || records.length === 0) continue;
      /** @type {MemoryRecord[]} */
      const next = [];
      for (const r of records) {
        const aged = decayMemory(r, now);
        if (aged !== r) decayedCount++;
        if (layer === "reflective") {
          next.push(aged);
          continue;
        }
        if (layer === "working") {
          next.push(aged); // capped by size, not retention
          continue;
        }
        const retention = computeRetention(aged, now);
        if (retention < cut) {
          if (this.embedder.available) this._removeFromVectorStore(layer, aged.id);
          this._embeddingCache.delete(aged.id);
          prunedCount++;
        } else {
          next.push(aged);
        }
      }
      this.records.set(layer, next);
    }
    return { decayed: decayedCount, pruned: prunedCount };
  }

  /**
   * Per-layer record counts.
   * @returns {Record<MemoryLayer, number>}
   */
  stats() {
    /** @type {Record<string, number>} */
    const out = {};
    for (const layer of MEMORY_LAYERS) out[layer] = this.records.get(layer)?.length || 0;
    return /** @type {Record<MemoryLayer, number>} */ (out);
  }

  /**
   * Snapshot the store as JSON. Vector stores are serialised individually.
   * @returns {Promise<string>}
   */
  async serialize() {
    /** @type {Record<string, any[]>} */
    const recordsJson = {};
    for (const layer of MEMORY_LAYERS) {
      recordsJson[layer] = (this.records.get(layer) || []).map((r) => recordToJson(r));
    }
    /** @type {Record<string, string|null>} */
    const vectorsJson = {};
    for (const layer of MEMORY_LAYERS) {
      const vs = this.vectors.get(layer);
      vectorsJson[layer] = vs && typeof vs.serialize === "function" ? vs.serialize() : null;
    }
    return JSON.stringify({
      version: 1,
      sessionId: this.sessionId,
      limits: this.limits,
      allowReflective: this.allowReflective,
      quarantineMs: this.quarantineMs,
      conflictThreshold: this.conflictThreshold,
      embedder: { dimensions: this.embedder.dimensions, name: this.embedder.name || "unknown" },
      records: recordsJson,
      vectors: vectorsJson
    });
  }

  /**
   * Restore from a serialised JSON blob.
   * @param {string|Object} json
   */
  async deserialize(json) {
    let data = json;
    if (typeof data === "string") {
      try {
        data = JSON.parse(data);
      } catch {
        return;
      }
    }
    if (!data || typeof data !== "object") return;

    if (typeof data.sessionId === "string") this.sessionId = data.sessionId;
    if (typeof data.allowReflective === "boolean") this.allowReflective = data.allowReflective;
    if (Number.isFinite(data.quarantineMs)) this.quarantineMs = Number(data.quarantineMs);
    if (Number.isFinite(data.conflictThreshold)) this.conflictThreshold = clamp01(data.conflictThreshold, 0.92);

    for (const layer of MEMORY_LAYERS) {
      const rows = Array.isArray(data.records?.[layer]) ? data.records[layer] : [];
      const restored = rows.map((row) => createMemoryRecord(row));
      this.records.set(layer, restored);
    }

    if (this.embedder.available) {
      // Ensure vector stores exist for this embedder dimensionality.
      this._maybeRebuildVectorStores();
      const vraw = data.vectors || {};
      for (const layer of MEMORY_LAYERS) {
        const blob = vraw[layer];
        if (blob) {
          try {
            this.vectors.set(layer, VectorStore.deserialize(blob));
          } catch {
            /* ignore corrupt vector blob */
          }
        }
      }
      // Re-index records that exist in records[] but not in their vector
      // store (e.g. when the previous serialisation skipped vectors).
      for (const layer of MEMORY_LAYERS) {
        const vs = this.vectors.get(layer);
        if (!vs) continue;
        const records = this.records.get(layer) || [];
        for (const r of records) {
          if (typeof vs.has === "function" && vs.has(r.id)) continue;
          try {
            const vec = await this._embed(r.text);
            vs.add({ id: r.id, vector: vec, metadata: { layer, recordId: r.id } });
          } catch {
            /* ignore embedding failures */
          }
        }
      }
    }
  }

  /** Persist to `${persistDir}/${sessionId}.json` (no-op without persistDir). */
  async saveToDisk() {
    if (!this.persistDir) return;
    await mkdir(this.persistDir, { recursive: true });
    const path = join(this.persistDir, `${safeSessionFileName(this.sessionId)}.json`);
    await writeFile(path, await this.serialize(), "utf8");
  }

  /** Load from `${persistDir}/${sessionId}.json` if present. */
  async loadFromDisk() {
    if (!this.persistDir) return;
    const path = join(this.persistDir, `${safeSessionFileName(this.sessionId)}.json`);
    try {
      const raw = await readFile(path, "utf8");
      await this.deserialize(raw);
    } catch (err) {
      if (err && /** @type {NodeJS.ErrnoException} */ (err).code !== "ENOENT") throw err;
    }
  }

  /* ───────────────────── private helpers ──────────────────── */

  _capLayer(layer) {
    const cap = this.limits[layer];
    if (!Number.isFinite(cap) || cap <= 0) return;
    const arr = this.records.get(layer);
    if (!arr || arr.length <= cap) return;
    const overflow = arr.length - cap;
    const removed = arr.splice(0, overflow);
    if (this.embedder.available) {
      for (const r of removed) {
        this._removeFromVectorStore(layer, r.id);
        this._embeddingCache.delete(r.id);
      }
    }
  }

  _reinforceById(id, layer) {
    const arr = this.records.get(layer);
    if (!arr) return;
    const i = arr.findIndex((r) => r.id === id);
    if (i < 0) return;
    arr[i] = reinforceMemory(arr[i]);
  }

  /**
   * @param {{ text: string, embedding: Float32Array }} candidate
   * @param {{ layers?: MemoryLayer[] }} [options]
   * @returns {Promise<Array<{ id: string, similarity: number, kind: string, layer?: string, confidence: number }>>}
   */
  async _findConflicts(candidate, { layers = ["episodic", "semantic"] } = {}) {
    if (!this.embedder.available) return [];
    /** @type {Array<{ id: string, text: string, embedding: Float32Array, layer: string, confidence: number, lastAccessed: number, createdAt: number }>} */
    const existing = [];
    for (const layer of layers) {
      const records = this.records.get(/** @type {MemoryLayer} */ (layer));
      if (!records) continue;
      for (const r of records) {
        const vec = this._embeddingCache.get(r.id);
        if (!vec) continue; // skip records without cached embeddings (rare)
        existing.push({
          id: r.id,
          text: r.text,
          embedding: vec,
          layer,
          confidence: r.confidence,
          lastAccessed: r.lastAccessed,
          createdAt: r.createdAt
        });
      }
    }
    return detectConflicts({
      candidate,
      existing,
      similarityThreshold: this.conflictThreshold,
      timeWindowMs: 86_400_000 * 30
    });
  }

  /**
   * Embed text with a per-store request cache so the same text isn't embedded
   * twice within a session (in addition to any caching done by CachedEmbedder).
   * @param {string} text
   */
  async _embed(text) {
    const vec = await this.embedder.embed(text);
    return vec instanceof Float32Array ? vec : Float32Array.from(vec || []);
  }

  /**
   * @param {Readonly<MemoryRecord>} record
   * @param {Float32Array} [precomputed]
   */
  async _index(record, precomputed) {
    if (!this.embedder.available) return;
    const vs = this.vectors.get(record.layer);
    if (!vs) return;
    let vec = precomputed;
    if (!vec) {
      try {
        vec = await this._embed(record.text);
      } catch {
        return;
      }
    }
    this._embeddingCache.set(record.id, vec);
    try {
      vs.add({
        id: record.id,
        vector: vec,
        metadata: { layer: record.layer, recordId: record.id }
      });
    } catch {
      /* if external store throws, ignore the index op rather than crash */
    }
  }

  _removeFromVectorStore(layer, id) {
    const vs = this.vectors.get(layer);
    if (!vs) return;
    if (typeof vs.remove === "function") {
      try {
        vs.remove(id);
      } catch {
        /* ignore */
      }
    }
  }

  _maybeRebuildVectorStores() {
    if (!this.embedder.available) return;
    if (this.vectors.size > 0) return;
    for (const layer of MEMORY_LAYERS) {
      this.vectors.set(layer, makeVectorStore({ dimensions: this.embedder.dimensions, scope: layer }));
    }
  }

  /**
   * @param {{ query?: string, topK: number, threshold: number, useEmbed: boolean, reinforce: boolean }} args
   */
  async _recallReflective({ query = "", topK, threshold, useEmbed, reinforce }) {
    const records = this.records.get("reflective") || [];
    if (records.length === 0) return [];
    if (useEmbed) {
      const vs = this.vectors.get("reflective");
      if (!vs) return [];
      const qvec = await this._embed(query);
      const hits = vs.search(qvec, { topK, threshold });
      const byId = new Map(records.map((r) => [r.id, r]));
      const out = [];
      for (const h of hits) {
        const rec = byId.get(h.id);
        if (!rec) continue;
        out.push({ id: rec.id, text: rec.text, score: round6(h.similarity), layer: "reflective" });
        if (reinforce) this._reinforceById(rec.id, "reflective");
      }
      return out;
    }
    // lexical/recency scoring when embeddings are unavailable
    const q = String(query || "").toLowerCase();
    const now = Date.now();
    const scored = [];
    for (const r of records) {
      let score = 0;
      if (q && r.text.toLowerCase().includes(q)) score += 0.7;
      const age = Math.max(0, now - (r.lastAccessed || r.createdAt));
      score += 0.3 * Math.exp(-age / (86_400_000 * 7));
      if (score >= threshold) scored.push({ id: r.id, text: r.text, score: round6(score), layer: "reflective" });
    }
    scored.sort((a, b) => b.score - a.score);
    return scored.slice(0, topK);
  }
}

/* ────────────────────────── helpers ─────────────────────────── */

function sanitizeText(text) {
  if (text == null) return "";
  const s = typeof text === "string" ? text : String(text);
  return s.trim().slice(0, 2000);
}

function clamp01(value, defaultValue = 0) {
  const x = Number(value);
  if (!Number.isFinite(x)) return clamp01(defaultValue);
  if (x < 0) return 0;
  if (x > 1) return 1;
  return x;
}

function round6(n) {
  const x = Number(n);
  if (!Number.isFinite(x)) return 0;
  return Math.round(x * 1_000_000) / 1_000_000;
}

function safeSessionFileName(id) {
  const s = String(id || "default").replace(/[^A-Za-z0-9._-]+/g, "_");
  return s.length > 0 ? s : "default";
}

function recordToJson(record) {
  if (!record) return null;
  return {
    id: record.id,
    layer: record.layer,
    text: record.text,
    summary: record.summary,
    tags: [...record.tags],
    createdAt: record.createdAt,
    lastAccessed: record.lastAccessed,
    accessCount: record.accessCount,
    importance: record.importance,
    strength: record.strength,
    confidence: record.confidence,
    sourceSignalId: record.sourceSignalId,
    metadata: { ...record.metadata }
  };
}
