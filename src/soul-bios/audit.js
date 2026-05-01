/**
 * Audit trail helpers for Soul-bios sessions.
 */

import { randomUUID } from "node:crypto";

/**
 * @typedef {{ type: string; ts: string; data?: unknown; provenance?: unknown; auditId?: string }} AuditEntry
 */

/**
 * Runtime log instance with convenience methods attached.
 *
 * @typedef {{
 *   sessionId: string | null;
 *   entries: AuditEntry[];
 *   snapshots: unknown[];
 *   append: (entry: Omit<AuditEntry, "auditId"> & Partial<AuditEntry>) => void;
 *   snapshot: (frame: unknown) => void;
 *   export: () => string;
 *   replay: () => ReturnType<typeof replayAudit>;
 * }} BiosAuditLog
 */

/**
 * @param {{ sessionId?: string | null }} [options]
 * @returns {BiosAuditLog}
 */
export function createAuditLog(options = {}) {
  /** @type {AuditEntry[]} */
  const entries = [];
  /** @type {unknown[]} */
  const snapshots = [];
  const sid = options.sessionId != null ? String(options.sessionId) : null;

  /** @type {BiosAuditLog} */
  const log = {
    sessionId: sid,
    entries,
    snapshots,
    append(entry) {
      appendAuditEntry(log, entry);
    },
    snapshot(frame) {
      createAuditSnapshot(log, frame);
    },
    export() {
      return exportAuditJsonl(log);
    },
    replay() {
      return replayAudit(log);
    }
  };

  return Object.freeze(log);
}

/**
 * @param {{ entries: AuditEntry[] }} log
 * @param {AuditEntry | (Omit<AuditEntry, "auditId"> & Partial<AuditEntry>)} entry
 */
export function appendAuditEntry(log, entry) {
  const ts =
    entry.ts instanceof Date ? entry.ts.toISOString() : entry.ts ?? new Date().toISOString();
  /** @type {AuditEntry} */
  const normalized = {
    ...entry,
    ts,
    auditId:
      typeof entry.auditId === "string" ? entry.auditId : randomUUID()
  };
  log.entries.push(normalized);
}

/**
 * Periodic / terminal frame capture.
 *
 * @param {{ snapshots: unknown[] }} log
 * @param {unknown} frame
 */
export function createAuditSnapshot(log, frame) {
  log.snapshots.push({
    snapshotId: randomUUID(),
    ts: new Date().toISOString(),
    payload: structuredCloneSafe(frame)
  });
}

/**
 * @param {{ entries: AuditEntry[] }} log
 * @returns {string}
 */
export function exportAuditJsonl(log) {
  return (
    log.entries.map((e) => JSON.stringify(e)).join("\n") + (log.entries.length ? "\n" : "")
  );
}

/**
 * Shallow-ish replay artefact bundle (replay driver can hydrate later).
 *
 * @param {{ entries: AuditEntry[]; snapshots?: unknown[] }} log
 */
export function replayAudit(log) {
  return {
    frames: [...log.entries],
    snapshots: log.snapshots != null ? [...log.snapshots] : []
  };
}

/** @param {unknown} v */
function structuredCloneSafe(v) {
  if (typeof structuredClone === "function") {
    try {
      return structuredClone(v);
    } catch {
      /* noop */
    }
  }
  return JSON.parse(JSON.stringify(v));
}
