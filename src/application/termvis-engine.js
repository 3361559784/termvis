import { detectTerminalCapabilities } from "../core/capabilities.js";
import { DEFAULT_CONFIG, loadConfig } from "../core/config.js";
import { renderCard } from "../core/layout.js";
import { createSecurityPolicy } from "../security/policy.js";
import { PluginManager } from "../plugins/plugin-manager.js";
import { renderVisual } from "../render/chafa-runner.js";

export class TermvisEngine {
  constructor({
    cwd = process.cwd(),
    env = process.env,
    config = DEFAULT_CONFIG,
    policy = createSecurityPolicy(config, { cwd }),
    plugins = [],
    capabilityProbe = detectTerminalCapabilities,
    renderer = renderVisual
  } = {}) {
    this.cwd = cwd;
    this.env = env;
    this.config = config;
    this.policy = policy;
    this.plugins = new PluginManager({ plugins, policy });
    this.capabilityProbe = capabilityProbe;
    this.renderer = renderer;
  }

  static async fromWorkspace({ cwd = process.cwd(), env = process.env, plugins = [] } = {}) {
    const loaded = await loadConfig({ cwd, env });
    return new TermvisEngine({
      cwd,
      env,
      config: loaded.value,
      plugins
    });
  }

  probeCapabilities({ stdout, stdin, env } = {}) {
    return this.capabilityProbe({
      env: { ...this.env, ...(env || {}) },
      stdout,
      stdin
    });
  }

  async renderBlock(params = {}, io = {}) {
    const caps = params.caps || this.probeCapabilities({
      stdout: io.stdout,
      stdin: io.stdin,
      env: params.env
    });
    const initialContext = {
      ...params,
      caps,
      config: params.config || this.config,
      cwd: this.cwd,
      env: { ...this.env, ...(params.env || {}) }
    };
    const before = await this.plugins.runHook("beforeRender", initialContext);
    const rendered = await this.renderer({
      source: before.source,
      alt: before.alt || before.altText || "Visual block",
      caps: before.caps,
      config: before.config,
      env: before.env,
      cwd: this.cwd,
      strict: Boolean(before.strict),
      image: before.image
    });
    const sanitized = {
      ...rendered,
      payload: this.policy.sanitizeOutput(rendered.payload || "")
    };
    return this.plugins.runHook("afterRender", { ...before, result: sanitized })
      .then((hookResult) => hookResult?.result || sanitized);
  }

  async layoutCard(params = {}) {
    const width = Number(params.width || 80);
    return {
      lines: renderCard({
        title: params.title || "termvis",
        body: params.body || "",
        width: Math.max(12, width)
      })
    };
  }
}

export async function createTermvisEngine(options = {}) {
  return TermvisEngine.fromWorkspace(options);
}
