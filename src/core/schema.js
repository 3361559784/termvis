export function createConfigSchema() {
  return {
    $schema: "https://json-schema.org/draft/2020-12/schema",
    $id: "https://termvis.dev/schema/config.json",
    title: "termvis configuration",
    type: "object",
    additionalProperties: true,
    $defs: {
      SoulHostContext: {
        type: "object",
        additionalProperties: true,
        properties: {
          host: { enum: ["codex", "claude-code", "opencode", "generic"], default: "generic" },
          mode: { enum: ["plan", "build", "chat", "review", "unspecified"], default: "unspecified" },
          approvalState: { enum: ["free", "pending", "restricted"], default: "free" },
          sandbox: { enum: ["read-only", "workspace-write", "dangerous", "unspecified"], default: "unspecified" },
          ttyCaps: {
            type: "object",
            additionalProperties: true,
            properties: {
              cols: { type: "integer", minimum: 1, maximum: 9999 },
              rows: { type: "integer", minimum: 1, maximum: 9999 },
              colorDepth: { enum: [1, 4, 8, 24] },
              pixelProtocol: { enum: ["kitty", "iterm", "sixels", "none"] }
            }
          }
        }
      },
      SoulPresenceState: {
        type: "object",
        additionalProperties: true,
        properties: {
          mode: { enum: ["dormant", "ambient", "attentive", "foreground"], default: "ambient" },
          attention: { type: "number", minimum: 0, maximum: 1 },
          foreground: { type: "boolean" },
          silenceBudgetMs: { type: "number" },
          userConsentLevel: { enum: ["minimal", "balanced", "expressive"], default: "balanced" },
          inactiveStreakMs: { type: "number", minimum: 0 }
        }
      },
      SoulMoodState: {
        type: "object",
        additionalProperties: true,
        properties: {
          valence: { type: "number", minimum: -1, maximum: 1 },
          arousal: { type: "number", minimum: 0, maximum: 1 },
          dominance: { type: "number", minimum: 0, maximum: 1 },
          tags: {
            type: "array",
            items: { enum: ["calm", "focused", "curious", "guarded", "delighted", "tired"] }
          },
          confidence: { type: "number", minimum: 0, maximum: 1 }
        }
      },
      SoulPulseState: {
        type: "object",
        additionalProperties: true,
        properties: {
          heartbeatBpm: { type: "number", minimum: 58, maximum: 96 },
          breathMs: { type: "number", minimum: 2600, maximum: 4800 },
          blinkMs: { type: "number", minimum: 1800, maximum: 4200 },
          microMotion: { type: "number", minimum: 0.1, maximum: 0.7 }
        }
      },
      SoulExpressionState: {
        type: "object",
        additionalProperties: true,
        properties: {
          face: { enum: ["idle", "blink", "think", "speak", "smile", "warn"] },
          gesture: { enum: ["none", "nod", "pulse-ring", "glow", "cursor-tail"] },
          frameset: { type: "string" },
          intensity: { type: "integer", minimum: 0, maximum: 3 }
        }
      },
      SoulSaysState: {
        type: "object",
        additionalProperties: true,
        properties: {
          main: { type: "string" },
          aside: { type: "string" },
          tone: { enum: ["plain", "warm", "playful", "guarded"] },
          speechAct: { enum: ["answer", "warn", "suggest", "reflect", "confirm"] }
        }
      },
      SoulProvenance: {
        type: "object",
        additionalProperties: true,
        properties: {
          signalRefs: { type: "array", items: { type: "string" } },
          memoryRefs: { type: "array", items: { type: "string" } },
          ruleRefs: { type: "array", items: { type: "string" } },
          llmRunId: { type: "string" },
          consistencyScore: { type: "number", minimum: 0, maximum: 1 }
        }
      },
      SoulFrame: {
        type: "object",
        additionalProperties: true,
        properties: {
          schemaVersion: { type: "string", default: "1.0.0" },
          entityVersion: { type: "integer", minimum: 1 },
          frameId: { type: "string" },
          sessionId: { type: "string" },
          ts: { type: "string", description: "ISO-8601 timestamp" },
          host: { $ref: "#/$defs/SoulHostContext" },
          presence: { $ref: "#/$defs/SoulPresenceState" },
          mood: { $ref: "#/$defs/SoulMoodState" },
          pulse: { $ref: "#/$defs/SoulPulseState" },
          expression: { $ref: "#/$defs/SoulExpressionState" },
          says: { $ref: "#/$defs/SoulSaysState" },
          provenance: { $ref: "#/$defs/SoulProvenance" }
        }
      }
    },
    properties: {
      profile: { type: "string", default: "default" },
      ui: {
        type: "object",
        additionalProperties: true,
        properties: {
          language: { enum: ["en", "zh", "ja"], default: "en" }
        }
      },
      render: {
        type: "object",
        additionalProperties: false,
        properties: {
          backend: { enum: ["auto", "system", "bundled", "disabled"], default: "auto" },
          preferPixelProtocol: { type: "boolean", default: true },
          fallbackChain: {
            type: "array",
            items: {
              enum: ["kitty", "iterm", "sixels", "symbols-truecolor", "symbols-256", "mono", "ascii", "plain"]
            },
            minItems: 1
          },
          fontRatio: { type: "string", pattern: "^[0-9]+(?:\\.[0-9]+)?(?:/[0-9]+(?:\\.[0-9]+)?)?$" },
          symbols: { type: "string" },
          work: { type: "integer", minimum: 1, maximum: 9 },
          threads: { type: "integer" },
          optimize: { type: "integer", minimum: 0, maximum: 9 },
          preprocess: { type: "boolean" },
          dither: { enum: ["none", "ordered", "diffusion", "noise"] },
          ditherGrain: { type: "string", pattern: "^(1|2|4|8)x(1|2|4|8)$" },
          ditherIntensity: { type: "number", minimum: 0 },
          colorSpace: { enum: ["rgb", "din99d"] },
          colorExtractor: { enum: ["average", "median"] },
          timeoutMs: { type: "integer", minimum: 1 },
          chafaPath: {
            type: "string",
            description: "Path to the chafa executable. Relative paths resolve from the current working directory."
          }
        }
      },
      theme: {
        type: "object",
        additionalProperties: true,
        properties: {
          name: { type: "string" },
          respectNoColor: { type: "boolean" },
          minimumContrast: { type: "number", minimum: 1 },
          tokens: {
            type: "object",
            additionalProperties: { type: ["string", "null"] }
          }
        }
      },
      accessibility: {
        type: "object",
        additionalProperties: false,
        properties: {
          screenReaderMode: { type: "boolean", default: false },
          altText: { type: "boolean", default: true },
          reduceMotion: { type: "boolean", default: false },
          respectNoColor: { type: "boolean", default: true }
        }
      },
      mood: {
        type: "object",
        properties: {
          showHeartbeat: { type: "boolean", default: true },
          idleHeartbeatBpm: { type: "array", items: { type: "number" }, minItems: 2, maxItems: 2 },
          maxFps: { type: "number", minimum: 1, maximum: 12, default: 6 }
        }
      },
      memory: {
        type: "object",
        properties: {
          scope: { enum: ["session", "project", "user"], default: "project" },
          reflective: { type: "boolean", default: false },
          retentionDays: { type: "number", minimum: 1, default: 30 },
          workingLimit: { type: "integer", minimum: 1, default: 20 },
          episodicLimit: { type: "integer", minimum: 1, default: 200 },
          semanticLimit: { type: "integer", minimum: 1, default: 100 }
        }
      },
      soulBios: {
        type: "object",
        additionalProperties: false,
        properties: {
          enabled: { type: "boolean", default: true },
          transport: { enum: ["stdio", "uds", "named-pipe", "http"], default: "stdio" },
          auditLog: { type: "boolean", default: true },
          snapshotIntervalMs: { type: "number", minimum: 5000, default: 60000 },
          decayEnabled: { type: "boolean", default: true },
          initialPresenceMode: { enum: ["dormant", "ambient", "attentive", "foreground"], default: "ambient" },
          initialConsentLevel: { enum: ["minimal", "balanced", "expressive"], default: "balanced" }
        }
      },
      life: {
        type: "object",
        additionalProperties: false,
        properties: {
          enabled: { type: "boolean", default: true },
          strict: {
            type: "boolean",
            default: true,
            description: "When true, living shell mode requires chafa, node-pty, TTY, and color support instead of silently degrading."
          },
          symbolic: {
            type: "boolean",
            default: true,
            description: "Prefer chafa symbols over pixel protocols so the avatar is expressed as terminal glyphs."
          },
          pulse: { enum: ["title", "line", "quiet"], default: "title" },
          avatar: { type: ["string", "null"] },
          avatarWidth: { type: "integer", minimum: 1 },
          avatarHeight: { type: "integer", minimum: 1 },
          avatarFit: { enum: ["cover", "contain", "stretch"], default: "contain" },
          avatarAlign: { type: "string", pattern: "^(top|mid|bottom),(left|mid|right)$" },
          avatarScale: { type: "string" },
          maxFps: {
            type: "number",
            minimum: 1,
            maximum: 12,
            default: 4,
            description: "Maximum refresh rate for the living rail. Keep this low so host CLI output remains primary."
          },
          layout: {
            type: "object",
            additionalProperties: false,
            properties: {
              side: { enum: ["left"], default: "left" },
              minHostCols: { type: "integer", minimum: 20, default: 40 },
              minRailWidth: { type: "integer", minimum: 18, default: 30 },
              maxRailWidth: { type: "integer", minimum: 18, default: 44 }
            }
          },
          trace: { type: "boolean", default: true },
          soul: {
            type: "object",
            additionalProperties: false,
            properties: {
              enabled: { type: "boolean", default: true },
              mode: { enum: ["transparent", "minimal", "companion"], default: "companion" },
              narration: { type: "string" },
              reply: { type: "string" },
              persona: {
                type: "object",
                additionalProperties: true,
                properties: {
                  id: { type: "string" },
                  name: { type: "string" },
                  language: { enum: ["en", "zh", "ja"] },
                  corePurpose: {
                    enum: ["coding-assistant", "companion", "hybrid"],
                    default: "hybrid"
                  },
                  archetype: {
                    enum: ["quiet-oracle", "warm-scout", "playful-synth", "custom"],
                    default: "quiet-oracle"
                  },
                  traits: { type: "array", items: { type: "string" } },
                  boundaries: {
                    type: "object",
                    additionalProperties: false,
                    properties: {
                      romance: { enum: ["forbid", "soft-no", "unspecified"], default: "forbid" },
                      persuasion: { enum: ["forbid", "warn"], default: "warn" },
                      proactiveStart: { enum: ["off", "low", "medium"], default: "low" }
                    }
                  },
                  speakingStyle: {
                    type: "object",
                    additionalProperties: false,
                    properties: {
                      brevity: { type: "integer", minimum: 0, maximum: 3, default: 2 },
                      warmth: { type: "integer", minimum: 0, maximum: 3, default: 2 },
                      metaphor: { type: "integer", minimum: 0, maximum: 3, default: 1 },
                      emoji: { type: "integer", minimum: 0, maximum: 3, default: 0 }
                    }
                  },
                  role: { type: "string" },
                  trustMode: { enum: ["transparent", "minimal", "companion"] },
                  style: { type: "string" },
                  boundary: { type: "string" }
                }
              }
            }
          }
        }
      },
      cognition: {
        type: "object",
        additionalProperties: true,
        properties: {
          enabled: { type: "boolean", default: true },
          safetyJudge: { type: "boolean", default: false },
          reflectionTickInterval: { type: "integer", minimum: 1, default: 20 },
          persona: {
            type: "object",
            additionalProperties: true,
            properties: {
              id: { type: "string" },
              name: { type: "string" },
              language: { enum: ["en", "zh", "ja"] },
              role: { type: "string" },
              archetype: { enum: ["quiet-oracle", "warm-scout", "playful-synth", "custom"] },
              style: { type: "string" },
              traits: { type: "array", items: { type: "string" } },
              speakingStyle: {
                type: "object",
                additionalProperties: false,
                properties: {
                  brevity: { type: "integer", minimum: 0, maximum: 3 },
                  warmth: { type: "integer", minimum: 0, maximum: 3 },
                  metaphor: { type: "integer", minimum: 0, maximum: 3 },
                  emoji: { type: "integer", minimum: 0, maximum: 3 }
                }
              }
            }
          },
          llm: {
            type: "object",
            additionalProperties: true,
            properties: {
              provider: { enum: ["auto", "openai", "deepseek", "anthropic", "ollama", "codex", "none"] },
              model: { type: ["string", "null"] },
              apiKeyEnv: { type: "string", pattern: "^[A-Za-z_][A-Za-z0-9_]*$" },
              baseURL: { type: "string" },
              apiBase: { type: "string" },
              maxTokens: { type: "integer", minimum: 1 },
              temperature: { type: "number", minimum: 0, maximum: 2 }
            }
          },
          embedding: {
            type: "object",
            additionalProperties: true,
            properties: {
              provider: { enum: ["auto", "openai", "ollama", "lexical"] },
              model: { type: ["string", "null"] },
              dimensions: { type: ["integer", "null"], minimum: 1 },
              probeOllama: { type: "boolean" }
            }
          },
          memory: {
            type: "object",
            additionalProperties: true
          },
          requireReal: { type: "boolean" }
        }
      },
      soulSays: {
        type: "object",
        additionalProperties: true,
        properties: {
          enabled: { type: "boolean", default: true },
          mode: { enum: ["silent", "minimal", "balanced", "expressive", "debug"], default: "expressive" },
          bottomStrip: {
            type: "object",
            additionalProperties: true,
            properties: {
              visible: { type: "boolean", default: true },
              historySize: { type: "integer", minimum: 0, default: 5 }
            }
          },
          generation: {
            type: "object",
            additionalProperties: true,
            properties: {
              llmCandidates: { type: "boolean", default: true },
              llmOnlyAtCheckpoints: { type: "boolean", default: false },
              maxLlmCallsPerHour: {
                type: "integer",
                minimum: 0,
                default: 0,
                description: "0 means unlimited; Soul Says still requires a real configured LLM."
              }
            }
          },
          cadence: {
            type: "object",
            additionalProperties: true,
            properties: {
              minCooldownMs: { type: "integer", minimum: 0, default: 0 },
              afterMicroStatusMs: { type: "integer", minimum: 0, default: 0 },
              afterMemoryEchoMs: { type: "integer", minimum: 0, default: 0 },
              afterPlayfulMs: { type: "integer", minimum: 0, default: 0 },
              afterRiskGuardMs: { type: "integer", minimum: 0, default: 0 },
              ambientRefreshMs: { type: "integer", minimum: 5000, default: 20000 }
            }
          }
        }
      },
      plugins: {
        type: "object",
        additionalProperties: false,
        properties: {
          local: { type: "array", items: { type: "string" } },
          npm: { type: "array", items: { type: "string" } }
        }
      },
      security: {
        type: "object",
        additionalProperties: false,
        properties: {
          trustedPlugins: { type: "array", items: { type: "string" } },
          network: { type: "boolean" },
          execAllowlist: { type: "array", items: { type: "string" } },
          fileReadAllowlist: { type: "array", items: { type: "string" } }
        }
      },
      hosts: {
        type: "object",
        additionalProperties: {
          type: "object",
          additionalProperties: true,
          properties: {
            enabled: { type: "boolean" }
          }
        }
      }
    }
  };
}
