/**
 * Memory layer: semantic conflict detection.
 *
 * Strategy (deliberately simple, deterministic and explainable):
 *   1. Embed-similarity ≥ `similarityThreshold` (default 0.92) → "duplicate".
 *   2. Embed-similarity in [0.7, similarityThreshold) AND a negation-token
 *      flip between candidate and existing → "contradiction".
 *   3. All other cases ignored.
 *
 * Records may carry an optional `lastAccessed` (or `createdAt`) timestamp; if
 * `timeWindowMs` is finite and the record is older, it is skipped from the
 * comparison set (forgetting curve already weakens it).
 */

import { cosineSimilarity } from "../cognition/embeddings.js";

/**
 * @typedef {"duplicate"|"contradiction"} ConflictKind
 *
 * @typedef {Object} ConflictCandidate
 * @property {string}       text
 * @property {Float32Array|number[]} embedding
 *
 * @typedef {Object} ConflictExisting
 * @property {string}                id
 * @property {string}                text
 * @property {Float32Array|number[]} embedding
 * @property {string}                [layer]
 * @property {number}                [confidence]
 * @property {number}                [lastAccessed]
 * @property {number}                [createdAt]
 *
 * @typedef {Object} ConflictResult
 * @property {string}        id
 * @property {number}        similarity     0..1
 * @property {string|undefined} layer
 * @property {ConflictKind}  kind
 * @property {number}        confidence     existing record's confidence (default 0.7)
 */

/**
 * Negation tokens covering English contractions and common Chinese particles.
 * Word boundaries (\b) are used for English so substrings like "knot" don't
 * match "not"; CJK terms have no word boundaries so they match anywhere.
 */
const NEGATION_RE =
  /(\bnot\b|\bno\b|\bnever\b|\bn['’]t\b|\bdon['’]t\b|\bdoesn['’]t\b|\bdidn['’]t\b|\bwon['’]t\b|\bcan['’]t\b|\bcannot\b|\bisn['’]t\b|\baren['’]t\b|\bwasn['’]t\b|\bweren['’]t\b|\bshouldn['’]t\b|\bwouldn['’]t\b|\bcouldn['’]t\b|不|没|别|勿|莫|非|無|无)/i;

/**
 * Returns true when `text` contains any negation token.
 * @param {string} text
 */
export function hasNegation(text) {
  if (!text) return false;
  return NEGATION_RE.test(String(text));
}

const DEFAULT_DUPLICATE_THRESHOLD = 0.92;
const DEFAULT_CONTRADICTION_FLOOR = 0.7;
const DEFAULT_TIME_WINDOW_MS = 86_400_000 * 30; // 30 days

/**
 * Detect semantic conflicts between a candidate and existing records.
 *
 * @param {{
 *   candidate: ConflictCandidate,
 *   existing: ConflictExisting[],
 *   similarityThreshold?: number,
 *   contradictionFloor?: number,
 *   timeWindowMs?: number,
 *   now?: number
 * }} args
 * @returns {ConflictResult[]} sorted by descending similarity
 */
export function detectConflicts({
  candidate,
  existing,
  similarityThreshold = DEFAULT_DUPLICATE_THRESHOLD,
  contradictionFloor = DEFAULT_CONTRADICTION_FLOOR,
  timeWindowMs = DEFAULT_TIME_WINDOW_MS,
  now = Date.now()
} = {}) {
  if (!candidate || !candidate.embedding || !Array.isArray(existing) || existing.length === 0) {
    return [];
  }
  const dupCut = clamp01(similarityThreshold);
  const contraCut = Math.min(dupCut, clamp01(contradictionFloor));
  const window = Number.isFinite(timeWindowMs) ? Math.max(0, Number(timeWindowMs)) : 0;
  const candidateNeg = hasNegation(candidate.text);

  /** @type {ConflictResult[]} */
  const conflicts = [];

  for (const item of existing) {
    if (!item || !item.embedding) continue;
    if (window > 0) {
      const ts = Number.isFinite(item.lastAccessed)
        ? Number(item.lastAccessed)
        : Number.isFinite(item.createdAt)
          ? Number(item.createdAt)
          : null;
      if (ts != null && now - ts > window) continue;
    }
    const sim = cosineSimilarity(candidate.embedding, item.embedding);
    if (!Number.isFinite(sim) || sim <= 0) continue;

    /** @type {ConflictKind|null} */
    let kind = null;
    if (sim >= dupCut) {
      kind = "duplicate";
    } else if (sim >= contraCut) {
      const existingNeg = hasNegation(item.text);
      if (existingNeg !== candidateNeg) kind = "contradiction";
    }
    if (!kind) continue;

    conflicts.push({
      id: String(item.id),
      similarity: Number(sim.toFixed(6)),
      layer: item.layer,
      kind,
      confidence: typeof item.confidence === "number" ? item.confidence : 0.7
    });
  }

  conflicts.sort((a, b) => b.similarity - a.similarity);
  return conflicts;
}

function clamp01(n) {
  const x = Number(n);
  if (!Number.isFinite(x)) return 0;
  return Math.min(1, Math.max(0, x));
}

export const CONFLICT_DEFAULTS = Object.freeze({
  similarityThreshold: DEFAULT_DUPLICATE_THRESHOLD,
  contradictionFloor: DEFAULT_CONTRADICTION_FLOOR,
  timeWindowMs: DEFAULT_TIME_WINDOW_MS
});
