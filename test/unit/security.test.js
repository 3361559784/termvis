import test from "node:test";
import assert from "node:assert/strict";
import { createSecurityPolicy, sanitizeTerminalOutput } from "../../src/security/policy.js";

test("security policy enforces exec, network, plugin, and file scopes", () => {
  const policy = createSecurityPolicy({
    security: {
      network: false,
      trustedPlugins: ["known"],
      execAllowlist: ["chafa"],
      fileReadAllowlist: ["fixtures"]
    }
  }, { cwd: "/repo" });
  assert.equal(policy.allowNetwork(), false);
  assert.equal(policy.trustPlugin("known"), true);
  assert.equal(policy.trustPlugin("unknown"), false);
  assert.equal(policy.allowExec("chafa"), true);
  assert.equal(policy.allowExec("bash"), false);
  assert.equal(policy.allowFileRead("fixtures/a.png"), true);
  assert.equal(policy.allowFileRead("../secret"), false);
});

test("sanitizeTerminalOutput strips OSC control sequences", () => {
  assert.equal(sanitizeTerminalOutput("a\u001b]52;c;secret\u0007b"), "ab");
});
