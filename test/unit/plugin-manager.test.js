import test from "node:test";
import assert from "node:assert/strict";
import {
  PluginManager,
  PLUGIN_PERMISSIONS,
  PLUGIN_TYPES,
  resolvePluginPermissions,
  validatePluginManifest
} from "../../src/plugins/plugin-manager.js";

test("PluginManager runs trusted hooks in order", async () => {
  const manager = new PluginManager({
    plugins: [
      { name: "a", trusted: true, beforeRender: async (ctx) => ({ ...ctx, value: ctx.value + 1 }) },
      { name: "b", trusted: true, beforeRender: async (ctx) => ({ ...ctx, value: ctx.value * 3 }) }
    ]
  });
  const result = await manager.runHook("beforeRender", { value: 2 });
  assert.equal(result.value, 9);
});

test("PluginManager rejects untrusted plugins", () => {
  assert.throws(() => new PluginManager({
    policy: { trustPlugin: () => false },
    plugins: [{ name: "unsafe" }]
  }), /not trusted/);
});

test("PluginManager times out slow hooks", async () => {
  const manager = new PluginManager({
    timeoutMs: 10,
    plugins: [{ name: "slow", trusted: true, beforeRender: () => new Promise(() => {}) }]
  });
  await assert.rejects(() => manager.runHook("beforeRender", {}), /timed out/);
});

test("validatePluginManifest rejects malformed manifests", () => {
  assert.throws(() => validatePluginManifest(null), /Invalid plugin manifest/);
  assert.throws(
    () =>
      validatePluginManifest({
        id: "",
        version: "1",
        type: "theme",
        entry: "./a.js",
        permissions: []
      }),
    /Invalid plugin manifest/
  );
});

test("resolvePluginPermissions applies type caps for theme plugins", () => {
  const manifest = {
    id: "t",
    version: "1.0.0",
    type: PLUGIN_TYPES.THEME,
    entry: "./entry.js",
    permissions: ["read:session", PLUGIN_PERMISSIONS.EXEC_SYSTEM]
  };
  const resolved = resolvePluginPermissions(manifest);
  assert.deepEqual(resolved, ["read:session"]);
});

test("PluginManager registers manifest plugins when trusted by policy", async () => {
  const manager = new PluginManager({
    policy: { trustPlugin: (id) => id === "trusted-theme" },
    plugins: [
      {
        id: "trusted-theme",
        version: "1.0.0",
        type: PLUGIN_TYPES.THEME,
        entry: "./theme.js",
        permissions: [PLUGIN_PERMISSIONS.READ_SESSION],
        async beforeRender(ctx) {
          return { ...ctx, value: ctx.value + 10 };
        }
      }
    ]
  });
  const result = await manager.runHook("beforeRender", { value: 5 });
  assert.equal(result.value, 15);
});

test("PluginManager rejects untrusted manifest plugins", () => {
  assert.throws(
    () =>
      new PluginManager({
        policy: { trustPlugin: () => false },
        plugins: [
          {
            id: "blocked",
            version: "1.0.0",
            type: PLUGIN_TYPES.THEME,
            entry: "./x.js",
            permissions: [PLUGIN_PERMISSIONS.READ_SESSION]
          }
        ]
      }),
    /not trusted/
  );
});
