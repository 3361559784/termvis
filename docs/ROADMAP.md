# Roadmap

## V1: Current Foundation

- Dependency-free core modules
- Optional `node-pty` wrapper
- chafa subprocess runner with text fallback
- strict living shell via `termvis life`
- chafa-symbolic avatar frame and life-state machine
- JSONL life traces under `.termvis/life-traces`
- JSONL visual-only soul events under `.termvis/soul-events`
- JSON-RPC sidecar methods
- MCP stdio tools including `termvis_life_frame` and `termvis_soul_event`
- Codex, Claude Code, Copilot CLI, Gemini CLI, and OpenCode adapter generators
- Internal aggregate facade via `TermvisEngine`
- JSON Schema output through `termvis schema`
- Layered tests using Node's built-in test runner

## V1.1

- Publish generated schema for `termvis.config.jsonc`
- Add optional real-socket integration tests behind an environment flag
- Add benchmark fixtures for wrapper overhead and render latency
- Add config-driven theme palettes and contrast checks
- Add more host-specific life signal matchers for Codex/Gemini/Copilot/Claude/OpenCode output
- Add richer persona presets and accessibility profiles for reduced motion / minimal soul mode

## V2

- Ship platform-specific bundled chafa binaries as optional packages
- Add richer host-specific adapters with hooks, skills, and write/apply modes
- Add xterm/headless replay support for terminal stream snapshots and full compositor experiments
- Add subprocess-isolated plugin execution

## V3

- Add web viewer and remote observation mode
- Add visual diff and recording workflows
- Add multi-host session orchestration
