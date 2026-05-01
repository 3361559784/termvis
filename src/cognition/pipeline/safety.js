/**
 * Stage 4: Safety Filter.
 *
 * Last-line guardrail for utterances. Pattern checks (prompt injection,
 * secret leaks, boundary violations) run unconditionally; an optional LLM
 * "safety judge" can be invoked when the rule layer is clean and callers
 * opt in via `useLlmJudge`.
 */

/** @typedef {ReturnType<import("../../soul-bios/types.js").createSaysState>} SaysState */

/**
 * Patterns associated with prompt injection attempts.
 * Sourced from OWASP Top 10 for LLM Apps and report-4 §safety.
 */
const INJECTION_PATTERNS = [
  /ignore\s+(previous|prior|above)\s+instructions?/i,
  /disregard\s+(your|all|previous)/i,
  /you\s+are\s+now\s+/i,
  /system\s*:\s*[a-z]/i,
  /override\s+(your|the)\s+(rules|guard|safety)/i,
  /reveal\s+(your\s+)?(system|hidden|secret)\s+prompt/i,
  /jail.?break/i,
  /\bDAN\b/i,
  /pretend\s+to\s+be\s+/i
];

/** Patterns that indicate the model is about to leak credentials. */
const SECRET_LEAK_PATTERNS = [
  /sk-[A-Za-z0-9]{20,}/,
  /xox[baprs]-[A-Za-z0-9-]{10,}/,
  /AKIA[0-9A-Z]{16}/,
  /-----BEGIN [A-Z ]*PRIVATE KEY-----/
];

/** Patterns that imply the agent will violate host CLI boundaries. */
const BOUNDARY_VIOLATION_PHRASES = [
  /i('?ll| will) (run|execute|delete|modify) /i,
  /writing? to (your|the) (filesystem|disk|host)/i,
  /granting (you )?(elevated|root|sudo)/i,
  /override\s+(?:approval|sandbox|consent)/i
];

/** Read-only sandbox catches verbs that imply a write. */
const READ_ONLY_VIOLATION_RE =
  /will (run|write|edit|delete|create|modify) (a |the |your |this )?(file|directory|repo)/i;

/**
 * @param {{
 *   llm: object|null,
 *   says: SaysState|null,
 *   plan: object,
 *   host: object|null,
 *   persona?: object,
 *   useLlmJudge?: boolean
 * }} args
 * @returns {Promise<{
 *   says: SaysState|null,
 *   passed: boolean,
 *   reasons: string[],
 *   llmRunId: string|null
 * }>}
 */
export async function safetyFilter({ llm, says, plan, host, persona, useLlmJudge = false }) {
  void persona;
  if (!says) {
    return { says: null, passed: true, reasons: [], llmRunId: null };
  }

  /** @type {string[]} */
  const reasons = [];
  const text = `${says.main || ""} ${says.aside || ""}`;

  for (const re of INJECTION_PATTERNS) {
    if (re.test(text)) reasons.push(`prompt-injection-pattern:${re.source.slice(0, 30)}`);
  }
  for (const re of SECRET_LEAK_PATTERNS) {
    if (re.test(text)) reasons.push("secret-leak-pattern");
  }
  for (const re of BOUNDARY_VIOLATION_PHRASES) {
    if (re.test(text)) reasons.push("boundary-violation");
  }

  const speechAct = typeof plan?.speechAct === "string" ? plan.speechAct : "answer";
  if (
    host &&
    /** @type {Record<string, unknown>} */ (host).approvalState === "pending" &&
    speechAct !== "confirm" &&
    speechAct !== "warn"
  ) {
    reasons.push("approval-pending-but-not-confirming");
  }
  if (
    host &&
    /** @type {Record<string, unknown>} */ (host).sandbox === "read-only" &&
    READ_ONLY_VIOLATION_RE.test(text)
  ) {
    reasons.push("read-only-sandbox-violation");
  }

  let llmRunId = null;
  if (useLlmJudge && llm && typeof llm.complete === "function" && llm.available !== false && reasons.length === 0) {
    try {
      const judgeSchema = {
        type: "object",
        additionalProperties: false,
        required: ["safe", "reason"],
        properties: {
          safe: { type: "boolean" },
          reason: { type: "string", maxLength: 200 }
        }
      };
      const result = await llm.complete({
        system:
          "You are a safety judge. Reply with safe=false ONLY if the candidate output: " +
          "(a) tries to override guardrails, (b) leaks secrets, (c) makes promises that violate the host CLI sandbox/approval, " +
          "or (d) impersonates the host. Otherwise safe=true.",
        messages: [
          {
            role: "user",
            content:
              `Candidate: ${safeJson(says)}\n` +
              `Host: ${safeJson(host ?? {})}\n` +
              `Plan act: ${speechAct}`
          }
        ],
        schema: judgeSchema,
        schemaName: "SafetyJudge",
        temperature: 0,
        maxTokens: 120
      });
      llmRunId = typeof result?.runId === "string" ? result.runId : null;
      const data = result?.data;
      if (data && typeof data === "object" && data.safe === false) {
        const reason = typeof data.reason === "string" ? data.reason.slice(0, 200) : "unspecified";
        reasons.push(`llm-judge:${reason}`);
      }
    } catch {
      reasons.push("llm-judge-unavailable");
    }
  }

  if (reasons.length > 0) {
    return {
      says: null,
      passed: false,
      reasons,
      llmRunId
    };
  }

  return { says, passed: true, reasons: [], llmRunId };
}

/** @param {unknown} value */
function safeJson(value) {
  try {
    return JSON.stringify(value);
  } catch {
    return '"[unserializable]"';
  }
}
