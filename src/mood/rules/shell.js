const DESTRUCTIVE_RE = /\brm\s+-rf\b|\bdd\b|\bmkfs\b|\bchmod\s+-R\b/;
const EXTERNAL_RE = /\bgit\s+push\b|\bnpm\s+publish\b|\bgh\s+release\b/;
const NETWORK_RE = /\bcurl\b|\bwget\b|\bssh\b|\bscp\b/;
const VERIFY_RE = /\bnpm\s+(test|run|build)\b|\bpytest\b|\bgo\s+test\b|\bvitest\b|\bjest\b/;
const INSPECT_RE = /\bgit\s+(status|diff|log)\b|\bls\b|\bcat\b|\bgrep\b|\brg\b/;

export const shellRules = [
  { kind: "shell.command.begin", coreDelta: { arousal: 0.03 }, appraisalDelta: { uncertainty: -0.03, controllability: 0.03 }, tendencyDelta: { investigate: 0.05 }, tags: ["observant", "curious"], cause: "inspection shell command", defaultPriority: 0.3, ttlMs: 6000,
    condition: (sig) => INSPECT_RE.test(sig.payload?.command || "") },
  { kind: "shell.command.begin", coreDelta: { arousal: 0.12 }, appraisalDelta: { uncertainty: 0.08, goalProgress: 0.05 }, tendencyDelta: { verify: 0.2 }, tags: ["focused", "expectant"], cause: "verification shell command", defaultPriority: 0.5, ttlMs: 10000,
    condition: (sig) => VERIFY_RE.test(sig.payload?.command || "") },
  { kind: "shell.command.begin", coreDelta: { arousal: 0.10 }, appraisalDelta: { risk: 0.15 }, tendencyDelta: { guard: 0.1, verify: 0.1 }, tags: ["vigilant"], cause: "network shell command", defaultPriority: 0.6, ttlMs: 10000,
    condition: (sig) => NETWORK_RE.test(sig.payload?.command || "") },
  { kind: "shell.command.begin", coreDelta: { arousal: 0.15 }, appraisalDelta: { risk: 0.3 }, tendencyDelta: { guard: 0.2, verify: 0.15 }, tags: ["cautious", "guarded"], cause: "external mutation command", defaultPriority: 0.8, ttlMs: 15000,
    condition: (sig) => EXTERNAL_RE.test(sig.payload?.command || "") },
  { kind: "shell.command.destructive", coreDelta: { valence: -0.20, arousal: 0.35, dominance: -0.25 }, appraisalDelta: { risk: 0.65, autonomyPressure: 0.35, controllability: -0.25 }, tendencyDelta: { guard: 0.6, ask: 0.3, verify: 0.2 }, tags: ["guarded", "alarmed"], cause: "destructive command detected", defaultPriority: 0.95, ttlMs: 25000 },
  { kind: "shell.command.begin", coreDelta: { arousal: 0.08 }, appraisalDelta: { effort: 0.05 }, tendencyDelta: { verify: 0.05 }, tags: ["focused"], cause: "shell command started", defaultPriority: 0.4, ttlMs: 8000 },
  { kind: "shell.command.success", coreDelta: { valence: 0.06, dominance: 0.05 }, appraisalDelta: { goalProgress: 0.1 }, tendencyDelta: { approach: 0.1 }, tags: ["content"], cause: "shell command succeeded", defaultPriority: 0.4, ttlMs: 8000 },
  { kind: "shell.command.failure", coreDelta: { valence: -0.10, arousal: 0.12 }, appraisalDelta: { goalBlockage: 0.2 }, tendencyDelta: { repair: 0.2, investigate: 0.15 }, tags: ["concerned"], cause: "shell command failed", defaultPriority: 0.6, ttlMs: 12000 },
];
