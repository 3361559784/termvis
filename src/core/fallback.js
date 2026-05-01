export const DEFAULT_FALLBACK_CHAIN = Object.freeze([
  "kitty",
  "iterm",
  "sixels",
  "symbols-truecolor",
  "symbols-256",
  "mono",
  "ascii",
  "plain"
]);

export function selectRenderMode(caps, config = {}) {
  const chain = config.render?.fallbackChain || DEFAULT_FALLBACK_CHAIN;
  const backend = config.render?.backend || "auto";
  if (backend === "disabled") return { mode: "plain", reason: "render backend disabled" };
  if (!caps?.isTTY || caps.termDumb) return { mode: "plain", reason: "non-interactive terminal" };
  if (caps.noColor) {
    const mode = firstSupported(chain, ["mono", "ascii", "plain"]) || "plain";
    return { mode, reason: "NO_COLOR active" };
  }

  for (const mode of chain) {
    if (isModeSupported(mode, caps, config)) return { mode, reason: "first supported fallback mode" };
  }
  return { mode: "plain", reason: "no fallback mode matched" };
}

export function isModeSupported(mode, caps, config = {}) {
  if (!mode) return false;
  if (["plain", "ascii"].includes(mode)) return true;
  if (mode === "mono") return caps.unicodeLevel !== "ascii";
  if (mode === "symbols-256") return caps.colorDepth >= 8;
  if (mode === "symbols-truecolor") return caps.colorDepth >= 24;
  if (["kitty", "iterm", "sixels"].includes(mode)) {
    return config.render?.preferPixelProtocol !== false && caps.pixelProtocol === mode;
  }
  return false;
}

export function modeToChafaArgs(mode, caps, config = {}, request = {}) {
  const render = config.render || {};
  const image = request.image || {};
  const args = [];
  const format = pixelFormatForMode(mode);
  args.push("--format", format);
  args.push("--colors", colorsForMode(mode, caps));
  args.push("--view-size", `${Math.max(1, caps.cols || 80)}x${Math.max(1, caps.rows || 24)}`);
  args.push("--size", `${Math.max(1, caps.cols || 80)}x${Math.max(1, caps.rows || 24)}`);
  args.push("--font-ratio", render.fontRatio || "1/2");
  args.push("--symbols", symbolsForMode(mode, render.symbols));
  args.push("--animate", "off");
  args.push("--polite", "on");
  args.push("--optimize", String(Number.isInteger(render.optimize) ? render.optimize : 9));
  args.push("--preprocess", render.preprocess === false ? "off" : "on");
  if (format === "symbols") {
    args.push("--scale", image.scale || render.scale || "max");
    args.push("--align", image.align || render.align || "mid,mid");
    args.push("--dither", render.dither || "diffusion");
    args.push("--dither-grain", render.ditherGrain || "2x2");
    args.push("--dither-intensity", String(Number.isFinite(render.ditherIntensity) ? render.ditherIntensity : 0.75));
    args.push("--color-space", render.colorSpace || "din99d");
    args.push("--color-extractor", render.colorExtractor || "median");
  }
  if (image.fit === "stretch" || render.fit === "stretch") args.push("--stretch");
  if (image.fit === "cover" || render.fit === "cover") args.push("--fit-width");
  args.push("--work", String(Number.isFinite(render.work) ? render.work : 9));
  args.push("--threads", String(Number.isFinite(render.threads) ? render.threads : -1));
  return args;
}

function firstSupported(chain, candidates) {
  return chain.find((mode) => candidates.includes(mode));
}

function pixelFormatForMode(mode) {
  if (mode === "kitty") return "kitty";
  if (mode === "iterm") return "iterm";
  if (mode === "sixels") return "sixels";
  return "symbols";
}

function colorsForMode(mode, caps) {
  if (["plain", "ascii", "mono"].includes(mode) || caps.noColor) return "none";
  if (mode === "symbols-256") return "256";
  if (caps.colorDepth >= 24) return "full";
  if (caps.colorDepth >= 8) return "256";
  if (caps.colorDepth >= 4) return "16";
  return "none";
}

function symbolsForMode(mode, configured) {
  if (mode === "ascii") return "ascii";
  if (mode === "mono") return "block+border+space";
  return configured || "block+border+space+braille+sextant+quad";
}
