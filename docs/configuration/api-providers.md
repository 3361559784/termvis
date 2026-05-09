# API provider configuration

[← Back to doc index](../README.md) · [Settings](./settings.md) · [Quickstart](../guides/quickstart.md)

Soul Dynamics uses LLM calls for appraisal, structured Soul Says output, and embeddings. The `termvis` codebase ships concrete providers for **OpenAI**, **DeepSeek**, **Anthropic**, **Ollama**, and **Codex CLI**; other vendors are accessed through **OpenAI-compatible HTTP** (`OPENAI_BASE_URL`) where your gateway supports `/v1/chat/completions`.

Configuration lives in discovered JSONC files (see [Settings](./settings.md)) under the `cognition` object.

## Shared JSONC knobs

| Key | Purpose |
|-----|---------|
| `cognition.llm.provider` | `auto` (default), `openai`, `deepseek`, `anthropic`, `ollama`, `codex`, `none` |
| `cognition.llm.model` | Overrides default model for the chosen provider |
| `cognition.llm.maxTokens` | Upper bound for completions |
| `cognition.llm.temperature` | Sampling temperature |
| `cognition.embedding.provider` | `auto`, `openai`, `ollama` |
| `cognition.embedding.model` | Embedding model id |
| `cognition.requireReal` | If true, hard-fail when no real LLM is available |

## OpenAI

| Mechanism | Variable / key | Notes |
|-----------|----------------|-------|
| API key | `OPENAI_API_KEY` | Required for cloud OpenAI |
| Base URL | `OPENAI_BASE_URL` | Default `https://api.openai.com/v1`; point at proxies |
| Model override | `TERMVIS_LLM_MODEL` | Shipped default often `gpt-4o-mini` |

**Example (`termvis.config.jsonc`)**

```jsonc
{
  "cognition": {
    "llm": { "provider": "openai", "model": "gpt-4o-mini", "temperature": 0.4 },
    "embedding": { "provider": "openai", "model": "text-embedding-3-small" }
  }
}
```

## Anthropic

| Mechanism | Variable / key | Notes |
|-----------|----------------|-------|
| API key | `ANTHROPIC_API_KEY` | Required |
| Base URL | `ANTHROPIC_BASE_URL` | Default `https://api.anthropic.com/v1` |
| API version | `ANTHROPIC_VERSION` | Default `2023-06-01` |

```jsonc
{
  "cognition": {
    "llm": { "provider": "anthropic", "model": "claude-haiku-4.5" }
  }
}
```

## Ollama (local)

| Mechanism | Variable / key | Notes |
|-----------|----------------|-------|
| Host | `OLLAMA_HOST` or `OLLAMA_BASE_URL` | Default `http://localhost:11434` |
| Probe | `cognition.ollama.probe` | Auto-probe behavior |

Works for both chat and embeddings when models are pulled locally.

## DeepSeek

DeepSeek is a first-class provider. It uses the OpenAI-compatible chat-completions surface while keeping a separate provider name and key variable.

| Mechanism | Variable / key |
|-----------|----------------|
| Key | `DEEPSEEK_API_KEY` |
| Base | `DEEPSEEK_BASE_URL` or `cognition.llm.baseURL` |
| Default base | `https://api.deepseek.com/v1` |
| Default model | `deepseek-chat` |
| Provider | `cognition.llm.provider`: `deepseek` |

```bash
export DEEPSEEK_API_KEY="..."
termvis setup --yes --provider deepseek --api-key-env DEEPSEEK_API_KEY
termvis setting --provider deepseek --model deepseek-chat
```

```jsonc
{
  "cognition": {
    "llm": {
      "provider": "deepseek",
      "model": "deepseek-chat",
      "baseURL": "https://api.deepseek.com/v1"
    }
  }
}
```

## Google Gemini (REST compatibility)

Prefer an **OpenAI compatibility** endpoint if your Google Cloud setup provides one; configure it exactly like OpenAI with `OPENAI_BASE_URL` pointing at the Gemini OpenAI adapter and `OPENAI_API_KEY` set to the Gemini API key.

| Mechanism | Variable / key |
|-----------|----------------|
| API key | `GEMINI_API_KEY` | Used by **Gemini CLI** host sessions (not the same code path as `cognition.llm`) |
| JSONC | `cognition.llm.provider`: `openai` + matching base URL + model name |

When running **Gemini CLI** as the host, see [`../docs/COPILOT_GEMINI_USAGE.md`](../docs/COPILOT_GEMINI_USAGE.md).

## OpenRouter

OpenRouter is OpenAI-compatible for chat completions.

| Mechanism | Variable / key |
|-----------|----------------|
| Key | `OPENAI_API_KEY` (OpenRouter-issued) |
| Base | `OPENAI_BASE_URL` → `https://openrouter.ai/api/v1` |
| Model | Fully qualified route string required by OpenRouter |

## Azure OpenAI

| Mechanism | Variable / key | Notes |
|-----------|----------------|-------|
| Key | `OPENAI_API_KEY` | Azure key |
| Base | `OPENAI_BASE_URL` | `https://YOUR_RESOURCE.openai.azure.com/openai/deployments/YOUR_DEPLOYMENT` (follow Azure’s path rules) |
| Model | Often embedded in deployment; `cognition.llm.model` may echo deployment name |

Confirm your Azure deployment supports the same JSON response shapes the client expects (`/chat/completions`).

## Provider selection quick reference

| If you have… | Set… |
|--------------|------|
| OpenAI key | `OPENAI_API_KEY` |
| DeepSeek key | `DEEPSEEK_API_KEY` + `cognition.llm.provider: deepseek` |
| Anthropic key | `ANTHROPIC_API_KEY` |
| Local Ollama | `OLLAMA_HOST` + pulled models |
| Codex CLI routing | `cognition.llm.provider`: `codex` |
| Third-party OpenAI surface | `OPENAI_API_KEY` + `OPENAI_BASE_URL` |

## Related documentation

- [Settings](./settings.md)
- [Signal LLM path](../subsystems/signal.md)
- [Repository README (env overview)](../README.md)
