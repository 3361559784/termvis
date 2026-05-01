/**
 * Smart memory module — re-exports.
 *
 * - `memory-record`         → MemoryRecord factory + Ebbinghaus math
 * - `embedded-memory-store` → EmbeddedMemoryStore with quarantine + decay
 * - `reflection`            → RMM-style prospective / retrospective reflection
 * - `conflict`              → embedding-based duplicate / contradiction detection
 *
 * The companion `src/life/memory.js` (legacy plain store) stays untouched;
 * use this module when you need embeddings, decay, or quarantine.
 */

export * from "./memory-record.js";
export * from "./embedded-memory-store.js";
export * from "./reflection.js";
export * from "./conflict.js";
