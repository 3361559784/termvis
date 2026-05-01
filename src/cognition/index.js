/**
 * Cognition layer — foundation for higher-order intelligence modules.
 *
 *   - llm-provider.js  — multi-provider structured-output LLM abstraction
 *   - embeddings.js    — embedding providers + cosine similarity
 *   - vector-store.js  — pure-JS in-memory + persisted vector index
 *
 * All three sub-modules are zero-dependency and rely only on Node 20+
 * built-ins (`fetch`, `crypto`, `fs/promises`, `perf_hooks`).
 */

export * from "./llm-provider.js";
export * from "./embeddings.js";
export * from "./vector-store.js";
