# Architecture

`termvis` is split into small layers so host integrations can evolve independently.
The current code follows an internal-aggregate / external-low-coupling rule:
external surfaces call `TermvisEngine`, while `TermvisEngine` owns the internal
composition of config, capability probing, layout, rendering, policy, and plugins.

## Layers

1. CLI surface
   - `src/cli/main.js`
   - Commands: `doctor`, `life`, `persona`, `run`, `render`, `sidecar`, `mcp`, `adapter`, `layout-demo`

2. Core
   - `src/core/capabilities.js`: TTY, size, color, Unicode, pixel protocol detection
   - `src/core/fallback.js`: explicit mode selection and chafa argument mapping
   - `src/core/width.js`: CJK, emoji, combining mark, ANSI-aware cell width
   - `src/core/layout.js`: deterministic line-grid cards, stacks, and splits
   - `src/core/config.js`: upward JSONC config discovery and validation
   - `src/core/theme.js`: token resolution, truecolor/256/NO_COLOR behavior, and contrast helpers

3. Rendering
   - `src/render/chafa-runner.js`: system `chafa` discovery and subprocess execution
   - `src/render/text-renderer.js`: structured visual fallback output

4. Living terminal
   - `src/life/state.js`: AI CLI life states, signal inference, stable BPM pulse model, event and digest tracking
   - `src/life/soul.js`: visual-only digital soul state, persona normalization, LLM soul event JSONL store, custom mood/reply handling, mood/BPM mapping
   - `src/life/frame.js`: chafa-symbolic avatar frame and status line rendering
   - `src/life/tui.js`: always-on ambient left soul rail and right host viewport painter
   - `src/life/viewport.js`: lightweight VT compositor for host alt-screen, cursor, clear, scroll, wrap, SGR, CJK, and emoji behavior
   - `src/life/runtime.js`: strict PTY wrapper, terminal-title pulse, JSONL trace, soul event polling

5. Control plane
   - `src/protocol/json-rpc.js`: transport-neutral JSON-RPC helpers
   - `src/sidecar/server.js`: local sidecar methods over newline framing
   - `src/mcp/server.js`: MCP stdio tools over Content-Length framing, including `termvis_life_frame` and `termvis_soul_event`

6. Extension and safety
   - `src/plugins/plugin-manager.js`: ordered, timeout-bound trusted hooks
   - `src/security/policy.js`: exec, file, network, plugin, and terminal-output policy

7. Host adapters
   - `src/adapters/codex.js`
   - `src/adapters/claude-code.js`
   - `src/adapters/copilot.js`
   - `src/adapters/gemini.js`
   - `src/adapters/opencode.js`

8. Application aggregate
   - `src/application/termvis-engine.js`: stable facade for CLI, MCP, sidecar, and tests

## Runtime Flow

For `termvis render`:

1. Load config.
2. Create `TermvisEngine`.
3. Probe terminal capabilities.
4. Run trusted `beforeRender` hooks.
5. Select the highest supported fallback mode.
6. Check `security.execAllowlist`.
7. Discover `chafa`.
8. Execute `chafa` if allowed and available.
9. Sanitize terminal output.
10. Run trusted `afterRender` hooks.
11. Return text fallback if any visual requirement is unavailable.

For host integration:

1. The host starts `termvis mcp`, or an external client talks to `termvis sidecar`.
2. The request enters JSON-RPC/MCP dispatch.
3. The same core capability, layout, security, and render modules are used.
4. Results remain terminal-safe text payloads with alt text.

For `termvis life`:

1. Load config and enforce strict non-fallback readiness by default.
2. Render a chafa-symbolic avatar into the always-on ambient left soul rail.
3. Reserve a right-side host viewport and start the host AI CLI through `node-pty`.
4. Parse host VT/ANSI output into a virtual right viewport, then paint changed rows by absolute coordinates so host output cannot overwrite or scroll the soul rail.
5. Observe stdout/stderr chunks without replacing the host agent.
6. Infer state transitions such as `reasoning`, `acting`, `waiting`, `succeeded`, and `failed`.
7. Redraw the HUD continuously with mood, presence, BPM pulse phase, signal, reply, and pinned footer counters.
8. Poll `.termvis/soul-events/<session>.jsonl` for LLM-generated visual-only mood, pulse, persona, reply, and narration events.
9. Persist JSONL trace events under `.termvis/life-traces`.
10. Update terminal title pulse during the run.
11. Render a final succeeded or failed state in the same TUI.

## Design Boundaries

`chafa` is a renderer, not the layout engine. The line-grid layout layer remains in
`termvis` so CJK width, fallback behavior, adapter semantics, and security can stay
consistent across hosts.

`termvis life` is a living TUI shell, not a fork of Codex/Gemini/Copilot/Claude/OpenCode.
It observes and frames real host CLIs through PTY and MCP while keeping the visible soul
rail separate from the host viewport. `--reader` / `--plain` use linear alt-text instead of the visual rail. A future full VT compositor can still use a headless
terminal buffer, but the current runtime already prevents normal fullscreen, clear,
cursor, scroll, long-line, SGR, CJK, and emoji host output from erasing or misaligning
the soul panel.

`termvis_soul_event` is deliberately visual-only. It appends local JSONL events that the
TUI reads for mood, BPM, persona, reply, and narration updates; it never writes to host stdin and
does not become part of the real CLI command stream.
