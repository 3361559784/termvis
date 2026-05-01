import { hasFlag, readOption, splitAfterDoubleDash } from "./args.js";
import {
  DEFAULT_LIFE_AVATAR_PATH,
  createLifeSnapshot,
  createSoulState,
  renderLivingFrame,
  renderSoulAltText,
  runLivingCommand
} from "../life/index.js";
import { createTermvisEngine } from "../application/termvis-engine.js";

export async function runLife(argv, io) {
  const [options, commandParts] = splitAfterDoubleDash(argv);
  const avatar = readOption(options, "--avatar", undefined);
  const title = readOption(options, "--title", "termvis living shell");
  const state = readOption(options, "--state", "awakening");
  const message = readOption(options, "--message", undefined);
  const avatarWidth = readNumberOption(options, "--avatar-width", undefined);
  const avatarHeight = readNumberOption(options, "--avatar-height", undefined);
  const avatarFit = readOption(options, "--avatar-fit", undefined);
  const avatarAlign = readOption(options, "--avatar-align", undefined);
  const avatarScale = readOption(options, "--avatar-scale", undefined);
  const width = readNumberOption(options, "--width", io.stdout?.columns || 80);
  const symbolic = hasFlag(options, "--pixel") ? false : undefined;
  const strict = hasFlag(options, "--allow-fallback") ? false : undefined;
  const trace = hasFlag(options, "--no-trace") ? false : undefined;
  const pulse = readOption(options, "--pulse", "title");
  const soulEnabled = hasFlag(options, "--soul-off") ? false : undefined;
  const soulMode = readOption(options, "--soul-mode", undefined);
  const soulName = readOption(options, "--soul-name", undefined);
  const soulNarration = readOption(options, "--soul-narration", undefined);
  const soulReply = readOption(options, "--soul-reply", undefined);
  const soulSession = readOption(options, "--soul-session", undefined);
  const readerMode = hasFlag(options, "--reader") || hasFlag(options, "--screen-reader") || hasFlag(options, "--plain");

  if (commandParts.length === 0) {
    if (readerMode) {
      const engine = await createTermvisEngine({ cwd: io.cwd, env: io.env });
      const lifeConfig = engine.config.life || {};
      const soulConfig = lifeConfig.soul || {};
      const runtimeAvatar = avatar || lifeConfig.avatar || DEFAULT_LIFE_AVATAR_PATH;
      const persona = {
        ...(soulConfig.persona || {}),
        ...(soulName ? { name: soulName } : {})
      };
      const snapshot = createLifeSnapshot({ title, state, message, avatar: runtimeAvatar });
      const soul = createSoulState({
        enabled: soulEnabled ?? soulConfig.enabled ?? true,
        mode: soulMode || soulConfig.mode,
        sessionId: soulSession,
        narration: soulNarration || message || soulConfig.narration,
        reply: soulReply || soulConfig.reply,
        persona
      });
      const text = renderSoulAltText(soul, { ...snapshot, soul });
      io.stdout.write(`${text}\n`);
      return { text };
    }
    const frame = await renderLivingFrame({
      io,
      avatar,
      title,
      state,
      message,
      width,
      avatarWidth,
      avatarHeight,
      avatarFit,
      avatarAlign,
      avatarScale,
      symbolic,
      strict,
      soulEnabled,
      soulMode,
      soulName,
      soulNarration,
      soulReply,
      soulSession
    });
    io.stdout.write(frame);
    return { frame };
  }

  const [command, ...args] = commandParts;
  return runLivingCommand({
    command,
    args,
    io,
    avatar,
    title,
    message,
    width,
    avatarWidth,
    avatarHeight,
    avatarFit,
    avatarAlign,
    avatarScale,
    symbolic,
    strict,
    trace,
    pulse,
    soulEnabled,
    soulMode,
    soulName,
    soulNarration,
    soulReply,
    soulSession,
    readerMode
  });
}

function readNumberOption(argv, name, fallback) {
  const value = readOption(argv, name, undefined);
  if (value === undefined) return fallback;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}
