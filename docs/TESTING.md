# Testing

The suite is intentionally dependency-light and runs with `node --test`.

## Commands

```bash
npm test
npm run test:unit
npm run test:integration
npm run check
```

## Unit Coverage

- `capabilities.test.js`: TTY dimensions, color depth, NO_COLOR, pixel protocol
- `fallback.test.js`: fallback mode selection and chafa argument mapping
- `width.test.js`: CSI/OSC/DCS/ESC stripping, CJK, emoji, combining marks, wrapping, truncation
- `layout.test.js`: card and split layout width stability
- `config.test.js`: JSONC parsing, recursive merge, upward config discovery
- `security.test.js`: exec, plugin, file, network, and OSC sanitization policy
- `json-rpc.test.js`: dispatch, errors, newline framing
- `plugin-manager.test.js`: hook ordering, trust gate, timeout behavior
- `mcp.test.js`: initialize, tools/list, card/life/soul tool calls, visual-only soul event append, and stdio server initialize response
- `engine.test.js`: `TermvisEngine` aggregate flow, plugin hook ordering, sanitization
- `schema.test.js`: JSON Schema contract for `termvis.config.jsonc`
- `adapters.test.js`: host registry, alias normalization, adapter artifact rendering
- `copilot-gemini-config.test.js`: workspace MCP files for Copilot CLI and Gemini CLI
- `theme.test.js`: default living theme, truecolor/256/NO_COLOR degradation, and contrast threshold checks
- `life.test.js`: living terminal state inference, BPM pulse/event separation, digest tracking, symbolic left-rail frame composition, fixed-size soul rail layout, Soul Says visibility, rail-only mouse wheel scrolling, word-aware reply wrapping, reader alt-text, virtual host viewport behavior, alt-screen protection, long-line scroll/wrap, CJK/emoji alignment, LLM custom mood/reply event polling primitives, and system-derived mood changes that do not increment LLM event counts
- `persona.test.js`: symbolic avatar frame composition and state normalization

## Integration Coverage

- `chafa-runner.test.js` creates a temporary executable named `chafa` and verifies that
  the runner finds it through `PATH`, selects the expected render mode, and passes the
  expected CLI arguments.
- `cli.test.js` executes the CLI entry in-process and validates `doctor --json` plus
  adapter output, schema output, and adapter registry listing.
- `sidecar.test.js` validates the sidecar JSON-RPC method stack through newline framing and the soul control-plane methods with alt-text.

## Environment-Dependent Tests

Actual UDS, Named Pipe, TCP listen, and real terminal pixel protocol tests depend on
permissions outside this sandbox. The implementation supports those paths through
`startSidecarServer()`, but the default suite avoids binding sockets so it remains
stable in restricted CI and local agent sandboxes.

For a full machine-level check, run:

```bash
node ./bin/termvis.js doctor
node ./bin/termvis.js sidecar --socket /tmp/termvis-manual.sock
```

For the always-on living TUI path, run in a real terminal:

```bash
env -u NO_COLOR TERM=xterm-256color COLORTERM=truecolor \
  node ./bin/termvis.js life --title "Always-On Soul" -- bash -lc \
  "printf '\033[2J\033[1;1Hhost clears screen\n'; sleep 1; printf '\033[3;4HThinking\n'; sleep 1; printf 'running test\ncompleted successfully\n'"
```

Expected result: the left soul rail remains visible during the sleeps and host output, while
the host content is parsed into the virtual right viewport. Clear-screen, cursor movement,
long lines, and width-sensitive text must not overwrite or scroll the rail.

To validate visual-only soul narration while that TUI is running, send an event from
another shell:

```bash
node --input-type=module -e 'import { appendSoulEvent } from "./src/life/soul.js"; await appendSoulEvent({ event: { mood: "curious shimmer", presence: "near the prompt", reply: "I will keep the terminal steady while the stream settles.", source: "manual-llm" } });'
```

Expected result: the rail reply/mood changes, the host CLI does not receive the text,
and the displayed BPM remains a stable mood BPM rather than a rapidly increasing counter.

For reader/plain mode:

```bash
node ./bin/termvis.js life --reader --title "Reader Soul" --message "awake"
```

Expected result: a single linear `[termvis]`-style status in command mode, or a plain
alt-text sentence in static mode. No chafa art, no animation, and no color-dependent state.

Then send a newline-framed JSON-RPC request from another shell:

```bash
printf '{"jsonrpc":"2.0","id":1,"method":"ping"}\n' | nc -U /tmp/termvis-manual.sock
```
