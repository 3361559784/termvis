# Verification Log

This file records the non-smoke checks for the current `termvis` implementation.

## Runtime

```bash
npm run check
```

Result: 19 test files passed. Coverage includes MCP initialize, ping, `tools/list`, newline-delimited JSON clients, Content-Length clients, ambient left soul rail layout, footer pinning, word-aware reply wrapping, reader alt-text and host stdout passthrough, virtual host viewport composition, alt-screen protection, long-line wrap/scroll, CJK/emoji alignment, truecolor/256/NO_COLOR theme degradation, WCAG contrast checks, free-form LLM mood/presence/reply events, sidecar soul control-plane methods, adapter output, schema validation, and integration CLI commands.

```bash
node ./bin/termvis.js doctor --json
```

Result: config valid, project chafa available at `.termvis/chafa-1.18.2/bin/chafa`, `node-pty` available. In this non-TTY command runner `nonFallbackReady` is false only because stdout is not a TTY and `TERM=dumb`.

## Living TUI

SOTA rail PTY command:

```bash
env -u NO_COLOR TERM=xterm-256color COLORTERM=truecolor \
  node ./bin/termvis.js life \
  --title "SOTA Rail Check" \
  --soul-name "Termvis Soul" \
  --soul-reply "I stay quiet beside the host stream." \
  --avatar-width 14 \
  --avatar-height 4 \
  --no-trace \
  -- node -e "console.log('right viewport line'); console.log('中文🙂 aligned'); setTimeout(()=>{}, 250);"
```

Result: left rail rendered as a slim ambient rail, not a heavy card. Host output began in the right viewport column; CJK/emoji output stayed aligned; the reply wrapped by words instead of splitting `beside`.

Longer live PTY command:

```bash
env -u NO_COLOR TERM=xterm-256color COLORTERM=truecolor \
  node ./bin/termvis.js life \
  --title "Live Soul Probe" \
  --soul-name "Termvis Soul" \
  --soul-reply "I stay in the left rail." \
  --avatar-width 20 \
  --avatar-height 6 \
  --no-trace \
  -- node -e "console.log('thinking in right viewport'); setTimeout(() => { console.log('completed successfully'); }, 8000);"
```

Result: left soul rail stayed visible for the full session; host output began at the right viewport column; a live event changed the rail to `mood curious shimmer`, `presence near the prompt`, `73 bpm`, footer `1 llm`, and the generated reply text.

Reader/plain command:

```bash
node ./bin/termvis.js life --reader --title "Reader Soul" --message "awake"
```

Result: emitted one linear alt-text sentence with soul name, host state, mood, presence, heartbeat BPM, and reply; it did not render animation or chafa art.

Reader/plain host passthrough command:

```bash
node ./bin/termvis.js life --reader --title "Reader Host" -- printf hi
```

Result: host stdout printed `hi`; `termvis` emitted linear `[termvis]` state mirrors to stderr.

ANSI viewport torture command:

```bash
env -u NO_COLOR TERM=xterm-256color COLORTERM=truecolor \
  node ./bin/termvis.js life \
  --title "Viewport Torture" \
  --avatar-width 18 \
  --avatar-height 6 \
  --no-trace \
  -- node -e "process.stdout.write('\x1b[?1049h\x1b[2J\x1b[1;1HALT hello'); process.stdout.write('\x1b[3;4H中文🙂wide'); process.stdout.write('\x1b[5;1H' + 'x'.repeat(120)); setTimeout(()=>{ process.stdout.write('\r\nfinal line after wrap\x1b[?1049l'); }, 300); setTimeout(()=>{}, 500);"
```

Result: alt-screen, clear-screen, cursor addressing, CJK/emoji, and a 120-column long line were parsed into the right viewport. The host paint began at the right viewport column and did not overwrite or physically scroll the left soul rail.

LLM-style soul event used during the PTY check:

```bash
node --input-type=module -e "import { appendSoulEvent } from './src/life/soul.js'; await appendSoulEvent({ event: { mood: 'curious shimmer', presence: 'near the prompt', reply: 'I am alive beside the right viewport.', heartBpm: 73, source: 'manual-llm' } });"
```

## MCP

Protocol checks:

```bash
printf 'Content-Length: 58\r\n\r\n{"jsonrpc":"2.0","id":1,"method":"initialize","params":{}}' \
  | /usr/bin/node ./bin/termvis.js mcp
```

Result: returned a valid MCP `initialize` response with `serverInfo.name = termvis`.

Gemini 0.40.0 uses newline-delimited JSON for stdio MCP; `termvis mcp` now supports both newline JSON and `Content-Length` framing.

## Host CLI Status

```bash
codex --version
copilot --version
gemini --version
claude --version
opencode --version
```

Verified versions:

```text
codex-cli 0.125.0
GitHub Copilot CLI 1.0.38
gemini 0.40.0
Claude Code 2.1.123
opencode 1.14.30
```

## Host Wrapper Rendering

The living wrapper was run against each installed AI CLI version command:

```bash
env -u NO_COLOR TERM=xterm-256color COLORTERM=truecolor node ./bin/termvis.js life --no-trace -- codex --version
env -u NO_COLOR TERM=xterm-256color COLORTERM=truecolor node ./bin/termvis.js life --no-trace -- gemini --version
env -u NO_COLOR TERM=xterm-256color COLORTERM=truecolor node ./bin/termvis.js life --no-trace -- copilot --version
env -u NO_COLOR TERM=xterm-256color COLORTERM=truecolor node ./bin/termvis.js life --no-trace -- claude --version
env -u NO_COLOR TERM=xterm-256color COLORTERM=truecolor node ./bin/termvis.js life --no-trace -- opencode --version
```

Result: all five commands rendered inside the right viewport with the soul rail visible. Observed versions were Codex `0.125.0`, Gemini `0.40.0`, GitHub Copilot CLI `1.0.38`, Claude Code `2.1.123`, and OpenCode `1.14.30`.

## Host MCP Status

```bash
codex mcp list
```

Result: `termvis` is registered globally and enabled.

```bash
copilot mcp list --json
```

Result: workspace `termvis` server is visible with all five tools.

```bash
gemini mcp list --debug
```

Result: `termvis ... Connected`.

```bash
claude mcp list
```

Result: `termvis ... Connected`.

```bash
opencode mcp list
```

Result: `termvis connected`.

## Auth Notes

MCP connection checks do not require model API credentials. Actual model sessions still require each host's own authentication:

- Gemini API mode needs `GEMINI_API_KEY`.
- Claude Code needs Claude/Anthropic authentication.
- OpenCode needs provider credentials through `opencode auth login` or environment variables.
- Copilot CLI needs GitHub/Copilot authentication.
