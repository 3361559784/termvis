import { readFile, writeFile, mkdir } from "node:fs/promises";
import { readFileSync, existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join, resolve, dirname } from "node:path";
import { homedir } from "node:os";

const CONFIG_FILES = [
  "termvis.config.jsonc",
  "termvis.config.json",
  ".termvisrc.jsonc",
  ".termvisrc.json"
];

export const USER_CONFIG_FILE = join(homedir(), ".config", "termvis", "config.json");
export const USER_SECRETS_FILE = join(homedir(), ".config", "termvis", "secrets.json");
export const LEGACY_USER_CONFIG_FILE = join(homedir(), ".config", "chafa-cli", "config.json");

export const DEFAULT_CONFIG = Object.freeze({
  profile: "default",
  ui: {
    language: "en"
  },
  render: {
    backend: "auto",
    preferPixelProtocol: true,
    fallbackChain: ["kitty", "iterm", "sixels", "symbols-truecolor", "symbols-256", "mono", "ascii", "plain"],
    fontRatio: "1/2",
    symbols: "block+border+space+braille+sextant+quad",
    work: 9,
    threads: -1,
    optimize: 9,
    preprocess: true,
    dither: "diffusion",
    ditherGrain: "2x2",
    ditherIntensity: 0.75,
    colorSpace: "din99d",
    colorExtractor: "median",
    timeoutMs: 5000
  },
  theme: {
    name: "moon-white-flow",
    respectNoColor: true,
    minimumContrast: 4.5
  },
  accessibility: {
    screenReaderMode: false,
    altText: true,
    reduceMotion: false,
    respectNoColor: true
  },
  mood: {
    showHeartbeat: true,
    idleHeartbeatBpm: [58, 66],
    maxFps: 6
  },
  memory: {
    scope: "project",
    reflective: false,
    retentionDays: 30,
    workingLimit: 20,
    episodicLimit: 200,
    semanticLimit: 100
  },
  life: {
    enabled: true,
    strict: true,
    symbolic: true,
    pulse: "title",
    avatarFit: "contain",
    avatarAlign: "mid,mid",
    avatarScale: "max",
    maxFps: 4,
    layout: {
      side: "left",
      minHostCols: 40,
      minRailWidth: 30,
      maxRailWidth: 44
    },
    trace: true,
    soul: {
      enabled: true,
      mode: "companion",
      narration: "awake beside the terminal stream",
      reply: "awake beside the terminal stream",
      persona: {
        id: "default",
        name: "Termvis Soul",
        language: "en",
        corePurpose: "hybrid",
        archetype: "quiet-oracle",
        traits: ["calm", "observant", "helpful"],
        boundaries: {
          romance: "forbid",
          persuasion: "warn",
          proactiveStart: "low"
        },
        speakingStyle: {
          brevity: 2,
          warmth: 2,
          metaphor: 1,
          emoji: 0
        },
        role: "terminal companion",
        trustMode: "companion",
        style: "quiet, warm, transparent",
        boundary: "visual companion only; never controls the host CLI"
      }
    }
  },
  plugins: {
    local: [],
    npm: []
  },
  security: {
    trustedPlugins: [],
    network: false,
    execAllowlist: ["chafa"],
    fileReadAllowlist: ["."]
  },
  hosts: {
    codex: { enabled: true },
    claudeCode: { enabled: true },
    opencode: { enabled: true }
  },
  soulBios: {
    enabled: true,
    transport: "stdio",
    auditLog: true,
    snapshotIntervalMs: 60000,
    decayEnabled: true,
    initialPresenceMode: "ambient",
    initialConsentLevel: "balanced"
  },
  cognition: {
    enabled: true,
    safetyJudge: false,
    reflectionTickInterval: 20,
    persona: {
      name: "Termvis Soul",
      language: "en",
      archetype: "calm-guide",
      speakingStyle: { brevity: 2, warmth: 1, metaphor: 0, emoji: 0 }
    },
    llm: {
      provider: "auto",
      model: null,
      maxTokens: 1024,
      temperature: 0.4
    },
    embedding: {
      provider: "auto",
      model: null,
      dimensions: null,
      probeOllama: true
    },
    memory: {
      reflective: false,
      quarantineMs: 600000,
      pruneThreshold: 0.05
    }
  }
});

export async function loadConfig({ cwd = process.cwd(), env = process.env, explicitPath } = {}) {
  if (explicitPath) {
    const raw = await readFile(explicitPath, "utf8");
    const parsed = normalizeCompatConfig(parseJsonc(raw));
    const merged = sanitizeConfigSecrets(mergeConfig(DEFAULT_CONFIG, parsed));
    validateConfig(merged);
    return { path: explicitPath, value: merged, defaults: false, env };
  }

  const projectPath = await findConfig(cwd);
  const userPath = env.TERMVIS_NO_USER_CONFIG === "1" ? null : await findUserConfig();
  if (!projectPath && !userPath) return { path: null, value: structuredClone(DEFAULT_CONFIG), defaults: true, env };

  let merged = structuredClone(DEFAULT_CONFIG);
  if (projectPath) {
    const raw = await readFile(projectPath, "utf8");
    merged = mergeConfig(merged, normalizeCompatConfig(parseJsonc(raw)));
  }
  if (userPath) {
    const raw = await readFile(userPath, "utf8");
    merged = mergeConfig(merged, normalizeCompatConfig(parseJsonc(raw)));
  }
  merged = sanitizeConfigSecrets(merged);
  validateConfig(merged);
  return {
    path: userPath || projectPath,
    paths: { user: userPath, project: projectPath },
    value: merged,
    defaults: false,
    env
  };
}

export async function findConfig(cwd = process.cwd()) {
  let current = resolve(cwd);
  while (true) {
    for (const file of CONFIG_FILES) {
      const candidate = join(current, file);
      try {
        await readFile(candidate, "utf8");
        return candidate;
      } catch (error) {
        if (error.code !== "ENOENT") throw error;
      }
    }
    const parent = resolve(current, "..");
    if (parent === current) return null;
    current = parent;
  }
}

export async function findUserConfig() {
  for (const candidate of [USER_CONFIG_FILE, LEGACY_USER_CONFIG_FILE]) {
    try {
      await readFile(candidate, "utf8");
      return candidate;
    } catch (error) {
      if (error.code !== "ENOENT") throw error;
    }
  }
  return null;
}

function normalizeCompatConfig(config) {
  if (!isPlainObject(config)) return config;
  const next = structuredClone(config);
  if (isPlainObject(next.llm)) {
    next.cognition = mergeConfig(next.cognition || {}, {
      llm: {
        provider: normalizeCompatLlmProvider(next.llm.provider),
        model: next.llm.model,
        apiKeyEnv: next.llm.apiKeyEnv,
        baseURL: next.llm.apiBase || next.llm.baseURL
      }
    });
    delete next.llm;
  }
  if (isPlainObject(next.embedding)) {
    next.cognition = mergeConfig(next.cognition || {}, {
      embedding: {
        provider: normalizeCompatEmbeddingProvider(next.embedding.provider),
        model: next.embedding.model
      }
    });
    delete next.embedding;
  }
  if (isPlainObject(next.soul)) {
    next.life = mergeConfig(next.life || {}, { soul: next.soul });
    if (isPlainObject(next.soul.persona)) {
      next.cognition = mergeConfig(next.cognition || {}, { persona: next.soul.persona });
    }
    delete next.soul;
  }
  if (next.avatar !== undefined) {
    next.life = mergeConfig(next.life || {}, { avatar: next.avatar });
    delete next.avatar;
  }
  return next;
}

export function sanitizeConfigSecrets(config) {
  if (!isPlainObject(config)) return config;
  const next = structuredClone(config);
  sanitizeLlmSecrets(next.llm);
  sanitizeLlmSecrets(next.cognition?.llm);
  return next;
}

function sanitizeLlmSecrets(llm) {
  if (!isPlainObject(llm)) return;
  delete llm.apiKey;
  const provider = normalizeCompatLlmProvider(llm.provider);
  const envName = sanitizeApiKeyEnv(provider, llm.apiKeyEnv);
  if (envName) llm.apiKeyEnv = envName;
  else delete llm.apiKeyEnv;
}

function sanitizeApiKeyEnv(provider, value) {
  const text = String(value || "").trim();
  if (/^[A-Za-z_][A-Za-z0-9_]*$/.test(text)) return text;
  return ({
    auto: "OPENAI_API_KEY",
    openai: "OPENAI_API_KEY",
    deepseek: "DEEPSEEK_API_KEY",
    anthropic: "ANTHROPIC_API_KEY"
  })[provider] || undefined;
}

function normalizeCompatLlmProvider(provider) {
  const value = String(provider || "auto").toLowerCase();
  if (["openrouter", "custom", "azure", "openai-compatible", "compatible"].includes(value)) return "openai";
  if (["auto", "openai", "anthropic", "ollama", "codex", "deepseek", "none"].includes(value)) return value;
  return "auto";
}

function normalizeCompatEmbeddingProvider(provider) {
  const value = String(provider || "auto").toLowerCase();
  if (value === "local") return "lexical";
  if (["auto", "openai", "ollama", "lexical"].includes(value)) return value;
  return "auto";
}

export function parseJsonc(source) {
  return JSON.parse(stripJsonComments(source));
}

export function stripJsonComments(source) {
  let output = "";
  let inString = false;
  let quote = "";
  let escaped = false;
  let inLineComment = false;
  let inBlockComment = false;

  for (let i = 0; i < source.length; i += 1) {
    const char = source[i];
    const next = source[i + 1];

    if (inLineComment) {
      if (char === "\n" || char === "\r") {
        inLineComment = false;
        output += char;
      }
      continue;
    }

    if (inBlockComment) {
      if (char === "*" && next === "/") {
        inBlockComment = false;
        i += 1;
      } else if (char === "\n" || char === "\r") {
        output += char;
      }
      continue;
    }

    if (inString) {
      output += char;
      if (escaped) {
        escaped = false;
      } else if (char === "\\") {
        escaped = true;
      } else if (char === quote) {
        inString = false;
      }
      continue;
    }

    if (char === "\"" || char === "'") {
      inString = true;
      quote = char;
      output += char;
      continue;
    }
    if (char === "/" && next === "/") {
      inLineComment = true;
      i += 1;
      continue;
    }
    if (char === "/" && next === "*") {
      inBlockComment = true;
      i += 1;
      continue;
    }
    output += char;
  }
  return output;
}

export function mergeConfig(base, override) {
  if (!isPlainObject(base) || !isPlainObject(override)) return structuredClone(override ?? base);
  const result = structuredClone(base);
  for (const [key, value] of Object.entries(override)) {
    if (isPlainObject(value) && isPlainObject(result[key])) {
      result[key] = mergeConfig(result[key], value);
    } else {
      result[key] = structuredClone(value);
    }
  }
  return result;
}

export function validateConfig(config) {
  const memoryScopes = new Set(["session", "project", "user"]);
  if (!memoryScopes.has(config.memory?.scope)) {
    throw new Error('memory.scope must be "session", "project", or "user"');
  }
  if (
    typeof config.memory?.retentionDays !== "number" ||
    !Number.isFinite(config.memory.retentionDays) ||
    config.memory.retentionDays <= 0
  ) {
    throw new Error("memory.retentionDays must be a positive number");
  }
  if (
    typeof config.memory?.workingLimit !== "number" ||
    !Number.isInteger(config.memory.workingLimit) ||
    config.memory.workingLimit < 1 ||
    typeof config.memory?.episodicLimit !== "number" ||
    !Number.isInteger(config.memory.episodicLimit) ||
    config.memory.episodicLimit < 1 ||
    typeof config.memory?.semanticLimit !== "number" ||
    !Number.isInteger(config.memory.semanticLimit) ||
    config.memory.semanticLimit < 1
  ) {
    throw new Error("memory.workingLimit, episodicLimit, and semanticLimit must be positive integers");
  }
  if (config.memory?.reflective !== undefined && typeof config.memory.reflective !== "boolean") {
    throw new Error("memory.reflective must be a boolean");
  }

  if (config.mood?.showHeartbeat !== undefined && typeof config.mood.showHeartbeat !== "boolean") {
    throw new Error("mood.showHeartbeat must be a boolean");
  }
  if (
    config.mood?.maxFps !== undefined &&
    (!Number.isFinite(config.mood.maxFps) || config.mood.maxFps < 1 || config.mood.maxFps > 12)
  ) {
    throw new Error("mood.maxFps must be a number between 1 and 12");
  }
  if (config.mood?.idleHeartbeatBpm !== undefined) {
    const bpm = config.mood.idleHeartbeatBpm;
    if (
      !Array.isArray(bpm) ||
      bpm.length !== 2 ||
      !Number.isFinite(bpm[0]) ||
      !Number.isFinite(bpm[1])
    ) {
      throw new Error("mood.idleHeartbeatBpm must be an array of two finite numbers");
    }
  }

  if (!Array.isArray(config.render?.fallbackChain)) {
    throw new Error("render.fallbackChain must be an array");
  }
  if (!["auto", "system", "bundled", "disabled"].includes(config.render?.backend)) {
    throw new Error("render.backend must be auto, system, bundled, or disabled");
  }
  if (config.render?.chafaPath !== undefined && typeof config.render.chafaPath !== "string") {
    throw new Error("render.chafaPath must be a string");
  }
  if (config.render?.work !== undefined && (!Number.isInteger(config.render.work) || config.render.work < 1 || config.render.work > 9)) {
    throw new Error("render.work must be an integer between 1 and 9");
  }
  if (config.render?.optimize !== undefined && (!Number.isInteger(config.render.optimize) || config.render.optimize < 0 || config.render.optimize > 9)) {
    throw new Error("render.optimize must be an integer between 0 and 9");
  }
  if (config.render?.preprocess !== undefined && typeof config.render.preprocess !== "boolean") {
    throw new Error("render.preprocess must be a boolean");
  }
  if (config.render?.dither !== undefined && !["none", "ordered", "diffusion", "noise"].includes(config.render.dither)) {
    throw new Error("render.dither must be none, ordered, diffusion, or noise");
  }
  if (config.render?.ditherGrain !== undefined && !/^(1|2|4|8)x(1|2|4|8)$/.test(config.render.ditherGrain)) {
    throw new Error("render.ditherGrain must look like 2x2");
  }
  if (config.render?.ditherIntensity !== undefined && (!Number.isFinite(config.render.ditherIntensity) || config.render.ditherIntensity < 0)) {
    throw new Error("render.ditherIntensity must be a non-negative number");
  }
  if (config.render?.colorSpace !== undefined && !["rgb", "din99d"].includes(config.render.colorSpace)) {
    throw new Error("render.colorSpace must be rgb or din99d");
  }
  if (config.render?.colorExtractor !== undefined && !["average", "median"].includes(config.render.colorExtractor)) {
    throw new Error("render.colorExtractor must be average or median");
  }
  if (config.life?.strict !== undefined && typeof config.life.strict !== "boolean") {
    throw new Error("life.strict must be a boolean");
  }
  if (config.life?.maxFps !== undefined && (!Number.isFinite(config.life.maxFps) || config.life.maxFps < 1 || config.life.maxFps > 12)) {
    throw new Error("life.maxFps must be a number between 1 and 12");
  }
  if (config.life?.avatarFit !== undefined && !["cover", "contain", "stretch"].includes(config.life.avatarFit)) {
    throw new Error("life.avatarFit must be cover, contain, or stretch");
  }
  if (config.life?.avatarAlign !== undefined && !/^(top|mid|bottom),(left|mid|right)$/.test(config.life.avatarAlign)) {
    throw new Error("life.avatarAlign must look like mid,mid or top,left");
  }
  if (config.life?.avatar !== undefined && config.life.avatar !== null && typeof config.life.avatar !== "string") {
    throw new Error("life.avatar must be a string or null");
  }
  if (config.life?.soul?.enabled !== undefined && typeof config.life.soul.enabled !== "boolean") {
    throw new Error("life.soul.enabled must be a boolean");
  }
  const languages = new Set(["en", "zh", "ja"]);
  if (config.ui?.language !== undefined && !languages.has(String(config.ui.language))) {
    throw new Error('ui.language must be "en", "zh", or "ja"');
  }
  const persona = config.life?.soul?.persona;
  if (persona?.language !== undefined && !languages.has(String(persona.language))) {
    throw new Error('persona.language must be "en", "zh", or "ja"');
  }
  const corePurposes = new Set(["coding-assistant", "companion", "hybrid"]);
  if (persona?.corePurpose !== undefined && !corePurposes.has(persona.corePurpose)) {
    throw new Error('persona.corePurpose must be "coding-assistant", "companion", or "hybrid"');
  }
  const archetypes = new Set(["quiet-oracle", "warm-scout", "playful-synth", "custom"]);
  if (persona?.archetype !== undefined && !archetypes.has(persona.archetype)) {
    throw new Error(
      'persona.archetype must be "quiet-oracle", "warm-scout", "playful-synth", or "custom"'
    );
  }
  const romance = persona?.boundaries?.romance;
  const romanceSet = new Set(["forbid", "soft-no", "unspecified"]);
  if (romance !== undefined && !romanceSet.has(romance)) {
    throw new Error('persona.boundaries.romance must be "forbid", "soft-no", or "unspecified"');
  }
  if (config.accessibility?.reduceMotion !== undefined && typeof config.accessibility.reduceMotion !== "boolean") {
    throw new Error("accessibility.reduceMotion must be a boolean");
  }
  if (typeof config.security?.network !== "boolean") {
    throw new Error("security.network must be a boolean");
  }

  if (config.soulBios != null && typeof config.soulBios !== "object") {
    throw new Error("soulBios must be an object when provided");
  }
  if (config.soulBios != null) {
    const sb = /** @type {Record<string, unknown>} */ (config.soulBios);
    if (sb.enabled !== undefined && typeof sb.enabled !== "boolean") throw new Error("soulBios.enabled must be a boolean");
    if (sb.auditLog !== undefined && typeof sb.auditLog !== "boolean") throw new Error("soulBios.auditLog must be a boolean");
    if (sb.decayEnabled !== undefined && typeof sb.decayEnabled !== "boolean") {
      throw new Error("soulBios.decayEnabled must be a boolean");
    }
    const transports = new Set(["stdio", "uds", "named-pipe", "http"]);
    if (sb.transport !== undefined && !transports.has(sb.transport)) {
      throw new Error('soulBios.transport must be "stdio", "uds", "named-pipe", or "http"');
    }
    if (
      sb.snapshotIntervalMs !== undefined &&
      (typeof sb.snapshotIntervalMs !== "number" ||
        !Number.isFinite(sb.snapshotIntervalMs) ||
        sb.snapshotIntervalMs < 5000)
    ) {
      throw new Error("soulBios.snapshotIntervalMs must be a number >= 5000");
    }
    const modes = new Set(["dormant", "ambient", "attentive", "foreground"]);
    if (
      sb.initialPresenceMode !== undefined &&
      !modes.has(String(sb.initialPresenceMode))
    ) {
      throw new Error(
        'soulBios.initialPresenceMode must be "dormant", "ambient", "attentive", or "foreground"'
      );
    }
    const consents = new Set(["minimal", "balanced", "expressive"]);
    if (
      sb.initialConsentLevel !== undefined &&
      !consents.has(String(sb.initialConsentLevel))
    ) {
      throw new Error('soulBios.initialConsentLevel must be "minimal", "balanced", or "expressive"');
    }
  }

  if (config.cognition != null && typeof config.cognition !== "object") {
    throw new Error("cognition must be an object when provided");
  }
  if (config.cognition != null) {
    const cog = /** @type {Record<string, unknown>} */ (config.cognition);
    if (cog.enabled !== undefined && typeof cog.enabled !== "boolean") {
      throw new Error("cognition.enabled must be a boolean");
    }
    if (cog.safetyJudge !== undefined && typeof cog.safetyJudge !== "boolean") {
      throw new Error("cognition.safetyJudge must be a boolean");
    }
    if (
      cog.reflectionTickInterval !== undefined &&
      (typeof cog.reflectionTickInterval !== "number" ||
        !Number.isFinite(cog.reflectionTickInterval) ||
        cog.reflectionTickInterval < 1)
    ) {
      throw new Error("cognition.reflectionTickInterval must be a positive integer");
    }
    if (cog.persona !== undefined && (typeof cog.persona !== "object" || cog.persona === null)) {
      throw new Error("cognition.persona must be an object");
    }
    if (cog.persona && typeof cog.persona === "object") {
      const language = /** @type {Record<string, unknown>} */ (cog.persona).language;
      if (language !== undefined && !languages.has(String(language))) {
        throw new Error('cognition.persona.language must be "en", "zh", or "ja"');
      }
    }
    if (cog.llm !== undefined) {
      if (typeof cog.llm !== "object" || cog.llm === null) {
        throw new Error("cognition.llm must be an object");
      }
      const llm = /** @type {Record<string, unknown>} */ (cog.llm);
      const llmProviders = new Set(["auto", "openai", "anthropic", "ollama", "codex", "deepseek", "none"]);
      if (llm.provider !== undefined && !llmProviders.has(String(llm.provider))) {
        throw new Error('cognition.llm.provider must be one of: auto, openai, anthropic, ollama, codex, deepseek, none');
      }
      if (llm.apiKeyEnv !== undefined && typeof llm.apiKeyEnv !== "string") {
        throw new Error("cognition.llm.apiKeyEnv must be a string");
      }
      if (llm.apiKeyEnv !== undefined && !/^[A-Za-z_][A-Za-z0-9_]*$/.test(String(llm.apiKeyEnv))) {
        throw new Error("cognition.llm.apiKeyEnv must be an environment variable name");
      }
    }
    if (cog.embedding !== undefined) {
      if (typeof cog.embedding !== "object" || cog.embedding === null) {
        throw new Error("cognition.embedding must be an object");
      }
      const emb = /** @type {Record<string, unknown>} */ (cog.embedding);
      const embProviders = new Set(["auto", "openai", "ollama", "lexical"]);
      if (emb.provider !== undefined && !embProviders.has(String(emb.provider))) {
        throw new Error('cognition.embedding.provider must be one of: auto, openai, ollama, lexical');
      }
    }
    if (cog.memory !== undefined && (typeof cog.memory !== "object" || cog.memory === null)) {
      throw new Error("cognition.memory must be an object");
    }
  }

  if (config.soulSays != null && typeof config.soulSays !== "object") {
    throw new Error("soulSays must be an object when provided");
  }

  return true;
}

/**
 * Synchronously load user config from disk.
 * Returns the parsed object or {} if no config file exists.
 */
export function loadUserConfigSync() {
  for (const candidate of [USER_CONFIG_FILE, LEGACY_USER_CONFIG_FILE]) {
    try {
      if (existsSync(candidate)) {
        return sanitizeConfigSecrets(parseJsonc(readFileSync(candidate, "utf8")));
      }
    } catch { /* ignore */ }
  }
  return {};
}

/**
 * Merge user config with defaults and run validateConfig.
 * Returns the merged config if valid, throws if not.
 */
export function validateUserConfig(config) {
  const merged = sanitizeConfigSecrets(mergeConfig(structuredClone(DEFAULT_CONFIG), config));
  validateConfig(merged);
  return merged;
}

/**
 * Synchronously save user config to ~/.config/termvis/config.json.
 * Validates against defaults before writing. Throws on invalid config.
 */
export function saveUserConfigSync(config) {
  const clean = sanitizeConfigSecrets(structuredClone(config));
  validateUserConfig(clean);
  const dir = dirname(USER_CONFIG_FILE);
  mkdirSync(dir, { recursive: true });
  writeFileSync(USER_CONFIG_FILE, JSON.stringify(clean, null, 2) + "\n", "utf8");
  return USER_CONFIG_FILE;
}

/**
 * Async version of saveUserConfig.
 * Validates against defaults before writing. Throws on invalid config.
 */
export async function saveUserConfig(config) {
  const clean = sanitizeConfigSecrets(structuredClone(config));
  validateUserConfig(clean);
  const dir = dirname(USER_CONFIG_FILE);
  await mkdir(dir, { recursive: true });
  await writeFile(USER_CONFIG_FILE, JSON.stringify(clean, null, 2) + "\n", "utf8");
  return USER_CONFIG_FILE;
}

/**
 * Load stored secrets from ~/.config/termvis/secrets.json.
 * Returns {} if the file does not exist.
 */
export function loadSecretsSync() {
  try {
    if (existsSync(USER_SECRETS_FILE)) {
      return JSON.parse(readFileSync(USER_SECRETS_FILE, "utf8"));
    }
  } catch { /* ignore */ }
  return {};
}

/**
 * Save secrets to ~/.config/termvis/secrets.json.
 * Only stores provider → apiKey mappings.
 */
export function saveSecretsSync(secrets) {
  const dir = dirname(USER_SECRETS_FILE);
  mkdirSync(dir, { recursive: true });
  writeFileSync(USER_SECRETS_FILE, JSON.stringify(secrets, null, 2) + "\n", { encoding: "utf8", mode: 0o600 });
  return USER_SECRETS_FILE;
}

/**
 * Inject stored secrets into env so LLM providers can find their keys.
 * Only sets env vars that are not already defined.
 */
export function injectSecretsIntoEnv(env = process.env) {
  const secrets = loadSecretsSync();
  const mapping = {
    openai: "OPENAI_API_KEY",
    deepseek: "DEEPSEEK_API_KEY",
    anthropic: "ANTHROPIC_API_KEY"
  };
  for (const [provider, envName] of Object.entries(mapping)) {
    const cur = env[envName];
    // Treat only undefined/null as unset so callers can pass "" to block file-backed secrets (tests/CI).
    if (secrets[provider] && (cur === undefined || cur === null)) {
      env[envName] = secrets[provider];
    }
  }
  return env;
}

function isPlainObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
