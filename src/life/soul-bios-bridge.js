import { createHash } from "node:crypto";
import { createMemoryStore, addWorkingMemory } from "./memory.js";
import { sanitizeSessionId } from "./soul.js";
import { createSignalEvent } from "../soul-bios/types.js";

/**
 * Per-process soul-bios session state: engine + memory store used for snapshot export.
 * Requires the intelligent soul engine so MCP/sidecar sessions use the same LLM-driven path as `termvis life`.
 */
export class SoulBiosSessionManager {
  /**
   * @param {{ cwd?: string; config?: Record<string, unknown> }} [options]
   */
  constructor({ cwd = process.cwd(), config = {} } = {}) {
    this.cwd = cwd;
    this.config = config;
    /** @type {Map<string, { ingest?: Function; tick?: Function; acceptSignals?: Function }>} */
    this._engines = new Map();
    /** @type {Map<string, ReturnType<typeof createMemoryStore>>} */
    this._memory = new Map();
    /** @type {Promise<Record<string, unknown>|null>|null} */
    this._modPromise = null;
  }

  /** @returns {Promise<Record<string, unknown>|null>} */
  _loadSoulBiosIndex() {
    if (!this._modPromise) {
      this._modPromise = import("../soul-bios/index.js")
        .then((m) => m)
        .catch(() => null);
    }
    return this._modPromise;
  }

  _memoryOptions() {
    const mem = /** @type {Record<string, unknown>} */ (this.config.memory || {});
    return {
      sessionId: "default",
      workingMax: typeof mem.workingLimit === "number" ? mem.workingLimit : 20,
      episodicMax: typeof mem.episodicLimit === "number" ? mem.episodicLimit : 200,
      semanticMax: typeof mem.semanticLimit === "number" ? mem.semanticLimit : 100
    };
  }

  /** @param {string} sessionId */
  _ensureMemoryStore(sessionId) {
    const key = sanitizeSessionId(sessionId);
    let store = this._memory.get(key);
    if (!store) {
      store = createMemoryStore({ ...this._memoryOptions(), sessionId: key });
      this._memory.set(key, store);
    }
    return store;
  }

  /** @param {string} sessionId */
  async _ensureEngine(sessionId) {
    const key = sanitizeSessionId(sessionId);
    const existing = this._engines.get(key);
    if (existing) return existing;

    const mod = await this._loadSoulBiosIndex();
    const cogCfg = /** @type {Record<string, unknown>|undefined} */ (this.config.cognition);
    if (cogCfg?.enabled === false) {
      throw new Error("soul-bios requires cognition.enabled=true");
    }
    if (!mod || typeof mod.createIntelligentSoulEngine !== "function") {
      throw new Error("soul-bios intelligent engine module is unavailable");
    }

    let engine;
    try {
      engine = await mod.createIntelligentSoulEngine({
        sessionId: key,
        cwd: this.cwd,
        config: this.config,
        persona: cogCfg?.persona,
        memoryAllowReflective: Boolean(cogCfg?.memory?.reflective ?? this.config?.memory?.reflective),
        safetyJudge: Boolean(cogCfg?.safetyJudge),
        tickIntervalForReflection: typeof cogCfg?.reflectionTickInterval === "number"
          ? cogCfg.reflectionTickInterval
          : 20,
        onDiagnostic: (msg) => { try { process.stderr.write(msg + "\n"); } catch { /* ignore */ } }
      });
      if (engine && typeof engine.init === "function") {
        await engine.init();
      }
    } catch (error) {
      throw new Error(`soul-bios intelligent engine unavailable: ${error?.message || error}`, { cause: error });
    }
    if (!engine || typeof engine.tick !== "function") {
      throw new Error("soul-bios intelligent engine did not expose tick()");
    }

    this._engines.set(key, engine);
    return engine;
  }

  /** @returns {Promise<unknown[]>} */
  async _optionalDenoise(events) {
    try {
      const sig = await import("../soul-bios/signal.js");
      if (typeof sig.denoiseSignals === "function") return sig.denoiseSignals(events);
    } catch {
      // Signal denoising is optional; normalized events remain valid input.
    }
    return events;
  }

  /**
   * @param {string} sessionId
   * @param {unknown[]} events
   * @returns {Promise<{ accepted: number; dropped: number }>}
   */
  async ingest(sessionId, events = []) {
    const key = sanitizeSessionId(sessionId);
    const list = Array.isArray(events) ? events : [];

    /** @type {ReturnType<typeof createSignalEvent>[]} */
    const normalized = [];
    let droppedPrep = 0;
    for (const ev of list) {
      try {
        if (!ev || typeof ev !== "object") {
          droppedPrep += 1;
          continue;
        }
        const o = /** @type {Record<string, unknown>} */ (ev);
        normalized.push(
          createSignalEvent({
            source: o.source,
            kind: o.kind,
            priority: o.priority,
            payload: o.payload ?? {},
            schemaVersion: o.schemaVersion,
            ttlMs: o.ttlMs,
            reliability: o.reliability,
            ts: o.ts
          })
        );
      } catch {
        droppedPrep += 1;
      }
    }

    const payload = await this._optionalDenoise(normalized);
    const engine = await this._ensureEngine(key);

    let accepted = 0;
    let dropped = droppedPrep;
    try {
      if (typeof engine.ingest === "function") {
        const raw = /** @type {unknown} */ (await Promise.resolve(engine.ingest(payload)));
        const counts = parseIngestCounts(raw);
        if (counts.ok) {
          accepted = counts.value.accepted;
          dropped = Math.max(dropped, counts.value.dropped);
        } else accepted = payload.length;
      } else if (typeof engine.acceptSignals === "function") {
        const raw = /** @type {unknown} */ (
          await Promise.resolve(/** @type {Function} */ (engine.acceptSignals)(payload))
        );
        const counts = parseIngestCounts(raw);
        if (counts.ok) {
          accepted = counts.value.accepted;
          dropped = Math.max(dropped, counts.value.dropped);
        } else accepted = payload.length;
      } else {
        accepted = payload.length;
      }
    } catch {
      dropped += payload.length;
      accepted = 0;
    }

    const bios = /** @type {Record<string, unknown>|undefined} */ (this.config.soulBios);
    if (bios?.auditLog !== false && accepted > 0) {
      const store = this._ensureMemoryStore(key);
      addWorkingMemory(store, `[signal.ingest] accepted=${accepted} dropped=${dropped}`);
    }

    return { accepted, dropped };
  }

  /**
   * @param {string} sessionId
   * @param {string} [nowIso]
   */
  async tick(sessionId, nowIso) {
    const key = sanitizeSessionId(sessionId);
    const engine = await this._ensureEngine(key);
    const now = typeof nowIso === "string" && nowIso.trim() ? nowIso : new Date().toISOString();

    /** @type {unknown} */
    let raw;
    if (typeof engine.tick === "function") {
      try {
        raw = await Promise.resolve(/** @type {Function} */ (engine.tick)({ now }));
      } catch {
        raw = await Promise.resolve(/** @type {Function} */ (engine.tick)(now));
      }
    }

    if (!raw || typeof raw !== "object") {
      throw new Error("soul-bios intelligent engine returned an invalid frame");
    }

    return structuredClone(JSON.parse(JSON.stringify(raw)));
  }

  /**
   * @param {string} sessionId
   * @param {"working"|"episodic"|"semantic"|"all"|string} scope
   * @returns {{ data: string; checksum: string }}
   */
  memorySnapshot(sessionId, scope = "all") {
    const key = sanitizeSessionId(sessionId);
    const store = this._ensureMemoryStore(key);
    const sco = normalizeScope(scope);
    const blob =
      sco === "all"
        ? {
            scope: "all",
            options: store.options,
            working: [...store.working],
            episodic: [...store.episodic],
            semantic: [...store.semantic],
            reflective: [...store.reflective]
          }
      : sco === "working"
        ? { scope: "working", working: [...store.working] }
        : sco === "episodic"
          ? { scope: "episodic", episodic: [...store.episodic] }
          : sco === "semantic"
            ? { scope: "semantic", semantic: [...store.semantic] }
            : { scope: sco, notice: "unknown scope; returning metadata only", options: store.options };

    const data = JSON.stringify(blob);
    const checksum = createHash("sha256").update(data).digest("hex").slice(0, 12);
    return { data, checksum };
  }
}

/**
 * @param {unknown} out
 * @returns {{ ok: true; value: { accepted: number; dropped: number } } | { ok: false }}
 */
function parseIngestCounts(out) {
  if (!out || typeof out !== "object") return { ok: false };
  const o = /** @type {Record<string, unknown>} */ (out);
  if (typeof o.accepted !== "number") return { ok: false };
  const dropped = typeof o.dropped === "number" ? o.dropped : 0;
  return { ok: true, value: { accepted: Math.max(0, o.accepted), dropped: Math.max(0, dropped) } };
}

function normalizeScope(scope) {
  const s = String(scope || "all").toLowerCase();
  if (s === "working" || s === "episodic" || s === "semantic" || s === "all") return s;
  return "all";
}
