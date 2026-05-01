# Quickstart: Soul Dynamics / termvis

[← Back to doc index](../README.md) · [Configuration](../configuration/settings.md) · [API providers](../configuration/api-providers.md)

This guide takes you from clone to a **living terminal** session with the soul rail, host viewport, and traced runtime behavior.

## 1. Install

```bash
cd /path/to/chafa_cli
npm install
```

Install **`chafa`** and ensure a TTY with color support. `termvis life` is **strict** by default: it expects `chafa`, `node-pty`, and usable terminal capabilities.

## 2. Configure

Create `termvis.config.jsonc` (optional but recommended):

```jsonc
{
  "theme": { "name": "moon-white-flow", "minimumContrast": 4.5 },
  "mood": { "idleHeartbeatBpm": [58, 66], "maxFps": 6 },
  "life": {
    "strict": true,
    "avatar": null,
    "soul": { "mode": "companion" }
  },
  "cognition": {
    "llm": { "provider": "auto", "temperature": 0.4 }
  }
}
```

Set provider credentials as needed:

```bash
export OPENAI_API_KEY="sk-..."
# or
export DEEPSEEK_API_KEY="sk-..."
# or
export ANTHROPIC_API_KEY="sk-ant-..."
# or run local Ollama
export OLLAMA_HOST="http://localhost:11434"
```

See [API providers](../configuration/api-providers.md) for DeepSeek, OpenRouter, Azure, and Gemini-compatible routing.

For a global install and user profile, prefer the setup/settings commands:

```bash
termvis setup --yes --language zh --provider codex --name "Termvis Soul" --profile default
termvis setting --role "terminal companion" --style "warm, concise, responsive"
termvis setting --show
```

DeepSeek example:

```bash
export DEEPSEEK_API_KEY="..."
termvis setup --yes --language zh --provider deepseek --api-key-env DEEPSEEK_API_KEY --model deepseek-chat
```

## 3. Run

Health check:

```bash
node ./bin/termvis.js doctor
```

Living shell with bundled avatar message:

```bash
node ./bin/termvis.js life --title "Digital Soul" --message "awake" -- bash
```

Run a specific host (examples):

```bash
node ./bin/termvis.js life -- codex
node ./bin/termvis.js life -- gemini
```

Reader / plain mode (reduced motion and linear text):

```bash
node ./bin/termvis.js life --reader --message "awake" -- bash
```

## 4. Customize

### Adapter snippets

```bash
node ./bin/termvis.js adapter codex
node ./bin/termvis.js adapter claude
node ./bin/termvis.js adapter copilot --json
node ./bin/termvis.js adapter gemini --json
node ./bin/termvis.js adapter opencode
```

### MCP server (for tool-capable hosts)

```bash
node ./bin/termvis.js mcp
```

### JSON schema for editors

```bash
node ./bin/termvis.js schema --compact
```

## 5. Learn the runtime

| Doc | Why read it |
|-----|-------------|
| [Architecture overview](../architecture/overview.md) | Subsystems and graph |
| [Tick cycle](../architecture/tick-cycle.md) | Ordering |
| [Signal types](../subsystems/signal.md) | Input taxonomy |
| [Host model](../subsystems/host.md) | Phases + adapters |

## Troubleshooting snapshot

| Symptom | Hint |
|---------|------|
| `life` refuses to start | Run `termvis doctor`; install `chafa`; ensure real TTY |
| Windows: `Cannot create process, error code: 2/193` | Fixed in v2: `termvis life` now delegates to `cmd.exe /c` on Windows for correct PATH and `.cmd` wrapper resolution |
| No LLM appraisal | Verify env vars per [API providers](../configuration/api-providers.md); run `termvis verify` |
| Soul Says stays silent | Ensure LLM is available (`termvis verify`); all gates except time-interval have been removed |
| Persona or avatar looks reset | Check `termvis setting --show`; user config now overrides project config |
| Interface language is wrong | Run `termvis setting --language en`, `zh`, or `ja`; restart the live session |
| Soul rail overlaps host | Widen terminal or trim `life.layout.maxRailWidth` |

## Related documentation

- [Settings reference](../configuration/settings.md)
- [Repository TECH stack](../../docs/TECH_STACK_AND_FLOWS.md) (implementation deep dive)
