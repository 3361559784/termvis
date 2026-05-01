# termvis

`termvis` is a living terminal layer for AI CLIs. It follows the design in
[`deep-research-report-3.md`](./deep-research-report-3.md) and
[`deep-research-report-4.md`](./deep-research-report-4.md): keep host CLIs intact, use a
wrapper or adapter for integration, and use `chafa` as the symbolic renderer that gives
Codex, Gemini CLI, Copilot CLI, Claude Code, OpenCode, and other terminal agents a
visible stateful presence.

The core of termvis is **soul bios** -- a schema-first, verifiable digital life runtime with
seven processing layers: **signal → perception → cognition → memory → affect → action/express → render**.
The soul bios engine produces `SoulFrame` objects that carry mood (VAD + discrete tags),
pulse (heartbeat/breath/blink/microMotion), expression, speech, and full provenance.
Every mood change is traceable through `signalRefs`, `ruleRefs`, and `memoryRefs`.

The digital soul is render-only with respect to the host: it can display mood, heart
pulse, presence, reply, narration, and persona state, but it never writes into or
controls the real host CLI session.

The current implementation is a real V1 foundation:

- `termvis run -- <command>` runs a host command through `node-pty` when available, and
  falls back to a pipe wrapper in dependency-free environments.
- `termvis render <image>` renders through a discovered `chafa` executable when terminal
  capabilities allow it; otherwise it emits a structured terminal/text fallback.
- `termvis life` runs a living TUI shell with a left-side chafa-symbolic soul rail,
  a protected right-side host viewport, life-state inference, animated heartbeat/presence
  rendering, PTY observation, virtual host viewport VT composition, HADE soul dynamics,
  optional LLM speech, and JSONL trace output.
- `termvis life --reader` / `--plain` exposes the same soul state as linear alt-text without
  animation, color dependence, or chafa art.
- `termvis persona` remains a simpler static avatar frame/wrapper for lightweight use.
- `termvis sidecar` exposes newline-framed JSON-RPC methods for local clients.
- `termvis mcp` exposes MCP tools over stdio framing for Codex, Claude Code, GitHub
  Copilot CLI, Gemini CLI, OpenCode, or any compatible host.
- `termvis adapter <codex|claude|copilot|gemini|opencode>` prints integration snippets/files.
- `termvis schema` prints the JSON Schema for `termvis.config.jsonc`.
- The core library includes capability probing, fallback selection, JSONC config,
  CJK/emoji cell-width handling, line-grid layout, moon-white-flow theme tokens, security policy,
  plugin hooks, and renderer orchestration.

## Quick Start

Install globally:

```bash
npm install -g termvis
# or
pnpm add -g termvis
```

Configure once:

```bash
termvis setup --yes --language zh --provider codex
termvis setting --name "Termvis Soul" --profile default --role "terminal companion" --style "warm, concise, responsive"
termvis setting --show
termvis doctor
termvis life -- codex
```

Local checkout commands:

```bash
npm test
node ./bin/termvis.js doctor
node ./bin/termvis.js life --title "Digital Soul" --message "awake"
node ./bin/termvis.js persona --message "ready to help"
node ./bin/termvis.js layout-demo
node ./bin/termvis.js adapter codex
node ./bin/termvis.js adapter copilot --json
node ./bin/termvis.js adapter gemini --json
node ./bin/termvis.js schema --compact
```

If `chafa` is installed:

```bash
node ./bin/termvis.js render ./path/to/image.png --alt "Image preview"
```

For `termvis render`, if `chafa` is not installed, the command still succeeds through
the text fallback path. `termvis life` is different: it is strict by default and fails
unless TTY, color, `node-pty`, and chafa are all available.

## Commands

```text
termvis doctor [--json]
termvis setup [--yes] [--language en|zh|ja]
              [--provider codex|openai|deepseek|anthropic|ollama|none]
              [--name <persona>] [--profile <id>] [--role <text>]
              [--archetype quiet-oracle|warm-scout|playful-synth|custom]
              [--style <text>] [--traits <csv>]
termvis setting [--show|--json]
termvis setting [--language en|zh|ja]
termvis setting [--provider codex|openai|deepseek|anthropic|ollama|none]
                [--api-key-env <env>] [--api-base <url>] [--model <model>]
                [--name <persona>] [--profile <id>] [--role <text>]
                [--archetype quiet-oracle|warm-scout|playful-synth|custom]
                [--style <text>] [--traits <csv>]
termvis settings [same as setting]
termvis life [--avatar <image>] [--avatar-fit contain|cover|stretch]
             [--avatar-align <x,y>] [--avatar-scale <n|max>]
             [--state <state>] [--message <text>] [--reader|--plain]
             [--soul-name <name>] [--soul-mode <transparent|minimal|companion>]
             [--soul-narration <text>] [--soul-reply <text>]
             [--soul-session <id>] [--soul-off]
             [--] <command>
termvis persona [--avatar <image>] [--state <state>] [--message <text>] [--] <command>
termvis run -- <command> [args...]
termvis render <image-file> [--alt <text>] [--json]
termvis avatar <image-file> [--width N] [--height N] [--fit contain|cover|stretch]
               [--align <x,y>] [--scale <n|max>] [--no-ui] [--json]
termvis sidecar [--socket <path>]
termvis mcp
termvis adapter <list|all|codex|claude|copilot|gemini|opencode> [--json]
termvis schema [--compact]
termvis layout-demo
```

## Configuration

`termvis setup` and `termvis setting` write user configuration to
`~/.config/termvis/config.json`. The first interactive prompt chooses the UI language
(`en`, `zh`, or `ja`). Project configuration is still discovered by walking upward from
the current working directory, but personal user settings override the project file so
avatar, persona, provider, language, and theme choices survive inside this repo.

Important defaults:

- `render.fallbackChain`: `kitty -> iterm -> sixels -> symbols-truecolor -> symbols-256 -> mono -> ascii -> plain`
- `security.execAllowlist`: only `chafa` is allowed by default
- `security.network`: disabled by default
- `theme.name`: `moon-white-flow` by default, with `neon-vein` and `dawn-glass` available in code
- `theme.respectNoColor`: enabled by default
- `accessibility.reduceMotion`: disabled by default; when enabled, the living rail drops to a slower refresh cadence
- `accessibility.screenReaderMode`: disabled by default; when enabled, `life` uses linear alt-text status instead of the visual rail
- `life.maxFps`: `4` by default; the rail is intentionally low-noise so host CLI output stays primary
- `life.layout`: left rail constraints and minimum host viewport columns
- `life.soul`: enabled by default, with local persona/reply/narration state only

## Test Layers

The test suite uses Node's built-in test runner and avoids network dependencies.

- Unit tests cover capabilities, fallback selection, width calculation, layout, config,
  JSON-RPC, MCP tool metadata, plugins, and security.
- Integration tests cover the CLI surface, chafa runner execution using a real temporary
  executable, and sidecar JSON-RPC method dispatch through newline framing.

Run:

```bash
npm test
```

See [`docs/TESTING.md`](./docs/TESTING.md) for the test matrix and what remains
environment-dependent.

## Non-Fallback Setup

This checkout is configured for a real non-fallback rendering path:

- `node-pty@1.1.0` is installed in `node_modules`.
- `chafa 1.18.2` is installed at `.termvis/chafa-1.18.2/bin/chafa`.
- `termvis.config.jsonc` points `render.chafaPath` at that executable.

Run the strict check in a real terminal:

```bash
env -u NO_COLOR TERM=xterm-256color COLORTERM=truecolor \
  node ./bin/termvis.js doctor --strict
```

Full details are in [`docs/NON_FALLBACK_SETUP.md`](./docs/NON_FALLBACK_SETUP.md).

## Copilot CLI and Gemini CLI

This checkout includes real workspace MCP configs for both CLIs:

- Copilot CLI: [`.mcp.json`](./.mcp.json) and [`.copilot/termvis-mcp-config.json`](./.copilot/termvis-mcp-config.json)
- Gemini CLI: [`.gemini/settings.json`](./.gemini/settings.json) plus a project extension under `.gemini/extensions/termvis`

Run the visual wrapper:

```bash
node ./bin/termvis.js life --title "Codex Soul" -- codex
node ./bin/termvis.js life --title "Copilot Soul" -- copilot
node ./bin/termvis.js life --title "Gemini Soul" -- gemini
node ./bin/termvis.js life --title "Gemini Soul" --soul-name "Termvis Soul" -- gemini
node ./bin/termvis.js persona --title "Copilot Persona" -- copilot
node ./bin/termvis.js persona --title "Gemini Persona" -- gemini
node ./bin/termvis.js run -- copilot
node ./bin/termvis.js run -- gemini
```

`termvis life` keeps the digital soul visible while the host is running. The interactive TUI
uses its own alternate screen, and the host stream is parsed into a virtual right-side viewport
before being painted. Alt-screen, clear screen, cursor movement, scrolling, long lines, CJK,
emoji, and SGR colors stay inside that viewport instead of growing the left soul rail in
scrollback.

For screen readers or plain logs:

```bash
node ./bin/termvis.js life --reader --title "Codex Soul" -- codex
node ./bin/termvis.js life --plain --title "Gemini Soul" -- gemini
```

This path emits `[termvis]` alt-text state mirrors and leaves the host output linear.

While `termvis life` is running, an MCP-capable host can call `termvis_soul_event` to append
LLM-observed soul events to `.termvis/soul-events/<session>.jsonl`. The runtime polls those
events and feeds them into the intelligent soul engine; visual mood, pulse, presence, host
state, and replies still come from the LLM pipeline.

```json
{
  "mood": "recovering",
  "presence": "recover",
  "reply": "I will keep the light steady while the command settles.",
  "source": "gemini"
}
```

Use `termvis_soul_config` for live persona/style/avatar updates:

```json
{
  "persona": { "name": "Noa", "speakingStyle": { "brevity": 3, "warmth": 1 } },
  "avatar": null,
  "avatarFit": "cover",
  "avatarAlign": "top,left",
  "avatarScale": "max"
}
```

Run the MCP checks:

```bash
copilot mcp list --json --additional-mcp-config @.copilot/termvis-mcp-config.json
gemini mcp list
```

Gemini model sessions require `GEMINI_API_KEY` when using the Gemini API provider.
Detailed commands and troubleshooting are in
[`docs/COPILOT_GEMINI_USAGE.md`](./docs/COPILOT_GEMINI_USAGE.md).

## Soul Bios Runtime

The `soul-bios` module (`src/soul-bios/`) implements the seven-layer cognitive runtime
described in `deep-research-report-4.md`.

### Architecture

```
Host CLI → Signal Layer → Perception → Cognition → Memory → Affect → Action → Render
                                                                          ↓
                                                                     SoulFrame
                                                                     (frozen, versioned,
                                                                      with provenance)
```

### Core Data Models

| Entity | Purpose | Key Fields |
|--------|---------|------------|
| `SignalEvent` | Standardized input event | `id/ts/source/kind/priority/reliability/payload` |
| `HostContext` | Current host state | `host/mode/approvalState/sandbox/ttyCaps` |
| `PresenceState` | Attention & mode | `mode(dormant\|ambient\|attentive\|foreground)/attention/silenceBudgetMs` |
| `MoodState` | Emotion vector | `valence(-1..1)/arousal(0..1)/dominance(0..1)/tags[]/confidence` |
| `PulseState` | Physiology simulation | `heartbeatBpm/breathMs/blinkMs/microMotion` |
| `ExpressionState` | Visual face/gesture | `face/gesture/frameset/intensity` |
| `SaysState` | Language output | `main/aside/tone/speechAct` |
| `Provenance` | Evidence chain | `signalRefs/memoryRefs/ruleRefs/llmRunId/consistencyScore` |
| `SoulFrame` | Unified output | All of the above, versioned with `schemaVersion` + `entityVersion` |

### Pulse Generation Formulas

| Dimension | Formula | Range |
|-----------|---------|-------|
| Heartbeat | `58 + arousal × 28 + focusBoost(8)` | 58–96 bpm |
| Breath | `4800 - arousal × 2200` | 2600–4800 ms |
| Blink | `3200 ± jitter`, shorter when tense | 1800–4200 ms |
| MicroMotion | `0.1 + arousal × 0.6` | 0.1–0.7 |

### Rule-Based Affect Engine

Mood updates are deterministic and rule-driven (LLM only assists with language):

```js
// Signal → mood delta mapping (excerpt)
tool.failure  → valence -= 0.18 × reliability, arousal += 0.22 × reliability
user.praise   → valence += 0.16 × reliability
approval.pending → dominance -= 0.20 × reliability, arousal += 0.10 × reliability

// Decay with inertia
valence   = clamp(prev.valence × 0.82 + delta.valence, -1, 1)
arousal   = clamp(prev.arousal × 0.75 + delta.arousal + taskUrgency × 0.2, 0, 1)
dominance = clamp(prev.dominance × 0.8 + delta.dominance - risk × 0.25, 0, 1)
```

### SoulEngine Lifecycle

```js
import { createSoulEngine, createSoulBiosCaps, createSignalEvent } from "termvis/soul-bios";

const engine = createSoulEngine();
await engine.init(createSoulBiosCaps({ hostId: "codex", transport: "stdio" }));

await engine.ingest([
  createSignalEvent({ kind: "tool.failure", priority: 5, reliability: 0.95 })
]);

const frame = await engine.tick();
// frame.mood.valence < 0 (decreased by failure)
// frame.provenance.ruleRefs includes "mood:tool.failure"
// frame.pulse.heartbeatBpm reflects elevated arousal

await engine.dispose();
```

### JSON-RPC Methods (Sidecar)

| Method | Params | Returns |
|--------|--------|---------|
| `signal.ingest` | `{ sessionId, events: SignalEvent[] }` | `{ accepted, dropped }` |
| `soul.tick` | `{ sessionId, now? }` | `SoulFrame` |
| `memory.snapshot.export` | `{ sessionId, scope }` | `{ data, checksum }` |

### MCP Tools

| Tool | Description |
|------|-------------|
| `termvis_signal_ingest` | Ingest signal events into the soul bios engine |
| `termvis_soul_tick` | Advance the engine and return the current SoulFrame |
| `termvis_soul_event` | Append LLM-observed soul events for the cognition layer |
| `termvis_soul_config` | Update running persona, speaking style, and avatar renderer settings |

### JSON Schema

The full SoulFrame schema is available at [`schemas/soul-frame.schema.json`](./schemas/soul-frame.schema.json).

## Cognitive Pipeline (Intelligent Mode)

Beyond the deterministic affect core, termvis ships a four-stage LLM-driven cognitive
pipeline based on `deep-research-report-4.md` and the latest authoritative literature:

- **OpenAI Structured Outputs** (`response_format: { type: "json_schema", strict: true }`) — guarantees schema-valid output without retries
- **Anthropic Structured Outputs GA (Jan 2026)** (`output_config.format`, `strict: true` tool use) — grammar-constrained sampling
- **Ollama** with raw JSON Schema in the `format` field for fully local inference
- **MemoryBank (Zhong et al.)** — Ebbinghaus retention with `R = e^(-t/S)` where `S = strength × importance × 1day`
- **Reflective Memory Management (Tan et al., ACL 2025)** — Prospective + Retrospective Reflection
- **OWASP Prompt Injection** patterns + **WCAG** color contrast rules baked into the safety filter

### Architecture

```
SignalEvent  ─┐
PresenceState ├──► Stage 1 ─► Stage 2 ─► Stage 3 ─► Stage 4 ─► SoulFrame.says
MoodState    ─┤    Planner   Content   Style      Safety
HostContext  ─┤    (IntentPlan) (Draft) (Says)    (passed/blocked)
Memory hits  ─┘    JSON schema  JSON     JSON     rules + LLM judge
                   strict       schema   schema
                                 ↓
                        provenance.llmRunIds[],
                        provenance.stageElapsed
```

If no LLM provider is reachable, schema validation fails, or a provider call times
out, the affected stage stays silent. No rule/template response is synthesized.

### Provider Auto-Detection

| Env Var Present | LLM Provider | Embedding Provider |
|-----------------|--------------|--------------------|
| `OPENAI_API_KEY` | OpenAI (`gpt-4o-mini` default) | `text-embedding-3-small` (1536d) |
| `DEEPSEEK_API_KEY` | DeepSeek (`deepseek-chat` default) | Lexical hashing (256d, deterministic) |
| `ANTHROPIC_API_KEY` | Anthropic (`claude-haiku-4.5` default) | falls through to next |
| `OLLAMA_HOST` | Ollama (`llama3.2` default) | Ollama (`nomic-embed-text`, 768d) |
| `TERMVIS_CODEX_LLM=1` or `life -- codex` | Codex CLI (`codex exec`) | Lexical hashing (256d, deterministic) |
| _(none)_ | none — cognition stays silent | Lexical hashing (256d, deterministic) |

Override via `cognition.llm.provider` and `cognition.embedding.provider`.
Set `cognition.llm.model` to use a specific model. DeepSeek can be selected with
an environment variable. `termvis` stores only the variable name, never the
secret value:

```bash
export DEEPSEEK_API_KEY="..."
termvis setup --yes --provider deepseek --api-key-env DEEPSEEK_API_KEY --model deepseek-chat
```

Equivalent config:

```jsonc
{
  "cognition": {
    "llm": {
      "provider": "deepseek",
      "model": "deepseek-chat",
      "baseURL": "https://api.deepseek.com/v1"
    }
  }
}
```

### Smart Memory (Five Layers)

| Layer | Capacity | Retention | Notes |
|-------|----------|-----------|-------|
| `working` | 20 (config) | session | Always-recency, no embedding |
| `quarantine` | 32 | 10 min default | Holding zone for new episodic entries |
| `episodic` | 200 | Ebbinghaus decay | Promoted from quarantine after timeout if no conflict |
| `semantic` | 100 | longest | Conflict-aware: duplicates kept with reduced confidence |
| `reflective` | 64 | indefinite | Requires explicit `cognition.memory.reflective: true` |

Recall uses cosine similarity over embeddings when available; otherwise falls back to
substring matching with 7-day half-life recency boost.

### Reflection Cycles (RMM)

Every `cognition.reflectionTickInterval` ticks (default 20):

1. **Prospective**: LLM consolidates the latest 16 episodic entries into 1–5 semantic
   summaries with tags + importance. Without a valid LLM summary, no records are promoted.
2. **Retrospective**: cited memory IDs from recent SoulFrames get `+0.05` importance;
   memories untouched for 30 days with `accessCount < 2` get `-0.02` importance.
3. **Decay**: applies Ebbinghaus formula across all layers, prunes records below
   `pruneThreshold` (default 0.05).

### Intelligent Engine Example

```js
import { createIntelligentSoulEngine, createSignalEvent, createSoulBiosCaps } from "termvis/soul-bios";

const engine = await createIntelligentSoulEngine({
  sessionId: "demo",
  persona: { name: "Termvis Soul", speakingStyle: { brevity: 2, warmth: 1, metaphor: 0, emoji: 0 } },
  memoryAllowReflective: false,
  safetyJudge: false
});
await engine.init(createSoulBiosCaps({ hostId: "codex" }));

await engine.ingest([
  createSignalEvent({
    kind: "tool.failure",
    priority: 5,
    reliability: 0.95,
    payload: { text: "pytest -k util — 1 failed" }
  })
]);

const frame = await engine.tick();
console.log(frame.says);          // { main, tone, speechAct } from LLM pipeline
console.log(frame.provenance);    // includes llmRunId, signalRefs, ruleRefs, memoryRefs

await engine.dispose();
```

### Configuration

```jsonc
{
  "cognition": {
    "enabled": true,
    "safetyJudge": false,
    "reflectionTickInterval": 20,
    "persona": {
      "name": "Termvis Soul",
      "archetype": "calm-guide",
      "speakingStyle": { "brevity": 2, "warmth": 1, "metaphor": 0, "emoji": 0 }
    },
    "llm": {
      "provider": "auto",
      "model": null,
      "maxTokens": 1024,
      "temperature": 0.4
    },
    "embedding": {
      "provider": "auto",
      "model": null,
      "dimensions": null,
      "probeOllama": true
    },
    "memory": {
      "reflective": false,
      "quarantineMs": 600000,
      "pruneThreshold": 0.05
    }
  }
}
```

### Module Exports

```js
import { createIntelligentSoulEngine } from "termvis/soul-bios";
import { runCognitivePipeline } from "termvis/cognition/pipeline";
import { createLLMProvider, createEmbeddingProvider, CodexCliLLMProvider } from "termvis/cognition";
import { EmbeddedMemoryStore, prospectiveReflect, createReflectionScheduler } from "termvis/memory";
```

### Local Codex Provider

```js
import { CodexCliLLMProvider } from "termvis/cognition";
import { runCognitivePipeline } from "termvis/cognition/pipeline";

const llm = new CodexCliLLMProvider({ cwd: process.cwd(), env: process.env });
const result = await runCognitivePipeline({ llm, context: { /* ... */ } });
// result.provenance.llmRunIds records real provider calls.
```

Note: `createLLMProvider()` does not include synthetic providers. Without OpenAI,
DeepSeek, Anthropic, Ollama, or an explicit Codex CLI provider, the engine reports
`provider: "none", available: false`.

## TUI Visualization

The terminal rail shows full `SoulFrame` state with kawaii ASCII art and live LLM
connection status. When the intelligent engine runs (auto-detected from env), the rail
displays:

```
▌● Termvis Soul                            │   ← persona + heartbeat dot
▏  termvis living shell                    │   ← session subtitle
▏                                          │
▏                 ✧   ♡   ✧                │   ← anime art
▏              ╱╲╲────────╱╱╲              │     scales mini/medium/large
▏             ╱╲╭──────────╮╱╲             │     based on terminal width
▏            ╱╲│  ────────  │╱╲            │     8 emotions keyed to mood
▏              │   ◕  ‿  ◕  │              │
▏              │      ω     │              │
▏                                          │
▏◉ mood  focused  V+0.20 A0.45 D0.55       │   ← VAD numerics
▏♥ pulse 73 bpm  ▂▄▅▄ ∘                   │   ← BPM + breath wave + animated glyph
▏◉ presn ambient · att 0.42                │   ← presence mode + attention bar
▏➤ sig   tool.failure                      │   ← latest signal
▏░ val           │▓▓▓                      │   ← VAD bars (wide layout)
▏░ aro   ▓▓▓▓▓▓░░░░░░░░░░                  │
▏░ dom   ▓▓▓▓▓▓▓▓░░░░░░░░                  │
▏                                          │
┌ Soul Says ───────────────────────────────┐
│ ◎ focused + observe     ♥73 steady       │
│ 「Test failed. Try rerunning with -v.」    │   ← LLM-generated speech
└──────────────────────────────────────────┘
```

### Connection Status Icons

| Icon | LLM State | Meaning |
|------|-----------|---------|
| `●` | available, idle | Provider connected, ready |
| `◈` | calling | Active LLM request in flight |
| `✗` | error | Last call failed (auth, network, rate-limit) |
| `○` | unavailable | No provider detected; cognition remains silent |

### Anime Character Art

The built-in character art (`src/life/anime-art.js`) ships with 10 emotion sets in 3 sizes:

- **mini** (3 lines × 12 cols) — terminals < 80 cols
- **medium** (6 lines × 18 cols) — terminals 80-119 cols
- **large** (9 lines × 24 cols) — terminals ≥ 120 cols

Emotions: `idle`, `blink`, `thinking`, `speaking`, `delighted`, `focused`, `curious`,
`guarded`, `tired`, `sleepy`. Auto-selected from `MoodState.tags`:
`guarded > tired > delighted > curious > focused > calm`.

Blink animation cycles at 400 ms; eyes alternate between the resting set and `blink`
except for `tired`/`sleepy` which keep their closed-eye look.

## Detailed Design

- [`docs/TECH_STACK_AND_FLOWS.md`](./docs/TECH_STACK_AND_FLOWS.md) documents the full
  technology stack, authoritative sources, Mermaid diagrams, sidecar/MCP/render flows,
  host adapter boundaries, security model, and test loop.
- [`docs/LIVING_TERMINAL_ARCHITECTURE.md`](./docs/LIVING_TERMINAL_ARCHITECTURE.md)
  documents the actual project thesis: chafa-symbolic digital life in AI CLI terminals.
- [`docs/DIGITAL_SOUL_EVENTS.md`](./docs/DIGITAL_SOUL_EVENTS.md) documents the
  soul event chain, persona fields, MCP payloads, and manual
  verification flow.
- [`docs/IMPLEMENTATION_MATRIX.md`](./docs/IMPLEMENTATION_MATRIX.md) maps the research
  report requirements to concrete files and verification commands.
- [`docs/NON_FALLBACK_SETUP.md`](./docs/NON_FALLBACK_SETUP.md) documents the exact
  installed dependencies, configuration, and commands required for non-fallback mode.
- [`docs/COPILOT_GEMINI_USAGE.md`](./docs/COPILOT_GEMINI_USAGE.md) documents actual
  GitHub Copilot CLI and Gemini CLI usage, MCP setup, wrapper mode, and troubleshooting.
- [`docs/PERSONA_CLI.md`](./docs/PERSONA_CLI.md) documents the avatar/persona terminal
  shell that turns chafa-rendered virtual characters into a live CLI presentation.
