import { createHash } from "node:crypto";

export function createAnchorCache(config = {}) {
  const ttlMs = config.cacheTtlMs ?? 180000;
  const maxSize = config.maxSize ?? 64;
  const entries = new Map();

  function hash(packet) {
    const key = `${packet.segmentKind}:${packet.host}:${(packet.text || "").slice(0, 200)}`;
    return createHash("sha256").update(key).digest("hex").slice(0, 16);
  }

  function prune(now) {
    if (entries.size <= maxSize) return;
    for (const [k, v] of entries) {
      if (v.expiresAt < now) entries.delete(k);
      if (entries.size <= maxSize * 0.75) break;
    }
  }

  return {
    has(packet, now = Date.now()) {
      const h = hash(packet);
      const entry = entries.get(h);
      if (!entry) return false;
      if (entry.expiresAt < now) {
        entries.delete(h);
        return false;
      }
      return true;
    },
    set(packet, anchor, now = Date.now()) {
      prune(now);
      const h = hash(packet);
      entries.set(h, { anchor, expiresAt: now + ttlMs });
    },
    get(packet, now = Date.now()) {
      const h = hash(packet);
      const entry = entries.get(h);
      if (!entry || entry.expiresAt < now) return null;
      return entry.anchor;
    },
    clear() { entries.clear(); },
    get size() { return entries.size; }
  };
}
