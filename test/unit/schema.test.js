import test from "node:test";
import assert from "node:assert/strict";
import { createConfigSchema } from "../../src/core/schema.js";

test("createConfigSchema exposes config contract for editors and docs", () => {
  const schema = createConfigSchema();
  assert.equal(schema.$id, "https://termvis.dev/schema/config.json");
  assert.ok(schema.properties.render.properties.fallbackChain.items.enum.includes("kitty"));
  assert.equal(schema.properties.render.properties.chafaPath.type, "string");
  assert.ok(schema.properties.security.properties.execAllowlist);
});
