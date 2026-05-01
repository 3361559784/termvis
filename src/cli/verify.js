import { loadConfig, DEFAULT_CONFIG, mergeConfig, validateConfig, USER_CONFIG_FILE } from "../core/config.js";
import { detectTerminalCapabilities } from "../core/capabilities.js";
import { findChafa } from "../render/chafa-runner.js";
import { verifyLlmConfig } from "./setup-wizard.js";

const TEXT = Object.freeze({
  en: {
    title: "termvis verify",
    config: "Config",
    configOk: "valid",
    configMissing: "not found — run: termvis setup",
    configError: "invalid",
    configValidation: "Config Validation",
    terminal: "Terminal",
    chafa: "Chafa",
    nodePty: "node-pty",
    llm: "LLM",
    llmOk: "available",
    llmSkip: "disabled (provider=none)",
    llmFail: "NOT available",
    embedding: "Embedding",
    theme: "Theme",
    persona: "Persona",
    presence: "Presence",
    accessibility: "Accessibility",
    language: "Language",
    avatar: "Avatar",
    allOk: "All checks passed. Ready to run: termvis life -- codex",
    hasErrors: "Some checks failed. Fix the issues above, then run: termvis verify"
  },
  zh: {
    title: "termvis 验证",
    config: "配置",
    configOk: "有效",
    configMissing: "未找到 — 运行：termvis setup",
    configError: "无效",
    configValidation: "配置校验",
    terminal: "终端",
    chafa: "Chafa",
    nodePty: "node-pty",
    llm: "LLM",
    llmOk: "可用",
    llmSkip: "已禁用 (provider=none)",
    llmFail: "不可用",
    embedding: "嵌入",
    theme: "主题",
    persona: "角色",
    presence: "存在感",
    accessibility: "无障碍",
    language: "语言",
    avatar: "角色图像",
    allOk: "所有检查通过。可以运行：termvis life -- codex",
    hasErrors: "部分检查未通过，请修复上述问题后运行：termvis verify"
  },
  ja: {
    title: "termvis 検証",
    config: "設定",
    configOk: "有効",
    configMissing: "見つかりません — 実行：termvis setup",
    configError: "無効",
    configValidation: "設定検証",
    terminal: "ターミナル",
    chafa: "Chafa",
    nodePty: "node-pty",
    llm: "LLM",
    llmOk: "利用可能",
    llmSkip: "無効 (provider=none)",
    llmFail: "利用不可",
    embedding: "埋め込み",
    theme: "テーマ",
    persona: "ペルソナ",
    presence: "プレゼンス",
    accessibility: "アクセシビリティ",
    language: "言語",
    avatar: "アバター",
    allOk: "すべてのチェックに合格。実行：termvis life -- codex",
    hasErrors: "一部のチェックに失敗。上記の問題を修正後：termvis verify"
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

export async function runVerify(argv, io) {
  const asJson = Array.isArray(argv) && argv.includes("--json");
  const write = (text) => io.stdout.write(text);
  const checks = [];
  let lang = "en";

  // 1. Config
  let configResult;
  try {
    configResult = await loadConfig({ cwd: io.cwd, env: io.env });
    lang = normalizeLanguage(configResult.value?.ui?.language);
    checks.push({ name: "config", ok: true, detail: `${configResult.path || USER_CONFIG_FILE}` });
  } catch (err) {
    checks.push({ name: "config", ok: false, detail: err?.message || String(err) });
    configResult = { value: structuredClone(DEFAULT_CONFIG), defaults: true };
  }

  if (configResult.defaults) {
    checks[checks.length - 1] = { name: "config", ok: false, detail: t(lang, "configMissing") };
  }

  const config = configResult.value;

  // 2. Terminal
  const caps = detectTerminalCapabilities({ env: io.env, stdout: io.stdout, stdin: io.stdin });
  const termDetail = caps.isTTY ? `${caps.cols}x${caps.rows}, ${caps.colorDepth}-bit color` : "non-TTY";
  checks.push({ name: "terminal", ok: Boolean(caps.isTTY && caps.colorDepth >= 8), detail: termDetail });

  // 3. Chafa
  const chafa = findChafa({ env: io.env, config, cwd: io.cwd });
  checks.push({ name: "chafa", ok: Boolean(chafa.available), detail: chafa.available ? chafa.path : (chafa.reason || "not found") });

  // 4. node-pty
  const nodePty = await hasOptionalNodePty();
  checks.push({ name: "node-pty", ok: nodePty, detail: nodePty ? "available" : "not installed" });

  // 5. LLM
  const provider = config.cognition?.llm?.provider || "auto";
  if (provider === "none") {
    checks.push({ name: "llm", ok: true, detail: t(lang, "llmSkip") });
  } else {
    const llmResult = await verifyLlmConfig(
      configResult.defaults ? {} : config,
      { env: io.env, cwd: io.cwd }
    );
    checks.push({
      name: "llm",
      ok: llmResult.ok,
      detail: llmResult.ok
        ? `${llmResult.provider} (${llmResult.model || "default"})`
        : llmResult.message
    });
  }

  // 6. Embedding
  try {
    const { createEmbeddingProvider } = await import("../cognition/embeddings.js");
    const embedder = await createEmbeddingProvider({ env: io.env, config });
    checks.push({
      name: "embedding",
      ok: Boolean(embedder?.available),
      detail: embedder?.available ? `${embedder.name}` : "not available"
    });
  } catch {
    checks.push({ name: "embedding", ok: false, detail: "load error" });
  }

  // 7. Config validation — validate that merged config passes all schema checks
  try {
    const merged = mergeConfig(structuredClone(DEFAULT_CONFIG), configResult.defaults ? {} : config);
    validateConfig(merged);
    checks.push({ name: "configValidation", ok: true, detail: t(lang, "configOk") });
  } catch (err) {
    checks.push({ name: "configValidation", ok: false, detail: err?.message || String(err) });
  }

  // 8. Theme
  const themeName = config.theme?.name || "moon-white-flow";
  const validThemes = new Set(["moon-white-flow", "neon-vein", "dawn-glass"]);
  checks.push({ name: "theme", ok: validThemes.has(themeName), detail: themeName });

  // 9. Language
  const uiLang = config.ui?.language || "en";
  const validLangs = new Set(["en", "zh", "ja"]);
  checks.push({ name: "language", ok: validLangs.has(uiLang), detail: uiLang });

  // 10. Persona
  const persona = config.life?.soul?.persona || config.cognition?.persona || {};
  const personaName = persona.name || "Termvis Soul";
  const personaArchetype = persona.archetype || "quiet-oracle";
  const validArchetypes = new Set(["quiet-oracle", "warm-scout", "playful-synth", "custom"]);
  checks.push({
    name: "persona",
    ok: Boolean(personaName) && validArchetypes.has(personaArchetype),
    detail: `${personaName} (${personaArchetype})`
  });

  // 11. Presence
  const presenceLevel = config.soulBios?.initialConsentLevel || "balanced";
  const validPresence = new Set(["minimal", "balanced", "expressive"]);
  checks.push({ name: "presence", ok: validPresence.has(presenceLevel), detail: presenceLevel });

  // 12. Accessibility
  const acc = config.accessibility || {};
  const accDetail = `reduceMotion=${acc.reduceMotion || false}, screenReader=${acc.screenReaderMode || false}, respectNoColor=${acc.respectNoColor !== false}`;
  checks.push({
    name: "accessibility",
    ok: typeof (acc.reduceMotion ?? false) === "boolean" && typeof (acc.screenReaderMode ?? false) === "boolean",
    detail: accDetail
  });

  // 13. Avatar
  const avatarValue = config.life?.avatar;
  checks.push({
    name: "avatar",
    ok: avatarValue === undefined || avatarValue === null || typeof avatarValue === "string",
    detail: avatarValue || "default"
  });

  const allOk = checks.every((c) => c.ok);

  if (asJson) {
    write(`${JSON.stringify({ ok: allOk, checks }, null, 2)}\n`);
    if (!allOk) process.exitCode = 1;
    return { ok: allOk, checks };
  }

  write(`\n${t(lang, "title")}\n`);
  write("─".repeat(40) + "\n");
  for (const check of checks) {
    const icon = check.ok ? "✓" : "✗";
    const label = t(lang, check.name) || check.name;
    write(`  ${icon} ${label}: ${check.detail}\n`);
  }
  write("─".repeat(40) + "\n");
  if (allOk) {
    write(`  ✓ ${t(lang, "allOk")}\n\n`);
  } else {
    write(`  ✗ ${t(lang, "hasErrors")}\n\n`);
    process.exitCode = 1;
  }

  return { ok: allOk, checks };
}

async function hasOptionalNodePty() {
  try {
    await import("node-pty");
    return true;
  } catch {
    return false;
  }
}
