export const MEMORY_DEFAULTS = Object.freeze({
  sessionId: "default",
  workingMin: 8,
  workingMax: 20,
  episodicMax: 512,
  semanticMax: 256,
  reflectiveMax: 64,
  enableEpisodic: true,
  enableSemantic: true,
  episodicStaleMs: 1000 * 60 * 60 * 24 * 30,
  semanticStaleMs: 1000 * 60 * 60 * 24 * 120,
  allowReflective: false,
  semanticVisible: true
});

export function createMemoryStore(options = {}) {
  const o = { ...MEMORY_DEFAULTS, ...options };
  return {
    options: normalizeOptions(o),
    working: [],
    episodic: [],
    semantic: [],
    reflective: []
  };
}

function normalizeOptions(o) {
  return {
    sessionId: String(o.sessionId || MEMORY_DEFAULTS.sessionId),
    workingMin: clampInt(o.workingMin ?? MEMORY_DEFAULTS.workingMin, 0, 255),
    workingMax: clampInt(o.workingMax ?? MEMORY_DEFAULTS.workingMax, 1, 500),
    episodicMax: o.episodicMax == null ? MEMORY_DEFAULTS.episodicMax : clampInt(o.episodicMax, 0, 10000),
    semanticMax: o.semanticMax == null ? MEMORY_DEFAULTS.semanticMax : clampInt(o.semanticMax, 0, 10000),
    reflectiveMax: clampInt(o.reflectiveMax ?? MEMORY_DEFAULTS.reflectiveMax, 0, 5000),
    enableEpisodic: Boolean(o.enableEpisodic ?? MEMORY_DEFAULTS.enableEpisodic),
    enableSemantic: Boolean(o.enableSemantic ?? MEMORY_DEFAULTS.enableSemantic),
    episodicStaleMs: Math.max(0, Number(o.episodicStaleMs ?? MEMORY_DEFAULTS.episodicStaleMs) || 0),
    semanticStaleMs: Math.max(0, Number(o.semanticStaleMs ?? MEMORY_DEFAULTS.semanticStaleMs) || 0),
    allowReflective: Boolean(o.allowReflective ?? MEMORY_DEFAULTS.allowReflective),
    semanticVisible: Boolean(o.semanticVisible ?? MEMORY_DEFAULTS.semanticVisible)
  };
}

export function addWorkingMemory(store, entry) {
  if (!store) return store;
  const text = stringifyEntry(entry);
  if (!text) return store;
  const { workingMax } = store.options;
  store.working.push(text);
  if (store.working.length > workingMax) {
    store.working.splice(0, store.working.length - workingMax);
  }
  return store;
}

export function addEpisodicMemory(store, entry) {
  if (!store || !store.options.enableEpisodic) return store;
  const text = stringifyEntry(entry);
  if (!text) return store;
  store.episodic.push({ entry: text, ts: Date.now() });
  const cap = store.options.episodicMax;
  if (cap !== null && cap !== undefined && store.episodic.length > cap) {
    store.episodic.splice(0, store.episodic.length - cap);
  }
  return store;
}

export function addSemanticMemory(store, entry) {
  if (!store || !store.options.enableSemantic) return store;
  const text = stringifyEntry(entry);
  if (!text) return store;
  store.semantic.push({ entry: text, ts: Date.now() });
  const cap = store.options.semanticMax;
  if (cap !== null && cap !== undefined && store.semantic.length > cap) {
    store.semantic.splice(0, store.semantic.length - cap);
  }
  return store;
}

export function addReflectiveMemory(store, entry) {
  if (!store || !store.options.allowReflective) return store;
  const text = stringifyEntry(entry);
  if (!text) return store;
  store.reflective.push({ entry: text, ts: Date.now() });
  const max = store.options.reflectiveMax;
  if (store.reflective.length > max) {
    store.reflective.splice(0, store.reflective.length - max);
  }
  return store;
}

export function recallMemory(store, options = {}) {
  if (!store) {
    return { working: [], episodic: [], semantic: [] };
  }
  const o = store.options;
  const workingTake = clampInt(options.workingRecall ?? o.workingMax, 1, o.workingMax);
  const epCap =
    options.episodicLimit === undefined ? MEMORY_DEFAULTS.episodicMax : clampInt(options.episodicLimit, 0, 10000);
  const semCap =
    options.semanticLimit === undefined ? MEMORY_DEFAULTS.semanticMax : clampInt(options.semanticLimit, 0, 10000);
  const refCap =
    options.reflectiveLimit === undefined ? MEMORY_DEFAULTS.reflectiveMax : clampInt(options.reflectiveLimit, 0, 5000);
  const includeSemantic = options.includeSemantic !== false && o.enableSemantic && o.semanticVisible;
  const includeReflective = Boolean(options.includeReflective && o.allowReflective);

  const recall = {
    working: sliceStrings(store.working, workingTake),
    episodic:
      epCap <= 0
        ? []
        : clampSlice(store.episodic, Math.min(epCap, store.episodic.length)).map(({ entry }) => entry),
    semantic: includeSemantic ?
        semCap <= 0 ?
          []
        : clampSlice(store.semantic, Math.min(semCap, store.semantic.length)).map(({ entry }) => entry)
      : []
  };

  if (includeReflective) {
    const r =
      refCap <= 0 ?
        []
      : clampSlice(store.reflective, Math.min(refCap, store.reflective.length)).map(({ entry }) => entry);
    if (r.length > 0) recall.reflective = r;
  }
  return recall;
}

export function pruneMemory(store, pruneOptions = {}) {
  if (!store) return store;
  const now = Date.now();
  const epCut = pruneOptions.episodicStaleMs ?? store.options.episodicStaleMs;
  const semCut = pruneOptions.semanticStaleMs ?? store.options.semanticStaleMs;
  const refCut = pruneOptions.reflectiveStaleMs ?? store.options.semanticStaleMs;
  store.episodic = store.episodic.filter(({ ts }) => !epCut || now - ts < epCut);
  store.semantic = store.semantic.filter(({ ts }) => !semCut || now - ts < semCut);
  store.reflective = store.reflective.filter(({ ts }) => !refCut || now - ts < refCut);

  const { episodicMax, semanticMax } = store.options;
  if (episodicMax !== null && store.episodic.length > episodicMax) {
    store.episodic.splice(0, store.episodic.length - episodicMax);
  }
  if (semanticMax !== null && store.semantic.length > semanticMax) {
    store.semantic.splice(0, store.semantic.length - semanticMax);
  }

  const wmax = pruneOptions.workingMax ?? store.options.workingMax;
  if (store.working.length > wmax) {
    store.working.splice(0, store.working.length - wmax);
  }
  return store;
}

export function serializeMemory(store) {
  if (!store) return "{}";
  return JSON.stringify({
    options: store.options,
    working: [...store.working],
    episodic: [...store.episodic],
    semantic: [...store.semantic],
    reflective: [...store.reflective]
  });
}

export function deserializeMemory(raw) {
  let data = raw;
  if (typeof raw === "string") {
    try {
      data = JSON.parse(raw);
    } catch {
      return createMemoryStore();
    }
  }
  if (!data || typeof data !== "object") return createMemoryStore();
  const merged = normalizeOptions(data.options || {});
  const next = createMemoryStore(merged);
  next.working = Array.isArray(data.working) ? data.working.map(String) : [];
  next.episodic = normalizeStampedRows(data.episodic);
  next.semantic = normalizeStampedRows(data.semantic);
  next.reflective = normalizeStampedRows(data.reflective);
  pruneMemory(next, {});
  return next;
}

function normalizeStampedRows(rows) {
  if (!Array.isArray(rows)) return [];
  const out = [];
  for (const row of rows) {
    if (typeof row === "string") out.push({ entry: row.slice(0, 2000), ts: Date.now() });
    else if (row && typeof row.entry === "string") {
      out.push({ entry: row.entry.slice(0, 2000), ts: Number(row.ts) || Date.now() });
    }
  }
  return out;
}

function stringifyEntry(entry) {
  const s =
    typeof entry === "string"
      ? entry.trim()
      : entry?.text != null
        ? String(entry.text).trim()
        : "";
  return s ? s.slice(0, 2000) : "";
}

function sliceStrings(lines, limit) {
  if (limit <= 0) return [];
  return lines.slice(Math.max(0, lines.length - limit));
}

function clampSlice(rows, limit) {
  if (!rows.length || limit <= 0) return [];
  const start = Math.max(0, rows.length - limit);
  return rows.slice(start);
}

function clampInt(n, lo, hi) {
  const x = Math.round(Number(n));
  if (!Number.isFinite(x)) return lo;
  return Math.min(hi, Math.max(lo, x));
}
