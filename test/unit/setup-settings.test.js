import test from "node:test";
import assert from "node:assert/strict";
import { buildConfig, normalizeApiKeyEnv, stripConfigSecrets } from "../../src/cli/setup-wizard.js";
import { createLLMProvider } from "../../src/cognition/index.js";

test("setup config stores provider env names instead of API key literals", async () => {
  const config = buildConfig({
    provider: "deepseek",
    apiKeyEnv: "TERMVIS_DEEPSEEK_KEY",
    model: "deepseek-chat",
    language: "zh",
    personaName: "Custom Soul"
  });

  const text = JSON.stringify(config);
  assert.equal(config.cognition.llm.provider, "deepseek");
  assert.equal(config.cognition.llm.apiKey, undefined);
  assert.equal(config.cognition.llm.apiKeyEnv, "TERMVIS_DEEPSEEK_KEY");
  assert.equal(config.life.avatar, undefined);
  assert.equal(config.life.soul.persona.name, "Custom Soul");
  assert.equal(config.cognition.persona.name, "Custom Soul");
  assert.doesNotMatch(text, /deepseek-secret-should-not-be-written/);
});

test("buildConfig preserves existing values when not overridden", async () => {
  const existing = {
    ui: { language: "ja" },
    theme: { name: "dawn-glass" },
    cognition: {
      llm: { provider: "openai", model: "gpt-4o", apiKeyEnv: "MY_KEY" },
      persona: { name: "OldSoul", id: "old" }
    },
    life: { soul: { persona: { name: "OldSoul", id: "old" } } },
    accessibility: { reduceMotion: true }
  };
  const config = buildConfig({ existing, model: "gpt-4o-mini" });

  assert.equal(config.ui.language, "ja");
  assert.equal(config.theme.name, "dawn-glass");
  assert.equal(config.cognition.llm.provider, "openai");
  assert.equal(config.cognition.llm.model, "gpt-4o-mini");
  assert.equal(config.cognition.llm.apiKeyEnv, "MY_KEY");
  assert.equal(config.cognition.persona.name, "OldSoul");
  assert.equal(config.accessibility.reduceMotion, true);
});

test("buildConfig sets persona on both life.soul.persona and cognition.persona", async () => {
  const config = buildConfig({
    personaName: "NewSoul",
    personaProfile: "new-profile",
    personaRole: "guide",
    personaArchetype: "warm-scout"
  });

  assert.equal(config.life.soul.persona.name, "NewSoul");
  assert.equal(config.life.soul.persona.id, "new-profile");
  assert.equal(config.life.soul.persona.role, "guide");
  assert.equal(config.life.soul.persona.archetype, "warm-scout");
  assert.equal(config.cognition.persona.name, "NewSoul");
  assert.equal(config.cognition.persona.id, "new-profile");
});

test("buildConfig stores presence in soulBios.initialConsentLevel", async () => {
  const config = buildConfig({ presenceMode: "expressive" });
  assert.equal(config.soulBios.initialConsentLevel, "expressive");
});

test("LLM provider resolves API keys from configured env names", async () => {
  const provider = await createLLMProvider({
    env: { TERMVIS_DEEPSEEK_KEY: "deepseek-env-key" },
    config: {
      cognition: {
        llm: {
          provider: "deepseek",
          apiKeyEnv: "TERMVIS_DEEPSEEK_KEY",
          model: "deepseek-chat"
        },
        ollama: { probe: false }
      }
    }
  });

  assert.equal(provider.name, "deepseek");
  assert.equal(provider.apiKey, "deepseek-env-key");
});

test("LLM provider ignores API key literals stored in config", async () => {
  const provider = await createLLMProvider({
    env: { DEEPSEEK_API_KEY: "" },
    config: {
      cognition: {
        llm: {
          provider: "deepseek",
          apiKey: "config-secret-should-not-be-used",
          model: "deepseek-chat"
        },
        ollama: { probe: false }
      }
    }
  });

  assert.equal(provider, null);
});

test("LLM provider ignores secret-looking apiKeyEnv and falls back to default env", async () => {
  const provider = await createLLMProvider({
    env: { OPENAI_API_KEY: "openai-env-key" },
    config: {
      cognition: {
        llm: {
          provider: "openai",
          apiKeyEnv: "sk-secret-value-should-not-be-env-name",
          model: "gpt-4o-mini"
        },
        ollama: { probe: false }
      }
    }
  });

  assert.equal(provider.name, "openai");
  assert.equal(provider.apiKey, "openai-env-key");
});

test("settings migration strips stored API key literals", () => {
  const config = stripConfigSecrets({
    llm: { apiKey: "legacy-secret" },
    cognition: { llm: { provider: "openai", apiKey: "nested-secret", apiKeyEnv: "OPENAI_API_KEY" } }
  });

  assert.equal(config.llm.apiKey, undefined);
  assert.equal(config.cognition.llm.apiKey, undefined);
  assert.equal(config.cognition.llm.apiKeyEnv, "OPENAI_API_KEY");
});

test("settings migration replaces secret-looking apiKeyEnv with provider env name", () => {
  const config = stripConfigSecrets({
    cognition: { llm: { provider: "deepseek", apiKeyEnv: "sk-secret-value-should-not-be-env-name" } }
  });

  assert.equal(config.cognition.llm.apiKeyEnv, "DEEPSEEK_API_KEY");
  assert.equal(normalizeApiKeyEnv("openai", "MY_OPENAI_KEY"), "MY_OPENAI_KEY");
  assert.equal(normalizeApiKeyEnv("openai", "sk-secret-value-should-not-be-env-name"), "OPENAI_API_KEY");
});
