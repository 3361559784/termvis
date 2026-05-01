import { splitAfterDoubleDash, readOption, hasFlag } from "./args.js";
import { runWrappedCommand } from "./run.js";
import { DEFAULT_AVATAR_PATH, renderPersonaFrame, validatePersonaAvatar } from "../persona/persona-shell.js";

export async function runPersona(argv, io) {
  const [options, commandParts] = splitAfterDoubleDash(argv);
  const avatar = readOption(options, "--avatar", DEFAULT_AVATAR_PATH);
  const title = readOption(options, "--title", "termvis persona");
  const state = readOption(options, "--state", readOption(options, "--mood", commandParts.length ? "thinking" : "idle"));
  const message = readOption(options, "--message", undefined);
  const avatarWidth = readNumberOption(options, "--avatar-width", undefined);
  const avatarHeight = readNumberOption(options, "--avatar-height", undefined);
  const width = readNumberOption(options, "--width", io.stdout?.columns || 80);
  const asJson = hasFlag(options, "--json");
  const symbolic = !hasFlag(options, "--pixel");

  await validatePersonaAvatar(avatar);

  if (asJson) {
    if (commandParts.length > 0) throw new Error("termvis persona --json only supports static frames.");
    const frame = await renderPersonaFrame({ io, avatar, title, state, message, width, avatarWidth, avatarHeight, symbolic });
    io.stdout.write(`${JSON.stringify({ avatar, title, state, message, frame }, null, 2)}\n`);
    return { avatar, title, state, message, frame };
  }

  if (commandParts.length === 0) {
    io.stdout.write(await renderPersonaFrame({ io, avatar, title, state, message, width, avatarWidth, avatarHeight, symbolic }));
    return 0;
  }

  const commandLabel = commandParts.join(" ");
  io.stdout.write(await renderPersonaFrame({
    io,
    avatar,
    title,
    state,
    message: message || `launching ${commandLabel}`,
    width,
    avatarWidth,
    avatarHeight,
    command: commandLabel,
    symbolic
  }));

  try {
    const exitCode = await runWrappedCommand(["--", ...commandParts], io);
    io.stdout.write(await renderPersonaFrame({
      io,
      avatar,
      title,
      state: "success",
      message: `${commandLabel} finished`,
      width,
      avatarWidth,
      avatarHeight,
      command: commandLabel,
      symbolic
    }));
    return exitCode;
  } catch (error) {
    io.stdout.write(await renderPersonaFrame({
      io,
      avatar,
      title,
      state: "error",
      message: error?.message || `${commandLabel} failed`,
      width,
      avatarWidth,
      avatarHeight,
      command: commandLabel,
      symbolic
    }));
    throw error;
  }
}

function readNumberOption(argv, name, fallback) {
  const value = readOption(argv, name, undefined);
  if (value === undefined) return fallback;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}
