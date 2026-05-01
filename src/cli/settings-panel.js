import { createInterface } from "node:readline";
import { buildConfig, loadConfig, saveConfig, CONFIG_FILE, stripConfigSecrets, normalizeApiKeyEnv, resolveApiKeyInput } from "./setup-wizard.js";

const LANGUAGES = Object.freeze([
  { value: "en", label: "English" },
  { value: "zh", label: "中文" },
  { value: "ja", label: "日本語" }
]);

const TEXT = Object.freeze({
  en: {
    language: "Choose language / 选择语言 / 言語を選択",
    title: "Termvis Settings",
    current: "Current Settings",
    provider: "LLM Provider",
    model: "Model",
    theme: "Theme",
    persona: "Persona",
    presence: "Presence",
    avatar: "Avatar",
    config: "Config",
    action: "What would you like to change?",
    choose: "Choose",
    chooseCancel: "Choose (1-{count}, or Enter to cancel)",
    chooseDefault: "Choose (1-{count})",
    currentMark: "current",
    selectProvider: "Select provider:",
    selectTheme: "Select theme:",
    selectPresence: "Presence style:",
    llmAction: "LLM Provider & API Env",
    modelAction: "Model",
    themeAction: "Theme",
    personaAction: "Persona Profile",
    presenceAction: "Presence Style",
    avatarAction: "Avatar Image",
    accessibilityAction: "Accessibility",
    embeddingAction: "Embedding Provider",
    exportAction: "Export config path",
    resetAction: "Reset to defaults",
    exitAction: "Exit",
    saved: "Settings saved",
    restart: "Restart any running termvis session to apply changes.",
    keep: "Enter keeps the current value.",
    apiKeyInput: "API key (sk-... or env var name)",
    apiBase: "API base URL",
    modelName: "Model name",
    personaName: "Persona name",
    profileId: "Profile id",
    role: "Role",
    style: "Speaking style",
    traits: "Traits (comma separated)",
    archetype: "Archetype:",
    avatarPath: "Avatar image path ('default' resets)",
    selectEmbedding: "Select embedding provider:",
    reduceMotion: "Reduce motion (true/false)",
    screenReader: "Screen reader mode (true/false)",
    noColor: "Respect NO_COLOR (true/false)",
    language: "Language",
    accessibility: "Accessibility",
    embedding: "Embedding",
    apiKeyEnv: "API Key Env",
    resetConfirm: "Reset all settings? (yes/no)",
    resetDone: "Settings reset to defaults",
    configFile: "Config file",
    apiKeySaved: "API key saved securely.",
    apiKeyEnvHint: "Using env var"
  },
  zh: {
    language: "Choose language / 选择语言 / 言語を選択",
    title: "Termvis 设置",
    current: "当前设置",
    provider: "LLM 提供方",
    model: "模型",
    theme: "主题",
    persona: "角色",
    presence: "存在感",
    avatar: "角色图像",
    config: "配置",
    action: "要修改哪一项？",
    choose: "选择",
    chooseCancel: "选择（1-{count}，直接回车取消）",
    chooseDefault: "选择（1-{count}）",
    currentMark: "当前",
    selectProvider: "选择提供方：",
    selectTheme: "选择主题：",
    selectPresence: "存在感风格：",
    llmAction: "LLM 提供方与环境变量",
    modelAction: "模型",
    themeAction: "主题",
    personaAction: "角色档案",
    presenceAction: "存在感风格",
    avatarAction: "角色图像",
    accessibilityAction: "无障碍",
    embeddingAction: "嵌入提供方",
    exportAction: "显示配置路径",
    resetAction: "重置默认值",
    exitAction: "退出",
    saved: "设置已保存",
    restart: "重启正在运行的 termvis 会话后生效。",
    keep: "直接回车会保留当前值。",
    apiKeyInput: "API key（直接粘贴 sk-... 或输入环境变量名）",
    apiBase: "API 基础 URL",
    modelName: "模型名称",
    personaName: "角色名称",
    profileId: "档案 ID",
    role: "角色定位",
    style: "说话风格",
    traits: "人格特质（逗号分隔）",
    archetype: "人格原型：",
    avatarPath: "角色图像路径（输入 default 重置）",
    selectEmbedding: "选择嵌入提供方：",
    reduceMotion: "减少动态效果（true/false）",
    screenReader: "屏幕阅读器模式（true/false）",
    noColor: "遵守 NO_COLOR（true/false）",
    language: "语言",
    accessibility: "无障碍",
    embedding: "嵌入",
    apiKeyEnv: "API Key 环境变量",
    resetConfirm: "确定重置全部设置？（yes/no）",
    resetDone: "设置已重置为默认值",
    configFile: "配置文件",
    apiKeySaved: "API key 已安全保存。",
    apiKeyEnvHint: "使用环境变量"
  },
  ja: {
    language: "Choose language / 选择语言 / 言語を選択",
    title: "Termvis 設定",
    current: "現在の設定",
    provider: "LLMプロバイダー",
    model: "モデル",
    theme: "テーマ",
    persona: "ペルソナ",
    presence: "プレゼンス",
    avatar: "アバター",
    config: "設定ファイル",
    action: "何を変更しますか？",
    choose: "選択",
    chooseCancel: "選択（1-{count}、Enterでキャンセル）",
    chooseDefault: "選択（1-{count}）",
    currentMark: "現在",
    selectProvider: "プロバイダーを選択：",
    selectTheme: "テーマを選択：",
    selectPresence: "プレゼンススタイル：",
    llmAction: "LLMプロバイダーと環境変数",
    modelAction: "モデル",
    themeAction: "テーマ",
    personaAction: "ペルソナプロファイル",
    presenceAction: "プレゼンススタイル",
    avatarAction: "アバター画像",
    accessibilityAction: "アクセシビリティ",
    embeddingAction: "埋め込みプロバイダー",
    exportAction: "設定パスを表示",
    resetAction: "既定値に戻す",
    exitAction: "終了",
    saved: "設定を保存しました",
    restart: "実行中の termvis セッションを再起動すると反映されます。",
    keep: "Enterで現在の値を保持します。",
    apiKeyInput: "APIキー（sk-...を貼り付け、または環境変数名を入力）",
    apiBase: "APIベースURL",
    modelName: "モデル名",
    personaName: "ペルソナ名",
    profileId: "プロファイルID",
    role: "役割",
    style: "話し方",
    traits: "特徴（カンマ区切り）",
    archetype: "原型：",
    avatarPath: "アバター画像パス（defaultでリセット）",
    selectEmbedding: "埋め込みプロバイダーを選択：",
    reduceMotion: "動きを減らす（true/false）",
    screenReader: "スクリーンリーダーモード（true/false）",
    noColor: "NO_COLORを尊重（true/false）",
    language: "言語",
    accessibility: "アクセシビリティ",
    embedding: "埋め込み",
    apiKeyEnv: "APIキー環境変数",
    resetConfirm: "すべての設定をリセットしますか？（yes/no）",
    resetDone: "設定を既定値に戻しました",
    configFile: "設定ファイル",
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

async function ask(rl, question, defaultValue) {
  return new Promise((resolve) => {
    const prompt = defaultValue !== undefined ? `${question} [${defaultValue}]: ` : `${question}: `;
    rl.question(prompt, (answer) => {
      resolve(answer.trim() || (defaultValue !== undefined ? String(defaultValue) : ""));
    });
  });
}

async function askEdit(rl, question, currentValue) {
  return new Promise((resolve) => {
    const current = currentValue !== undefined && currentValue !== null && String(currentValue) !== ""
      ? ` [${currentValue}]`
      : "";
    rl.question(`${question}${current}: `, (answer) => {
      const text = answer.trim();
      resolve(text ? text : undefined);
    });
  });
}

async function choose(rl, question, options, language = "en") {
  console.log(`\n${question}`);
  options.forEach((opt, i) => {
    console.log(`  ${i + 1}. ${opt.label}${opt.current ? ` (${t(language, "currentMark")})` : ""}`);
  });
  const answer = await ask(rl, t(language, "chooseCancel").replace("{count}", String(options.length)), "");
  if (!answer) return null;
  const idx = parseInt(answer, 10) - 1;
  if (idx < 0 || idx >= options.length) return null;
  return options[idx].value;
}

async function chooseDefault(rl, question, options, currentValue, language = "en") {
  const current = currentValue === undefined ? undefined : String(currentValue);
  const defaultIndex = Math.max(0, options.findIndex((opt) => String(opt.value) === current));
  console.log(`\n${question}`);
  options.forEach((opt, i) => {
    const marker = i === defaultIndex ? "●" : "○";
    console.log(`  ${marker} ${i + 1}. ${opt.label}`);
  });
  const answer = await ask(rl, t(language, "chooseDefault").replace("{count}", String(options.length)), String(defaultIndex + 1));
  const idx = Math.max(0, Math.min(options.length - 1, parseInt(answer, 10) - 1));
  return options[idx].value;
}

function readOption(argv, name, fallback = undefined) {
  if (!Array.isArray(argv)) return fallback;
  const index = argv.indexOf(name);
  if (index === -1) return fallback;
  const value = argv[index + 1];
  if (value === undefined || value === "" || String(value).startsWith("--")) return fallback;
  return value;
}

function hasAnyOption(argv, names) {
  return Array.isArray(argv) && names.some((name) => argv.includes(name));
}

function getPersona(config = {}) {
  return config.life?.soul?.persona || config.cognition?.persona || {};
}

function getLlm(config = {}) {
  return config.cognition?.llm || {};
}

function providerEnvVar(provider) {
  return ({
    openai: "OPENAI_API_KEY",
    deepseek: "DEEPSEEK_API_KEY",
    anthropic: "ANTHROPIC_API_KEY",
    compatible: "LLM_API_KEY"
  })[provider] || "";
}

export async function runSettingsPanel(argv = [], io = {}) {
  const showOnly = Array.isArray(argv) && (argv.includes("--show") || argv.includes("--json"));
  let config = loadConfig();
  if (showOnly) {
    const text = argv.includes("--json") ? `${JSON.stringify(config, null, 2)}\n` : renderSettingsSummary(config);
    io.stdout?.write?.(text);
    return config;
  }

  if (hasAnyOption(argv, [
    "--provider", "--api-key-env", "--api-key", "--api-base", "--model",
    "--embedding", "--avatar", "--theme", "--presence",
    "--name", "--profile", "--role", "--archetype",
    "--style", "--traits", "--brevity", "--warmth",
    "--metaphor", "--emoji", "--language", "--lang"
  ])) {
    const language = normalizeLanguage(readOption(argv, "--language", readOption(argv, "--lang", config.ui?.language)));
    const rawBatchKeyInput = readOption(argv, "--api-key", readOption(argv, "--api-key-env"));
    const batchProvider = readOption(argv, "--provider");
    const batchResolved = rawBatchKeyInput ? resolveApiKeyInput(batchProvider || getLlm(config).provider || "auto", rawBatchKeyInput) : {};
    config = buildConfig({
      existing: config,
      language: readOption(argv, "--language", readOption(argv, "--lang")) || undefined,
      provider: batchProvider,
      apiKeyEnv: batchResolved.envName || rawBatchKeyInput,
      apiBase: readOption(argv, "--api-base"),
      model: readOption(argv, "--model"),
      embedProvider: readOption(argv, "--embedding"),
      avatarPath: readOption(argv, "--avatar"),
      themeName: readOption(argv, "--theme"),
      presenceMode: readOption(argv, "--presence"),
      personaName: readOption(argv, "--name"),
      personaProfile: readOption(argv, "--profile"),
      personaRole: readOption(argv, "--role"),
      personaArchetype: readOption(argv, "--archetype"),
      personaStyle: readOption(argv, "--style"),
      personaTraits: readOption(argv, "--traits"),
      brevity: readOption(argv, "--brevity"),
      warmth: readOption(argv, "--warmth"),
      metaphor: readOption(argv, "--metaphor"),
      emoji: readOption(argv, "--emoji")
    });
    saveConfig(config);
    io.stdout?.write?.(renderSettingsSummary(config, language));
    return config;
  }

  const rl = createInterface({ input: io.stdin || process.stdin, output: io.stdout || process.stdout });
  let language = await chooseDefault(rl, t(config.ui?.language, "language"), LANGUAGES, config.ui?.language || "en", config.ui?.language || "en");
  config.ui = { ...(config.ui || {}), language };
  saveConfig(config);

  console.log("\n┌────────────────────────────────────────┐");
  console.log(`│ ${t(language, "title").padEnd(38)} │`);
  console.log("└────────────────────────────────────────┘");
  console.log(`  ${t(language, "keep")}`);

  let running = true;
  while (running) {
    const llm = getLlm(config);
    const persona = getPersona(config);

    const acc = config.accessibility || {};
    const emb = config.cognition?.embedding || {};

    console.log(`\n─── ${t(language, "current")} ───`);
    console.log(`  ${t(language, "language")}: ${config.ui?.language || "en"}`);
    console.log(`  ${t(language, "provider")}: ${llm.provider || "none"}`);
    console.log(`  ${t(language, "model")}: ${llm.model || "—"}`);
    console.log(`  ${t(language, "apiKeyEnv")}: ${llm.apiKeyEnv || "—"}`);
    console.log(`  ${t(language, "embedding")}: ${emb.provider || "auto"}`);
    console.log(`  ${t(language, "theme")}: ${config.theme?.name || "moon-white-flow"}`);
    console.log(`  ${t(language, "persona")}: ${persona.name || "Termvis Soul"} (${persona.id || "default"})`);
    console.log(`  ${t(language, "presence")}: ${config.soulBios?.initialConsentLevel || "balanced"}`);
    console.log(`  ${t(language, "avatar")}: ${config.life?.avatar || "default"}`);
    console.log(`  ${t(language, "accessibility")}: reduceMotion=${acc.reduceMotion || false}, screenReader=${acc.screenReaderMode || false}`);
    console.log(`  ${t(language, "config")}: ${CONFIG_FILE}`);

    const action = await choose(rl, t(language, "action"), [
      { label: t(language, "llmAction"), value: "llm" },
      { label: t(language, "modelAction"), value: "model" },
      { label: t(language, "embeddingAction"), value: "embedding" },
      { label: t(language, "themeAction"), value: "theme" },
      { label: t(language, "personaAction"), value: "persona" },
      { label: t(language, "presenceAction"), value: "presence" },
      { label: t(language, "avatarAction"), value: "avatar" },
      { label: t(language, "accessibilityAction"), value: "accessibility" },
      { label: t(language, "exportAction"), value: "export" },
      { label: t(language, "resetAction"), value: "reset" },
      { label: t(language, "exitAction"), value: "exit" }
    ], language);

    if (!action || action === "exit") {
      running = false;
      break;
    }

    if (action === "llm") {
      const currentProvider = getLlm(config).provider || "none";
      const provider = await choose(rl, t(language, "selectProvider"), [
        { label: "Codex CLI", value: "codex", current: currentProvider === "codex" },
        { label: "OpenAI", value: "openai", current: currentProvider === "openai" },
        { label: "DeepSeek", value: "deepseek", current: currentProvider === "deepseek" },
        { label: "Anthropic", value: "anthropic", current: currentProvider === "anthropic" },
        { label: "Ollama (local)", value: "ollama", current: currentProvider === "ollama" },
        { label: "OpenAI-compatible", value: "compatible", current: currentProvider === "compatible" },
        { label: "None", value: "none", current: currentProvider === "none" }
      ], language);
      if (provider) {
        config = buildConfig({ existing: config, provider });
        if (!["none", "ollama", "codex"].includes(provider)) {
          const envVar = providerEnvVar(provider);
          const hasExisting = Boolean(envVar && process.env[envVar]);
          const hint = hasExisting ? envVar : "";
          const rawKeyInput = await askEdit(rl, t(language, "apiKeyInput"), hint);
          if (rawKeyInput) {
            const resolved = resolveApiKeyInput(provider, rawKeyInput);
            config = buildConfig({ existing: config, apiKeyEnv: resolved.envName });
            if (resolved.injected) {
              console.log(`  ✓ ${t(language, "apiKeySaved")}`);
            } else if (resolved.envName) {
              console.log(`  ✓ ${t(language, "apiKeyEnvHint")}: ${resolved.envName}`);
            }
          }
        }
        if (["ollama", "compatible", "openai", "deepseek"].includes(provider)) {
          const baseDefault = provider === "deepseek" ? "https://api.deepseek.com/v1" : provider === "ollama" ? "http://localhost:11434" : "";
          const base = await askEdit(rl, t(language, "apiBase"), getLlm(config).baseURL || baseDefault);
          if (base) config = buildConfig({ existing: config, apiBase: base });
        }
      }
    }

    if (action === "model") {
      const model = await askEdit(rl, t(language, "modelName"), getLlm(config).model || "");
      if (model) config = buildConfig({ existing: config, model });
    }

    if (action === "theme") {
      const theme = await choose(rl, t(language, "selectTheme"), [
        { label: "Moon White Flow", value: "moon-white-flow", current: config.theme?.name === "moon-white-flow" },
        { label: "Neon Vein", value: "neon-vein", current: config.theme?.name === "neon-vein" },
        { label: "Dawn Glass", value: "dawn-glass", current: config.theme?.name === "dawn-glass" }
      ], language);
      if (theme) config = buildConfig({ existing: config, themeName: theme });
    }

    if (action === "persona") {
      const prev = getPersona(config);
      const name = await askEdit(rl, t(language, "personaName"), prev.name || "Termvis Soul");
      const id = await askEdit(rl, t(language, "profileId"), prev.id || "default");
      const role = await askEdit(rl, t(language, "role"), prev.role || "terminal companion");
      const style = await askEdit(rl, t(language, "style"), prev.style || "warm, concise, responsive");
      const traits = await askEdit(rl, t(language, "traits"), Array.isArray(prev.traits) ? prev.traits.join(",") : "warm,attentive,adaptive");
      const archetype = await choose(rl, t(language, "archetype"), [
        { label: "Warm Scout", value: "warm-scout", current: prev.archetype === "warm-scout" },
        { label: "Quiet Oracle", value: "quiet-oracle", current: prev.archetype === "quiet-oracle" },
        { label: "Playful Synth", value: "playful-synth", current: prev.archetype === "playful-synth" },
        { label: "Custom", value: "custom", current: prev.archetype === "custom" }
      ], language);
      config = buildConfig({
        existing: config,
        personaName: name,
        personaProfile: id,
        personaRole: role,
        personaStyle: style,
        personaTraits: traits,
        personaArchetype: archetype
      });
    }

    if (action === "presence") {
      const pref = await choose(rl, t(language, "selectPresence"), [
        { label: "Minimal", value: "minimal", current: config.soulBios?.initialConsentLevel === "minimal" },
        { label: "Balanced", value: "balanced", current: config.soulBios?.initialConsentLevel === "balanced" },
        { label: "Expressive", value: "expressive", current: config.soulBios?.initialConsentLevel === "expressive" }
      ], language);
      if (pref) config = buildConfig({ existing: config, presenceMode: pref });
    }

    if (action === "avatar") {
      const path = await askEdit(rl, t(language, "avatarPath"), config.life?.avatar || "default");
      if (path !== undefined) config = buildConfig({ existing: config, avatarPath: path });
    }

    if (action === "embedding") {
      const currentEmbed = config.cognition?.embedding?.provider || "auto";
      const embedChoice = await choose(rl, t(language, "selectEmbedding"), [
        { label: "Auto (same as LLM)", value: "auto", current: currentEmbed === "auto" },
        { label: "Local lexical", value: "lexical", current: currentEmbed === "lexical" },
        { label: "Ollama", value: "ollama", current: currentEmbed === "ollama" }
      ], language);
      if (embedChoice) config = buildConfig({ existing: config, embedProvider: embedChoice });
    }

    if (action === "accessibility") {
      const prevAcc = config.accessibility || {};
      const rm = await askEdit(rl, t(language, "reduceMotion"), String(prevAcc.reduceMotion || false));
      const sr = await askEdit(rl, t(language, "screenReader"), String(prevAcc.screenReaderMode || false));
      const nc = await askEdit(rl, t(language, "noColor"), String(prevAcc.respectNoColor !== false));
      config.accessibility = {
        ...(config.accessibility || {}),
        reduceMotion: rm !== undefined ? rm === "true" : prevAcc.reduceMotion || false,
        screenReaderMode: sr !== undefined ? sr === "true" : prevAcc.screenReaderMode || false,
        respectNoColor: nc !== undefined ? nc !== "false" : prevAcc.respectNoColor !== false
      };
    }

    if (action === "export") {
      console.log(`\n${t(language, "configFile")}: ${CONFIG_FILE}`);
      console.log(JSON.stringify(config, null, 2));
    }

    if (action === "reset") {
      const confirm = await askEdit(rl, t(language, "resetConfirm"), "no");
      if (confirm === "yes") {
        config = {};
        console.log(`  ✓ ${t(language, "resetDone")}`);
      }
    }

    saveConfig(config);
    console.log(`  ✓ ${t(language, "saved")}`);
  }

  rl.close();
  console.log(`\n${t(language, "saved")}. ${t(language, "restart")}\n`);
  return config;
}

function renderSettingsSummary(config = {}, lang = config.ui?.language || "en") {
  const persona = getPersona(config);
  const llm = getLlm(config);
  const emb = config.cognition?.embedding || {};
  const acc = config.accessibility || {};
  return [
    t(lang, "title"),
    `  ${t(lang, "language")}: ${config.ui?.language || "en"}`,
    `  ${t(lang, "provider")}: ${llm.provider || "none"}`,
    `  ${t(lang, "model")}: ${llm.model || "—"}`,
    `  ${t(lang, "apiKeyEnv")}: ${llm.apiKeyEnv || "—"}`,
    `  ${t(lang, "embedding")}: ${emb.provider || "auto"}`,
    `  ${t(lang, "theme")}: ${config.theme?.name || "moon-white-flow"}`,
    `  ${t(lang, "persona")}: ${persona.name || "Termvis Soul"} (${persona.id || "default"})`,
    `  ${t(lang, "role")}: ${persona.role || "terminal companion"}`,
    `  ${t(lang, "archetype")} ${persona.archetype || "warm-scout"}`,
    `  ${t(lang, "presence")}: ${config.soulBios?.initialConsentLevel || "balanced"}`,
    `  ${t(lang, "avatar")}: ${config.life?.avatar || "default"}`,
    `  ${t(lang, "accessibility")}: reduceMotion=${acc.reduceMotion || false}, screenReader=${acc.screenReaderMode || false}, respectNoColor=${acc.respectNoColor !== false}`,
    `  ${t(lang, "config")}: ${CONFIG_FILE}`,
    ""
  ].join("\n");
}
