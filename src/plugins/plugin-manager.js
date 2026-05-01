const ALL_PERMISSIONS = Object.freeze([
  "read:session",
  "write:theme",
  "write:persona",
  "exec:system",
  "net:outbound",
  "tts:speak"
]);

export const PLUGIN_TYPES = Object.freeze({
  THEME: "theme",
  PERSONA: "persona",
  SKILL: "skill",
  SYSTEM: "system"
});

export const PLUGIN_PERMISSIONS = Object.freeze({
  READ_SESSION: "read:session",
  WRITE_THEME: "write:theme",
  WRITE_PERSONA: "write:persona",
  EXEC_SYSTEM: "exec:system",
  NET_OUTBOUND: "net:outbound",
  TTS_SPEAK: "tts:speak"
});

const TYPE_VALUES = new Set(Object.values(PLUGIN_TYPES));

const VALID_PERMISSION_VALUES = new Set(Object.values(PLUGIN_PERMISSIONS));

const TYPE_PERMISSION_CAPS = Object.freeze({
  [PLUGIN_TYPES.THEME]: new Set([PLUGIN_PERMISSIONS.READ_SESSION]),
  [PLUGIN_TYPES.PERSONA]: new Set([PLUGIN_PERMISSIONS.READ_SESSION]),
  [PLUGIN_TYPES.SKILL]: new Set([
    PLUGIN_PERMISSIONS.READ_SESSION,
    PLUGIN_PERMISSIONS.WRITE_PERSONA,
    PLUGIN_PERMISSIONS.EXEC_SYSTEM,
    PLUGIN_PERMISSIONS.NET_OUTBOUND,
    PLUGIN_PERMISSIONS.TTS_SPEAK
  ]),
  [PLUGIN_TYPES.SYSTEM]: new Set(ALL_PERMISSIONS)
});

function isPluginManifestRecord(plugin) {
  return Boolean(
    plugin &&
      typeof plugin === "object" &&
      typeof plugin.id === "string" &&
      typeof plugin.version === "string" &&
      typeof plugin.type === "string" &&
      typeof plugin.entry === "string" &&
      Array.isArray(plugin.permissions)
  );
}

export function validatePluginManifest(manifest) {
  const errors = [];
  if (!manifest || typeof manifest !== "object") {
    throw new Error("Invalid plugin manifest: manifest must be an object");
  }
  if (typeof manifest.id !== "string" || !manifest.id.trim()) errors.push("id must be a non-empty string");
  if (typeof manifest.version !== "string" || !manifest.version.trim()) {
    errors.push("version must be a non-empty string");
  }
  if (typeof manifest.type !== "string" || !TYPE_VALUES.has(manifest.type)) {
    errors.push(`type must be one of ${[...TYPE_VALUES].join(", ")}`);
  }
  if (typeof manifest.entry !== "string" || !manifest.entry.trim()) {
    errors.push("entry must be a non-empty string");
  }
  if (!Array.isArray(manifest.permissions)) {
    errors.push("permissions must be an array");
  } else {
    for (const p of manifest.permissions) {
      if (!VALID_PERMISSION_VALUES.has(p)) errors.push(`unknown permission "${p}"`);
    }
  }
  if (manifest.signature !== undefined) {
    const s = manifest.signature;
    if (!s || typeof s !== "object") errors.push("signature must be an object");
    else {
      if (typeof s.keyId !== "string" || !s.keyId.trim()) {
        errors.push("signature.keyId must be a non-empty string");
      }
      if (s.algorithm !== "ed25519") errors.push('signature.algorithm must be "ed25519"');
      if (typeof s.value !== "string" || !s.value.trim()) {
        errors.push("signature.value must be a non-empty string");
      }
    }
  }
  if (errors.length) throw new Error(`Invalid plugin manifest: ${errors.join("; ")}`);
}

function effectivePermissionsAfterCaps(manifest, policy) {
  const cap = TYPE_PERMISSION_CAPS[manifest.type];
  if (!cap) return Object.freeze([]);
  let list = manifest.permissions.filter((p) => VALID_PERMISSION_VALUES.has(p) && cap.has(p));
  if (policy?.allowedPluginPermissions instanceof Set) {
    list = list.filter((p) => policy.allowedPluginPermissions.has(p));
  }
  return Object.freeze([...list]);
}

export function resolvePluginPermissions(manifest, policy) {
  validatePluginManifest(manifest);
  return effectivePermissionsAfterCaps(manifest, policy);
}

export class PluginManager {
  constructor({ plugins = [], policy, timeoutMs = 1000 } = {}) {
    this.plugins = [];
    this.policy = policy;
    this.timeoutMs = timeoutMs;
    for (const plugin of plugins) this.register(plugin);
  }

  register(plugin) {
    if (isPluginManifestRecord(plugin)) {
      validatePluginManifest(plugin);
      if (plugin.trusted !== true && this.policy && !this.policy.trustPlugin(plugin.id)) {
        throw new Error(`Plugin "${plugin.id}" is not trusted`);
      }
      const effectivePermissions = effectivePermissionsAfterCaps(plugin, this.policy);
      this.plugins.push({ ...plugin, name: plugin.id, effectivePermissions });
      return;
    }
    if (!plugin || typeof plugin.name !== "string") {
      throw new Error("Plugin must expose a string name");
    }
    if (plugin.trusted !== true && this.policy && !this.policy.trustPlugin(plugin.name)) {
      throw new Error(`Plugin "${plugin.name}" is not trusted`);
    }
    this.plugins.push(plugin);
  }

  async runHook(name, context) {
    let current = context;
    for (const plugin of this.plugins) {
      const hook = plugin[name];
      if (typeof hook !== "function") continue;
      const label = plugin.name || plugin.id;
      const next = await withTimeout(
        Promise.resolve(hook.call(plugin, current)),
        this.timeoutMs,
        `${label}.${name}`
      );
      if (next !== undefined) current = next;
    }
    return current;
  }
}

export function createAltTextPlugin(fn, name = "alt-text") {
  return {
    name,
    version: "0.0.0",
    trusted: true,
    async altText(context) {
      return { ...context, altText: await fn(context) };
    }
  };
}

function withTimeout(promise, timeoutMs, label) {
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error(`Plugin hook timed out: ${label}`)), timeoutMs);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}
