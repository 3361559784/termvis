# Configurable settings reference

[← Back to doc index](../README.md) · [API providers](./api-providers.md) · [Quickstart](../guides/quickstart.md)

`termvis` loads defaults, then the nearest project JSONC config, then the user config at
`~/.config/termvis/config.json`. User settings intentionally win so personal avatar,
provider, theme, and persona choices are not reset by a repository config.

Project JSONC config is discovered by walking upward from the current working directory, trying in order:

- `termvis.config.jsonc`
- `termvis.config.json`
- `.termvisrc.jsonc`
- `.termvisrc.json`

CLI flags override file values for many `termvis life` options. This page maps **Soul Dynamics–relevant** settings to their purpose.

Use `termvis setup` for first-run configuration and `termvis setting` for later edits. Both support non-interactive persona/profile fields:

```bash
termvis setup --language zh
termvis setting --language ja
termvis setting --provider deepseek --model deepseek-chat
termvis setting --name "Termvis Soul" --profile default --role "terminal companion" \
  --archetype warm-scout --style "warm, concise, responsive" \
  --traits warm,attentive,adaptive
```

## Language

| Key | Description |
|-----|-------------|
| `ui.language` | Interface and visible Soul Says prompt language: `en`, `zh`, or `ja` |
| `life.soul.persona.language` / `cognition.persona.language` | Persona speech language mirrored from `ui.language` |

Interactive `termvis setup` and `termvis setting` ask for language first. Pressing Enter in
settings keeps the current value; it no longer overwrites existing fields with empty strings.

## Theme

| Key | Description |
|-----|-------------|
| `theme.name` | Palette token set (for example `moon-white-flow`) |
| `theme.respectNoColor` | Honor `NO_COLOR` |
| `theme.minimumContrast` | WCAG-style contrast floor for HUD tokens |

Themes affect rail chrome, status lines, and fallback text—not the host viewport palette.

## Avatar

| Key | Description |
|-----|-------------|
| `life.avatar` | Default image path for chafa-symbolic rendering |
| `life.avatarFit` | `contain`, `cover`, or `stretch` |
| `life.avatarAlign` | Fractional anchor (for example `mid,mid`) |
| `life.avatarScale` | Numeric scale or `max` |

CLI: `--avatar`, `--avatar-fit`, `--avatar-align`, `--avatar-scale`.

## Presence preference

| Key | Description |
|-----|-------------|
| `soulBios.initialPresenceMode` | Bootstrap presence scheduler (`ambient`, etc.) |
| `soulBios.initialConsentLevel` | How aggressively to surface permission-heavy postures |
| `life.soul.mode` | Visual cadence: `transparent`, `minimal`, `companion` |

These bias the [Presence](../subsystems/presence.md) scheduler without exposing unsafe host control.

## Persona profile

| Key | Description |
|-----|-------------|
| `life.soul.persona.id` / `cognition.persona.id` | Profile id used by setup and settings |
| `life.soul.persona.name` / `cognition.persona.name` | Visible soul name and LLM persona name |
| `life.soul.persona.role` / `cognition.persona.role` | Role text supplied to the cognition prompts |
| `life.soul.persona.archetype` / `cognition.persona.archetype` | `quiet-oracle`, `warm-scout`, `playful-synth`, or `custom` |
| `life.soul.persona.style` / `cognition.persona.style` | Natural-language speaking style |
| `life.soul.persona.traits` / `cognition.persona.traits` | Short trait list |
| `life.soul.persona.speakingStyle` | Dial object: `brevity`, `warmth`, `metaphor`, `emoji` from 0 to 3 |

The setup/settings commands write the same persona into `life.soul.persona` and
`cognition.persona` so the rail name, Soul Says, and LLM prompt all use one profile.

## LLM anchor budget

| Key | Description |
|-----|-------------|
| `cognition.reflectionTickInterval` | Ticks between optional reflection passes |
| `cognition.llm.provider` | `auto`, `openai`, `deepseek`, `anthropic`, `ollama`, `codex`, or `none` |
| `cognition.llm.model` | Provider model, for example `deepseek-chat` |
| `cognition.llm.baseURL` | Provider base URL override |
| `cognition.llm.maxTokens` | Cap on appraisal/reflection completions |
| `cognition.memory.quarantineMs` | How long risky memory stays isolated |
| `cognition.memory.pruneThreshold` | Score floor for kept traces |

Higher reflection frequency spends more anchor budget but stabilizes mood under noise.

## Pulse persona

| Key | Description |
|-----|-------------|
| `mood.showHeartbeat` | Toggle heartbeat visualization |
| `mood.idleHeartbeatBpm` | Two-number range `[low, high]` for calm baseline |
| `mood.maxFps` | Animator cadence cap (keeps CPU low) |
| `life.pulse` | Terminal title pulse mode (for example `title`) |
| `life.maxFps` | Life TUI HUD refresh ceiling |

Maps directly to [Pulse](../subsystems/pulse.md) sympathetic/parasympathetic basins.

## Display mode

| Key | Description |
|-----|-------------|
| `life.layout.side` | Soul rail placement (`left` / `right` in supported builds) |
| `life.layout.minHostCols` | Minimum host viewport width before degrading layout |
| `life.layout.minRailWidth` / `maxRailWidth` | Rail column bounds |
| `render.fallbackChain` | Ordered chafa modes (`kitty`, `iterm`, `symbols-truecolor`, …) |
| `render.backend` | `auto`, `system`, `bundled`, `disabled` |

CLI reader modes: `--reader` / `--plain` bypass animation-Heavy HUD while preserving semantic status.

## Accessibility options

| Key | Description |
|-----|-------------|
| `accessibility.screenReaderMode` | Prefer explicit textual ordering |
| `accessibility.altText` | Emit descriptive alt text alongside visuals |
| `accessibility.reduceMotion` | Suppress shimmer, breath micro-motion, flutter accents |
| `accessibility.respectNoColor` | Align with `NO_COLOR` |

Pair with [`life.strict`](../guides/quickstart.md) policies when building CI-friendly environments.

## Memory scopes (soul-facing)

| Key | Description |
|-----|-------------|
| `memory.scope` | `session`, `project`, or `user` |
| `memory.retentionDays` | Episodic retention window |
| `memory.workingLimit` | Working-set row cap |
| `memory.episodicLimit` | Episodic store cap |
| `memory.semanticLimit` | Semantic index cap |
| `memory.reflective` | Enable reflective consolidation passes |

See [Memory layers](../subsystems/memory.md) for conceptual mapping.

## Embedding

| Key | Description |
|-----|-------------|
| `cognition.embedding.provider` | `auto`, `openai`, `ollama`, or `lexical` |
| `cognition.embedding.model` | Optional model override |
| `cognition.embedding.probeOllama` | Probe local Ollama for embedding support |

`termvis setting` now includes an Embedding Provider option in the interactive menu. `lexical` is a local, deterministic, no-API-key fallback.

## Verification

Run `termvis verify` to check all settings:

```bash
termvis verify          # human-readable
termvis verify --json   # machine-readable
```

The verify command checks: config validity, terminal capabilities, chafa, node-pty, LLM provider, embedding provider, theme, language, persona, presence, accessibility, and avatar.

## Related documentation

- [API providers](./api-providers.md)
- [Architecture overview](../architecture/overview.md)
