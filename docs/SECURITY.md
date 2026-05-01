# Security Model

The default policy is intentionally conservative.

## Defaults

- Network access is disabled in config semantics.
- External command execution is limited to `chafa`.
- Third-party plugins are rejected unless trusted.
- File reads are scoped to configured roots.
- Terminal output sanitization strips OSC sequences, including clipboard-oriented OSC 52.

## Renderer Execution

`renderVisual()` checks `security.execAllowlist` before running `chafa`. If `chafa` is
not allowed, rendering falls back to text unless strict mode is enabled.

## Living Shell

`termvis life` is strict by default. It fails if TTY, color, `node-pty`, or chafa are
missing, unless the user explicitly passes `--allow-fallback`. This keeps the real
living-terminal path from silently becoming a text-only demo.

The living runtime observes host output and stores digest-oriented JSONL trace entries.
It does not store raw full transcripts by default; trace events contain state, stable
heart BPM, event counts, output byte counts, and short hashes.

## Digital Soul Events

`termvis_soul_event` is visual-only. It appends normalized local JSONL under
`.termvis/soul-events` and the TUI polls that file to update mood, presence, BPM,
persona, reply, and narration. It never writes to the host PTY stdin, never executes commands,
and never modifies the host CLI configuration.

The soul event store is deliberately separate from `.termvis/life-traces`: traces record
how the host stream was observed, while soul events record LLM-generated presentation
state. Deleting `.termvis/soul-events` removes the local soul event history.

## Plugin Hooks

`PluginManager` requires either `plugin.trusted === true` for built-ins or an explicit
trust decision from the policy object. Hooks run in order and have a timeout.

This is a V1 enforcement model. Future process-isolated plugins should keep the same
policy shape and move untrusted hooks into subprocesses.
