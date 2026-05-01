export function hasFlag(argv, flag) {
  return argv.includes(flag);
}

export function readOption(argv, name, fallback = undefined) {
  const index = argv.indexOf(name);
  if (index === -1) return fallback;
  return argv[index + 1] ?? fallback;
}

export function splitAfterDoubleDash(argv) {
  const index = argv.indexOf("--");
  if (index === -1) return [argv, []];
  return [argv.slice(0, index), argv.slice(index + 1)];
}

export function withoutFlags(argv, flags) {
  const result = [];
  for (let i = 0; i < argv.length; i += 1) {
    const value = argv[i];
    const spec = flags.get(value);
    if (!spec) {
      result.push(value);
      continue;
    }
    if (spec.takesValue) i += 1;
  }
  return result;
}
