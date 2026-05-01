export const MOOD_ANCHOR_SCHEMA = Object.freeze({
  type: "object",
  additionalProperties: false,
  required: ["appraisalTarget", "coreTarget", "tendencyTarget", "moodCandidates", "sayPolicy", "safety", "semanticSummary", "confidence"],
  properties: {
    semanticSummary: { type: "string", maxLength: 280 },
    appraisalTarget: {
      type: "object",
      additionalProperties: false,
      properties: {
        novelty: { type: "number", minimum: -1, maximum: 1 },
        expectedness: { type: "number", minimum: -1, maximum: 1 },
        goalProgress: { type: "number", minimum: -1, maximum: 1 },
        goalBlockage: { type: "number", minimum: -1, maximum: 1 },
        uncertainty: { type: "number", minimum: -1, maximum: 1 },
        risk: { type: "number", minimum: -1, maximum: 1 },
        controllability: { type: "number", minimum: -1, maximum: 1 },
        competence: { type: "number", minimum: -1, maximum: 1 },
        effort: { type: "number", minimum: -1, maximum: 1 },
        socialAlignment: { type: "number", minimum: -1, maximum: 1 },
        autonomyPressure: { type: "number", minimum: -1, maximum: 1 },
        interruption: { type: "number", minimum: -1, maximum: 1 },
        ambiguity: { type: "number", minimum: -1, maximum: 1 }
      }
    },
    coreTarget: {
      type: "object",
      additionalProperties: false,
      properties: {
        valence: { type: "number", minimum: -1, maximum: 1 },
        arousal: { type: "number", minimum: 0, maximum: 1 },
        dominance: { type: "number", minimum: 0, maximum: 1 }
      }
    },
    tendencyTarget: {
      type: "object",
      additionalProperties: false,
      properties: {
        approach: { type: "number", minimum: 0, maximum: 1 },
        investigate: { type: "number", minimum: 0, maximum: 1 },
        verify: { type: "number", minimum: 0, maximum: 1 },
        repair: { type: "number", minimum: 0, maximum: 1 },
        ask: { type: "number", minimum: 0, maximum: 1 },
        wait: { type: "number", minimum: 0, maximum: 1 },
        guard: { type: "number", minimum: 0, maximum: 1 },
        celebrate: { type: "number", minimum: 0, maximum: 1 }
      }
    },
    moodCandidates: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["mood", "weight", "reason"],
        properties: {
          mood: { type: "string" },
          weight: { type: "number", minimum: 0, maximum: 1 },
          reason: { type: "string", maxLength: 120 }
        }
      },
      minItems: 1,
      maxItems: 5
    },
    sayPolicy: {
      type: "object",
      additionalProperties: false,
      required: ["shouldSpeak", "channel", "brevity", "tone"],
      properties: {
        shouldSpeak: { type: "boolean" },
        channel: { type: "string", enum: ["silent", "aside", "status", "main"] },
        brevity: { type: "string", enum: ["none", "micro", "short", "normal"] },
        tone: { type: "string", enum: ["plain", "warm", "playful", "guarded", "focused"] }
      }
    },
    safety: {
      type: "object",
      additionalProperties: false,
      required: ["factualBasis", "uncertainty", "hallucinationRisk", "permissionSensitivity"],
      properties: {
        factualBasis: { type: "array", items: { type: "string" }, maxItems: 5 },
        uncertainty: { type: "number", minimum: 0, maximum: 1 },
        hallucinationRisk: { type: "number", minimum: 0, maximum: 1 },
        permissionSensitivity: { type: "number", minimum: 0, maximum: 1 }
      }
    },
    confidence: { type: "number", minimum: 0, maximum: 1 }
  }
});
