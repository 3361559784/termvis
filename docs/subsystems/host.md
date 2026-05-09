# Host Environment Model

[← Back to doc index](../README.md) · [Signal](./signal.md) · [Tick cycle](../architecture/tick-cycle.md)

The **Host Model** mirrors the real agent process: what phase of work is happening, which tools are in flight, and what permission posture the session uses. It never sends commands to the host; it **observes** and projects structured state for mood, memory, and presence.

## Task phase graph

Phases advance on classified signals and adapter-specific hooks:

```text
idle → input → planning → reasoning → tooling → editing → verifying → recovering → responding → closing → idle
```

| Phase | Meaning for SDR |
|-------|------------------|
| **idle** | No active user goal; soul may drift toward reflective/dormant presence |
| **input** | User composing intent; high attention on `user_input` gaze |
| **planning** | Enumeration / branch selection; risk rises if speculative commands appear |
| **reasoning** | Model-only analysis; pulse quickening without tool depth |
| **tooling** | Shell / MCP / file tools; stack depth tracked |
| **editing** | Buffered writes; paired with diff-aware signals when available |
| **verifying** | Tests, linters, build; failures transition toward **recovering** |
| **recovering** | Repair loops; memory **debt** accrues unless mitigated |
| **responding** | Natural language back to user; presence may `engage` |
| **closing** | Wrap-up; transitions to calm/companion farewell stances |

Phases may **short-circuit** (for example tooling → verifying on a test-only change).

## Tool stack tracking

- **Depth**: number of nested or concurrent tool invocations
- **Class**: shell, file_read, file_write, network, VCS, package_install, test_runner, etc.
- **Hotness**: exponential moving average of invocations per minute

Risk scoring uses class **tiers** (network > file_write > read) and sandbox flags.

## Permission states

| State | Description |
|-------|-------------|
| **implicit** | Default allow for safe tier |
| **pending** | Awaiting user approval—presence → `guardian`, pulse → `holding` |
| **denied** | User blocked; memory records trust **debt** |
| **expired** | Stale permission dialog; signal engine escalates priority |

## Sandbox modes

| Mode | Host implication | Soul bias |
|------|------------------|-----------|
| **strict** | Reduced write/network surface | Higher base risk; more `guarded` readiness |
| **balanced** | Typical dev session | default CAAP weights |
| **permissive** | Broad tool allowance | Lower friction posture; still spikes on destructive patterns |

Exact names follow each host CLI; SDR maps them to this enum via adapters.

## Host adapter reference

| Host CLI | Adapter focus | Typical integration |
|----------|----------------|---------------------|
| **Codex** | MCP tools, `codex exec` bridges | `termvis mcp`; OpenAI Docs MCP alignment |
| **Claude Code** | Plugins + hooks | Hook/plugin JSON; MCP stdio |
| **Gemini CLI** | `settings.json` MCP servers | Extension context files (for example `GEMINI.md`) |
| **Copilot CLI** | `.mcp.json`, trust tiers | Additional MCP config paths |
| **OpenCode** | Local MCP, plugins, themes | Low-coupling config snippets via `termvis adapter opencode` |

All adapters share goals: **discover** the stdio MCP server, **forward** life/soul tools where appropriate, and **surface** permission prompts as high-priority signals.

## Related documentation

- [Signal pipeline](./signal.md)
- [Memory: operational debt](./memory.md)
- [Quickstart: choosing a host](../guides/quickstart.md)
