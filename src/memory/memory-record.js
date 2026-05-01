/**
 * Memory layer: immutable MemoryRecord factory plus MemoryBank-style
 * (Ebbinghaus) retention math.
 *
 * References:
 *   - MemoryBank (Zhong et al., 2024) — memory consolidation with Ebbinghaus
 *     forgetting curve and reinforcement on access.
 *   - RMM (Tan et al., ACL 2025)      — prospective + retrospective reflection.
 *   - LoCoMo (2024)                   — long-term conversational memory benchmark.
 *
 * @typedef {"working"|"episodic"|"semantic"|"reflective"|"quarantine"} MemoryLayer
 *
 * @typedef {Object} MemoryRecord
 * @property {string}      id                 UUID v4.
 * @property {MemoryLayer} layer              Storage tier.
 * @property {string}      text               Body text (≤ 2000 chars).
 * @property {string}      summary            Short summary (≤ 200 chars).
 * @property {string[]}    tags               Topical tags (frozen).
 * @property {number}      createdAt          Epoch ms when first stored.
 * @property {number}      lastAccessed       Epoch ms of latest hit / write.
 * @property {number}      accessCount        Reinforcement count.
 * @property {number}      importance         0..1 — slows decay.
 * @property {number}      strength           0..1 — MemoryBank reinforcement.
 * @property {number}      confidence         0..1 — caller-supplied trust.
 * @property {string|null} sourceSignalId     Originating signal id (or null).
 * @property {Object}      metadata           Frozen extra info.
 */

import { randomUUID } from "node:crypto";

const MAX_TEXT = 2000;
const MAX_SUMMARY = 200;
const MAX_TAG = 32;
const MAX_TAGS = 8;
const ONE_DAY_MS = 86_400_000;

const VALID_LAYERS = new Set(["working", "episodic", "semantic", "reflective", "quarantine"]);

/**
 * Clamp `n` into [lo, hi], coerces NaN to `lo`.
 * @param {number} n
 * @param {number} lo
 * @param {number} hi
 */
export function clamp(n, lo, hi) {
  const x = Number(n);
  if (!Number.isFinite(x)) return lo;
  return Math.min(hi, Math.max(lo, x));
}

function safeString(value, max) {
  if (value == null) return "";
  const s = typeof value === "string" ? value : String(value);
  return s.length > max ? s.slice(0, max) : s;
}

function normalizeTags(tags) {
  if (!Array.isArray(tags)) return Object.freeze([]);
  /** @type {string[]} */
  const out = [];
  const seen = new Set();
  for (const raw of tags) {
    if (out.length >= MAX_TAGS) break;
    const t = safeString(raw, MAX_TAG).trim();
    if (!t || seen.has(t)) continue;
    seen.add(t);
    out.push(t);
  }
  return Object.freeze(out);
}

function normalizeLayer(layer) {
  const s = String(layer ?? "episodic").toLowerCase();
  return VALID_LAYERS.has(s) ? /** @type {MemoryLayer} */ (s) : "episodic";
}

function summaryFromText(text, explicit) {
  const ex = safeString(explicit, MAX_SUMMARY).trim();
  if (ex) return ex;
  const t = text || "";
  if (t.length <= MAX_SUMMARY) return t;
  const sliced = t.slice(0, MAX_SUMMARY - 1);
  const lastSpace = sliced.lastIndexOf(" ");
  return (lastSpace > MAX_SUMMARY * 0.6 ? sliced.slice(0, lastSpace) : sliced) + "…";
}

function freezeMetadata(meta) {
  if (!meta || typeof meta !== "object") return Object.freeze({});
  const out = {};
  for (const k of Object.keys(meta)) out[k] = meta[k];
  return Object.freeze(out);
}

/**
 * Build a frozen `MemoryRecord`. Caller may override any field; missing
 * fields fall back to the documented defaults.
 *
 * Defaults:
 *   - id           random UUID
 *   - layer        "episodic"
 *   - importance   0.5
 *   - strength     1.0   (new memories start fully reinforced)
 *   - confidence   0.7
 *   - createdAt / lastAccessed = `Date.now()`
 *   - accessCount  0
 *
 * @param {Partial<MemoryRecord> & { now?: number }} [overrides]
 * @returns {Readonly<MemoryRecord>}
 */
export function createMemoryRecord(overrides = {}) {
  const now = Number.isFinite(overrides.now) ? Number(overrides.now) : Date.now();
  const text = safeString(overrides.text, MAX_TEXT);
  const summary = summaryFromText(text, overrides.summary);
  /** @type {MemoryRecord} */
  const record = {
    id: typeof overrides.id === "string" && overrides.id.trim() ? overrides.id : randomUUID(),
    layer: normalizeLayer(overrides.layer),
    text,
    summary,
    tags: normalizeTags(overrides.tags),
    createdAt: Number.isFinite(overrides.createdAt) ? Number(overrides.createdAt) : now,
    lastAccessed: Number.isFinite(overrides.lastAccessed) ? Number(overrides.lastAccessed) : now,
    accessCount: Math.max(0, Math.floor(Number(overrides.accessCount ?? 0))),
    importance: clamp(overrides.importance ?? 0.5, 0, 1),
    strength: clamp(overrides.strength ?? 1.0, 0, 1),
    confidence: clamp(overrides.confidence ?? 0.7, 0, 1),
    sourceSignalId:
      typeof overrides.sourceSignalId === "string" && overrides.sourceSignalId
        ? overrides.sourceSignalId
        : null,
    metadata: freezeMetadata(overrides.metadata)
  };
  return Object.freeze(record);
}

/**
 * Compute Ebbinghaus retention probability `R = exp(-t / S)` where
 * `t = ms since last access` and `S = strength × importance × 1 day`.
 * Strength and importance are clamped above zero so `S` never collapses to
 * zero (which would make `R` an immediate `0`).
 *
 * @param {Readonly<MemoryRecord>} record
 * @param {number} [now=Date.now()]
 * @returns {number} retention in [0, 1]
 */
export function computeRetention(record, now = Date.now()) {
  if (!record) return 0;
  const ts = Number.isFinite(record.lastAccessed) ? record.lastAccessed : record.createdAt || now;
  const elapsed = Math.max(0, now - ts);
  const strength = Math.max(1e-3, Number(record.strength) || 0);
  const importance = Math.max(1e-3, Number(record.importance) || 0);
  const S = Math.max(1, strength * importance * ONE_DAY_MS);
  const r = Math.exp(-elapsed / S);
  if (!Number.isFinite(r)) return 0;
  return clamp(r, 0, 1);
}

/**
 * Reinforce a record on access (MemoryBank-style):
 *   - strength    += 0.2 × (1 − strength)        (diminishing returns)
 *   - importance  += 0.05                         (capped at 1)
 *   - accessCount += 1
 *   - lastAccessed = now
 *
 * Returns a NEW frozen record; the input is left untouched.
 *
 * @param {Readonly<MemoryRecord>} record
 * @param {number} [now=Date.now()]
 * @returns {Readonly<MemoryRecord>}
 */
export function reinforceMemory(record, now = Date.now()) {
  if (!record) return record;
  const nextStrength = clamp(record.strength + 0.2 * (1 - record.strength), 0, 1);
  const nextImportance = clamp(record.importance + 0.05, 0, 1);
  return Object.freeze({
    ...record,
    strength: nextStrength,
    importance: nextImportance,
    accessCount: record.accessCount + 1,
    lastAccessed: now
  });
}

/**
 * Apply Ebbinghaus-style decay to a record's strength based on elapsed days
 * since last access. Important memories decay slower:
 *
 *   strength *= exp(-elapsedDays × decayRate × (1 − importance))
 *
 * Returns a NEW frozen record; lastAccessed is preserved (we are not
 * "touching" the memory, only aging it).
 *
 * @param {Readonly<MemoryRecord>} record
 * @param {number} [now=Date.now()]
 * @param {{ decayRate?: number }} [options]
 * @returns {Readonly<MemoryRecord>}
 */
export function decayMemory(record, now = Date.now(), { decayRate = 0.5 } = {}) {
  if (!record) return record;
  const ts = Number.isFinite(record.lastAccessed) ? record.lastAccessed : record.createdAt || now;
  const elapsedDays = Math.max(0, (now - ts) / ONE_DAY_MS);
  if (elapsedDays === 0) return record;
  const rate = Math.max(0, Number(decayRate) || 0);
  const protection = clamp(1 - record.importance, 0, 1);
  const factor = Math.exp(-elapsedDays * rate * protection);
  const nextStrength = clamp(record.strength * factor, 0, 1);
  if (nextStrength === record.strength) return record;
  return Object.freeze({
    ...record,
    strength: nextStrength
  });
}

export const MEMORY_RECORD_LIMITS = Object.freeze({
  textChars: MAX_TEXT,
  summaryChars: MAX_SUMMARY,
  tags: MAX_TAGS,
  tagChars: MAX_TAG
});
