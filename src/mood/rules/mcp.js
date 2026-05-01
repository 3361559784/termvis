export const mcpRules = [
  { kind: "mcp.server.connect", coreDelta: { valence: 0.04, dominance: 0.08 }, appraisalDelta: { controllability: 0.15 }, tendencyDelta: { approach: 0.1 }, tags: ["prepared"], cause: "MCP server connected", defaultPriority: 0.5, ttlMs: 10000 },
  { kind: "mcp.server.disconnect", coreDelta: { valence: -0.08, dominance: -0.12 }, appraisalDelta: { goalBlockage: 0.2, controllability: -0.15 }, tendencyDelta: { guard: 0.15, repair: 0.1 }, tags: ["concerned"], cause: "MCP server disconnected", defaultPriority: 0.6, ttlMs: 12000 },
  { kind: "mcp.tool.begin", coreDelta: { arousal: 0.08 }, appraisalDelta: { effort: 0.05, uncertainty: 0.1 }, tendencyDelta: { verify: 0.1 }, tags: ["focused"], cause: "MCP tool started", defaultPriority: 0.4, ttlMs: 8000 },
  { kind: "mcp.tool.success", coreDelta: { valence: 0.04, dominance: 0.06 }, appraisalDelta: { goalProgress: 0.15 }, tendencyDelta: { approach: 0.1 }, tags: ["content"], cause: "MCP tool succeeded", defaultPriority: 0.5, ttlMs: 8000 },
  { kind: "mcp.tool.failure", coreDelta: { valence: -0.12, arousal: 0.15 }, appraisalDelta: { goalBlockage: 0.25, controllability: -0.1 }, tendencyDelta: { repair: 0.2, guard: 0.15 }, tags: ["concerned", "wary"], cause: "MCP tool failed", defaultPriority: 0.7, ttlMs: 12000 },
];
