import { createMoodAnchor, MOOD_IDS } from "../types.js";

export function validateAnchor(rawData, packet = null) {
  if (!rawData || typeof rawData !== "object") {
    return { ok: false, reason: "anchor data is not an object", anchor: null };
  }

  if (!rawData.moodCandidates || !Array.isArray(rawData.moodCandidates) || rawData.moodCandidates.length === 0) {
    return { ok: false, reason: "no mood candidates", anchor: null };
  }

  // Validate mood candidates reference known moods
  const validCandidates = rawData.moodCandidates.filter(c =>
    c && typeof c === "object" && typeof c.mood === "string" && MOOD_IDS.includes(c.mood)
  );
  if (validCandidates.length === 0) {
    return { ok: false, reason: "no valid mood IDs in candidates", anchor: null };
  }

  // Validate safety factual basis is grounded
  const safety = rawData.safety;
  if (safety && packet) {
    const hallucinationRisk = typeof safety.hallucinationRisk === "number" ? safety.hallucinationRisk : 0;
    if (hallucinationRisk > 0.7) {
      return { ok: false, reason: "hallucination risk too high", anchor: null };
    }
    const basis = Array.isArray(safety.factualBasis) ? safety.factualBasis : [];
    if (basis.length === 0 && validCandidates.some(c => c.weight > 0.5)) {
      return { ok: false, reason: "high-weight mood candidate without factual basis", anchor: null };
    }
  }

  const confidence = typeof rawData.confidence === "number" ? rawData.confidence : 0;
  if (confidence < 0.15) {
    return { ok: false, reason: "confidence too low", anchor: null };
  }

  const anchor = createMoodAnchor({
    sourceEventIds: packet ? [packet.id] : [],
    semanticSummary: typeof rawData.semanticSummary === "string" ? rawData.semanticSummary : "",
    appraisalTarget: rawData.appraisalTarget || {},
    coreTarget: rawData.coreTarget || {},
    tendencyTarget: rawData.tendencyTarget || {},
    moodCandidates: validCandidates.map(c => ({
      mood: c.mood,
      weight: typeof c.weight === "number" ? c.weight : 0.5,
      reason: typeof c.reason === "string" ? c.reason : ""
    })),
    sayPolicy: rawData.sayPolicy || {},
    safety: {
      factualBasis: Array.isArray(rawData.safety?.factualBasis) ? rawData.safety.factualBasis : [],
      uncertainty: rawData.safety?.uncertainty ?? 0,
      hallucinationRisk: rawData.safety?.hallucinationRisk ?? 0,
      permissionSensitivity: rawData.safety?.permissionSensitivity ?? 0
    },
    confidence,
    ttlMs: 30000
  });

  return { ok: true, reason: null, anchor };
}
