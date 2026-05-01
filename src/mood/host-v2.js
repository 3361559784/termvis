import { clamp } from "./types.js";

/**
 * @template T
 * @param {T} v
 * @returns {T}
 */
function freezeDeep(v) {
  if (v === null || typeof v !== "object") return v;
  if (Array.isArray(v)) {
    for (let i = 0; i < v.length; i++) {
      const e = v[i];
      if (e && typeof e === "object") freezeDeep(e);
    }
    return Object.freeze(v);
  }
  for (const k of Object.keys(v)) {
    const val = /** @type {Record<string, unknown>} */ (v)[k];
    if (val && typeof val === "object") freezeDeep(val);
  }
  return Object.freeze(v);
}

function normalizeHostId(v) {
  const s = String(v || "generic").toLowerCase();
  return ["codex", "claude-code", "gemini-cli", "copilot-cli", "opencode", "generic"].includes(s)
    ? s
    : "generic";
}

function normalizeTransport(v) {
  const s = String(v || "stdio").toLowerCase();
  return ["pty", "hook", "mcp", "stdio", "mixed"].includes(s) ? s : "stdio";
}

function normalizeTaskPhase(v) {
  const s = String(v || "idle").toLowerCase();
  const valid = [
    "idle",
    "input",
    "planning",
    "reasoning",
    "tooling",
    "editing",
    "verifying",
    "recovering",
    "responding",
    "waiting_approval",
    "waiting_user",
    "closing",
  ];
  return valid.includes(s) ? s : "idle";
}

function normalizeSource(v) {
  const s = String(v || "inferred").toLowerCase();
  return ["explicit", "detected", "inferred"].includes(s) ? s : "inferred";
}

function normalizeApproval(v) {
  const s = String(v || "free").toLowerCase();
  return ["free", "pending", "restricted", "denied", "granted"].includes(s) ? s : "free";
}

function normalizeSandbox(v) {
  const s = String(v || "unknown").toLowerCase();
  return ["read-only", "workspace-write", "network-disabled", "dangerous", "unknown"].includes(s)
    ? s
    : "unknown";
}

function normalizeStatus(v) {
  const s = String(v || "unknown").toLowerCase();
  return ["unknown", "running", "passed", "failed"].includes(s) ? s : "unknown";
}

function normalizeColorDepth(v) {
  const n = Number(v);
  return [1, 16, 256, 24].includes(n) ? n : 1;
}

function normalizePixelProtocol(v) {
  const s = String(v || "none").toLowerCase();
  return ["kitty", "iterm", "sixels", "symbols", "none"].includes(s) ? s : "none";
}

function normalizeToolCall(tc) {
  if (!tc || typeof tc !== "object")
    return { name: "unknown", status: "unknown", startedAt: 0 };
  return {
    name: String(tc.name || "unknown"),
    status: String(tc.status || "running"),
    startedAt: Number(tc.startedAt || Date.now()),
    durationMs: Number.isFinite(Number(tc.durationMs)) ? Number(tc.durationMs) : undefined,
  };
}

function normalizeToolSummary(ts) {
  if (!ts || typeof ts !== "object") return { name: "unknown", success: false };
  return {
    name: String(ts.name || "unknown"),
    success: Boolean(ts.success),
    durationMs: Number.isFinite(Number(ts.durationMs)) ? Number(ts.durationMs) : undefined,
  };
}

/**
 * @param {object} [overrides]
 */
export function createHostStateV2(overrides = {}) {
  const o = overrides || {};
  const session = o.session || {};
  const mode = o.mode || {};
  const agent = o.agent || {};
  const permissions = o.permissions || {};
  const tool = o.tool || {};
  const project = o.project || {};
  const tty = o.tty || {};
  const pressure = o.pressure || {};
  const recovery = o.recovery || {};

  return freezeDeep({
    hostId: normalizeHostId(o.hostId),
    transport: normalizeTransport(o.transport),

    session: {
      id: String(session.id || ""),
      startedAt: String(session.startedAt || new Date().toISOString()),
      turnId: session.turnId ? String(session.turnId) : undefined,
      taskPhase: normalizeTaskPhase(session.taskPhase),
    },

    mode: {
      name: String(mode.name || "unspecified"),
      source: normalizeSource(mode.source),
      confidence: clamp(Number(mode.confidence ?? 0.5), 0, 1),
    },

    agent: {
      primary: agent.primary ? String(agent.primary) : undefined,
      subagent: agent.subagent ? String(agent.subagent) : undefined,
      stack: Array.isArray(agent.stack) ? agent.stack.map(String) : [],
      delegationDepth: Math.max(0, Math.floor(Number(agent.delegationDepth || 0))),
    },

    permissions: {
      approvalState: normalizeApproval(permissions.approvalState),
      sandbox: normalizeSandbox(permissions.sandbox),
      allowedTools: Array.isArray(permissions.allowedTools)
        ? permissions.allowedTools.map(String)
        : [],
      deniedTools: Array.isArray(permissions.deniedTools) ? permissions.deniedTools.map(String) : [],
    },

    tool: {
      activeCount: Math.max(0, Math.floor(Number(tool.activeCount || 0))),
      stack: Array.isArray(tool.stack) ? tool.stack.slice(0, 10).map(normalizeToolCall) : [],
      lastTool: tool.lastTool ? normalizeToolSummary(tool.lastTool) : undefined,
      failureStreak: Math.max(0, Math.floor(Number(tool.failureStreak || 0))),
      successStreak: Math.max(0, Math.floor(Number(tool.successStreak || 0))),
    },

    project: {
      cwd: project.cwd ? String(project.cwd) : undefined,
      gitBranch: project.gitBranch ? String(project.gitBranch) : undefined,
      dirty: Boolean(project.dirty),
      changedFiles: Math.max(0, Math.floor(Number(project.changedFiles || 0))),
      testStatus: normalizeStatus(project.testStatus),
      buildStatus: normalizeStatus(project.buildStatus),
    },

    tty: {
      cols: clamp(Math.floor(Number(tty.cols || 80)), 1, 9999),
      rows: clamp(Math.floor(Number(tty.rows || 24)), 1, 9999),
      colorDepth: normalizeColorDepth(tty.colorDepth),
      pixelProtocol: normalizePixelProtocol(tty.pixelProtocol),
      screenReaderMode: Boolean(tty.screenReaderMode),
      noColor: Boolean(tty.noColor),
    },

    pressure: {
      activity: clamp(Number(pressure.activity ?? 0), 0, 1),
      toolConcurrency: clamp(Number(pressure.toolConcurrency ?? 0), 0, 1),
      permissionPressure: clamp(Number(pressure.permissionPressure ?? 0), 0, 1),
      stdoutRate: clamp(Number(pressure.stdoutRate ?? 0), 0, 1),
      risk: clamp(Number(pressure.risk ?? 0), 0, 1),
    },

    recovery: {
      recentSuccess: clamp(Number(recovery.recentSuccess ?? 0), 0, 1),
      recentFailure: clamp(Number(recovery.recentFailure ?? 0), 0, 1),
      lastResolvedRiskAt: Number.isFinite(Number(recovery.lastResolvedRiskAt))
        ? Number(recovery.lastResolvedRiskAt)
        : undefined,
    },
  });
}

/**
 * @param {object} [initialConfig]
 */
export function createHostModel(initialConfig = {}) {
  const cfg = initialConfig || {};
  let state = /** @type {Record<string, unknown>} */ (structuredClone(createHostStateV2(cfg)));

  function getState() {
    return createHostStateV2(state);
  }

  function reset() {
    state = /** @type {Record<string, unknown>} */ (structuredClone(createHostStateV2(cfg)));
  }

  /**
   * @param {unknown} signals
   * @param {Record<string, unknown>} [ttyInfo]
   */
  function update(signals, ttyInfo = {}) {
    const sigs = Array.isArray(signals) ? signals : [];

    for (const sig of sigs) {
      const s = sig && typeof sig === "object" ? /** @type {Record<string, unknown>} */ (sig) : {};
      const kind = typeof s.kind === "string" ? s.kind : "";
      const payload =
        s.payload && typeof s.payload === "object"
          ? /** @type {Record<string, unknown>} */ (s.payload)
          : {};

      const sess = /** @type {Record<string, unknown>} */ (state.session);
      const mode = /** @type {Record<string, unknown>} */ (state.mode);
      const ag = /** @type {Record<string, unknown>} */ (state.agent);
      const perm = /** @type {Record<string, unknown>} */ (state.permissions);
      const toolState = /** @type {Record<string, unknown>} */ (state.tool);
      const proj = /** @type {Record<string, unknown>} */ (state.project);
      const press = /** @type {Record<string, unknown>} */ (state.pressure);
      const rec = /** @type {Record<string, unknown>} */ (state.recovery);

      if (kind === "session.start" || kind === "session.resume") {
        sess.taskPhase = "idle";
        sess.startedAt = new Date().toISOString();
      }
      if (kind === "user.typing") sess.taskPhase = "input";
      if (kind === "user.submit") sess.taskPhase = "planning";
      if (kind === "host.reasoning.begin") sess.taskPhase = "reasoning";
      if (kind === "host.says.plan" || kind === "host.output.plan") sess.taskPhase = "planning";
      if (
        kind.startsWith("tool.call.begin") ||
        kind.startsWith("shell.begin") ||
        kind.startsWith("file.edit") ||
        kind.startsWith("file.write") ||
        kind.startsWith("file.patch")
      ) {
        sess.taskPhase = "tooling";
        toolState.activeCount = Math.min(10, Number(toolState.activeCount) + 1);
        const st = /** @type {unknown[]} */ (toolState.stack);
        st.push({
          name: (typeof payload.toolName === "string" && payload.toolName) || kind,
          status: "running",
          startedAt: Date.now(),
        });
        if (st.length > 10) st.shift();
      }
      if (
        kind === "tool.call.success" ||
        kind === "shell.command.success" ||
        kind === "mcp.tool.success"
      ) {
        toolState.activeCount = Math.max(0, Number(toolState.activeCount) - 1);
        toolState.successStreak = Number(toolState.successStreak) + 1;
        toolState.failureStreak = 0;
        toolState.lastTool = {
          name: (typeof payload.toolName === "string" && payload.toolName) || "tool",
          success: true,
        };
        rec.recentSuccess = clamp(Number(rec.recentSuccess) + 0.15, 0, 1);
      }
      if (
        kind === "tool.call.failure" ||
        kind === "shell.command.failure" ||
        kind === "mcp.tool.failure"
      ) {
        toolState.activeCount = Math.max(0, Number(toolState.activeCount) - 1);
        toolState.failureStreak = Number(toolState.failureStreak) + 1;
        toolState.successStreak = 0;
        toolState.lastTool = {
          name: (typeof payload.toolName === "string" && payload.toolName) || "tool",
          success: false,
        };
        rec.recentFailure = clamp(Number(rec.recentFailure) + 0.15, 0, 1);
      }
      if (kind === "test.begin") {
        sess.taskPhase = "verifying";
        proj.testStatus = "running";
      }
      if (kind === "test.pass") {
        proj.testStatus = "passed";
        rec.recentSuccess = clamp(Number(rec.recentSuccess) + 0.2, 0, 1);
      }
      if (kind === "test.fail") {
        proj.testStatus = "failed";
        sess.taskPhase = "recovering";
        rec.recentFailure = clamp(Number(rec.recentFailure) + 0.2, 0, 1);
      }
      if (kind === "build.begin") {
        sess.taskPhase = "verifying";
        proj.buildStatus = "running";
      }
      if (kind === "build.success") {
        proj.buildStatus = "passed";
      }
      if (kind === "build.failure") {
        proj.buildStatus = "failed";
        sess.taskPhase = "recovering";
      }
      if (kind === "tool.permission.request") {
        sess.taskPhase = "waiting_approval";
        perm.approvalState = "pending";
      }
      if (kind === "tool.permission.granted" || kind === "user.approve") {
        perm.approvalState = "granted";
        rec.lastResolvedRiskAt = Date.now();
      }
      if (kind === "tool.permission.denied" || kind === "user.deny") {
        perm.approvalState = "denied";
      }
      if (kind === "host.says.final" || kind === "host.output.final") {
        sess.taskPhase = "closing";
      }
      if (kind === "session.end") {
        sess.taskPhase = "idle";
      }
      if (kind === "mode.switch" || kind === "host.mode.switch") {
        mode.name =
          (typeof payload.mode === "string" && payload.mode) ||
          (typeof payload.modeName === "string" && payload.modeName) ||
          mode.name;
        mode.source = "detected";
        mode.confidence = 0.9;
      }
      if (kind === "subagent.create" || kind === "agent.subagent.create") {
        ag.subagent =
          (typeof payload.agentName === "string" && payload.agentName) || "subagent";
        ag.delegationDepth = Number(ag.delegationDepth) + 1;
      }
      if (kind === "subagent.stop" || kind === "agent.subagent.stop") {
        ag.subagent = undefined;
        ag.delegationDepth = Math.max(0, Number(ag.delegationDepth) - 1);
      }
      if (kind === "git.commit") {
        proj.dirty = false;
      }
      if (kind === "git.conflict") {
        proj.dirty = true;
      }
      if (kind === "mcp.server.connect") {
        /* track MCP */
      }
      if (kind === "mcp.server.disconnect") {
        /* track MCP */
      }
      if (kind === "shell.command.destructive") {
        press.risk = clamp(Number(press.risk) + 0.4, 0, 1);
      }
    }

    const tty = /** @type {Record<string, unknown>} */ (state.tty);
    const ti = ttyInfo && typeof ttyInfo === "object" ? ttyInfo : {};
    if (ti.cols) {
      tty.cols = clamp(Math.floor(Number(ti.cols)), 1, 9999);
    }
    if (ti.rows) {
      tty.rows = clamp(Math.floor(Number(ti.rows)), 1, 9999);
    }

    const press = /** @type {Record<string, unknown>} */ (state.pressure);
    const perm = /** @type {Record<string, unknown>} */ (state.permissions);
    const toolState = /** @type {Record<string, unknown>} */ (state.tool);
    const rec = /** @type {Record<string, unknown>} */ (state.recovery);

    press.toolConcurrency = clamp(Number(toolState.activeCount) / 3, 0, 1);
    press.permissionPressure = perm.approvalState === "pending" ? 0.8 : 0;
    press.activity = clamp(sigs.length / 10, 0, 1);

    rec.recentSuccess = Number(rec.recentSuccess) * 0.95;
    rec.recentFailure = Number(rec.recentFailure) * 0.95;
    press.risk = Number(press.risk) * 0.97;

    return getState();
  }

  return { update, getState, reset };
}

/**
 * @param {unknown} host
 */
export function deriveHostVisual(host) {
  const h =
    host && typeof host === "object" ? /** @type {Record<string, unknown>} */ (host) : {};
  const session =
    h.session && typeof h.session === "object"
      ? /** @type {Record<string, unknown>} */ (h.session)
      : {};
  const permissions =
    h.permissions && typeof h.permissions === "object"
      ? /** @type {Record<string, unknown>} */ (h.permissions)
      : {};
  const tool =
    h.tool && typeof h.tool === "object" ? /** @type {Record<string, unknown>} */ (h.tool) : {};
  const agent =
    h.agent && typeof h.agent === "object" ? /** @type {Record<string, unknown>} */ (h.agent) : {};
  const pressure =
    h.pressure && typeof h.pressure === "object"
      ? /** @type {Record<string, unknown>} */ (h.pressure)
      : {};
  const mode =
    h.mode && typeof h.mode === "object" ? /** @type {Record<string, unknown>} */ (h.mode) : {};

  const phase = normalizeTaskPhase(session.taskPhase);

  const phaseIcon =
    {
      idle: "·",
      input: "⌨",
      planning: "📋",
      reasoning: "◦",
      tooling: "⚙",
      editing: "✎",
      verifying: "✓",
      recovering: "↻",
      responding: "▶",
      waiting_approval: "⏳",
      waiting_user: "◟",
      closing: "◆",
    }[phase] || "·";

  const sandboxText = normalizeSandbox(permissions.sandbox);

  const sandboxIcon =
    {
      "read-only": "🔒",
      "workspace-write": "📝",
      "network-disabled": "🚫",
      dangerous: "⚠",
      unknown: "?",
    }[sandboxText] || "?";

  const stack = Array.isArray(tool.stack) ? tool.stack : [];
  const head = stack[0];
  const headName =
    head && typeof head === "object" && "name" in head
      ? String(/** @type {Record<string, unknown>} */ (head).name || "")
      : "";

  const lastTool =
    tool.lastTool && typeof tool.lastTool === "object"
      ? /** @type {Record<string, unknown>} */ (tool.lastTool)
      : null;

  const activeCount = Number(tool.activeCount || 0);
  const toolText =
    activeCount > 0
      ? `${activeCount} active` + (headName ? ` · ${headName}` : "")
      : lastTool && lastTool.name
        ? `last: ${String(lastTool.name)} ${lastTool.success ? "✓" : "✗"}`
        : "idle";

  const primary = agent.primary != null ? String(agent.primary) : "";
  const sub = agent.subagent != null ? String(agent.subagent) : "";
  const agentText = sub ? `${primary || "main"} → ${sub}` : primary || "main";

  return Object.freeze({
    phaseIcon,
    phaseText: phase,
    hostId: normalizeHostId(h.hostId),
    modeName: typeof mode.name === "string" && mode.name ? mode.name : "unspecified",
    sandboxIcon,
    sandboxText,
    approvalText: normalizeApproval(permissions.approvalState),
    toolText,
    agentText,
    riskPct: Math.round(clamp(Number(pressure.risk || 0), 0, 1) * 100),
    activityPct: Math.round(clamp(Number(pressure.activity || 0), 0, 1) * 100),
  });
}
