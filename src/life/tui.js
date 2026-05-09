import { createTermvisEngine } from "../application/termvis-engine.js";
import { colorize, resolveTheme, bold, dim, italic, underline, style, gradientText, progressBar, sparkline, sectionHeader, SOUL_PALETTE } from "../core/theme.js";
import { cellWidth, padCells, stripAnsi, truncateCells, wrapCells } from "../core/width.js";
import { DEFAULT_LIFE_AVATAR_PATH } from "./frame.js";
import { getLifePulse, getLifeStateInfo, createLifeSnapshot } from "./state.js";
import { diagnoseAvatarRenderer } from "../render/avatar-diagnostics.js";
import {
  createMoodFrame,
  createSoulState,
  getExpression,
  getSoulPulse,
  SOUL_PHASES,
  soulMoodToDisplayString
} from "./soul.js";
import { getAnimeArt, chooseEmotionFromMood, chooseSizeForTerminal } from "./anime-art.js";
import { createHostViewport, renderHostViewportOnce } from "./viewport.js";

const ALT_SCREEN_PATTERN = /\u001b\[\?(?:1049|1047|1048)[hl]/g;
const CURSOR_VISIBILITY_PATTERN = /\u001b\[\?25[hl]/g;
const ESC = "\u001b";
const INPUT_PRIVATE_MODES = new Set(["1", "1000", "1002", "1003", "1004", "1005", "1006", "1015", "2004"]);
const TUI_UNSTABLE_SYMBOLS = new Set(["braille", "sextant", "quad"]);
const TUI_DEFAULT_SYMBOLS = "block+border+space";

const AMBIENT_BREATH_MS = Object.freeze({ quiet: 4800, normal: 3800, active: 2800 });
const RAIL_TEXT = Object.freeze({
  en: {
    mood: "mood",
    moodSection: "Mood",
    pulse: "pulse",
    pulseSection: "Pulse",
    presence: "presence",
    presenceSection: "Presence",
    face: "face",
    voice: "voice",
    soul: "soul",
    aura: "aura",
    motion: "motion",
    signal: "signal",
    source: "src",
    bound: "bound",
    heart: "heart",
    state: "state",
    breath: "breath",
    stress: "stress",
    recovery: "recov",
    risk: "risk",
    uncertainty: "unc",
    progress: "prog",
    hrv: "HRV",
    sympathetic: "symp",
    parasympathetic: "para",
    proximity: "prox",
    agency: "agency",
    bpm: "bpm",
    linesTotal: "lines total",
    gaze: "gaze",
    attention: "att",
    visualShell: "visual shell",
    soulVoiceLive: "soul voice live",
    soulVoiceReady: "soul voice ready",
    soulSays: "Soul Says",
    soulSilent: "soul"
  },
  zh: {
    mood: "情绪",
    moodSection: "情绪",
    pulse: "脉搏",
    pulseSection: "脉搏",
    presence: "存在",
    presenceSection: "存在感",
    face: "表情",
    voice: "话语",
    soul: "灵魂",
    aura: "气息",
    motion: "动态",
    signal: "信号",
    source: "来源",
    bound: "边界",
    heart: "心跳",
    state: "状态",
    breath: "呼吸",
    stress: "压力",
    recovery: "恢复",
    risk: "风险",
    uncertainty: "不确定",
    progress: "进度",
    hrv: "心率变异",
    sympathetic: "交感",
    parasympathetic: "副交感",
    proximity: "距离",
    agency: "主动性",
    bpm: "次/分",
    linesTotal: "行",
    gaze: "视线",
    attention: "注意",
    visualShell: "可视外壳",
    soulVoiceLive: "灵魂话语在线",
    soulVoiceReady: "灵魂话语待机",
    soulSays: "灵魂说",
    soulSilent: "灵魂"
  },
  ja: {
    mood: "気分",
    moodSection: "気分",
    pulse: "脈拍",
    pulseSection: "脈拍",
    presence: "存在感",
    presenceSection: "存在感",
    face: "表情",
    voice: "声",
    soul: "ソウル",
    aura: "気配",
    motion: "動き",
    signal: "信号",
    source: "出所",
    bound: "境界",
    heart: "心拍",
    state: "状態",
    breath: "呼吸",
    stress: "負荷",
    recovery: "回復",
    risk: "リスク",
    uncertainty: "不確実",
    progress: "進捗",
    hrv: "HRV",
    sympathetic: "交感",
    parasympathetic: "副交感",
    proximity: "距離",
    agency: "能動性",
    bpm: "bpm",
    linesTotal: "行",
    gaze: "視線",
    attention: "注意",
    visualShell: "視覚シェル",
    soulVoiceLive: "ソウル発話中",
    soulVoiceReady: "ソウル待機中",
    soulSays: "ソウルの声",
    soulSilent: "ソウル"
  }
});

const TERM_TEXT = Object.freeze({
  zh: {
    calm: "平静",
    quiet: "安静",
    resting: "休息",
    sleepy: "困倦",
    observant: "观察",
    present: "在场",
    soft: "柔和",
    reserved: "克制",
    focused: "专注",
    attentive: "留意",
    absorbed: "沉浸",
    analytical: "分析",
    organized: "有序",
    determined: "坚定",
    curious: "好奇",
    exploratory: "探索",
    reflective: "回望",
    guarded: "警觉",
    cautious: "谨慎",
    vigilant: "戒备",
    concerned: "担忧",
    alarmed: "警报",
    delighted: "明亮",
    warm: "温暖",
    relieved: "松弛",
    satisfied: "满足",
    proud: "确认",
    celebratory: "庆祝",
    hopeful: "期待",
    confident: "笃定",
    supportive: "支撑",
    tired: "疲惫",
    weary: "倦怠",
    strained: "绷紧",
    frustrated: "受阻",
    blocked: "阻塞",
    recovering: "恢复",
    apologetic: "歉意",
    humbled: "收束",
    orchestrating: "编排",
    ambient: "环绕",
    foreground: "前景",
    dormant: "休眠",
    active: "活跃",
    engaged: "投入",
    reflective: "反思",
    peripheral: "旁观",
    guardian: "守护",
    celebrating: "庆祝",
    focus: "聚焦",
    observe: "观察",
    listen: "聆听",
    remember: "记忆",
    repair: "修复",
    wait: "等待",
    investigate: "调查",
    verify: "验证",
    approach: "接近",
    guard: "守护",
    ask: "询问",
    celebrate: "庆祝",
    open: "开放",
    user: "用户",
    host_output: "主界面输出",
    tool: "工具",
    memory: "记忆",
    plan: "计划",
    none: "无",
    system: "系统",
    boot: "启动",
    fatigue: "疲劳",
    terminal: "终端",
    steady: "稳定",
    surge: "涌动",
    quickening: "加速",
    skip: "跳拍",
    flutter: "轻颤",
    holding: "屏住",
    settling: "沉降",
    exhale: "呼出",
    silent: "安静",
    primed: "预备",
    composing: "生成",
    speaking: "发话",
    cooling: "冷却",
    listening: "聆听",
    soft_face: "柔和",
    blink_face: "眨眼",
    thinking_face: "思考",
    speaking_face: "发话",
    bright_face: "明亮",
    focused_face: "专注",
    curious_face: "好奇",
    guarded_face: "警觉",
    tired_face: "疲惫",
    sleepy_face: "困倦"
  },
  ja: {
    calm: "穏やか",
    quiet: "静か",
    resting: "休息",
    sleepy: "眠い",
    observant: "観察",
    present: "在席",
    soft: "柔らか",
    reserved: "控えめ",
    focused: "集中",
    attentive: "注視",
    absorbed: "没入",
    analytical: "分析",
    organized: "整理",
    determined: "決意",
    curious: "好奇心",
    exploratory: "探索",
    reflective: "内省",
    guarded: "警戒",
    cautious: "慎重",
    vigilant: "監視",
    concerned: "懸念",
    alarmed: "警報",
    delighted: "明るい",
    warm: "温かい",
    relieved: "安堵",
    satisfied: "満足",
    proud: "確信",
    celebratory: "祝福",
    hopeful: "期待",
    confident: "自信",
    supportive: "支え",
    tired: "疲れ",
    weary: "倦怠",
    strained: "緊張",
    frustrated: "停滞",
    blocked: "阻害",
    recovering: "回復",
    apologetic: "謝意",
    humbled: "収束",
    orchestrating: "編成",
    ambient: "周辺",
    foreground: "前面",
    dormant: "休眠",
    active: "活動",
    engaged: "没入",
    reflective: "内省",
    peripheral: "周辺",
    guardian: "保護",
    celebrating: "祝福",
    focus: "集中",
    observe: "観察",
    listen: "傾聴",
    remember: "記憶",
    repair: "修復",
    wait: "待機",
    investigate: "調査",
    verify: "検証",
    approach: "接近",
    guard: "保護",
    ask: "質問",
    celebrate: "祝福",
    open: "開放",
    user: "ユーザー",
    host_output: "ホスト出力",
    tool: "ツール",
    memory: "記憶",
    plan: "計画",
    none: "なし",
    system: "システム",
    boot: "起動",
    fatigue: "疲労",
    terminal: "端末",
    steady: "安定",
    surge: "高まり",
    quickening: "加速",
    skip: "欠拍",
    flutter: "震え",
    holding: "保持",
    settling: "沈静",
    exhale: "吐息",
    silent: "静寂",
    primed: "待機",
    composing: "生成",
    speaking: "発話",
    cooling: "冷却",
    listening: "傾聴",
    soft_face: "柔らか",
    blink_face: "瞬き",
    thinking_face: "思考",
    speaking_face: "発話",
    bright_face: "明るい",
    focused_face: "集中",
    curious_face: "好奇",
    guarded_face: "警戒",
    tired_face: "疲れ",
    sleepy_face: "眠い"
  }
});

function normalizeLanguage(value) {
  const lang = String(value || "").toLowerCase();
  if (lang.startsWith("zh") || lang === "cn") return "zh";
  if (lang.startsWith("ja") || lang === "jp") return "ja";
  return "en";
}

function railText(language, key) {
  const lang = normalizeLanguage(language);
  return RAIL_TEXT[lang]?.[key] || RAIL_TEXT.en[key] || key;
}

function localizeTerm(language, value) {
  const text = String(value ?? "").trim();
  if (!text) return "";
  const lang = normalizeLanguage(language);
  if (lang === "en") return text;
  const key = text.toLowerCase().replace(/\s+/g, "_");
  const withNumber = text.match(/^([a-z_ -]+)\s+([0-9]+%.*)$/iu);
  if (withNumber) {
    const prefix = withNumber[1].trim().toLowerCase().replace(/\s+/g, "_");
    const localized = TERM_TEXT[lang]?.[prefix];
    if (localized) return `${localized} ${withNumber[2]}`;
  }
  return TERM_TEXT[lang]?.[key] || text;
}

function localizedTerms(language, values = []) {
  return (Array.isArray(values) ? values : []).map((value) => localizeTerm(language, value)).filter(Boolean);
}

export function inferAmbientMode(snapshot = {}) {
  const e = snapshot.ambientMode;
  if (e === "quiet" || e === "normal" || e === "active") return e;
  const st = snapshot.state;
  if (st === "reasoning" || st === "acting" || st === "waiting") return "active";
  if (st === "observing" || st === "listening" || st === "awakening") return "quiet";
  return "normal";
}

function inferBreathCadence(snapshot = {}) {
  const mode = inferAmbientMode(snapshot);
  return AMBIENT_BREATH_MS[mode] ?? AMBIENT_BREATH_MS.normal;
}

function layoutTier(terminalCols) {
  if (terminalCols < 80) return "narrow";
  if (terminalCols < 120) return "medium";
  return "wide";
}

function pulseWithBreath(soulPulseOrPulseObj, breathMs, now = new Date(), language = "en") {
  const pulse = soulPulseOrPulseObj;
  const wave = animateWave(pulse.wave || "▁▂▃▄▅▄▃▂", now, pulse.bpm || 64);
  const heart = heartbeatIcon(pulse.bpm || 64, now);
  const breath = Number(breathMs || pulse.breathMs || 4200);
  const breathPhase = Math.floor((Number(now instanceof Date ? now.getTime() : now) || Date.now()) / Math.max(300, breath / 4)) % 4;
  const breathGlyph = ["○", "◔", "◕", "●"][breathPhase];
  return `${heart} ${pulse.bpm} ${railText(language, "bpm")}  ${wave} ${breathGlyph}`;
}

function soulExpressionAscii(soul, now = new Date()) {
  void now;
  if (soul.soulPhase === SOUL_PHASES.speaking) return getExpression("speaking");
  const hint = soul.renderHints?.expression;
  if (hint && hint !== "idle") return getExpression(hint);
  return getExpression(soul.mood);
}

function chooseAnimeEmotion(soul, defaultHint = "idle") {
  const hint = soul?.renderHints?.expression;
  if (hint === "blink") return "blink";
  if (hint === "speak" || hint === "speaking") return "speaking";
  if (hint === "think" || hint === "thinking") return "thinking";
  if (hint === "warn" || hint === "guarded") return "guarded";
  if (hint === "smile" || hint === "warm" || hint === "delighted") return "delighted";
  if (hint === "curious" || hint === "scan") return "curious";
  if (hint === "focus" || hint === "focused") return "focused";
  if (hint === "sleepy") return "sleepy";
  if (hint === "tired" || hint === "dim") return "tired";
  if (hint === "sparkle") return "delighted";
  if (hint === "guard" || hint === "flinch") return "guarded";
  if (hint === "frown" || hint === "repair") return "tired";
  if (hint === "nod" || hint === "soft-smile" || hint === "warm-smile") return "delighted";
  if (hint === "far-look") return "idle";
  if (hint === "apologetic") return "idle";
  if (soul?.mood?.tags) return chooseEmotionFromMood(soul.mood);
  if (soul?.mood?.discrete) {
    const map = {
      calm: "idle", focused: "focused", curious: "curious",
      guarded: "guarded", delighted: "delighted", tired: "tired",
      sleepy: "sleepy", content: "delighted", attentive: "focused",
      absorbed: "focused", analytical: "thinking", cautious: "guarded",
      concerned: "tired", frustrated: "tired", relieved: "delighted",
      satisfied: "delighted", warm: "delighted", reflective: "idle",
      alarmed: "guarded", strained: "tired", organized: "focused",
      determined: "focused", vigilant: "guarded", recovering: "idle",
      observant: "idle", present: "idle", hopeful: "delighted"
    };
    return map[soul.mood.discrete] || defaultHint;
  }
  return defaultHint;
}

/**
 * @param {object} soul
 * @param {Date|number} now
 * @param {number} width   - panel inner width (content area)
 * @param {number} height  - panel inner height
 */
function renderAnimeArtBlock(soul, now, width, height) {
  const emotion = chooseAnimeEmotion(soul);
  void now;
  const blink = emotion === "blink";
  // Choose size based on both width and available height.
  // large (9 lines) needs enough vertical room after header (2) + gap (1) = 3 used.
  // So large only if height >= 22 and width >= 22.
  // medium (6 lines) if height >= 16 and width >= 16.
  const size =
    width >= 22 && height >= 22 ? "large" :
    width >= 16 && height >= 16 ? "medium" : "mini";
  return getAnimeArt({ emotion, size, blinkPhase: blink });
}

function vadBars(mood, width = 12) {
  const v = Number(mood?.valence ?? 0);
  const a = Number(mood?.arousal ?? 0);
  const d = Number(mood?.dominance ?? 0);
  const w = Math.max(6, Math.floor(width));
  const half = Math.floor(w / 2);
  const valBar = bipolarBar(v, w);
  const aroBar = unipolarBar(a, w);
  const domBar = unipolarBar(d, w);
  return { valBar, aroBar, domBar, half };
}

function bipolarBar(value, width) {
  const v = Math.max(-1, Math.min(1, Number(value) || 0));
  const cells = width;
  const half = Math.floor(cells / 2);
  let leftFill = 0;
  let rightFill = 0;
  if (v < 0) leftFill = Math.round(-v * half);
  else rightFill = Math.round(v * half);
  const left = " ".repeat(half - leftFill) + "▓".repeat(leftFill);
  const right = "▓".repeat(rightFill) + " ".repeat(half - rightFill);
  return `${left}│${right}`;
}

function unipolarBar(value, width) {
  const v = Math.max(0, Math.min(1, Number(value) || 0));
  const fill = Math.round(v * width);
  return "▓".repeat(fill) + "░".repeat(Math.max(0, width - fill));
}

/** Mood face emoji based on tags */
function moodFaceIcon(tags) {
  if (!Array.isArray(tags) || tags.length === 0) return "☁";
  const t = new Set(tags);
  if (t.has("alarmed") || t.has("tense")) return "⚡";
  if (t.has("guarded") || t.has("cautious") || t.has("vigilant")) return "⚡";
  if (t.has("delighted") || t.has("celebratory") || t.has("proud")) return "✿";
  if (t.has("content") || t.has("satisfied") || t.has("relieved")) return "✿";
  if (t.has("focused") || t.has("attentive") || t.has("absorbed")) return "◈";
  if (t.has("analytical") || t.has("organized") || t.has("determined")) return "◈";
  if (t.has("curious") || t.has("exploratory")) return "✦";
  if (t.has("warm") || t.has("appreciative") || t.has("supportive")) return "♡";
  if (t.has("sleepy") || t.has("resting") || t.has("drifting")) return "☾";
  if (t.has("tired") || t.has("weary") || t.has("strained")) return "☁";
  if (t.has("frustrated") || t.has("blocked") || t.has("overloaded")) return "☁";
  if (t.has("concerned") || t.has("disappointed")) return "☁";
  if (t.has("apologetic") || t.has("humbled") || t.has("contrite")) return "○";
  if (t.has("reflective") || t.has("nostalgic") || t.has("familiar")) return "◇";
  if (t.has("hopeful") || t.has("prepared")) return "★";
  if (t.has("confident") || t.has("orchestrating")) return "★";
  return "○";
}

function lifeHostExpression(snapshot, now = new Date()) {
  const discreteMap = {
    reasoning: "focused",
    waiting: "guarded",
    failed: "tired",
    acting: "curious",
    observing: "calm",
    awakening: "calm",
    listening: "calm"
  };
  const discrete = discreteMap[snapshot.state || "listening"] || "calm";
  void now;
  return getExpression(createMoodFrame({ discrete }));
}


function truncateMeta(value, maxCells) {
  const s = String(value || "").replace(/\s+/g, " ").trim();
  return truncateCells(s, Math.max(8, maxCells));
}

function soulRenderTime(snapshot = {}) {
  const raw = snapshot?.soul?.updatedAt || snapshot?.soul?.ts || snapshot?.startedAt || Date.now();
  const parsed = raw instanceof Date ? raw : new Date(raw);
  return Number.isFinite(parsed.getTime()) ? parsed : new Date(0);
}


export async function createLifeTui({
  io,
  engine,
  snapshot,
  avatar = DEFAULT_LIFE_AVATAR_PATH,
  symbolic = true,
  avatarWidth,
  avatarHeight,
  avatarFit,
  avatarAlign,
  avatarScale,
  width,
  minHostCols = 28,
  reduceMotion = false,
  minRailWidth,
  maxRailWidth
} = {}) {
  const runtime = engine || await createTermvisEngine({ cwd: io?.cwd, env: io?.env });
  const language = normalizeLanguage(runtime.config?.ui?.language || runtime.config?.language || "en");
  const cols = Math.max(60, Number(width || io?.stdout?.columns || 80));
  const rows = Math.max(14, Number(io?.stdout?.rows || 24));
  const sideWidth = chooseSideWidth(cols, avatarWidth, minHostCols, { minRailWidth, maxRailWidth });
  const hostLeft = sideWidth + 2;
  const hostCols = Math.max(1, cols - hostLeft + 1);
  const hostRows = rows;
  const visualWidth = Math.max(12, sideWidth);
  const visualHeight = chooseRenderedAvatarHeight(rows, sideWidth, avatarHeight);
  const caps = runtime.probeCapabilities({ stdout: io?.stdout, stdin: io?.stdin, env: io?.env });
  const theme = resolveTheme(runtime.config, caps);
  const avatarPayload = await renderTuiAvatar({
    runtime,
    io,
    snapshot,
    avatar,
    symbolic,
    caps,
    visualWidth,
    visualHeight,
    avatarFit,
    avatarAlign,
    avatarScale
  });

  const avatarDiagnostics = diagnoseAvatarRenderer({
    env: io?.env,
    config: runtime.config,
    cwd: io?.cwd,
    caps,
    symbolic
  });

  return new LifeTui({
    io,
    runtime,
    avatarPayload,
    avatarSource: avatar,
    avatarDiagnostics,
    symbolic,
    avatarFit,
    avatarAlign,
    avatarScale,
    requestedAvatarWidth: avatarWidth,
    requestedAvatarHeight: avatarHeight,
    cols,
    rows,
    sideWidth,
    hostLeft,
    hostCols,
    hostRows,
    avatarWidth: visualWidth,
    avatarHeight: visualHeight,
    hostViewport: createHostViewport({ cols: hostCols, rows: hostRows }),
    reduceMotion,
    caps,
    theme,
    language,
    minHostCols,
    minRailWidth,
    maxRailWidth
  });
}

async function renderTuiAvatar({
  runtime,
  io,
  snapshot,
  avatar,
  symbolic,
  caps,
  visualWidth,
  visualHeight,
  avatarFit,
  avatarAlign,
  avatarScale
} = {}) {
  const result = await runtime.renderBlock({
    source: { type: "file", path: snapshot?.avatar || avatar },
    alt: `${snapshot?.title || "termvis life"} avatar`,
    config: {
      ...runtime.config,
      render: {
        ...(runtime.config?.render || {}),
        symbols: selectTuiAvatarSymbols(runtime.config, caps, runtime.env)
      }
    },
    caps: {
      ...caps,
      pixelProtocol: symbolic ? "none" : caps.pixelProtocol,
      cols: visualWidth,
      rows: visualHeight
    },
    strict: false,
    image: {
      fit: avatarFit,
      align: avatarAlign,
      scale: avatarScale
    }
  }, io);
  return result.payload;
}

export function selectTuiAvatarSymbols(config = {}, caps = {}, env = process.env) {
  const forced = String(env?.TERMVIS_LIFE_AVATAR_SYMBOLS || "").trim().toLowerCase();
  if (forced === "ascii") return "ascii";
  if (forced === "safe") return TUI_DEFAULT_SYMBOLS;
  if (shouldForceAsciiAvatarSymbols(caps)) return "ascii";
  const raw = String(config?.render?.symbols || "").trim();
  if (!raw) return TUI_DEFAULT_SYMBOLS;
  if (raw.toLowerCase() === "ascii") return "ascii";
  const filtered = [];
  const seen = new Set();
  for (const part of raw.split("+")) {
    const token = String(part || "").trim().toLowerCase();
    if (!token || seen.has(token)) continue;
    seen.add(token);
    if (TUI_UNSTABLE_SYMBOLS.has(token)) continue;
    filtered.push(token);
  }
  if (filtered.length === 0) return TUI_DEFAULT_SYMBOLS;
  if (!filtered.includes("space")) filtered.push("space");
  if (!filtered.includes("block")) filtered.unshift("block");
  return filtered.join("+");
}

function shouldForceAsciiAvatarSymbols(caps = {}) {
  const termProgram = String(caps?.termProgram || "").toLowerCase();
  const term = String(caps?.term || "").toLowerCase();
  return /jetbrains|jediterm|vscode/u.test(termProgram) || /\bvscode\b/u.test(term);
}

export class LifeTui {
  constructor({
    io,
    runtime,
    avatarPayload,
    avatarSource,
    avatarDiagnostics,
    symbolic = true,
    avatarFit,
    avatarAlign,
    avatarScale,
    requestedAvatarWidth,
    requestedAvatarHeight,
    cols,
    rows,
    sideWidth,
    hostLeft,
    hostCols,
    hostRows,
    avatarWidth,
    avatarHeight,
    hostViewport,
    reduceMotion = false,
    caps = {},
    theme,
    language = "en",
    minHostCols = 28,
    minRailWidth,
    maxRailWidth
  }) {
    this.io = io;
    this.runtime = runtime;
    this.avatarPayload = avatarPayload || "";
    this.avatarSource = avatarSource;
    this.avatarDiagnostics = avatarDiagnostics;
    this.symbolic = Boolean(symbolic);
    this.avatarFit = avatarFit;
    this.avatarAlign = avatarAlign;
    this.avatarScale = avatarScale;
    this.requestedAvatarWidth = requestedAvatarWidth;
    this.requestedAvatarHeight = requestedAvatarHeight;
    this.cols = cols;
    this.rows = rows;
    this.sideWidth = sideWidth;
    this.hostLeft = hostLeft;
    this.hostCols = hostCols;
    this.hostRows = hostRows;
    this.avatarWidth = avatarWidth;
    this.avatarHeight = avatarHeight;
    this.hostViewport = hostViewport || createHostViewport({ cols: hostCols, rows: hostRows });
    this.reduceMotion = Boolean(reduceMotion);
    this.caps = caps;
    this.theme = theme;
    this.language = normalizeLanguage(language);
    this.minHostCols = minHostCols;
    this.minRailWidth = minRailWidth;
    this.maxRailWidth = maxRailWidth;
    this.snapshot = null;
    this._lastPanel = null;
    this._usingAltScreen = false;
    this._active = false;
    this.railScrollOffset = 0;
    this._animationTimer = null;
    this.hostInputModes = new Set();
  }

  start(snapshot) {
    this.snapshot = snapshot;
    this.hostViewport.clear();
    this.railScrollOffset = 0;
    this._lastPanel = null;
    this._usingAltScreen = true;
    this._active = true;
    this.write(`${enterAlternateScreen()}${hideCursor()}${terminalMouseEnableSequence()}${clearScreen()}${resetScrollRegion()}`);
    this.write(clearHostViewport({ hostLeft: this.hostLeft, hostRows: this.hostRows, terminalCols: this.cols }));
    this.write(this.hostViewport.render({ hostLeft: this.hostLeft, force: true }));
    this.render(snapshot);
    this.moveToHost();
    this.startAnimation();
  }

  update(snapshot) {
    if (!this._active) return;
    this.snapshot = snapshot;
    this.render(snapshot);
    this.moveToHost();
  }

  writeHost(chunk) {
    if (!this._active) return;
    updateHostInputModes(String(chunk || ""), this.hostInputModes);
    const passthrough = extractTerminalModePassthrough(chunk);
    if (passthrough) this.write(passthrough);
    this.hostViewport.write(chunk);
    this.write(this.hostViewport.render({ hostLeft: this.hostLeft }));
  }

  stop(snapshot) {
    this.snapshot = snapshot || this.snapshot;
    this._active = false;
    this.stopAnimation();
    this.hostInputModes.clear();
    this._usingAltScreen = false;
    this.write(`${terminalModeResetSequence()}${cursorTo(this.rows, 1)}\n`);
  }

  startAnimation() {
    this.stopAnimation();
    if (this.reduceMotion) return;
    this._animationTimer = setInterval(() => {
      if (!this._active) return;
      this.render(this.snapshot);
      this.moveToHost();
    }, 250);
    this._animationTimer.unref?.();
  }

  stopAnimation() {
    if (this._animationTimer) clearInterval(this._animationTimer);
    this._animationTimer = null;
  }

  moveToHost() {
    if (!this._active) return;
    this.write(`${resetScrollRegion()}${this.hostViewport.cursorSequence({ hostLeft: this.hostLeft })}`);
  }

  resize() {
    if (!this._active) return { cols: this.hostCols, rows: this.hostRows };
    const nextCols = Math.max(60, Number(this.io?.stdout?.columns || this.cols || 80));
    const nextRows = Math.max(14, Number(this.io?.stdout?.rows || this.rows || 24));
    if (nextCols === this.cols && nextRows === this.rows) {
      this.moveToHost();
      return { cols: this.hostCols, rows: this.hostRows };
    }
    this.cols = nextCols;
    this.rows = nextRows;
    this.sideWidth = chooseSideWidth(this.cols, this.requestedAvatarWidth, this.minHostCols, {
      minRailWidth: this.minRailWidth,
      maxRailWidth: this.maxRailWidth
    });
    const nextAvatarWidth = Math.max(12, this.sideWidth);
    const nextAvatarHeight = chooseRenderedAvatarHeight(this.rows, this.sideWidth, this.requestedAvatarHeight);
    const avatarChanged = nextAvatarWidth !== this.avatarWidth || nextAvatarHeight !== this.avatarHeight;
    this.avatarWidth = nextAvatarWidth;
    this.avatarHeight = nextAvatarHeight;
    this.hostLeft = this.sideWidth + 2;
    this.hostCols = Math.max(1, this.cols - this.hostLeft + 1);
    this.hostRows = this.rows;
    this.hostViewport.resize({ cols: this.hostCols, rows: this.hostRows });
    this._lastPanel = null;
    this.railScrollOffset = 0;
    this.write(`${clearScreen()}${clearHostViewport({ hostLeft: this.hostLeft, hostRows: this.hostRows, terminalCols: this.cols })}`);
    this.write(this.hostViewport.render({ hostLeft: this.hostLeft, force: true }));
    this.render(this.snapshot);
    this.moveToHost();
    if (avatarChanged) this.refreshAvatar().catch(() => {});
    return { cols: this.hostCols, rows: this.hostRows };
  }

  async refreshAvatar() {
    if (!this.runtime || !this._active) return;
    const payload = await renderTuiAvatar({
      runtime: this.runtime,
      io: this.io,
      snapshot: this.snapshot,
      avatar: this.avatarSource,
      symbolic: this.symbolic,
      caps: this.caps,
      visualWidth: this.avatarWidth,
      visualHeight: this.avatarHeight,
      avatarFit: this.avatarFit,
      avatarAlign: this.avatarAlign,
      avatarScale: this.avatarScale
    });
    if (!this._active) return;
    if (payload === this.avatarPayload) return;
    this.avatarPayload = payload;
    this._lastPanel = null;
    this.render(this.snapshot);
    this.moveToHost();
  }

  async configureAvatar({
    avatar,
    avatarFit,
    avatarAlign,
    avatarScale,
    avatarWidth,
    avatarHeight
  } = {}) {
    if (!this._active) return;
    let layoutChanged = false;
    if (avatar) this.avatarSource = String(avatar);
    if (avatarFit) this.avatarFit = avatarFit;
    if (avatarAlign) this.avatarAlign = avatarAlign;
    if (avatarScale) this.avatarScale = avatarScale;
    if (Number.isFinite(Number(avatarWidth)) && Number(avatarWidth) > 0) {
      this.requestedAvatarWidth = Number(avatarWidth);
      layoutChanged = true;
    }
    if (Number.isFinite(Number(avatarHeight)) && Number(avatarHeight) > 0) {
      this.requestedAvatarHeight = Number(avatarHeight);
      layoutChanged = true;
    }
    if (layoutChanged) this.resize();
    await this.refreshAvatar();
  }

  translateInput(input) {
    const isBuf = Buffer.isBuffer(input);
    const seq = isBuf ? input : Buffer.from(String(input), "utf8");
    const finishScroll = () => (isBuf ? Buffer.alloc(0) : "");
    const bumpRailScroll = (delta) => {
      if (delta < 0) this.railScrollOffset = Math.max(0, this.railScrollOffset + delta);
      else this.railScrollOffset += delta;
      this.render(this.snapshot);
      return finishScroll();
    };

    if (seq.equals(Buffer.from(`${ESC}[5~`, "utf8"))) return bumpRailScroll(-5);
    if (seq.equals(Buffer.from(`${ESC}[6~`, "utf8"))) return bumpRailScroll(5);
    if (seq.equals(Buffer.from(`${ESC}[1;2A`, "utf8"))) return bumpRailScroll(-1);
    if (seq.equals(Buffer.from(`${ESC}[1;2B`, "utf8"))) return bumpRailScroll(1);

    const sgrWheel = parseSgrMouseBuffer(seq, 0);
    if (sgrWheel && sgrWheel.end === seq.length) {
      if (this.isRailMouseEvent(sgrWheel)) {
        if (sgrWheel.button === 64) return bumpRailScroll(-1);
        if (sgrWheel.button === 65) return bumpRailScroll(1);
        return finishScroll();
      }
    }

    const x10 = parseX10MouseBuffer(seq, 0);
    if (x10 && x10.end === seq.length) {
      const btn = x10.buttonByte;
      if (this.isRailMouseEvent(x10)) {
        if (btn === 36 || btn === 0x60 || btn === 0x61) return bumpRailScroll(-1);
        if (btn === 37 || btn === 0x62) return bumpRailScroll(1);
        return finishScroll();
      }
    }

    return translateHostInputForTui(input, {
      hostLeft: this.hostLeft,
      hostCols: this.hostCols,
      hostRows: this.hostRows,
      hostInputModes: this.hostInputModes
    });
  }

  isRailMouseEvent(event) {
    const x = Number(event?.x);
    const y = Number(event?.y);
    return Number.isFinite(x) && Number.isFinite(y) && x >= 1 && x < this.hostLeft && y >= 1 && y <= this.rows;
  }

  render(snapshot = this.snapshot) {
    if (!this._active) return;
    if (!snapshot) return;
    const panel = renderLifeTuiPanel({
      snapshot,
      avatarPayload: this.avatarPayload,
      width: this.sideWidth,
      height: this.rows,
      avatarWidth: this.avatarWidth,
      avatarHeight: this.avatarHeight,
      terminalCols: this.cols,
      theme: this.theme,
      caps: this.caps,
      language: this.language,
      breathMsResolved: inferBreathCadence(snapshot),
      now: this.reduceMotion ? soulRenderTime(snapshot) : new Date(),
      scrollOffset: this.railScrollOffset,
      avatarDiagnostics: this.avatarDiagnostics
    });
    const changed = [];
    for (let index = 0; index < panel.length; index++) {
      if (!this._lastPanel || this._lastPanel[index] !== panel[index]) {
        changed.push(`${cursorTo(index + 1, 1)}${panel[index]} `);
      }
    }
    if (this._lastPanel && this._lastPanel.length > panel.length) {
      const blank = " ".repeat(this.sideWidth + 1);
      for (let index = panel.length; index < this._lastPanel.length; index++) {
        changed.push(`${cursorTo(index + 1, 1)}${blank}`);
      }
    }
    this._lastPanel = panel;
    if (changed.length > 0) this.write(`${saveCursor()}${changed.join("")}${restoreCursor()}`);
  }

  write(value) {
    this.io?.stdout?.write?.(value);
  }
}

export function extractTerminalModePassthrough(chunk) {
  const input = String(chunk || "");
  if (!input) return "";
  let output = "";
  for (let index = 0; index < input.length; index += 1) {
    const char = input[index];
    if (char !== ESC) continue;
    const next = input[index + 1];
    if (next === "=" || next === ">") {
      output += `${ESC}${next}`;
      index += 1;
      continue;
    }
    if (next !== "[") continue;
    const parsed = readCsi(input, index);
    if (!parsed) continue;
    output += terminalInputModeSequence(parsed.body, parsed.final);
    index = parsed.end - 1;
  }
  return output;
}

export function terminalModeResetSequence() {
  return [
    `${ESC}[?1l`,
    `${ESC}>`,
    `${ESC}[?1000l`,
    `${ESC}[?1002l`,
    `${ESC}[?1003l`,
    `${ESC}[?1004l`,
    `${ESC}[?1005l`,
    `${ESC}[?1006l`,
    `${ESC}[?1015l`,
    `${ESC}[?2004l`,
    `${ESC}[?2026l`,
    `${ESC}[>4;0m`,
    showCursor(),
    resetScrollRegion(),
    leaveAlternateScreen()
  ].join("");
}

export function terminalMouseEnableSequence() {
  return [`${ESC}[?1000h`, `${ESC}[?1006h`].join("");
}

export function translateHostInputForTui(input, { hostLeft = 1, hostCols = 80, hostRows = 24, hostInputModes } = {}) {
  if (input == null) return input;
  const options = { hostLeft, hostCols, hostRows, hostInputModes };
  if (Buffer.isBuffer(input)) return translateHostInputBuffer(input, options);
  const translated = translateHostInputString(String(input), options);
  return translated;
}

function updateHostInputModes(text, set) {
  let index = 0;
  while (index < text.length) {
    if (text[index] === ESC && text[index + 1] === "[") {
      const parsed = readCsi(text, index);
      if (parsed) {
        if ((parsed.final === "h" || parsed.final === "l") && parsed.body.startsWith("?")) {
          const enable = parsed.final === "h";
          const parts = parsed.body.slice(1).split(";");
          for (const part of parts) {
            const mode = part.split(":")[0].trim();
            if (enable) set.add(mode);
            else set.delete(mode);
          }
        }
        index = parsed.end;
        continue;
      }
    }
    index += 1;
  }
}

export function renderLifeTuiPanel({
  snapshot,
  avatarPayload = "",
  width = 80,
  height = 10,
  avatarWidth,
  avatarHeight,
  terminalCols,
  theme,
  caps = {},
  language = "en",
  now = new Date(),
  breathMsResolved,
  scrollOffset = 0,
  avatarDiagnostics
} = {}) {
  const viewportWidth = Math.max(24, Number(width || 32));
  const viewportHeight = Math.max(8, Number(height || 24));
  const bodyWidth = Math.max(12, viewportWidth - 2);
  const totalColsGuess = Number.isFinite(Number(terminalCols)) && Number(terminalCols) > 0 ?
    Number(terminalCols)
    : viewportWidth + 80;
  const tier = layoutTier(totalColsGuess);
  const breathMs = breathMsResolved ?? inferBreathCadence(snapshot);
  const stateInfo = getLifeStateInfo(snapshot?.state);
  const pulse = getLifePulse(snapshot, now);
  const soul = snapshot?.soul || createSoulState({ enabled: false });
  const soulPulse = getSoulPulse(soul, now);
  const bpmForPulse =
    soul.enabled && soul.mood && typeof soul.mood === "object"
      ? (Number.isFinite(soul.mood.heartbeatBpm) ? soul.mood.heartbeatBpm : soulPulse.bpm)
    : soulPulse.bpm;
  const heartbeatPulseObj = soul.enabled ? { ...soulPulse, bpm: bpmForPulse ?? soulPulse.bpm } : soulPulse;
  const visualWidth = Math.min(Math.max(10, Number(avatarWidth || bodyWidth)), Math.max(10, bodyWidth));
  const avatarRows = chooseAvatarRows(viewportHeight, tier, {
    requestedRows: avatarHeight,
    width: bodyWidth,
    rich: Boolean(soul.enabled && (soul.llmStats !== undefined || (soul.mood && Array.isArray(soul.mood.tags))))
  });
  const avatarLines = normalizeAvatarLines(avatarPayload, visualWidth, avatarRows);
  const bodyLines = soul.enabled ? createSoulRailBody({
    soul,
    soulPulse: heartbeatPulseObj,
    breathMs,
    stateInfo,
    snapshot,
    avatarLines,
    title: snapshot?.title || "termvis",
    width: bodyWidth,
    height: viewportHeight,
    theme,
    caps,
    language,
    tier,
    now,
    avatarDiagnostics
  }) : createLifeOnlyRailBody({
    stateInfo,
    pulse,
    breathMs,
    snapshot,
    avatarLines,
    title: snapshot?.title || "termvis",
    width: bodyWidth,
    height: viewportHeight,
    theme,
    caps,
    language,
    tier,
    now,
    avatarDiagnostics
  });

  const soulSays = resolveSoulSaysForDisplay(soul);
  const saysStripLines = renderSoulSaysStrip(soulSays, viewportWidth, theme, caps, language);

  const reservedForStrip = saysStripLines.length;
  const mainAreaHeight = Math.max(4, viewportHeight - reservedForStrip);

  const wrappedBody = [];
  for (const line of bodyLines) {
    wrappedBody.push(...wrapCells(line || "", bodyWidth));
  }
  const totalContent = wrappedBody.length;
  const needsScroll = totalContent > mainAreaHeight;
  const scrollBarRows = needsScroll ? 1 : 0;
  const contentRows = mainAreaHeight - scrollBarRows;
  const maxScroll = Math.max(0, totalContent - contentRows);
  const safeOffset = Math.max(0, Math.min(scrollOffset || 0, maxScroll));

  const visibleLines = needsScroll
    ? wrappedBody.slice(safeOffset, safeOffset + contentRows)
    : wrappedBody.slice(safeOffset);
  if (needsScroll) {
    while (visibleLines.length < contentRows) visibleLines.push("");
  }

  const renderedMain = visibleLines.map((line, index) => renderRailLine({
    line,
    row: safeOffset === 0 ? index : index + 1,
    width: viewportWidth,
    theme,
    caps
  }));

  if (needsScroll) {
    const scrollIndicator = safeOffset < maxScroll
      ? `  ↕ ${safeOffset + 1}-${Math.min(safeOffset + contentRows, totalContent)}/${totalContent}`
      : `  ↑ ${totalContent} ${railText(language, "linesTotal")}`;
    const is24bit = (caps?.colorDepth || 0) >= 24;
    const indLine = is24bit
      ? style(scrollIndicator, { fg: "#506070" })
      : paint(scrollIndicator, "muted", theme, caps);
    renderedMain.push(renderRailLine({
      line: indLine,
      row: renderedMain.length,
      width: viewportWidth,
      theme,
      caps
    }));
  }

  return [...renderedMain, ...saysStripLines];
}

function createSoulRailBody({ soul, soulPulse, breathMs, stateInfo, snapshot, avatarLines, title, width, height, theme, caps, language = "en", tier = "medium", now = new Date(), avatarDiagnostics }) {
  // Detect rich (soul-bios SoulFrame-shaped) vs legacy soul
  const isRich = Boolean(soul && (soul.llmStats !== undefined || (soul.mood && Array.isArray(soul.mood.tags))));
  if (isRich) {
    return createRichSoulRailBody({ soul, soulPulse, breathMs, stateInfo, snapshot, avatarLines, title, width, height, theme, caps, language, tier, now, avatarDiagnostics });
  }
  return createLegacySoulRailBody({ soul, soulPulse, breathMs, stateInfo, snapshot, avatarLines, title, width, height, theme, caps, language, tier, now, avatarDiagnostics });
}

function createLegacySoulRailBody({ soul, soulPulse, breathMs, stateInfo, snapshot, avatarLines, title, width, height, theme, caps, language = "en", tier = "medium", now = new Date(), avatarDiagnostics }) {
  const narrow = tier === "narrow";
  const wide = tier === "wide";
  const roomy = height >= 20 && !narrow;
  const quoteWidth = Math.max(8, width - 5);
  const reply = displayReply(soul);
  const pulseText = pulseWithBreath(soulPulse, breathMs, now, language);
  const replyMax = chooseReplyRows(height, tier);
  const replyLines = wrapRailText(reply, quoteWidth).slice(0, replyMax);
  let metrics;
  if (narrow) {
    metrics = [
      metricLine(railText(language, "pulse"), pulseText, width, theme, caps)
    ];
  } else {
    metrics = [
      metricLine(railText(language, "mood"), localizeTerm(language, soulMoodToDisplayString(soul)), width, theme, caps),
      metricLine(railText(language, "presence"), localizeTerm(language, soul.presence), width, theme, caps),
      metricLine(railText(language, "pulse"), pulseText, width, theme, caps)
    ];
    if (roomy) metrics.push(metricLine(railText(language, "signal"), snapshot?.lastSignal || "boot", width, theme, caps));
  }
  const foot = `${snapshot?.outputBytes || 0}b`;
  const footAugmented = wide && snapshot?.lastDigest ? `${foot} │ ${truncateMeta(snapshot.lastDigest, Math.max(10, width - cellWidth(foot) - 3))}` : foot;
  const details = [];
  if (avatarDiagnostics) {
    const diagText = `avatar: ${avatarDiagnostics.mode}`;
    const reasonText = avatarDiagnostics.reason.replace(/_/g, " ");
    details.push(padCells(`  ${dim(diagText)} ${dim("·")} ${dim(reasonText)}`, width));
  }
  if (!narrow && soul.mode === "transparent" && soul.persona?.boundary) {
    details.push(metricLine(railText(language, "source"), localizeTerm(language, soul.lastSource || "system"), width, theme, caps));
    details.push(...wrapLabel(railText(language, "bound"), soul.persona.boundary, width).slice(0, 2).map((line) => paint(line, "muted", theme, caps)));
  }
  const expressionLine = expressionBadge(soul, snapshot, width, theme, caps, now, language);
  return composeRailBody({
    header: narrow ? [railTitle(soul.persona?.name || "Termvis Soul", width, theme, caps)] : [
      railTitle(soul.persona?.name || "Termvis Soul", width, theme, caps),
      railSubtitle(title, width, theme, caps)
    ],
    avatar: formatAvatarLines(avatarLines, width),
    expression: [expressionLine],
    metrics,
    details,
    reply: narrow ? [] : replyBlock(replyLines, width, theme, caps, [soul.mood?.discrete]),
    filler: createStableActivityList({ soul, snapshot, width, theme, caps, language, tier, now }),
    footer: railFoot(footAugmented, width, theme, caps),
    height,
    minAvatarRows: chooseMinAvatarRows(height, tier, avatarLines.length),
    minMetricRows: narrow ? 2 : 4,
    minReplyRows: narrow ? 0 : 1
  });
}

/**
 * Rich rail body: anime art + full SoulFrame display + LLM status.
 * Used when the snapshot was built via soulFrameToTuiSnapshot from the intelligent engine.
 */
function createRichSoulRailBody({ soul, soulPulse, breathMs, stateInfo, snapshot, avatarLines, title, width, height, theme, caps, language = "en", tier = "medium", now = new Date(), avatarDiagnostics }) {
  const narrow = tier === "narrow";
  const wide = tier === "wide";
  const roomy = height >= 20 && !narrow;
  const tall = height >= 30;
  const quoteWidth = Math.max(8, width - 5);
  const barW = Math.max(6, Math.min(14, width - 12));
  const reply = displayReply(soul);
  const pulseText = pulseWithBreath(soulPulse, breathMs, now, language);
  const replyMax = chooseReplyRows(height, tier);
  const replyLines = wrapRailText(reply, quoteWidth).slice(0, replyMax);
  const is24bit = (caps.colorDepth || 0) >= 24;

  const hasUserAvatar = avatarLines && avatarLines.some((l) => stripAnsi(l || "").trim().length > 0);
  let avatarBlock;
  if (hasUserAvatar) {
    avatarBlock = formatAvatarLines(avatarLines, width);
  } else {
    const animeArtLines = renderAnimeArtBlock(soul, now, Math.max(12, width - 4), height);
    avatarBlock = animeArtLines.map((line) => padCells(truncateCells(paint(line, "primary", theme, caps), width), width, "center"));
  }

  const llmStats = soul.llmStats || null;

  const moodTags = Array.isArray(soul.mood?.tags) ? soul.mood.tags : [];
  const moodIcon = moodFaceIcon(moodTags);
  const v2 = soul.v2Frame || null;
  const v2v = soul.v2Visual || v2?.visual || {};

  let metrics;
  if (narrow) {
    const bpmStr = v2?.pulse?.bpm ? `${Math.round(v2.pulse.bpm)}` : String(soulPulse?.bpm || "62");
    const evtIcon = v2v.pulse?.eventIcon || "●";
    const prv = v2v.presence || {};
    metrics = [
      iconLine(moodIcon, railText(language, "mood"), localizedTerms(language, moodTags.slice(0, 2)).join("·") || localizeTerm(language, "calm"), width, theme, caps, "text"),
      iconLine(evtIcon, railText(language, "pulse"), `${bpmStr}${railText(language, "bpm")}`, width, theme, caps, "heartbeat"),
      iconLine(prv.modeIcon || "◎", railText(language, "presence"), localizeTerm(language, prv.modeText || "ambient"), width, theme, caps, "text")
    ];
  } else {
    const tagLabel = moodTags.length > 0 ? localizedTerms(language, moodTags.slice(0, 3)).join(" · ") : localizeTerm(language, soul.mood?.discrete || "calm");
    const valence = Number(soul.mood?.valence ?? 0);
    const arousal = Number(soul.mood?.arousal ?? 0);
    const dominance = Number(soul.mood?.dominance ?? 0);
    const pal = SOUL_PALETTE;

    metrics = [];

    // ── Mood Section ──
    metrics.push(sectionLine(railText(language, "moodSection"), width, theme, caps));
    const moodPrimary = is24bit
      ? style(`${moodIcon} ${tagLabel}`, { fg: pal.mood.primary, isBold: true })
      : paint(`${moodIcon} ${bold(tagLabel)}`, "primary", theme, caps);
    metrics.push(padCells(moodPrimary, width));

    const vBar = progressBar((valence + 1) / 2, barW, { filledColor: valence >= 0 ? pal.success : pal.danger, emptyColor: "#333344", caps });
    const aBar = progressBar(arousal, barW, { filledColor: pal.pulse.primary, emptyColor: "#333344", caps });
    const dBar = progressBar(dominance, barW, { filledColor: pal.presence.primary, emptyColor: "#333344", caps });
    metrics.push(padCells(`  ${paint("V", "muted", theme, caps)} ${vBar} ${dim(valence.toFixed(2))}`, width));
    metrics.push(padCells(`  ${paint("A", "muted", theme, caps)} ${aBar} ${dim(arousal.toFixed(2))}`, width));
    metrics.push(padCells(`  ${paint("D", "muted", theme, caps)} ${dBar} ${dim(dominance.toFixed(2))}`, width));

    if (roomy) {
      const appr = v2?.mood?.caap?.appraisal || {};
      const tend = v2?.mood?.caap?.tendency || {};
      if (Object.keys(appr).length > 0) {
        const riskLabel = railText(language, "risk");
        const uncLabel = railText(language, "uncertainty");
        const proLabel = railText(language, "progress");
        const riskStr = (appr.risk || 0) > 0.3
          ? style(`${riskLabel}:${(appr.risk * 100).toFixed(0)}%`, { fg: pal.danger })
          : dim(`${riskLabel}:${((appr.risk || 0) * 100).toFixed(0)}%`);
        const uncStr = dim(`${uncLabel}:${((appr.uncertainty || 0) * 100).toFixed(0)}%`);
        const proStr = dim(`${proLabel}:${((appr.goalProgress || 0) * 100).toFixed(0)}%`);
        metrics.push(padCells(`  ${riskStr}  ${uncStr}  ${proStr}`, width));
      }
      if (Object.keys(tend).length > 0) {
        const tendParts = [];
        for (const [k, v] of Object.entries(tend)) {
          if (v > 0.15) tendParts.push(dim(`${localizeTerm(language, k)}:${(v * 100).toFixed(0)}%`));
        }
        if (tendParts.length) metrics.push(padCells(`  ${tendParts.slice(0, 4).join(" ")}`, width));
      }
    }

    // ── Pulse Section ──
    metrics.push(sectionLine(railText(language, "pulseSection"), width, theme, caps));
    const pv = v2v.pulse || {};
    const bpmNum = v2?.pulse?.bpm ? Math.round(v2.pulse.bpm) : (soulPulse?.bpm || 62);
    const pulseEvt = pv.eventName || "steady";
    const pulseEvtText = localizeTerm(language, pulseEvt);
    const bwave = animateWave(pv.beatWave || "▁▂▃▄▅▇█▆▄▂", now, bpmNum);
    const heart = heartbeatIcon(bpmNum, now);
    const bpmColor = bpmNum > 90 ? pal.danger : bpmNum > 75 ? pal.warn : pal.pulse.primary;
    const bpmDisplay = is24bit ? style(`${bpmNum}`, { fg: bpmColor, isBold: true }) : paint(bold(`${bpmNum}`), "heartbeat", theme, caps);
    const heartDisplay = is24bit ? style(heart, { fg: pal.danger, isBold: heart !== "♡" }) : paint(heart, "heartbeat", theme, caps);
    const evtDisplay = is24bit
      ? style(`${pv.eventIcon || "●"} ${pulseEvtText}`, { fg: pulseEvt === "surge" ? pal.danger : pulseEvt === "quickening" ? pal.warn : pal.pulse.secondary })
      : paint(`${pv.eventIcon || "●"} ${pulseEvtText}`, "heartbeat", theme, caps);
    metrics.push(padCells(`  ${heartDisplay} ${bpmDisplay} ${dim(railText(language, "bpm"))}`, width));
    if (pv.breathText) metrics.push(padCells(`  ${dim(railText(language, "breath"))} ${dim(pv.breathText)}`, width));
    metrics.push(padCells(`  ${evtDisplay}`, width));

    const waveDisplay = is24bit ? gradientText(bwave, pal.pulse.primary, pal.pulse.secondary, caps) : paint(bwave, "heartbeat", theme, caps);
    metrics.push(padCells(`  ${waveDisplay}`, width));

    if (roomy) {
      const stressLvl = v2?.pulse?.stressLoad || 0;
      const recLvl = v2?.pulse?.recoveryLoad || 0;
      const sBar = progressBar(stressLvl, barW, { filledColor: pal.danger, emptyColor: "#1a1a2e", caps });
      const rBar = progressBar(recLvl, barW, { filledColor: pal.pulse.recovery, emptyColor: "#1a1a2e", caps });
      metrics.push(padCells(`  ${dim(railText(language, "stress"))} ${sBar} ${dim(`${(stressLvl * 100).toFixed(0)}%`)}`, width));
      metrics.push(padCells(`  ${dim(railText(language, "recovery"))} ${rBar} ${dim(`${(recLvl * 100).toFixed(0)}%`)}`, width));
      if (tall) {
        const fatStr = pv.fatigueText || "";
        const hrvStr = `${railText(language, "hrv")}:${Math.round(v2?.pulse?.hrvMs || 55)}ms`;
        const sympStr = `${railText(language, "sympathetic")}:${pv.sympatheticPct || 0}%`;
        const parasStr = `${railText(language, "parasympathetic")}:${pv.parasympatheticPct || 0}%`;
        metrics.push(padCells(`  ${dim(hrvStr)}  ${dim(sympStr)}  ${dim(parasStr)}`, width));
        if (fatStr) metrics.push(padCells(`  ${dim(localizeTerm(language, fatStr))}`, width));
      }
    }

    // ── Presence Section ──
    metrics.push(sectionLine(railText(language, "presenceSection"), width, theme, caps));
    const prv = v2v.presence || {};
    const presMode = prv.modeText || soul.presence || "ambient";
    const presStance = prv.stanceText || "observe";
    const presModeText = localizeTerm(language, presMode);
    const presStanceText = localizeTerm(language, presStance);
    const presColor = presMode === "guardian" ? pal.danger : presMode === "recovering" ? pal.warn : presMode === "celebrating" ? pal.success : pal.presence.primary;
    const presMain = is24bit
      ? `${style(prv.modeIcon || "◎", { fg: presColor })} ${style(presModeText, { fg: presColor, isBold: true })} ${dim("/")} ${dim(presStanceText)}`
      : `${paint(prv.modeIcon || "◎", "primary", theme, caps)} ${paint(bold(presModeText), "primary", theme, caps)} ${paint("/", "muted", theme, caps)} ${paint(presStanceText, "muted", theme, caps)}`;
    metrics.push(padCells(`  ${presMain}`, width));

    const gazeStr = localizeTerm(language, prv.gazeText || "terminal");
    const attPct = prv.attentionPct || 0;
    const attBar = progressBar(attPct / 100, Math.min(8, barW), { filledColor: pal.presence.primary, emptyColor: "#222233", caps });
    metrics.push(padCells(`  ${dim(`${railText(language, "gaze")}:`)} ${dim(gazeStr)}`, width));
    metrics.push(padCells(`  ${dim(railText(language, "attention"))}  ${attBar} ${dim(`${attPct}%`)}`, width));
    if (prv.silenceText) metrics.push(padCells(`  ${dim(localizeTerm(language, prv.silenceText))}`, width));

    if (roomy) {
      const proxPct = prv.proximityPct || 0;
      const agcyPct = prv.agencyPct || 0;
      metrics.push(padCells(`  ${dim(`${railText(language, "proximity")}:${proxPct}%  ${railText(language, "agency")}:${agcyPct}%`)}`, width));
    }
  }

  const footFull = soul.provenance?.llmRunId ? railText(language, "soulVoiceLive") : railText(language, "soulVoiceReady");

  const details = [];
  if (avatarDiagnostics) {
    const diagText = `avatar: ${avatarDiagnostics.mode}`;
    const reasonText = avatarDiagnostics.reason.replace(/_/g, " ");
    details.push(padCells(`  ${dim(diagText)} ${dim("·")} ${dim(reasonText)}`, width));
  }
  if (!narrow && soul.mode === "transparent" && soul.persona?.boundary) {
    details.push(iconLine("⚠", railText(language, "source"), localizeTerm(language, soul.lastSource || "system"), width, theme, caps, "muted"));
    details.push(...wrapLabel(railText(language, "bound"), soul.persona.boundary, width).slice(0, 2).map((line) => paint(line, "muted", theme, caps)));
  }

  return composeRailBody({
    header: narrow ? [railTitle(soul.persona?.name || "Termvis Soul", width, theme, caps)] : [
      railTitle(soul.persona?.name || "Termvis Soul", width, theme, caps),
      railSubtitle(title, width, theme, caps)
    ],
    avatar: avatarBlock,
    expression: [expressionBadge(soul, snapshot, width, theme, caps, now, language)],
    metrics,
    details,
    reply: replyBlock(narrow ? replyLines.slice(0, 1) : replyLines, width, theme, caps, moodTags),
    filler: createStableActivityList({ soul, snapshot, llmStats, width, theme, caps, language, tier, now }),
    footer: railFoot(footFull, width, theme, caps),
    height,
    minAvatarRows: chooseMinAvatarRows(height, tier, avatarBlock.length),
    minMetricRows: narrow ? 5 : 8,
    minReplyRows: narrow ? 1 : 1
  });
}

function createLifeOnlyRailBody({ stateInfo, pulse, breathMs, snapshot, avatarLines, title, width, height, theme, caps, language = "en", tier = "medium", now = new Date(), avatarDiagnostics }) {
  const message = snapshot?.message || stateInfo.voice;
  const footBase = snapshot?.lastDigest ? `${snapshot.lastDigest}  ${snapshot.outputBytes || 0}b` : `${snapshot?.outputBytes || 0}b`;
  const narrow = tier === "narrow";
  const wide = tier === "wide";
  const pulseLine = pulseWithBreath(pulse, breathMs, now, language);
  const expressionLine = hostExpressionBadge(snapshot, width, theme, caps, now, language);
  let metrics;
  if (narrow) {
    metrics = [
      metricLine(railText(language, "heart"), pulseLine, width, theme, caps),
      metricLine(railText(language, "state"), stateInfo.label, width, theme, caps)
    ];
  } else {
    metrics = [
      metricLine(railText(language, "state"), stateInfo.label, width, theme, caps),
      metricLine(railText(language, "heart"), pulseLine, width, theme, caps),
      metricLine(railText(language, "signal"), snapshot?.lastSignal || "boot", width, theme, caps)
    ];
  }
  if (avatarDiagnostics) {
    const diagText = `avatar: ${avatarDiagnostics.mode}`;
    const reasonText = avatarDiagnostics.reason.replace(/_/g, " ");
    metrics.push(padCells(`  ${dim(diagText)} ${dim("·")} ${dim(reasonText)}`, width));
  }
  return composeRailBody({
    header: narrow ? [railTitle(title, width, theme, caps)] : [
      railTitle(title, width, theme, caps),
      railSubtitle(railText(language, "visualShell"), width, theme, caps)
    ],
    avatar: formatAvatarLines(avatarLines, width),
    expression: [expressionLine],
    metrics,
    reply: narrow ? [] : wrapRailText(message, Math.max(8, width - 2)).slice(0, 2).map((line) => paint(line, "text", theme, caps)),
    filler: createStableActivityList({ soul: null, snapshot, width, theme, caps, language, tier, now }),
    footer: railFoot(footBase, width, theme, caps),
    height,
    minAvatarRows: chooseMinAvatarRows(height, tier, avatarLines.length),
    minMetricRows: narrow ? 2 : 3,
    minReplyRows: narrow ? 0 : 1
  });
}

function composeRailBody({
  header = [],
  avatar = [],
  expression = [],
  metrics = [],
  details = [],
  reply = [],
  filler = [],
  footer = "",
  height = 24,
  minAvatarRows = 3,
  minMetricRows = 2,
  minReplyRows = 0
} = {}) {
  void minAvatarRows;
  void minMetricRows;
  void minReplyRows;
  const body = buildRailSections({ header, avatar, expression, metrics, details, reply });
  const slack = Math.max(0, height - body.length - 1);
  const fill = filler.slice(0, slack);
  return [
    ...body,
    ...fill,
    footer
  ];
}

/**
 * Assemble sections into a flat array. Only a single blank line is inserted
 * between header→avatar. All other sections flow immediately to keep the
 * layout tight and prevent the "big gap" problem.
 */
function buildRailSections({ header = [], avatar = [], expression = [], metrics = [], details = [], reply = [] } = {}) {
  const lines = [];
  const hdr = header.filter(Boolean);
  const avt = avatar.filter(Boolean);
  const expr = expression.filter(Boolean);
  const met = metrics.filter(Boolean);
  const det = details.filter(Boolean);
  const rep = reply.filter(Boolean);

  // Header
  if (hdr.length) lines.push(...hdr);
  // One spacer after header before avatar
  if (avt.length) {
    lines.push("");
    lines.push(...avt);
  }
  // Expression directly after avatar (no gap)
  if (expr.length) lines.push(...expr);
  // Metrics: one spacer after avatar/expression
  if (met.length) {
    if (avt.length || expr.length) lines.push("");
    lines.push(...met);
  }
  // Details flow right after metrics (no gap)
  if (det.length) lines.push(...det);
  // Reply: one spacer before it
  if (rep.length) {
    lines.push("");
    lines.push(...rep);
  }
  return lines;
}

function formatAvatarLines(avatarLines, width) {
  return trimBlankEdges(avatarLines).map((line) => padCells(line, width, "center"));
}

function trimBlankEdges(lines = []) {
  let start = 0;
  let end = lines.length;
  while (start < end && stripAnsi(lines[start]).trim() === "") start += 1;
  while (end > start && stripAnsi(lines[end - 1]).trim() === "") end -= 1;
  return lines.slice(start, end);
}

function renderRailLine({ line, row, width, theme, caps }) {
  const is24bit = (caps.colorDepth || 0) >= 24;
  const accent = row === 0
    ? (is24bit ? style("▌", { fg: SOUL_PALETTE.mood.primary }) : paint("▌", "primary", theme, caps))
    : (is24bit ? style("│", { fg: "#2F3A4F" }) : paint("│", "border", theme, caps));
  const boundary = is24bit ? style("│", { fg: "#2F3A4F" }) : paint("│", "border", theme, caps);
  const bodyWidth = Math.max(1, width - 2);
  const body = padCells(line || "", bodyWidth);
  return `${accent}${body}${boundary}`;
}

function railTitle(value, width, theme, caps) {
  const label = truncateCells(stripAnsi(value || "Termvis Soul"), Math.max(8, width - 3));
  const is24bit = (caps.colorDepth || 0) >= 24;
  const icon = is24bit ? style("●", { fg: SOUL_PALETTE.pulse.primary }) : paint("●", "heartbeat", theme, caps);
  const text = is24bit ? gradientText(label, SOUL_PALETTE.mood.primary, SOUL_PALETTE.pulse.primary, caps) : paint(label, "primary", theme, caps);
  return `${icon} ${bold(text)}`;
}

function railSubtitle(value, width, theme, caps) {
  const label = truncateCells(stripAnsi(value || ""), Math.max(8, width - 2));
  return paint(`  ${label}`, "muted", theme, caps);
}

function railFoot(value, width, theme, caps) {
  return paint(truncateCells(stripAnsi(value || ""), Math.max(8, width)), "muted", theme, caps);
}

function metricLine(label, value, width, theme, caps) {
  const labelWidth = 9;
  const normalizedLabel = truncateCells(label, labelWidth - 1);
  const labelText = paint(padCells(normalizedLabel, labelWidth), "muted", theme, caps);
  const heartbeatLabel = /^(pulse|heart|脉搏|心跳|脈拍|心拍)$/u.test(String(label || ""));
  const valueText =
    heartbeatLabel ? paint(String(value || ""), "heartbeat", theme, caps)
    : paint(String(value || ""), "text", theme, caps);
  return truncateCells(`${labelText}${valueText}`, width);
}

/**
 * Render a metric line with a colored icon prefix.
 * Layout: " <icon> <label> <value>" — wraps value to avoid truncation.
 */
function iconLine(icon, label, value, width, theme, caps, valueRole = "text") {
  const iconText = paint(icon || " ", "primary", theme, caps);
  const labelPart = label ? paint(padCells(truncateCells(label, 5), 6), "muted", theme, caps) : "";
  const role = ROLE_FALLBACKS[valueRole] || valueRole || "text";
  const valStr = String(value || "");
  const prefixCells = 2 + (label ? 6 : 0);
  const maxValCells = Math.max(4, width - prefixCells);
  const valueText = paint(truncateCells(valStr, maxValCells), role, theme, caps);
  return padCells(`${iconText} ${labelPart}${valueText}`, width);
}

function richLine(content, width, theme, caps, role = "text") {
  return padCells(paint(truncateCells(String(content || ""), Math.max(4, width)), role, theme, caps), width);
}

function sectionLine(label, width, theme, caps) {
  return sectionHeader(label, Math.max(8, width), theme, caps);
}

const ROLE_FALLBACKS = Object.freeze({
  ok: "primary",
  warning: "heartbeat",
  heartbeat: "heartbeat",
  primary: "primary",
  text: "text",
  muted: "muted",
  border: "border"
});

function expressionBadge(soul, snapshot, width, theme, caps, now = new Date(), language = "en") {
  const emotion = chooseAnimeEmotion(soul, emotionFromHostState(snapshot?.state));
  const icon = emotionIcon(emotion);
  const face = stripAnsi(soulExpressionAscii(soul, now)).replace(/\s+/g, " ").trim();
  const label = `${emotionLabel(emotion, language)} ${face}`;
  return iconLine(icon, railText(language, "face"), label, width, theme, caps, "primary");
}

function hostExpressionBadge(snapshot, width, theme, caps, now = new Date(), language = "en") {
  const emotion = emotionFromHostState(snapshot?.state);
  const icon = emotionIcon(emotion);
  const face = stripAnsi(lifeHostExpression(snapshot, now)).replace(/\s+/g, " ").trim();
  return iconLine(icon, railText(language, "face"), `${emotionLabel(emotion, language)} ${face}`, width, theme, caps, "primary");
}

function emotionFromHostState(state = "listening") {
  const map = {
    reasoning: "focused",
    acting: "curious",
    waiting: "guarded",
    failed: "tired",
    succeeded: "delighted",
    observing: "idle",
    awakening: "curious",
    listening: "idle"
  };
  return map[state] || "idle";
}

function emotionIcon(emotion = "idle") {
  const map = {
    idle: "◕",
    blink: "◡",
    thinking: "?",
    speaking: "♪",
    delighted: "✿",
    focused: "◆",
    curious: "✦",
    guarded: "!",
    tired: "☁",
    sleepy: "☾"
  };
  return map[emotion] || "◕";
}

function emotionLabel(emotion = "idle", language = "en") {
  const map = {
    idle: "soft",
    blink: "blink",
    thinking: "thinking",
    speaking: "speaking",
    delighted: "bright",
    focused: "focused",
    curious: "curious",
    guarded: "guarded",
    tired: "tired",
    sleepy: "sleepy"
  };
  const raw = map[emotion] || "soft";
  return localizeTerm(language, `${raw}_face`) || raw;
}

function displayReply(_soul = {}) {
  return "";
}

function isGenericSoulReply(value) {
  const text = String(value || "").replace(/\s+/g, " ").trim().toLowerCase();
  if (!text) return true;
  return new Set([
    "awake",
    "awake beside the terminal stream",
    "awakening the terminal presence",
    "termvis living shell",
    "visual shell"
  ]).has(text);
}

function createStableActivityList({ soul, snapshot = {}, width, theme, caps, language = "en", tier = "medium", now = new Date() } = {}) {
  void soul;
  void snapshot;
  void width;
  void theme;
  void caps;
  void language;
  void tier;
  void now;
  return [];
}

function heartbeatIcon(bpm = 64, now = new Date()) {
  const ms = Number(now instanceof Date ? now.getTime() : now) || Date.now();
  const beatMs = 60000 / Math.max(40, Number(bpm) || 64);
  const phase = (ms % beatMs) / beatMs;
  return phase < 0.14 ? "♥" : phase < 0.24 ? "❤" : "♡";
}

function animateWave(wave = "▁▂▃▄▅▄▃▂", now = new Date(), bpm = 64) {
  const chars = Array.from(String(wave || ""));
  if (chars.length <= 1) return String(wave || "");
  const ms = Number(now instanceof Date ? now.getTime() : now) || Date.now();
  const stepMs = Math.max(90, Math.round(60000 / Math.max(40, Number(bpm) || 64) / 4));
  const offset = Math.floor(ms / stepMs) % chars.length;
  return chars.slice(offset).join("") + chars.slice(0, offset).join("");
}

function replyBlock(lines, width, theme, caps, moodTags) {
  const faceIcon = moodFaceIcon(Array.isArray(moodTags) ? moodTags : []);
  return lines.map((line, index) => {
    const prefix = index === 0 ? `${faceIcon} ` : "  ";
    return truncateCells(`${paint(prefix, "muted", theme, caps)}${paint(line, "text", theme, caps)}`, width);
  });
}

function wrapRailText(value, width) {
  const text = String(value || "").replace(/\s+/g, " ").trim();
  if (!text) return [];
  const words = text.split(" ");
  if (words.length <= 1) {
    return wrapCells(text, width).map((line) => line.trim()).filter(Boolean);
  }
  const lines = [];
  let line = "";
  for (const word of words) {
    if (cellWidth(word) > width) {
      if (line) {
        lines.push(line);
        line = "";
      }
      lines.push(...wrapCells(word, width).map((part) => part.trim()).filter(Boolean));
      continue;
    }
    const candidate = line ? `${line} ${word}` : word;
    if (cellWidth(candidate) > width) {
      if (line) lines.push(line);
      line = word;
    } else {
      line = candidate;
    }
  }
  if (line) lines.push(line);
  return lines;
}

function chooseRenderedAvatarHeight(rows, sideWidth, avatarHeight) {
  const requested = Number(avatarHeight);
  const terminalRows = Math.max(14, Number(rows || 24));
  const usableRows = Math.max(4, terminalRows - 10);
  const widthHint = Number(sideWidth || 32);
  const ratioTarget = Math.round(Math.max(12, widthHint - 2) * (widthHint >= 38 ? 0.50 : 0.45));
  const target = Number.isFinite(requested) && requested > 0 ? requested : ratioTarget;
  return clamp(Math.round(target), 4, Math.max(4, usableRows));
}

function chooseReplyRows(height, tier = "medium") {
  if (tier === "narrow") return 1;
  const ratio = tier === "wide" ? 0.16 : 0.13;
  return clamp(Math.round(Number(height || 20) * ratio), 1, tier === "wide" ? 4 : 3);
}

function chooseMinAvatarRows(height, tier = "medium", availableRows = 0) {
  if (availableRows <= 0) return 0;
  const floor = tier === "narrow" ? 2 : 4;
  const ratio = tier === "wide" ? 0.28 : 0.24;
  return Math.min(availableRows, clamp(Math.round(Number(height || 20) * ratio), floor, tier === "wide" ? 8 : 6));
}

function chooseAvatarRows(height, tier = "medium", { requestedRows, width = 32, rich = false } = {}) {
  const h = Math.max(8, Number(height || 24));
  const requested = Number(requestedRows);
  const reserved = tier === "narrow"
    ? 9
    : rich
      ? Math.max(11, Math.round(h * 0.48))
      : Math.max(10, Math.round(h * 0.42));
  const maxByHeight = Math.max(tier === "narrow" ? 2 : 4, h - reserved);
  const widthBoost = width >= 38 ? 1 : 0;
  const ratioTarget = Math.round(h * (tier === "wide" ? 0.38 : tier === "medium" ? 0.33 : 0.24)) + widthBoost;
  const target = Number.isFinite(requested) && requested > 0 ? requested : ratioTarget;
  const maxRows = tier === "narrow" ? 5 : Math.max(tier === "wide" ? 10 : 8, maxByHeight);
  return clamp(Math.round(target), tier === "narrow" ? 2 : 3, Math.min(maxRows, maxByHeight));
}

function paint(value, role, theme, caps) {
  return colorize(String(value ?? ""), role, theme, caps);
}

export function transformHostOutputForTui(chunk, { offsetRows = 0, hostLeft = 1, hostRows = 24, hostCols, terminalCols = 80, cols } = {}) {
  return renderHostViewportOnce(chunk, {
    hostLeft,
    hostRows,
    hostCols: hostCols || cols || terminalCols || 80,
    rowOffset: offsetRows
  });
}

function readCsi(text, start) {
  if (text[start] !== ESC || text[start + 1] !== "[") return null;
  let cursor = start + 2;
  while (cursor < text.length) {
    const code = text.charCodeAt(cursor);
    if (code >= 0x40 && code <= 0x7e) {
      return {
        body: text.slice(start + 2, cursor),
        final: text[cursor],
        end: cursor + 1
      };
    }
    cursor += 1;
  }
  return null;
}

function terminalInputModeSequence(body, final) {
  if ((final === "h" || final === "l") && body.startsWith("?")) {
    const modes = body.slice(1)
      .split(";")
      .map((part) => part.split(":")[0].trim())
      .filter((part) => INPUT_PRIVATE_MODES.has(part));
    return modes.length > 0 ? `${ESC}[?${modes.join(";")}${final}` : "";
  }
  if (final === "u" && /^[<>=][0-9;:]*$/u.test(body)) return `${ESC}[${body}${final}`;
  if (final === "m" && /^>4;(?:0|1|2)(?:;[0-9:]+)?$/u.test(body)) return `${ESC}[${body}${final}`;
  return "";
}

function translateHostInputString(input, options) {
  let output = "";
  let index = 0;
  while (index < input.length) {
    const parsed = parseSgrMouseString(input, index);
    if (parsed) {
      output += rewriteSgrMouse(parsed, options);
      index = parsed.end;
      continue;
    }
    output += input[index];
    index += 1;
  }
  return output;
}

function translateHostInputBuffer(input, options) {
  const chunks = [];
  let changed = false;
  let start = 0;
  let index = 0;
  while (index < input.length) {
    const sgr = parseSgrMouseBuffer(input, index);
    if (sgr) {
      chunks.push(input.subarray(start, index));
      const rewritten = rewriteSgrMouse(sgr, options);
      if (rewritten) chunks.push(Buffer.from(rewritten, "ascii"));
      index = sgr.end;
      start = index;
      changed = true;
      continue;
    }
    const x10 = parseX10MouseBuffer(input, index);
    if (x10) {
      chunks.push(input.subarray(start, index));
      const rewritten = rewriteX10Mouse(input.subarray(index, x10.end), x10, options);
      if (rewritten) chunks.push(rewritten);
      index = x10.end;
      start = index;
      changed = true;
      continue;
    }
    index += 1;
  }
  if (!changed) return input;
  chunks.push(input.subarray(start));
  return Buffer.concat(chunks);
}

function parseSgrMouseString(text, index) {
  if (text[index] !== ESC || text[index + 1] !== "[" || text[index + 2] !== "<") return null;
  let cursor = index + 3;
  let body = "";
  while (cursor < text.length) {
    const char = text[cursor];
    if (char === "M" || char === "m") {
      const parts = body.split(";").map((part) => Number.parseInt(part, 10));
      if (parts.length !== 3 || parts.some((part) => !Number.isFinite(part))) return null;
      return { button: parts[0], x: parts[1], y: parts[2], final: char, end: cursor + 1 };
    }
    if (!/[0-9;]/u.test(char)) return null;
    body += char;
    cursor += 1;
  }
  return null;
}

function parseSgrMouseBuffer(buffer, index) {
  if (buffer[index] !== 0x1b || buffer[index + 1] !== 0x5b || buffer[index + 2] !== 0x3c) return null;
  let cursor = index + 3;
  const bytes = [];
  while (cursor < buffer.length) {
    const byte = buffer[cursor];
    if (byte === 0x4d || byte === 0x6d) {
      const parts = Buffer.from(bytes).toString("ascii").split(";").map((part) => Number.parseInt(part, 10));
      if (parts.length !== 3 || parts.some((part) => !Number.isFinite(part))) return null;
      return {
        button: parts[0],
        x: parts[1],
        y: parts[2],
        final: String.fromCharCode(byte),
        end: cursor + 1
      };
    }
    if (!((byte >= 0x30 && byte <= 0x39) || byte === 0x3b)) return null;
    bytes.push(byte);
    cursor += 1;
  }
  return null;
}

function parseX10MouseBuffer(buffer, index) {
  if (index + 5 >= buffer.length) return null;
  if (buffer[index] !== 0x1b || buffer[index + 1] !== 0x5b || buffer[index + 2] !== 0x4d) return null;
  return {
    buttonByte: buffer[index + 3],
    x: buffer[index + 4] - 32,
    y: buffer[index + 5] - 32,
    end: index + 6
  };
}

function rewriteSgrMouse(event, { hostLeft = 1, hostCols = 80, hostRows = 24, hostInputModes } = {}) {
  // Only forward if the child actually enabled mouse mode (1000, 1002, or 1003) 
  // AND enabled SGR mode (1006).
  if (!hostInputModes) return "";
  const hasMouse = hostInputModes.has("1000") || hostInputModes.has("1002") || hostInputModes.has("1003");
  const hasSgr = hostInputModes.has("1006");
  if (!hasMouse || !hasSgr) return "";

  const x = event.x - Math.max(0, Number(hostLeft || 1) - 1);
  const y = event.y;
  if (!isHostCell(x, y, hostCols, hostRows)) return "";
  return `${ESC}[<${event.button};${x};${y}${event.final}`;
}

function rewriteX10Mouse(sequence, event, { hostLeft = 1, hostCols = 80, hostRows = 24, hostInputModes } = {}) {
  if (!hostInputModes) return null;
  const hasMouse = hostInputModes.has("1000") || hostInputModes.has("1002") || hostInputModes.has("1003");
  if (!hasMouse) return null;

  const x = event.x - Math.max(0, Number(hostLeft || 1) - 1);
  const y = event.y;
  if (!isHostCell(x, y, hostCols, hostRows)) return null;
  const encodedX = x + 32;
  if (encodedX < 0 || encodedX > 255) return null;
  const next = Buffer.from(sequence);
  next[4] = encodedX;
  return next;
}

function isHostCell(x, y, hostCols, hostRows) {
  const cols = Math.max(1, Number(hostCols || 80));
  const rows = Math.max(1, Number(hostRows || 24));
  return Number.isFinite(x) && Number.isFinite(y) && x >= 1 && x <= cols && y >= 1 && y <= rows;
}

function normalizeAvatarLines(payload, width, height) {
  const lines = String(payload || "")
    .replace(CURSOR_VISIBILITY_PATTERN, "")
    .replace(ALT_SCREEN_PATTERN, "")
    .replace(/\s+$/u, "")
    .split(/\r?\n/)
    .filter((line) => line.length > 0)
    .slice(0, height);
  while (lines.length < height) lines.push("");
  return lines.map((line) => padCells(truncateCells(line, width), width));
}

function fitPanel(lines, width, height) {
  const fitted = lines.slice(0, height).map((line) => padCells(truncateCells(line, width), width));
  while (fitted.length < height) fitted.push(padCells("", width));
  return fitted;
}

function chooseSideWidth(cols, avatarWidth, minHostCols, { minRailWidth, maxRailWidth } = {}) {
  const tier = layoutTier(cols);
  const minRailBase = tier === "narrow" ? 22 : 24;
  const minRail = Math.max(minRailBase, Number(minRailWidth || 30));
  const availableForRail = Math.max(minRail, cols - minHostCols - 2);
  const maxRail = Math.max(minRail, Number(maxRailWidth || availableForRail));
  const requested = Number(avatarWidth);
  if (Number.isFinite(requested) && requested > 0) {
    return clamp(Math.round(requested + 6), minRail, Math.min(maxRail, availableForRail));
  }
  return clamp(availableForRail, minRail, maxRail);
}

function wrapLabel(label, value, width) {
  const prefix = `${label} `;
  const usable = Math.max(8, width - cellWidth(prefix));
  const wrapped = wrapCells(value || "", usable).map((line) => line.trimEnd());
  if (wrapped.length === 0) return [prefix.trimEnd()];
  return wrapped.map((line, index) => index === 0 ? `${prefix}${line.trimEnd()}` : `${" ".repeat(cellWidth(prefix))}${line.trimEnd()}`);
}

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

/* ────────── Soul Says Bottom Strip ────────── */

const SAYS_VISIBILITY_STYLES = Object.freeze({
  hidden: { fg: null, border: "#2F3A4F" },
  dim: { fg: "#607080", border: "#2F3A4F" },
  normal: { fg: "#B0BEC5", border: "#4A6080" },
  bright: { fg: "#E0F0FF", border: "#70A0D0" },
  guard: { fg: "#FF9966", border: "#CC6633" }
});

const SAYS_INTENT_ICONS = Object.freeze({
  micro_status: "◌",
  mood_reflection: "◎",
  risk_guard: "⚠",
  plan_marker: "▸",
  tool_watch: "⟐",
  failure_recovery: "↺",
  success_release: "✓",
  memory_echo: "❋",
  user_alignment: "↵",
  ambient_whisper: "◌",
  ritual_open: "☀",
  ritual_close: "☾",
  subagent_comment: "⤴",
  web_research_note: "⊛",
  apology_or_recalibration: "↻",
  silent: " "
});

function resolveSoulSaysForDisplay(soul = {}) {
  const llmText = String(soul.says?.main || soul.reply || soul.narration || "").replace(/\s+/g, " ").trim();
  if (llmText && !isGenericSoulReply(llmText)) {
    const moodTags = Array.isArray(soul.mood?.tags) ? soul.mood.tags : [];
    const mood = moodTags[0] || soul.mood?.discrete || "calm";
    const speechAct = soul.says?.speechAct || "reflect";
    const intentMap = {
      answer: "user_alignment",
      warn: "risk_guard",
      suggest: "plan_marker",
      reflect: "mood_reflection",
      confirm: "success_release"
    };
    return {
      action: "emit",
      state: "speaking",
      frame: {
        text: llmText,
        visibility: speechAct === "warn" ? "guard" : "bright",
        intent: intentMap[speechAct] || "mood_reflection",
        meta: {
          mood,
          pulseBpm: Math.round(Number(soul.heartBpm || soul.mood?.heartbeatBpm || 62)),
          pulseEvent: soul.pulseEvent || "steady",
          stance: soul.presence || "observe",
          presenceMode: soul.presence || "ambient"
        },
        trace: {
          source: "llm-says",
          llmUsed: Boolean(soul.provenance?.llmRunId)
        }
      }
    };
  }

  const current = soul?.v2Frame?.soulSays || null;
  if (current && current.action !== "silent" && current.frame?.text) return current;
  const history = Array.isArray(current?.history) ? current.history : [];
  const lastHistoryFrame = history.length > 0 ? history[history.length - 1] : null;
  if (lastHistoryFrame?.text) {
    return {
      action: "speak",
      state: current?.state || "speaking",
      frame: lastHistoryFrame,
      history: current?.history || []
    };
  }
  return current;
}

export function renderSoulSaysStrip(soulSays, width, theme, caps, language = "en") {
  const w = Math.max(20, width || 80);
  const is24bit = (caps?.colorDepth || 0) >= 24;

  if (!soulSays || soulSays.action === "silent" || !soulSays.frame) {
    return renderSaysQuietStrip(soulSays, w, is24bit, theme, caps, language);
  }

  const frame = soulSays.frame;
  const vis = SAYS_VISIBILITY_STYLES[frame.visibility] || SAYS_VISIBILITY_STYLES.normal;
  const icon = SAYS_INTENT_ICONS[frame.intent] || "◌";
  const meta = frame.meta || {};
  const bpmStr = String(meta.pulseBpm || 62);
  const evtStr = localizeTerm(language, meta.pulseEvent || "steady");
  const moodStr = localizeTerm(language, meta.mood || "calm");
  const stanceStr = localizeTerm(language, meta.stance || "observe");
  const presenceStr = localizeTerm(language, meta.presenceMode || "ambient");

  const borderColor = vis.border;
  const textColor = vis.fg || "#607080";

  if (w < 28) {
    const narrowText = padCells(truncateCells(`${icon} ${moodStr}/${stanceStr} ♥${bpmStr}  "${truncateCells(frame.text, Math.max(6, w - 28))}"`, w), w);
    if (is24bit) return [style(narrowText, { fg: textColor })];
    return [paint(narrowText, "muted", theme, caps)];
  }

  const topBorderChar = "─";
  const topLabel = `┌ ${railText(language, "soulSays")} `;
  const topLeft = is24bit ? style(topLabel, { fg: borderColor }) : paint(topLabel, "border", theme, caps);
  const topPad = topBorderChar.repeat(Math.max(0, w - cellWidth(topLabel) - 1));
  const topBorder = is24bit ? style(topPad + "┐", { fg: borderColor }) : paint(topPad + "┐", "border", theme, caps);

  const metaCapsule = `${icon} ${moodStr} + ${stanceStr}     ♥${bpmStr} ${evtStr}     ${railText(language, "presence")}: ${presenceStr} / ${railText(language, "gaze")}: ${stanceStr}`;
  const metaLine = padCells(truncateCells(metaCapsule, w - 4), w - 4);
  const metaFormatted = is24bit
    ? style("│ ", { fg: borderColor }) + style(metaLine, { fg: "#7A90A5" }) + style(" │", { fg: borderColor })
    : paint("│ ", "border", theme, caps) + paint(metaLine, "muted", theme, caps) + paint(" │", "border", theme, caps);

  const quoteChar = "「";
  const quoteCharEnd = "」";
  const speechContent = `${quoteChar}${frame.text}${quoteCharEnd}`;
  const speechFormatted = wrapRailText(speechContent, Math.max(8, w - 4)).map((line) => {
    const speechLine = padCells(line, w - 4);
    return is24bit
      ? style("│ ", { fg: borderColor }) + style(speechLine, { fg: textColor }) + style(" │", { fg: borderColor })
      : paint("│ ", "border", theme, caps) + paint(speechLine, "text", theme, caps) + paint(" │", "border", theme, caps);
  });

  const botPad = topBorderChar.repeat(Math.max(0, w - 2));
  const botBorder = is24bit ? style("└" + botPad + "┘", { fg: borderColor }) : paint("└" + botPad + "┘", "border", theme, caps);

  const lines = [topLeft + topBorder, metaFormatted, ...speechFormatted];

  if (soulSays.frame?.trace && caps?.debug) {
    const src = frame.trace.source || "llm";
    const causes = (frame.trace.causeIds || []).slice(0, 3).join(", ");
    const traceLine = `cause: ${causes || "—"}     source: ${src}${frame.trace.llmUsed ? " + LLM" : ""}`;
    const traceFormatted = is24bit
      ? style("│ ", { fg: borderColor }) + style(padCells(truncateCells(traceLine, w - 4), w - 4), { fg: "#506070" }) + style(" │", { fg: borderColor })
      : paint("│ ", "border", theme, caps) + paint(padCells(truncateCells(traceLine, w - 4), w - 4), "muted", theme, caps) + paint(" │", "border", theme, caps);
    lines.push(traceFormatted);
  }

  lines.push(botBorder);
  return lines;
}

function renderSaysQuietStrip(soulSays, w, is24bit, theme, caps, language = "en") {
  const state = soulSays?.state || "silent";
  const stateIcons = { silent: "◌", primed: "◐", composing: "◑", ambient: "◌", cooling: "◒" };
  const icon = stateIcons[state] || "◌";
  const label = `${icon} ${railText(language, "soulSilent")} ${localizeTerm(language, state)}`;
  const line = padCells(truncateCells(label, w), w);
  if (is24bit) return [style(line, { fg: "#3A4A5A" })];
  return [paint(line, "muted", theme, caps)];
}

/**
 * Convert a soul-bios SoulFrame into the snapshot shape that renderLifeTuiPanel consumes.
 * This bridges the new seven-layer runtime to the existing TUI rendering pipeline.
 *
 * @param {object} frame - SoulFrame from engine.tick()
 * @param {{ personaName?: string, title?: string, llmStats?: object, memoryStats?: object, lastSignal?: string }} [options]
 */
export function soulFrameToTuiSnapshot(frame, options = {}) {
  if (!frame || typeof frame !== "object") return createLifeSnapshot({ title: "termvis" });
  const mood = frame.mood || {};
  const pulse = frame.pulse || {};
  const expr = frame.expression || {};
  const says = frame.says || {};
  const presence = frame.presence || {};
  const host = frame.host || {};
  const provenance = frame.provenance || {};

  const discreteTag = Array.isArray(mood.tags) && mood.tags.length > 0 ? mood.tags[0] : "calm";
  const moodFrame = createMoodFrame({
    discrete: discreteTag,
    valence: mood.valence,
    arousal: mood.arousal,
    dominance: mood.dominance,
    heartbeatBpm: pulse.heartbeatBpm,
    breathMs: pulse.breathMs
  });
  // Preserve the structured tags for richer TUI display
  const fullMood = { ...moodFrame, tags: Array.isArray(mood.tags) ? [...mood.tags] : [] };

  const faceToHint = {
    idle: "idle",
    blink: "blink",
    think: "thinking",
    thinking: "thinking",
    speak: "speaking",
    speaking: "speaking",
    smile: "warm",
    warn: "guarded",
    "soft-smile": "soft-smile",
    "warm-smile": "warm-smile",
    warm: "warm",
    guarded: "guarded",
    guard: "guarded",
    curious: "curious",
    scan: "scan",
    focus: "focused",
    focused: "focused",
    sleepy: "sleepy",
    tired: "tired",
    dim: "dim",
    sparkle: "sparkle",
    flinch: "guarded",
    frown: "tired",
    repair: "repair",
    nod: "nod",
    "far-look": "far-look",
    apologetic: "apologetic"
  };
  const phaseFromPresence = {
    dormant: SOUL_PHASES.dormant,
    ambient: SOUL_PHASES.idle,
    attentive: SOUL_PHASES.attentive,
    foreground: SOUL_PHASES.thinking
  };

  const v2 = frame.v2Frame || options.v2Frame || null;
  const v2Visual = v2?.visual || {};
  const persona = options.persona && typeof options.persona === "object"
    ? { ...options.persona }
    : { name: options.personaName || "Termvis Soul", id: frame.sessionId || "soul" };
  if (!persona.name) persona.name = options.personaName || "Termvis Soul";
  if (!persona.id) persona.id = frame.sessionId || "soul";

  const soulState = {
    enabled: true,
    sessionId: frame.sessionId || "",
    mode: "companion",
    persona,
    mood: fullMood,
    soulPhase: phaseFromPresence[presence.mode] || SOUL_PHASES.idle,
    presence: presence.mode === "foreground" ? "focus" : presence.mode === "attentive" ? "active" : "ambient",
    attention: presence.attention,
    narration: says.main || "",
    reply: says.main || "",
    says: Object.keys(says).length > 0 ? { ...says } : null,
    heartBpm: pulse.heartbeatBpm || moodFrame.heartbeatBpm,
    aura: discreteTag === "guarded" ? "guarded" : discreteTag === "delighted" ? "warm" : "soft",
    renderHints: {
      expression: faceToHint[expr.face] || "idle",
      intensity: expr.intensity ?? 1,
      showHeartbeat: true
    },
    events: options.llmStats?.totalCalls ?? 0,
    systemEvents: Array.isArray(provenance.signalRefs)
      ? provenance.signalRefs.filter((ref) => ref !== "tick:nosignal").length
      : 0,
    lastSource: "soul-bios",
    lastSignal: options.lastSignal,
    updatedAt: frame.ts,
    llmStats: options.llmStats || null,
    memoryStats: options.memoryStats || null,
    provenance: {
      signalRefs: Array.isArray(provenance.signalRefs) ? [...provenance.signalRefs].slice(0, 8) : [],
      ruleRefs: Array.isArray(provenance.ruleRefs) ? [...provenance.ruleRefs].slice(0, 8) : [],
      memoryRefs: Array.isArray(provenance.memoryRefs) ? [...provenance.memoryRefs].slice(0, 4) : [],
      llmRunId: provenance.llmRunId || null
    },
    v2Frame: v2,
    v2Visual
  };

  const hostStateMap = {
    plan: "reasoning", build: "acting", chat: "listening", review: "observing", unspecified: "listening"
  };

  return {
    ...createLifeSnapshot({
      title: options.title || "termvis living shell",
      host: host.host || "terminal",
      state: hostStateMap[host.mode] || "listening"
    }),
    soul: soulState
  };
}

function saveCursor() {
  return "\u001b7";
}

function restoreCursor() {
  return "\u001b8";
}

function hideCursor() {
  return "\u001b[?25l";
}

function showCursor() {
  return "\u001b[?25h";
}

function enterAlternateScreen() {
  return "\u001b[?1049h";
}

function leaveAlternateScreen() {
  return "\u001b[?1049l";
}

function clearScreen() {
  return "\u001b[2J\u001b[H";
}

function cursorTo(row, col) {
  return `\u001b[${row};${col}H`;
}

function resetScrollRegion() {
  return "\u001b[r";
}

function clearHostViewport({ hostLeft = 1, hostRows = 24, terminalCols = 80, top = 1 } = {}) {
  const lines = [];
  for (let row = top; row < top + hostRows; row += 1) {
    lines.push(`${cursorTo(row, hostLeft)}${" ".repeat(Math.max(0, terminalCols - hostLeft + 1))}`);
  }
  return `${saveCursor()}${lines.join("")}${cursorTo(top, hostLeft)}${restoreCursor()}`;
}
