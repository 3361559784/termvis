# 实现矩阵

本矩阵用于跟踪 `deep-research-report.md`、`deep-research-report-2.md` 与 `deep-research-report-3.md` 的要求在当前仓库中的落地状态。

| 要求 | 当前落地 | 代码/文档 |
|---|---|---|
| 零侵入 CLI 包装 | 已实现，优先 `node-pty`，无依赖时 pipe fallback | `src/cli/run.js` |
| chafa 渲染后端 | 已实现系统二进制发现、参数生成、超时、文本回退 | `src/render/chafa-runner.js` |
| chafa 非回退安装 | 已安装 chafa 1.18.2 到项目内 `.termvis/chafa-1.18.2` 并在配置中固定路径 | `termvis.config.jsonc`、`docs/NON_FALLBACK_SETUP.md` |
| living terminal runtime | 已实现 strict 非回退生命层、左侧 ambient soul rail、右侧 host viewport、虚拟 VT viewport compositor、稳定 BPM pulse、状态机、PTY 观察、terminal title pulse、JSONL trace | `src/cli/life.js`、`src/life`、`docs/LIVING_TERMINAL_ARCHITECTURE.md` |
| report-3 低噪视觉排版 | 已实现无卡片边框的常驻左侧 rail、细左侧生命线、右侧分隔线、标题/头像/状态/回复/底部元信息分层、底部状态固定、英文按词换行、CJK/emoji 按 cell width 对齐 | `src/life/tui.js`、`test/unit/life.test.js` |
| 宿主 CLI 防遮挡 | 已实现 host 输出先进 `HostViewport` 虚拟屏幕，再 diff 到右侧；支持 alt-screen、RIS/DECSET、CSI 光标、清屏/清行、scroll region、插入/删除行列、长行换行、CJK/emoji 宽字符和 SGR；不会让宿主 stdout 触发物理终端滚动覆盖左侧 rail | `src/life/viewport.js`、`src/life/tui.js`、`test/unit/life.test.js` |
| LLM 生成数字灵魂 | 已实现 visual-only soul state、persona、自定义 mood/presence/reply/BPM、LLM narration event、`.termvis/soul-events` 本地事件流；宿主输出只推导 mood，不增加 LLM 事件计数 | `src/life/soul.js`、`src/life/runtime.js`、`src/mcp/server.js`、`docs/DIGITAL_SOUL_EVENTS.md` |
| 生命感 persona CLI | 已实现 avatar 符号化、状态帧、宿主命令包装 | `src/cli/persona.js`、`src/persona/persona-shell.js`、`docs/PERSONA_CLI.md` |
| 能力探测 | 已实现 TTY、尺寸、色深、pixel protocol、Unicode level | `src/core/capabilities.js` |
| 多级回退链 | 已实现显式 fallback chain | `src/core/fallback.js` |
| line-grid 布局 | 已实现 card、stack、split row/column | `src/core/layout.js` |
| CJK/emoji 宽度 | 已实现 ANSI/OSC/DCS 清理、grapheme、CJK、emoji、组合字符处理 | `src/core/width.js` |
| 主题与低动效 | 已实现 `moon-white-flow` 默认主题、`neon-vein`/`dawn-glass` token、truecolor/256/NO_COLOR 三级颜色降级、WCAG 4.5:1 对比度测试、`accessibility.reduceMotion`、`life.maxFps`、left rail 布局约束配置 | `src/core/theme.js`、`src/core/config.js`、`src/core/schema.js`、`termvis.config.jsonc`、`test/unit/theme.test.js` |
| reader/plain 模式 | 已实现 `termvis life --reader` / `--screen-reader` / `--plain` 线性 alt-text 模式；不绘制动画 rail，不依赖 chafa/color/TTY 作为视觉前置，宿主输出仍可运行并输出状态镜像 | `src/cli/life.js`、`src/life/runtime.js`、`src/life/soul.js`、`test/unit/life.test.js` |
| JSONC 配置 | 已实现向上查找、注释剥离、默认合并、校验 | `src/core/config.js` |
| JSON Schema | 已实现 `termvis schema` | `src/core/schema.js` |
| 内部聚合 | 已实现 `TermvisEngine` | `src/application/termvis-engine.js` |
| 外部低耦合 | 已实现 CLI/MCP/sidecar/adapters 调用聚合层 | `src/cli`、`src/mcp`、`src/sidecar`、`src/adapters` |
| JSON-RPC sidecar | 已实现 newline framing、渲染方法和 soul 控制面：`soul.init`、`soul.getState`、`soul.renderTick`、`soul.setTheme`、`soul.consent` | `src/protocol/json-rpc.js`、`src/sidecar/server.js` |
| MCP server | 已实现 initialize、tools/list、tools/call、stdio 保活，并新增 `termvis_life_frame` 与 `termvis_soul_event` | `src/mcp/server.js` |
| Codex adapter | 已实现 config snippet | `src/adapters/codex.js` |
| Claude Code adapter | 已实现 plugin 文件生成 | `src/adapters/claude-code.js` |
| GitHub Copilot CLI adapter | 已实现 `.mcp.json`、`.copilot/termvis-mcp-config.json` 与 wrapper 使用说明 | `src/adapters/copilot.js`、`.mcp.json`、`.copilot/termvis-mcp-config.json`、`docs/COPILOT_GEMINI_USAGE.md` |
| Gemini CLI adapter | 已实现 `.gemini/settings.json` 与 Gemini extension 文件 | `src/adapters/gemini.js`、`.gemini/settings.json`、`.gemini/extensions/termvis`、`docs/COPILOT_GEMINI_USAGE.md` |
| OpenCode adapter | 已实现 local MCP JSON snippet | `src/adapters/opencode.js` |
| 安全模型 | 已实现 exec allowlist、插件 trust gate、OSC 清理、文件 scope | `src/security/policy.js` |
| 插件 hooks | 已实现 trusted hooks、顺序执行、超时 | `src/plugins/plugin-manager.js` |
| 分层测试 | 已实现 19 个测试文件，覆盖核心、集成路径、life runtime、soul event、reader alt-text、persona、主题降级/对比度、Copilot/Gemini 工作区配置 | `test/unit`、`test/integration` |

## 未默认自动跑的环境测试

| 项目 | 原因 | 手动验证 |
|---|---|---|
| 真 UDS / Named Pipe 监听 | 当前沙箱禁止 listen | `node ./bin/termvis.js sidecar --socket ...` |
| 真 `node-pty` PTY 包装 | 需要交互式终端确认 | `node ./bin/termvis.js run -- bash` |
| 常驻 living TUI | 需要真实 TTY 才能验证左侧 rail 常驻与虚拟 host viewport 防遮挡 | `node ./bin/termvis.js life --title "Always-On Soul" -- bash -lc "printf '\\033[2J\\033[1;1Hhi\\n'; sleep 1; printf '\\033[3;4HThinking\\n'"` |
| LLM soul event 动态旁白 | 需要一个正在运行的真实 TTY `termvis life` 会话 | `node --input-type=module -e 'import { appendSoulEvent } from "./src/life/soul.js"; await appendSoulEvent({ event: { mood: "curious shimmer", presence: "near the prompt", reply: "manual recovery line", source: "manual-llm" } });'` |
| 真 chafa 图像输出 | 需要真实 TTY/颜色能力 | `node ./bin/termvis.js render test/fixtures/termvis-sample.svg --alt "termvis sample"` |
| Kitty/iTerm/Sixel 像素协议 | 需要真实终端 | 在对应终端中运行 render 命令 |
| Gemini 模型会话 | 需要真实 API key/auth | `export GEMINI_API_KEY=... && gemini mcp list` |

## 验收命令

```bash
npm run check
node ./bin/termvis.js doctor --json
node ./bin/termvis.js layout-demo
node ./bin/termvis.js life --title "Digital Soul" --message "awake"
node ./bin/termvis.js life --reader --title "Digital Soul" --message "awake"
node ./bin/termvis.js persona --title "Cute CLI" --message "ready"
node ./bin/termvis.js schema --compact
node ./bin/termvis.js adapter list
node ./bin/termvis.js adapter all
node ./bin/termvis.js adapter copilot --json
node ./bin/termvis.js adapter gemini --json
node --input-type=module -e 'import { appendSoulEvent } from "./src/life/soul.js"; await appendSoulEvent({ sessionId: "matrix-test", event: { mood: "curious shimmer", presence: "near the prompt", reply: "matrix test", source: "manual-llm" } });'
copilot mcp list --json --additional-mcp-config @.copilot/termvis-mcp-config.json
gemini mcp list
env -u NO_COLOR TERM=xterm-256color COLORTERM=truecolor node ./bin/termvis.js doctor --strict
```
