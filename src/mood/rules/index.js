import { sessionRules } from "./session.js";
import { userRules } from "./user.js";
import { reasoningRules } from "./reasoning.js";
import { toolsRules } from "./tools.js";
import { filesRules } from "./files.js";
import { shellRules } from "./shell.js";
import { testsRules } from "./tests.js";
import { webRules } from "./web.js";
import { mcpRules } from "./mcp.js";
import { agentsRules } from "./agents.js";
import { stdoutRules } from "./stdout.js";

const ALL_RULES = [
  ...sessionRules, ...userRules, ...reasoningRules, ...toolsRules,
  ...filesRules, ...shellRules, ...testsRules, ...webRules,
  ...mcpRules, ...agentsRules, ...stdoutRules
];

const rulesByKind = new Map();
for (const rule of ALL_RULES) {
  const list = rulesByKind.get(rule.kind) || [];
  list.push(rule);
  rulesByKind.set(rule.kind, list);
}

export function lookupRules(signalKind) {
  return rulesByKind.get(signalKind) || [];
}

export function signalToImpulses(signal, context = {}) {
  const rules = lookupRules(signal.kind);
  if (rules.length === 0) return [];
  const impulses = [];
  for (const rule of rules) {
    if (rule.condition && !rule.condition(signal, context)) continue;
    impulses.push({
      eventId: signal.id || "",
      kind: signal.kind,
      priority: signal.priority ?? rule.defaultPriority ?? 0.5,
      reliability: signal.reliability ?? 1,
      semanticConfidence: 0,
      ttlMs: rule.ttlMs || 10000,
      coreDelta: { ...(rule.coreDelta || {}) },
      appraisalDelta: { ...(rule.appraisalDelta || {}) },
      tendencyDelta: { ...(rule.tendencyDelta || {}) },
      tags: [...(rule.tags || [])],
      cause: rule.cause || signal.kind
    });
  }
  return impulses;
}
