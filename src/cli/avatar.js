import { access } from "node:fs/promises";
import { hasFlag, readOption } from "./args.js";
import { createTermvisEngine } from "../application/termvis-engine.js";

const ALIGN_ROWS = ["top", "mid", "bottom"];
const ALIGN_COLS = ["left", "mid", "right"];
const FITS = ["cover", "contain", "stretch"];

export async function runAvatar(argv, io) {
  const image = readOption(argv, "--image", undefined) || argv.find((item) => !String(item).startsWith("--"));
  if (!image) throw new Error("termvis avatar requires an image path");
  await access(image);

  const explicitWidth = readOption(argv, "--width", undefined) !== undefined;
  const explicitHeight = readOption(argv, "--height", undefined) !== undefined;
  const width = readNumberOption(argv, "--width", Math.max(18, Math.min(42, Number(io.stdout?.columns || 80) - 2)));
  const height = readNumberOption(argv, "--height", Math.max(6, Math.round(width * 0.45)));
  const state = {
    image,
    width,
    height,
    explicitWidth,
    explicitHeight,
    fit: normalizeFit(readOption(argv, "--fit", "contain")),
    align: normalizeAlign(readOption(argv, "--align", "mid,mid")),
    scale: readOption(argv, "--scale", "max")
  };

  if (hasFlag(argv, "--json")) {
    io.stdout.write(`${JSON.stringify(avatarCommand(state), null, 2)}\n`);
    return avatarCommand(state);
  }

  const interactive = Boolean(io.stdin?.isTTY && io.stdout?.isTTY && !hasFlag(argv, "--no-ui"));
  if (!interactive) {
    const preview = await renderAvatarPreview(state, io);
    io.stdout.write(`${preview}\n${formatAvatarCommand(state)}\n`);
    return { preview, ...avatarCommand(state) };
  }

  await runAvatarUi(state, io);
  return avatarCommand(state);
}

async function runAvatarUi(state, io) {
  const stdin = io.stdin;
  const stdout = io.stdout;
  const wasRaw = Boolean(stdin.isRaw);
  stdin.setRawMode?.(true);
  stdin.resume?.();

  const redraw = async () => {
    const preview = await renderAvatarPreview(state, io);
    stdout.write("\u001b[2J\u001b[1;1H");
    stdout.write(`${preview}\n`);
    stdout.write(`\n${formatAvatarCommand(state)}\n`);
    stdout.write("keys: w/s/a/d align  +/- scale  f fit  enter/q done\n");
  };

  await redraw();
  try {
    await new Promise((resolve, reject) => {
      const onData = async (chunk) => {
        const key = chunk.toString("utf8");
        try {
          if (key === "q" || key === "\r" || key === "\n" || key === "\u0003") {
            stdin.off?.("data", onData);
            resolve();
            return;
          }
          mutateState(state, key);
          await redraw();
        } catch (error) {
          stdin.off?.("data", onData);
          reject(error);
        }
      };
      stdin.on("data", onData);
    });
  } finally {
    stdin.setRawMode?.(wasRaw);
    stdin.pause?.();
  }
}

async function renderAvatarPreview(state, io) {
  const engine = await createTermvisEngine({ cwd: io.cwd, env: io.env });
  const caps = engine.probeCapabilities({ stdout: io.stdout, stdin: io.stdin, env: io.env });
  const result = await engine.renderBlock({
    source: { type: "file", path: state.image },
    alt: "soul avatar preview",
    caps: {
      ...caps,
      isTTY: true,
      termDumb: false,
      noColor: false,
      colorDepth: Math.max(24, Number(caps.colorDepth || 0)),
      unicodeLevel: "unicode-wide",
      pixelProtocol: "none",
      cols: state.width,
      rows: state.height
    },
    strict: true,
    image: {
      fit: state.fit,
      align: state.align,
      scale: state.scale
    }
  }, io);
  return result.payload.replace(/\s+$/u, "");
}

function mutateState(state, key) {
  const [row, col] = state.align.split(",");
  let rowIndex = ALIGN_ROWS.indexOf(row);
  let colIndex = ALIGN_COLS.indexOf(col);
  if (key === "w") rowIndex = Math.max(0, rowIndex - 1);
  if (key === "s") rowIndex = Math.min(ALIGN_ROWS.length - 1, rowIndex + 1);
  if (key === "a") colIndex = Math.max(0, colIndex - 1);
  if (key === "d") colIndex = Math.min(ALIGN_COLS.length - 1, colIndex + 1);
  if (key === "f") state.fit = FITS[(FITS.indexOf(state.fit) + 1) % FITS.length];
  if (key === "+" || key === "=") state.scale = scaleBy(state.scale, 1.1);
  if (key === "-" || key === "_") state.scale = scaleBy(state.scale, 1 / 1.1);
  state.align = `${ALIGN_ROWS[rowIndex]},${ALIGN_COLS[colIndex]}`;
}

function scaleBy(value, factor) {
  const numeric = Number(value === "max" ? 1 : value);
  const next = Math.max(0.2, Math.min(8, (Number.isFinite(numeric) ? numeric : 1) * factor));
  return String(Math.round(next * 100) / 100);
}

function avatarCommand(state) {
  const command = {
    avatar: state.image,
    previewWidth: state.width,
    previewHeight: state.height,
    avatarFit: state.fit,
    avatarAlign: state.align,
    avatarScale: state.scale,
    command: formatAvatarCommand(state)
  };
  if (state.explicitWidth) command.avatarWidth = state.width;
  if (state.explicitHeight) command.avatarHeight = state.height;
  return command;
}

function formatAvatarCommand(state) {
  const parts = [
    "termvis life",
    "--avatar", shellArg(state.image),
    "--avatar-fit", state.fit,
    "--avatar-align", state.align,
    "--avatar-scale", state.scale,
    "--"
  ];
  if (state.explicitWidth) parts.splice(3, 0, "--avatar-width", String(state.width));
  if (state.explicitHeight) {
    const insertAt = state.explicitWidth ? 5 : 3;
    parts.splice(insertAt, 0, "--avatar-height", String(state.height));
  }
  return parts.join(" ");
}

function normalizeFit(value) {
  const fit = String(value || "contain").toLowerCase();
  return FITS.includes(fit) ? fit : "contain";
}

function normalizeAlign(value) {
  const align = String(value || "mid,mid").toLowerCase();
  return /^(top|mid|bottom),(left|mid|right)$/.test(align) ? align : "mid,mid";
}

function shellArg(value) {
  const s = String(value);
  if (/^[A-Za-z0-9_./:@-]+$/.test(s)) return s;
  return `'${s.replace(/'/g, "'\\''")}'`;
}

function readNumberOption(argv, name, fallback) {
  const value = readOption(argv, name, undefined);
  if (value === undefined) return fallback;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? Math.round(parsed) : fallback;
}
