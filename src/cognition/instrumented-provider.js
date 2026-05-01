/**
 * Instrumented LLM provider wrapper.
 *
 * Wraps any LLMProvider with call tracking so the TUI can display:
 *   - Current call status (idle / calling / error)
 *   - Last N call summaries (runId, schemaName, latencyMs, tokenCount, ok)
 *   - Connection probe state (provider name, model, available)
 *   - Cumulative stats (totalCalls, totalErrors, totalTokens)
 *
 * Used by the soul-bios engine and TUI rail to surface real-time LLM activity.
 */

/**
 * @typedef {Object} LLMCallRecord
 * @property {string} runId
 * @property {string} schemaName
 * @property {number} latencyMs
 * @property {number} promptTokens
 * @property {number} completionTokens
 * @property {number} totalTokens
 * @property {boolean} ok
 * @property {string} [error]
 * @property {number} startedAt
 *
 * @typedef {"idle"|"calling"|"error"} LLMCallState
 *
 * @typedef {Object} LLMStats
 * @property {string} providerName
 * @property {string} model
 * @property {boolean} available
 * @property {LLMCallState} state
 * @property {LLMCallRecord|null} currentCall
 * @property {LLMCallRecord[]} recentCalls
 * @property {number} totalCalls
 * @property {number} totalErrors
 * @property {number} totalTokens
 * @property {number|null} avgLatencyMs
 */

export class InstrumentedLLMProvider {
  /**
   * @param {Object|null} inner - The wrapped provider, or null when no provider available
   * @param {{ keepRecent?: number }} [options]
   */
  constructor(inner, { keepRecent = 8 } = {}) {
    this.inner = inner;
    /** @type {string} */
    this.name = inner?.name || "none";
    /** @type {string} */
    this.model = inner?.model || "(none)";
    /** @type {boolean} */
    this.available = Boolean(inner?.available);
    /** @type {LLMCallState} */
    this.state = "idle";
    /** @type {LLMCallRecord|null} */
    this.currentCall = null;
    /** @type {LLMCallRecord[]} */
    this.recentCalls = [];
    this._keepRecent = Math.max(1, Math.floor(keepRecent));
    this.totalCalls = 0;
    this.totalErrors = 0;
    this.totalTokens = 0;
    this._totalLatency = 0;
    /** @type {Set<(stats: LLMStats) => void>} */
    this._listeners = new Set();
  }

  /** Subscribe to status changes. Returns unsubscribe fn. */
  onChange(listener) {
    if (typeof listener !== "function") return () => {};
    this._listeners.add(listener);
    return () => this._listeners.delete(listener);
  }

  _emit() {
    const stats = this.stats();
    for (const listener of this._listeners) {
      try {
        listener(stats);
      } catch {
        /* listener errors must not break LLM call */
      }
    }
  }

  /** @returns {LLMStats} */
  stats() {
    return {
      providerName: this.name,
      model: this.model,
      available: this.available,
      state: this.state,
      currentCall: this.currentCall,
      recentCalls: [...this.recentCalls],
      totalCalls: this.totalCalls,
      totalErrors: this.totalErrors,
      totalTokens: this.totalTokens,
      avgLatencyMs: this.totalCalls > 0 ? Math.round(this._totalLatency / this.totalCalls) : null
    };
  }

  async complete(args) {
    if (!this.inner || !this.inner.complete) {
      throw new Error("InstrumentedLLMProvider: no inner provider for complete()");
    }
    const startedAt = Date.now();
    /** @type {LLMCallRecord} */
    const record = {
      runId: "",
      schemaName: args?.schemaName || "(unknown)",
      latencyMs: 0,
      promptTokens: 0,
      completionTokens: 0,
      totalTokens: 0,
      ok: false,
      startedAt
    };
    this.state = "calling";
    this.currentCall = record;
    this._emit();
    try {
      const result = await this.inner.complete(args);
      record.runId = result?.runId || "";
      record.latencyMs = Date.now() - startedAt;
      record.promptTokens = result?.usage?.promptTokens ?? 0;
      record.completionTokens = result?.usage?.completionTokens ?? 0;
      record.totalTokens = result?.usage?.totalTokens ?? (record.promptTokens + record.completionTokens);
      record.ok = true;
      this.totalCalls += 1;
      this.totalTokens += record.totalTokens;
      this._totalLatency += record.latencyMs;
      this._appendRecent(record);
      this.state = "idle";
      this.currentCall = null;
      this._emit();
      return result;
    } catch (error) {
      record.latencyMs = Date.now() - startedAt;
      record.ok = false;
      record.error = error?.message || String(error);
      this.totalCalls += 1;
      this.totalErrors += 1;
      this._totalLatency += record.latencyMs;
      this._appendRecent(record);
      this.state = "error";
      this.currentCall = null;
      this._emit();
      throw error;
    }
  }

  async chat(args) {
    if (!this.inner || !this.inner.chat) {
      throw new Error("InstrumentedLLMProvider: no inner provider for chat()");
    }
    const startedAt = Date.now();
    /** @type {LLMCallRecord} */
    const record = {
      runId: "",
      schemaName: "chat",
      latencyMs: 0,
      promptTokens: 0,
      completionTokens: 0,
      totalTokens: 0,
      ok: false,
      startedAt
    };
    this.state = "calling";
    this.currentCall = record;
    this._emit();
    try {
      const result = await this.inner.chat(args);
      record.runId = result?.runId || "";
      record.latencyMs = Date.now() - startedAt;
      record.ok = true;
      this.totalCalls += 1;
      this._totalLatency += record.latencyMs;
      this._appendRecent(record);
      this.state = "idle";
      this.currentCall = null;
      this._emit();
      return result;
    } catch (error) {
      record.latencyMs = Date.now() - startedAt;
      record.ok = false;
      record.error = error?.message || String(error);
      this.totalCalls += 1;
      this.totalErrors += 1;
      this._totalLatency += record.latencyMs;
      this._appendRecent(record);
      this.state = "error";
      this.currentCall = null;
      this._emit();
      throw error;
    }
  }

  _appendRecent(record) {
    this.recentCalls.unshift(Object.freeze({ ...record }));
    if (this.recentCalls.length > this._keepRecent) {
      this.recentCalls.length = this._keepRecent;
    }
  }
}

/**
 * Create an instrumented snapshot when no provider is available.
 * @returns {LLMStats}
 */
export function noProviderStats() {
  return {
    providerName: "none",
    model: "(no api key)",
    available: false,
    state: "idle",
    currentCall: null,
    recentCalls: [],
    totalCalls: 0,
    totalErrors: 0,
    totalTokens: 0,
    avgLatencyMs: null
  };
}
