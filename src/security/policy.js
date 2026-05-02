import { resolve, sep } from "node:path";

const OSC_52_PATTERN = /\u001b\]52;[\s\S]*?(?:\u0007|\u001b\\)/g;
const DANGEROUS_OSC_PATTERN = /\u001b\](?:[0-9]+;)?[\s\S]*?(?:\u0007|\u001b\\)/g;

export function createSecurityPolicy(config = {}, { cwd = process.cwd() } = {}) {
  const security = config.security || {};
  const trustedPlugins = new Set(security.trustedPlugins || []);
  const execAllowlist = new Set(security.execAllowlist || []);
  const roots = (security.fileReadAllowlist || ["."]).map((root) => resolve(cwd, root));

  return {
    allowNetwork: () => Boolean(security.network),
    trustPlugin: (name) => trustedPlugins.has(name),
    allowExec: (command) => execAllowlist.has(command),
    allowFileRead: (path) => {
      const absolute = resolve(cwd, path);
      return roots.some((root) => {
        const base = resolve(root);
        const abs = resolve(absolute);
        if (abs === base) return true;
        const prefix = base.endsWith(sep) ? base : `${base}${sep}`;
        return abs.startsWith(prefix);
      });
    },
    sanitizeOutput: (text) => sanitizeTerminalOutput(text)
  };
}

export function sanitizeTerminalOutput(text, { stripAllOsc = true } = {}) {
  const source = String(text);
  if (stripAllOsc) return source.replace(DANGEROUS_OSC_PATTERN, "");
  return source.replace(OSC_52_PATTERN, "");
}
