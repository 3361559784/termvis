/**
 * Memory layer: RMM-style reflection cycles.
 *
 * - `prospectiveReflect` consolidates recent episodic memories into stable
 *   semantic facts using an LLM. If no LLM can provide a valid summary, it
 *   stays silent and does not promote episodic records.
 *
 * - `retrospectiveReflect` rewards memories that were actually cited in
 *   recent SoulFrames and gently demotes long-idle, never-cited memories.
 *
 * - `createReflectionScheduler` returns a `(tickIndex, citedIds) => result`
 *   that fires both phases on a fixed cadence and applies decay afterwards.
 *
 * @typedef {import("./embedded-memory-store.js").EmbeddedMemoryStore} EmbeddedMemoryStore
 * @typedef {{
 *   available: boolean,
 *   complete: (opts: any) => Promise<{ data: any, runId: string }>
 * }} LLMLike
 *
 * @typedef {Object} ProspectiveResult
 * @property {number}        summarized
 * @property {string[]}      semanticIds
 * @property {string|null}   llmRunId
 *
 * @typedef {Object} RetrospectiveResult
 * @property {number} bumped
 * @property {number} demoted
 *
 * @typedef {Object} ReflectionCycleResult
 * @property {ProspectiveResult}    prospective
 * @property {RetrospectiveResult}  retrospective
 * @property {{ decayed: number, pruned: number }} decay
 */

const PROSPECTIVE_SCHEMA = Object.freeze({
  type: "object",
  additionalProperties: false,
  required: ["summaries"],
  properties: {
    summaries: {
      type: "array",
      maxItems: 5,
      items: {
        type: "object",
        additionalProperties: false,
        required: ["summary", "tags", "importance"],
        properties: {
          summary: { type: "string", maxLength: 200 },
          tags: { type: "array", items: { type: "string" }, maxItems: 4 },
          importance: { type: "number", minimum: 0, maximum: 1 }
        }
      }
    }
  }
});

const PROSPECTIVE_SYSTEM =
  "You consolidate episodic memory into stable semantic facts. Preserve user " +
  "preferences and decision patterns. Reject one-off noise. Keep summaries " +
  "concise (under 200 chars) and tag them.";

const ONE_DAY_MS = 86_400_000;

/* ────────────────────── prospective reflection ──────────────── */

/**
 * Summarise the most recent N episodic records into 1–5 semantic facts.
 *
 * @param {{
 *   memory: EmbeddedMemoryStore,
 *   llm?: LLMLike|null,
 *   recentN?: number,
 *   onlyIfMin?: number
 * }} args
 * @returns {Promise<ProspectiveResult>}
 */
export async function prospectiveReflect({ memory, llm, recentN = 16, onlyIfMin = 8 } = /** @type {any} */ ({})) {
  if (!memory) {
    return { summarized: 0, semanticIds: [], llmRunId: null };
  }
  const episodic = memory.records.get("episodic") || [];
  if (episodic.length < Math.max(1, onlyIfMin)) {
    return { summarized: 0, semanticIds: [], llmRunId: null };
  }
  const recent = episodic.slice(-Math.max(1, recentN));
  const transcript = recent
    .map((r) => `[${new Date(r.createdAt).toISOString()}] ${r.text}`)
    .join("\n")
    .slice(0, 4000);

  if (llm && llm.available) {
    try {
      const result = await llm.complete({
        system: PROSPECTIVE_SYSTEM,
        messages: [
          {
            role: "user",
            content: `Recent episodic memory:\n${transcript}\n\nReturn 1-5 semantic summaries.`
          }
        ],
        schema: PROSPECTIVE_SCHEMA,
        schemaName: "ProspectiveReflection",
        temperature: 0.2
      });
      const summaries = Array.isArray(result?.data?.summaries) ? result.data.summaries : [];
      /** @type {string[]} */
      const semanticIds = [];
      for (const s of summaries) {
        if (!s || typeof s.summary !== "string") continue;
        const id = await memory.addSemantic(s.summary, {
          tags: Array.isArray(s.tags) ? s.tags : [],
          importance: clamp01(s.importance, 0.5),
          confidence: 0.8
        });
        if (id) semanticIds.push(id);
      }
      return {
        summarized: semanticIds.length,
        semanticIds,
        llmRunId: typeof result?.runId === "string" ? result.runId : null
      };
    } catch {
      return { summarized: 0, semanticIds: [], llmRunId: null };
    }
  }
  return { summarized: 0, semanticIds: [], llmRunId: null };
}

/* ────────────────── retrospective reflection ───────────────── */

/**
 * Bump records that were referenced by recent SoulFrames and demote ones that
 * have aged without being touched.
 *
 * Mutation note: we mutate the per-layer arrays in place by replacing each
 * frozen record with a freshly frozen variant — the records themselves remain
 * immutable, only the array slot changes.
 *
 * @param {{
 *   memory: EmbeddedMemoryStore,
 *   citedMemoryIds: string[],
 *   missedQueryEmbeddings?: Float32Array[],
 *   now?: number,
 *   layers?: string[]
 * }} args
 * @returns {Promise<RetrospectiveResult>}
 */
export async function retrospectiveReflect({
  memory,
  citedMemoryIds = [],
  missedQueryEmbeddings = [],
  now = Date.now(),
  layers = ["episodic", "semantic"]
} = /** @type {any} */ ({})) {
  void missedQueryEmbeddings; // reserved for future "expand-on-miss" logic
  if (!memory) return { bumped: 0, demoted: 0 };
  const cited = new Set((citedMemoryIds || []).map((x) => String(x)));
  let bumped = 0;
  let demoted = 0;
  const idleCutoff = ONE_DAY_MS * 30;

  for (const layer of layers) {
    const records = memory.records.get(layer);
    if (!Array.isArray(records)) continue;
    for (let i = 0; i < records.length; i++) {
      const r = records[i];
      if (!r) continue;
      if (cited.has(r.id)) {
        records[i] = Object.freeze({
          ...r,
          importance: clamp01(r.importance + 0.05, 0),
          accessCount: r.accessCount + 1,
          lastAccessed: now
        });
        bumped++;
      } else if (now - (r.lastAccessed || 0) > idleCutoff && (r.accessCount || 0) < 2) {
        const next = Math.max(0, r.importance - 0.02);
        if (next !== r.importance) {
          records[i] = Object.freeze({ ...r, importance: next });
          demoted++;
        }
      }
    }
  }
  return { bumped, demoted };
}

/* ────────────────────── reflection scheduler ───────────────── */

/**
 * Build a tick-driven scheduler. The returned function should be called once
 * per cognitive tick with the tick index and the list of memory ids cited by
 * the most recent SoulFrame. Reflection runs at most once every
 * `tickInterval` ticks; in between calls return `null`.
 *
 * @param {{
 *   memory: EmbeddedMemoryStore,
 *   llm?: LLMLike|null,
 *   tickInterval?: number,
 *   onReflect?: (result: ReflectionCycleResult) => void,
 *   recentN?: number,
 *   onlyIfMin?: number,
 *   pruneThreshold?: number
 * }} options
 * @returns {(tickIndex: number, citedIds?: string[]) => Promise<ReflectionCycleResult|null>}
 */
export function createReflectionScheduler({
  memory,
  llm = null,
  tickInterval = 20,
  onReflect,
  recentN = 16,
  onlyIfMin = 8,
  pruneThreshold = 0.05
} = /** @type {any} */ ({})) {
  if (!memory) {
    return async () => null;
  }
  const interval = Math.max(1, Math.floor(Number(tickInterval) || 1));
  let lastTick = -interval; // allow first call to fire immediately if requested
  let armed = false;

  return async function maybeReflect(tickIndex, citedIds = []) {
    const idx = Number.isFinite(tickIndex) ? Number(tickIndex) : 0;
    if (!armed) {
      lastTick = idx;
      armed = true;
      return null;
    }
    if (idx - lastTick < interval) return null;
    lastTick = idx;

    const prospective = await prospectiveReflect({ memory, llm, recentN, onlyIfMin });
    const retrospective = await retrospectiveReflect({ memory, citedMemoryIds: citedIds });
    const decay = memory.decay({ pruneThreshold });
    /** @type {ReflectionCycleResult} */
    const result = { prospective, retrospective, decay };
    if (typeof onReflect === "function") {
      try {
        onReflect(result);
      } catch {
        /* listener errors must not break the scheduler */
      }
    }
    return result;
  };
}

function clamp01(value, defaultValue = 0) {
  const x = Number(value);
  if (!Number.isFinite(x)) return clamp01(defaultValue);
  if (x < 0) return 0;
  if (x > 1) return 1;
  return x;
}

export const REFLECTION_DEFAULTS = Object.freeze({
  recentN: 16,
  onlyIfMin: 8,
  tickInterval: 20,
  pruneThreshold: 0.05
});
