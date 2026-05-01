/**
 * Orchestrator for the four-stage cognitive pipeline:
 *   planner → content → style → safety.
 *
 * Invalid or unavailable LLM stages stay silent. The orchestrator records
 * provenance for every LLM call so downstream audit tooling can reconstruct
 * decisions.
 */

import { planIntentAsync } from "./planner.js";
import { generateContent } from "./content.js";
import { applyStyle } from "./style.js";
import { safetyFilter } from "./safety.js";

/**
 * @typedef {Object} CognitivePipelineResult
 * @property {object} plan
 * @property {object|null} draft
 * @property {object|null} says
 * @property {{ passed: boolean, reasons: string[] }} safety
 * @property {{
 *   llmRunIds: string[],
 *   stageElapsed: { planner: number, content: number, style: number, safety: number },
 *   rationale: string
 * }} provenance
 */

/**
 * Run the four-stage pipeline end-to-end.
 *
 * @param {{
 *   llm: object|null,
 *   context: {
 *     presence?: object,
 *     mood?: object,
 *     host?: object,
 *     signals?: object[],
 *     topSignal?: object|null,
 *     memoryHits?: object[],
 *     persona?: object,
 *     task?: object,
 *     risk?: number,
 *     userInput?: string
 *   },
 *   evidence?: string[],
 *   safetyJudge?: boolean
 * }} args
 * @returns {Promise<CognitivePipelineResult>}
 */
export async function runCognitivePipeline({ llm, context, evidence = [], safetyJudge = false }) {
  /** @type {CognitivePipelineResult["provenance"]} */
  const provenance = {
    llmRunIds: [],
    stageElapsed: { planner: 0, content: 0, style: 0, safety: 0 },
    rationale: ""
  };

  const ctx = context || {};

  const t1 = Date.now();
  const planResult = await planIntentAsync({ llm, context: ctx });
  provenance.stageElapsed.planner = Date.now() - t1;
  if (planResult.llmRunId) provenance.llmRunIds.push(planResult.llmRunId);
  provenance.rationale = planResult.rationale || "";

  const t2 = Date.now();
  const contentResult = await generateContent({
    llm,
    plan: planResult.plan,
    context: ctx,
    evidence
  });
  provenance.stageElapsed.content = Date.now() - t2;
  if (contentResult.llmRunId) provenance.llmRunIds.push(contentResult.llmRunId);

  let stylePackage = { says: null, llmRunId: null };
  const t3 = Date.now();
  if (contentResult.draft) {
    stylePackage = await applyStyle({
      llm,
      draft: contentResult.draft,
      persona: ctx.persona || {},
      plan: planResult.plan,
      mood: ctx.mood || null
    });
  }
  provenance.stageElapsed.style = Date.now() - t3;
  if (stylePackage.llmRunId) provenance.llmRunIds.push(stylePackage.llmRunId);

  const t4 = Date.now();
  const safetyResult = await safetyFilter({
    llm,
    says: stylePackage.says,
    plan: planResult.plan,
    host: ctx.host || null,
    persona: ctx.persona,
    useLlmJudge: Boolean(safetyJudge)
  });
  provenance.stageElapsed.safety = Date.now() - t4;
  if (safetyResult.llmRunId) provenance.llmRunIds.push(safetyResult.llmRunId);

  return {
    plan: planResult.plan,
    draft: contentResult.draft,
    says: safetyResult.says,
    safety: { passed: safetyResult.passed, reasons: safetyResult.reasons },
    provenance
  };
}
