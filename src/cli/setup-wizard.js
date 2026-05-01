import { createInterface } from "node:readline";
import {
  USER_CONFIG_FILE,
  DEFAULT_CONFIG,
  loadUserConfigSync,
  saveUserConfigSync,
  mergeConfig,
  sanitizeConfigSecrets,
  validateUserConfig,
  loadSecretsSync,
  saveSecretsSync
} from "../core/config.js";

const CONFIG_FILE = USER_CONFIG_FILE;

const LANGUAGES = Object.freeze([
  { value: "en", label: "English", desc: "English UI" },
  { value: "zh", label: "中文", desc: "中文界面" },
  { value: "ja", label: "日本語", desc: "日本語UI" }
]);

const TEXT = Object.freeze({
  en: {
    title: "Termvis - Soul Setup Wizard",
    language: "Choose language / 选择语言 / 言語を選択",
    provider: "Select your LLM provider:",
    embedding: "Select embedding provider:",
    avatarSection: "Avatar Configuration",
    avatarSource: "Avatar image source:",
    displaySection: "Display Preferences",
    theme: "Color theme:",
    presence: "Presence style:",
    personaName: "Soul persona name",
    profileId: "Profile id",
    role: "Role",
    archetype: "Persona archetype:",
    style: "Speaking style",
    traits: "Traits (comma separated)",
    saved: "Configuration saved",
    run: "Run: termvis life -- codex",
    settings: "Settings: termvis setting",
    choose: "Choose (1-{count})",
    config: "Config",
    current: "current",
    apiKeyInput: "API key (sk-... or env var name like DEEPSEEK_API_KEY)",
    ollamaBase: "Ollama base URL",
    compatibleBase: "OpenAI-compatible API base URL",
    deepseekBase: "DeepSeek API base URL",
    model: "Model",
    modelName: "Model name",
    codexModel: "Codex model override (blank uses Codex default)",
    avatarPath: "Path to avatar image",
    avatarUrl: "Avatar image URL",
    apiKeySaved: "API key saved securely.",
    apiKeyEnvHint: "Using env var"
  },
  zh: {
    title: "Termvis - 灵魂设置向导",
    language: "Choose language / 选择语言 / 言語を選択",
    provider: "选择 LLM 提供方：",
    embedding: "选择嵌入提供方：",
    avatarSection: "角色图像设置",
    avatarSource: "角色图像来源：",
    displaySection: "显示偏好",
    theme: "配色主题：",
    presence: "存在感风格：",
    personaName: "角色名称",
    profileId: "配置档案 ID",
    role: "角色定位",
    archetype: "人格原型：",
    style: "说话风格",
    traits: "人格特质（逗号分隔）",
    saved: "配置已保存",
    run: "运行：termvis life -- codex",
    settings: "设置：termvis setting",
    choose: "选择（1-{count}）",
    config: "配置",
    current: "当前",
    apiKeyInput: "API key（直接粘贴 sk-... 或输入环境变量名）",
    ollamaBase: "Ollama 基础 URL",
    compatibleBase: "OpenAI 兼容 API 基础 URL",
    deepseekBase: "DeepSeek API 基础 URL",
    model: "模型",
    modelName: "模型名称",
    codexModel: "Codex 模型覆盖（留空使用 Codex 默认）",
    avatarPath: "角色图像路径",
    avatarUrl: "角色图像 URL",
    apiKeySaved: "API key 已安全保存。",
    apiKeyEnvHint: "使用环境变量"
  },
  ja: {
    title: "Termvis - ソウル設定ウィザード",
    language: "Choose language / 选择语言 / 言語を選択",
    provider: "LLMプロバイダーを選択：",
    embedding: "埋め込みプロバイダーを選択：",
    avatarSection: "アバター設定",
    avatarSource: "アバター画像のソース：",
    displaySection: "表示設定",
    theme: "カラーテーマ：",
    presence: "プレゼンススタイル：",
    personaName: "ソウル名",
    profileId: "プロファイルID",
    role: "役割",
    archetype: "ペルソナ原型：",
    style: "話し方",
    traits: "特徴（カンマ区切り）",
    saved: "設定を保存しました",
    run: "実行：termvis life -- codex",
    settings: "設定：termvis setting",
    choose: "選択（1-{count}）",
    config: "設定",
    current: "現在",
    apiKeyInput: "APIキー（sk-...を貼り付け、または環境変数名を入力）",
    ollamaBase: "OllamaベースURL",
    compatibleBase: "OpenAI互換APIベースURL",
    deepseekBase: "DeepSeek APIベースURL",
    model: "モデル",
    modelName: "モデル名",
    codexModel: "Codexモデル上書き（空欄でCodex既定）",
    avatarPath: "アバター画像パス",
    avatarUrl: "アバター画像URL",
    apiKeySaved: "APIキーを安全に保存しました。",
    apiKeyEnvHint: "環境変数を使用"
  }
});

function normalizeLanguage(value) {
  const lang = String(value || "").toLowerCase();
  if (lang.startsWith("zh") || lang === "cn") return "zh";
  if (lang.startsWith("ja") || lang === "jp") return "ja";
  return "en";
}

function t(lang, key) {
  return TEXT[normalizeLanguage(lang)]?.[key] || TEXT.en[key] || key;
}

function loadConfig() {
  return loadUserConfigSync();
}

function saveConfig(config) {
  return saveUserConfigSync(config);
}

function stripConfigSecrets(config = {}) {
  return sanitizeConfigSecrets(structuredClone(config));
}

async function ask(rl, question, defaultValue) {
  return new Promise((resolve) => {
    const hasDefault = defaultValue !== undefined && defaultValue !== null && String(defaultValue) !== "";
    const prompt = hasDefault ? `${question} [${defaultValue}]: ` : `${question}: `;
    rl.question(prompt, (answer) => {
      const text = answer.trim();
      resolve(text || (defaultValue !== undefined ? String(defaultValue) : ""));
    });
  });
}

async function choose(rl, question, options, defaultIdx = 0, language = "en") {
  const safeDefaultIdx = Math.max(0, Math.min(options.length - 1, Number.isFinite(defaultIdx) ? defaultIdx : 0));
  console.log(`\n${question}`);
  options.forEach((opt, i) => {
    const marker = i === safeDefaultIdx ? "●" : "○";
    console.log(`  ${marker} ${i + 1}. ${opt.label}${opt.desc ? ` — ${opt.desc}` : ""}`);
  });
  const answer = await ask(rl, t(language, "choose").replace("{count}", String(options.length)), String(safeDefaultIdx + 1));
  const idx = Math.max(0, Math.min(options.length - 1, parseInt(answer, 10) - 1));
  return options[idx].value;
}

function hasFlag(argv, name) {
  return Array.isArray(argv) && argv.includes(name);
}

function readOption(argv, name, fallback = undefined) {
  if (!Array.isArray(argv)) return fallback;
  const index = argv.indexOf(name);
  if (index === -1) return fallback;
  const value = argv[index + 1];
  if (value === undefined || value === "" || String(value).startsWith("--")) return fallback;
  return value;
}

function normalizeProviderFlag(value) {
  const provider = String(value || "codex").toLowerCase();
  if (provider === "openai-compatible") return "compatible";
  return provider;
}

function providerEnvVar(provider) {
  return ({
    auto: "OPENAI_API_KEY",
    openai: "OPENAI_API_KEY",
    deepseek: "DEEPSEEK_API_KEY",
    anthropic: "ANTHROPIC_API_KEY",
    compatible: "OPENAI_API_KEY"
  })[provider] || "";
}

function isEnvVarName(value) {
  return /^[A-Za-z_][A-Za-z0-9_]*$/.test(String(value || ""));
}

function looksLikeApiKey(value) {
  const text = String(value || "").trim();
  if (!text) return false;
  if (isEnvVarName(text)) return false;
  return /^sk[-_]/.test(text) || /^[a-f0-9]{32,}$/i.test(text) || text.includes("-");
}

function normalizeApiKeyEnv(provider, value) {
  const text = String(value || "").trim();
  if (isEnvVarName(text)) return text;
  return providerEnvVar(normalizeProviderFlag(provider)) || undefined;
}

/**
 * If value looks like a raw API key rather than an env var name,
 * inject it into env[envVarName], persist to secrets.json, and return the env var name.
 * Otherwise return the value as-is (treated as env var name).
 */
function resolveApiKeyInput(provider, value, env = process.env) {
  const text = String(value || "").trim();
  const normalized = normalizeProviderFlag(provider);
  if (!text) return { envName: providerEnvVar(normalized) };
  if (isEnvVarName(text)) return { envName: text };
  const envName = providerEnvVar(normalized) || "LLM_API_KEY";
  env[envName] = text;
  try {
    const secrets = loadSecretsSync();
    secrets[normalized] = text;
    saveSecretsSync(secrets);
  } catch { /* best-effort */ }
  return { envName, injected: true };
}

function clampDial(value, fallback = 1) {
  const next = Number.parseInt(String(value ?? ""), 10);
  if (!Number.isFinite(next)) return fallback;
  return Math.max(0, Math.min(3, next));
}

function splitTraits(value, fallback = []) {
  if (Array.isArray(value)) return value.map((item) => String(item).trim()).filter(Boolean).slice(0, 8);
  const text = String(value || "").trim();
  if (!text) return fallback;
  return text.split(/[,\n;]+/u).map((item) => item.trim()).filter(Boolean).slice(0, 8);
}

function getPersona(config) {
  return config.life?.soul?.persona || config.cognition?.persona || {};
}

function getLlm(config) {
  return config.cognition?.llm || {};
}

/**
 * Build a complete user config by merging user-provided values on top of existing.
 * Only sets fields that the user explicitly provided; preserves everything else.
 */
function buildConfig({
  existing = {},
  provider,
  apiKeyEnv,
  apiBase,
  model,
  embedProvider,
  avatarPath,
  themeName,
  presenceMode,
  personaName,
  personaProfile,
  personaRole,
  personaArchetype,
  personaStyle,
  personaTraits,
  brevity,
  warmth,
  metaphor,
  emoji,
  language
} = {}) {
  const config = structuredClone(existing);

  // --- ui ---
  if (language !== undefined) {
    config.ui = config.ui || {};
    config.ui.language = normalizeLanguage(language);
  }

  // --- cognition.llm ---
  const normalizedProvider = provider !== undefined ? normalizeProviderFlag(provider) : undefined;
  if (normalizedProvider !== undefined) {
    config.cognition = config.cognition || {};
    config.cognition.llm = config.cognition.llm || {};
    config.cognition.llm.provider = normalizedProvider === "compatible" ? "openai" : normalizedProvider;
    config.cognition.enabled = normalizedProvider !== "none";
  }
  if (model !== undefined && model !== "") {
    config.cognition = config.cognition || {};
    config.cognition.llm = config.cognition.llm || {};
    config.cognition.llm.model = model;
  }
  if (apiKeyEnv !== undefined) {
    config.cognition = config.cognition || {};
    config.cognition.llm = config.cognition.llm || {};
    const envName = normalizeApiKeyEnv(normalizedProvider || config.cognition.llm.provider, apiKeyEnv);
    if (envName) config.cognition.llm.apiKeyEnv = envName;
  }
  if (apiBase !== undefined && apiBase !== "") {
    config.cognition = config.cognition || {};
    config.cognition.llm = config.cognition.llm || {};
    config.cognition.llm.baseURL = apiBase;
  }
  if (config.cognition?.llm) {
    delete config.cognition.llm.apiKey;
    if (!config.cognition.llm.apiKeyEnv) delete config.cognition.llm.apiKeyEnv;
    if (!config.cognition.llm.baseURL) delete config.cognition.llm.baseURL;
  }

  // --- cognition.embedding ---
  if (embedProvider !== undefined) {
    config.cognition = config.cognition || {};
    config.cognition.embedding = config.cognition.embedding || {};
    config.cognition.embedding.provider = embedProvider === "same" ? "auto" : embedProvider;
  }

  // --- theme ---
  if (themeName !== undefined) {
    config.theme = config.theme || {};
    config.theme.name = themeName;
  }

  // --- life.avatar ---
  if (avatarPath !== undefined) {
    config.life = config.life || {};
    const text = String(avatarPath || "").trim();
    config.life.avatar = (!text || text === "default") ? null : text;
  }

  // --- soulBios.initialConsentLevel (presence mode) ---
  if (presenceMode !== undefined) {
    config.soulBios = config.soulBios || {};
    config.soulBios.initialConsentLevel = presenceMode;
  }

  // --- persona (sync to both life.soul.persona and cognition.persona) ---
  const prevPersona = getPersona(config);
  const prevStyle = prevPersona.speakingStyle || {};
  const personaUpdates = {};
  let hasPersonaUpdate = false;

  if (personaName !== undefined) { personaUpdates.name = personaName; hasPersonaUpdate = true; }
  if (personaProfile !== undefined) { personaUpdates.id = personaProfile; hasPersonaUpdate = true; }
  if (personaRole !== undefined) { personaUpdates.role = personaRole; hasPersonaUpdate = true; }
  if (personaArchetype !== undefined) { personaUpdates.archetype = personaArchetype; hasPersonaUpdate = true; }
  if (personaStyle !== undefined) { personaUpdates.style = personaStyle; hasPersonaUpdate = true; }
  if (personaTraits !== undefined) { personaUpdates.traits = splitTraits(personaTraits, prevPersona.traits); hasPersonaUpdate = true; }
  if (language !== undefined) { personaUpdates.language = normalizeLanguage(language); hasPersonaUpdate = true; }

  const styleUpdates = {};
  let hasStyleUpdate = false;
  if (brevity !== undefined) { styleUpdates.brevity = clampDial(brevity, prevStyle.brevity ?? 2); hasStyleUpdate = true; }
  if (warmth !== undefined) { styleUpdates.warmth = clampDial(warmth, prevStyle.warmth ?? 2); hasStyleUpdate = true; }
  if (metaphor !== undefined) { styleUpdates.metaphor = clampDial(metaphor, prevStyle.metaphor ?? 1); hasStyleUpdate = true; }
  if (emoji !== undefined) { styleUpdates.emoji = clampDial(emoji, prevStyle.emoji ?? 0); hasStyleUpdate = true; }
  if (hasStyleUpdate) {
    personaUpdates.speakingStyle = { ...prevStyle, ...styleUpdates };
    hasPersonaUpdate = true;
  }

  if (hasPersonaUpdate) {
    const merged = { ...prevPersona, ...personaUpdates };
    config.life = config.life || {};
    config.life.soul = config.life.soul || {};
    config.life.soul.persona = merged;
    config.cognition = config.cognition || {};
    config.cognition.persona = merged;
  }

  // --- setup marker ---
  config.setupCompleted = true;
  config.setupAt = new Date().toISOString();

  return config;
}

export async function runSetupWizard(argv = [], io = {}) {
  const existing = loadConfig();
  if (hasFlag(argv, "--yes")) {
    const language = readOption(argv, "--language", readOption(argv, "--lang", existing.ui?.language));
    const provider = readOption(argv, "--provider", getLlm(existing).provider || "codex");
    const batchEnv = { ...(io.env || process.env) };
    const rawKeyInput = readOption(argv, "--api-key", readOption(argv, "--api-key-env", normalizeApiKeyEnv(normalizeProviderFlag(provider), getLlm(existing).apiKeyEnv)));
    const resolvedKey = resolveApiKeyInput(provider, rawKeyInput, batchEnv);
    const config = buildConfig({
      existing,
      language,
      provider,
      apiKeyEnv: resolvedKey.envName,
      apiBase: readOption(argv, "--api-base", getLlm(existing).baseURL),
      model: readOption(argv, "--model", getLlm(existing).model),
      embedProvider: readOption(argv, "--embedding", existing.cognition?.embedding?.provider),
      avatarPath: readOption(argv, "--avatar", existing.life?.avatar),
      themeName: readOption(argv, "--theme", existing.theme?.name),
      presenceMode: readOption(argv, "--presence", existing.soulBios?.initialConsentLevel),
      personaName: readOption(argv, "--name", getPersona(existing).name),
      personaProfile: readOption(argv, "--profile", getPersona(existing).id),
      personaRole: readOption(argv, "--role", getPersona(existing).role),
      personaArchetype: readOption(argv, "--archetype", getPersona(existing).archetype),
      personaStyle: readOption(argv, "--style", getPersona(existing).style),
      personaTraits: readOption(argv, "--traits"),
      brevity: readOption(argv, "--brevity"),
      warmth: readOption(argv, "--warmth"),
      metaphor: readOption(argv, "--metaphor"),
      emoji: readOption(argv, "--emoji")
    });
    saveConfig(config);
    const verification = await verifyLlmConfig(config, { env: batchEnv, cwd: io.cwd });
    io.stdout?.write?.(`termvis setup wrote ${CONFIG_FILE}\n`);
    printVerification(verification, language || "en", io);
    io.stdout?.write?.("Run: termvis doctor && termvis life -- codex\n");
    return config;
  }

  const rl = createInterface({ input: io.stdin || process.stdin, output: io.stdout || process.stdout });
  const language = await choose(
    rl,
    t(existing.ui?.language, "language"),
    LANGUAGES,
    Math.max(0, LANGUAGES.findIndex((item) => item.value === normalizeLanguage(existing.ui?.language))),
    existing.ui?.language || "en"
  );

  console.log("\n╔══════════════════════════════════════════╗");
  console.log(`║ ${t(language, "title").padEnd(40)} ║`);
  console.log("╚══════════════════════════════════════════╝\n");

  const provider = await choose(rl, t(language, "provider"), [
    { label: "Codex CLI", value: "codex", desc: "Uses your existing Codex login; recommended for Codex users" },
    { label: "OpenAI", value: "openai", desc: "OpenAI Chat Completions with structured output" },
    { label: "DeepSeek", value: "deepseek", desc: "DeepSeek Chat API with DEEPSEEK_API_KEY" },
    { label: "Anthropic", value: "anthropic", desc: "Claude Messages API" },
    { label: "Ollama (local)", value: "ollama", desc: "Local models, no API key needed" },
    { label: "OpenAI-compatible", value: "compatible", desc: "DeepSeek/OpenRouter/local gateways with /v1/chat/completions" },
    { label: "Disable cognition", value: "none", desc: "No LLM calls" }
  ], 0, language);

  let apiKeyEnv;
  let apiBase;
  let model;
  const setupEnv = { ...(io.env || process.env) };

  const prevLlm = getLlm(existing);

  if (!["none", "ollama", "codex"].includes(provider)) {
    const envVar = providerEnvVar(provider);
    const existingKey = setupEnv[envVar];
    const defaultHint = existingKey ? envVar : "";
    const rawKeyInput = await ask(rl, t(language, "apiKeyInput"), defaultHint);
    const resolved = resolveApiKeyInput(provider, rawKeyInput, setupEnv);
    apiKeyEnv = resolved.envName;
    if (resolved.injected) {
      console.log(`  ✓ ${t(language, "apiKeySaved")}`);
    } else if (apiKeyEnv && setupEnv[apiKeyEnv]) {
      console.log(`  ✓ ${t(language, "apiKeyEnvHint")}: ${apiKeyEnv}`);
    }
  }

  if (provider === "ollama") {
    apiBase = await ask(rl, t(language, "ollamaBase"), prevLlm.baseURL || "http://localhost:11434");
    model = await ask(rl, t(language, "modelName"), prevLlm.model || "llama3.2");
  } else if (provider === "compatible") {
    apiBase = await ask(rl, t(language, "compatibleBase"), prevLlm.baseURL || "");
    model = await ask(rl, t(language, "modelName"), prevLlm.model || "");
  } else if (provider === "deepseek") {
    apiBase = await ask(rl, t(language, "deepseekBase"), prevLlm.baseURL || "https://api.deepseek.com/v1");
    model = await ask(rl, t(language, "model"), prevLlm.model || "deepseek-chat");
  } else if (provider === "openai") {
    model = await ask(rl, t(language, "model"), prevLlm.model || "gpt-4o-mini");
  } else if (provider === "anthropic") {
    model = await ask(rl, t(language, "model"), prevLlm.model || "claude-haiku-4.5");
  } else if (provider === "codex") {
    model = await ask(rl, t(language, "codexModel"), prevLlm.model || "");
  }

  const embedProvider = await choose(rl, t(language, "embedding"), [
    { label: "Same as LLM provider", value: "same", desc: "Uses the same API" },
    { label: "Local lexical", value: "lexical", desc: "No API calls; deterministic local embeddings" },
    { label: "Ollama", value: "ollama", desc: "Local embedding model" }
  ], 1, language);

  console.log(`\n─── ${t(language, "avatarSection")} ───`);
  const avatarSource = await choose(rl, t(language, "avatarSource"), [
    { label: "Default avatar", value: "default", desc: "Built-in character image" },
    { label: "Custom file path", value: "custom", desc: "PNG/GIF/WEBP file" },
    { label: "URL", value: "url", desc: "Download from URL" }
  ], 0, language);

  let avatarPath;
  if (avatarSource === "custom") {
    avatarPath = await ask(rl, t(language, "avatarPath"), "");
  } else if (avatarSource === "url") {
    avatarPath = await ask(rl, t(language, "avatarUrl"), "");
  } else {
    avatarPath = "default";
  }

  console.log(`\n─── ${t(language, "displaySection")} ───`);
  const themeName = await choose(rl, t(language, "theme"), [
    { label: "Moon White Flow", value: "moon-white-flow", desc: "Soft moonlight palette" },
    { label: "Neon Vein", value: "neon-vein", desc: "Cyberpunk neon palette" },
    { label: "Dawn Glass", value: "dawn-glass", desc: "Clean morning palette" }
  ], 0, language);

  const presenceMode = await choose(rl, t(language, "presence"), [
    { label: "Minimal", value: "minimal", desc: "Quiet, less speech" },
    { label: "Balanced", value: "balanced", desc: "Default mode" },
    { label: "Expressive", value: "expressive", desc: "More reactions and speech" }
  ], 1, language);

  const prevPersona = getPersona(existing);
  const personaName = await ask(rl, t(language, "personaName"), prevPersona.name || "Termvis Soul");
  const personaProfile = await ask(rl, t(language, "profileId"), prevPersona.id || "default");
  const personaRole = await ask(rl, t(language, "role"), prevPersona.role || "terminal companion");
  const personaArchetype = await choose(rl, t(language, "archetype"), [
    { label: "Warm Scout", value: "warm-scout", desc: "warm, alert, practical" },
    { label: "Quiet Oracle", value: "quiet-oracle", desc: "calm, restrained, reflective" },
    { label: "Playful Synth", value: "playful-synth", desc: "lively, expressive, kinetic" },
    { label: "Custom", value: "custom", desc: "use role/style/traits as the primary profile" }
  ], 0, language);
  const personaStyle = await ask(rl, t(language, "style"), prevPersona.style || "warm, concise, responsive");
  const personaTraits = await ask(rl, t(language, "traits"), (prevPersona.traits || ["warm", "attentive", "adaptive"]).join(","));

  const config = buildConfig({
    existing,
    language,
    provider,
    apiKeyEnv,
    apiBase,
    model,
    embedProvider,
    avatarPath,
    themeName,
    presenceMode,
    personaName,
    personaProfile,
    personaRole,
    personaArchetype,
    personaStyle,
    personaTraits
  });

  saveConfig(config);

  console.log("\n╔══════════════════════════════════════════╗");
  console.log(`║  ✓ ${t(language, "saved").padEnd(35)}║`);
  console.log(`║  ${t(language, "config")}: ${CONFIG_FILE.padEnd(32)}║`);
  console.log("╚══════════════════════════════════════════╝");

  const verification = await verifyLlmConfig(config, { env: setupEnv, cwd: io.cwd });
  printVerification(verification, language, { stdout: process });
  console.log(`\n${t(language, "run")}`);
  console.log(`${t(language, "settings")}\n`);

  rl.close();
  return config;
}

/**
 * Verify that the configured LLM provider can actually be instantiated
 * with the current environment. Returns a diagnostic object.
 */
export async function verifyLlmConfig(config, { env = process.env, cwd } = {}) {
  const merged = mergeConfig(structuredClone(DEFAULT_CONFIG), config);
  const provider = merged.cognition?.llm?.provider || "auto";
  if (provider === "none") {
    return { ok: true, provider: "none", message: "Cognition disabled — no LLM needed." };
  }
  try {
    const { injectSecretsIntoEnv } = await import("../core/config.js");
    injectSecretsIntoEnv(env);
    const { createLLMProvider } = await import("../cognition/llm-provider.js");
    const llm = await createLLMProvider({ env, config: merged, cwd });
    if (!llm || llm.available === false) {
      const envVar = merged.cognition?.llm?.apiKeyEnv || providerEnvVar(provider);
      return {
        ok: false,
        provider,
        envVar,
        message: `LLM provider "${provider}" not available. ` +
          (envVar ? `Set environment variable ${envVar} in your shell profile.` : "Check provider configuration.")
      };
    }
    return { ok: true, provider: llm.name, model: llm.model, message: `LLM OK: ${llm.name} (${llm.model || "default"})` };
  } catch (err) {
    return { ok: false, provider, message: `LLM verification failed: ${err?.message || err}` };
  }
}

const VERIFY_TEXT = Object.freeze({
  en: { verifying: "Verifying LLM configuration...", ok: "LLM", warn: "LLM WARNING" },
  zh: { verifying: "正在验证 LLM 配置...", ok: "LLM", warn: "LLM 警告" },
  ja: { verifying: "LLM設定を検証中...", ok: "LLM", warn: "LLM 警告" }
});

function printVerification(result, lang = "en", io = {}) {
  const vt = VERIFY_TEXT[normalizeLanguage(lang)] || VERIFY_TEXT.en;
  const write = (text) => {
    if (io.stdout?.write) io.stdout.write(text);
    else console.log(text.replace(/\n$/, ""));
  };
  if (result.ok) {
    write(`  ✓ ${vt.ok}: ${result.message}\n`);
  } else {
    write(`  ✗ ${vt.warn}: ${result.message}\n`);
  }
}

export { CONFIG_FILE, loadConfig, saveConfig, buildConfig, stripConfigSecrets, normalizeApiKeyEnv, resolveApiKeyInput, printVerification };
