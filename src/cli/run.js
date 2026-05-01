import { spawn } from "node:child_process";
import { splitAfterDoubleDash } from "./args.js";

export async function runWrappedCommand(argv, io) {
  const [, commandParts] = splitAfterDoubleDash(argv);
  if (commandParts.length === 0) {
    throw new Error("Usage: termvis run -- <command> [args...]");
  }

  const [command, ...args] = commandParts;
  const pty = await loadNodePty();
  if (pty && io.stdin.isTTY && io.stdout.isTTY) {
    return runWithPty(pty, command, args, io);
  }
  return runWithPipes(command, args, io);
}

async function loadNodePty() {
  try {
    return await import("node-pty");
  } catch {
    return null;
  }
}

function runWithPty(pty, command, args, io) {
  return new Promise((resolve, reject) => {
    const child = pty.spawn(command, args, {
      name: io.env.TERM || "xterm-256color",
      cols: io.stdout.columns || 80,
      rows: io.stdout.rows || 25,
      cwd: io.cwd,
      env: io.env
    });

    const onData = (chunk) => io.stdout.write(chunk);
    child.onData(onData);
    child.onExit(({ exitCode }) => {
      cleanup();
      if (exitCode === 0) resolve(exitCode);
      else reject(new Error(`${command} exited with code ${exitCode}`));
    });

    const onInput = (buffer) => child.write(buffer);
    const onResize = () => child.resize(io.stdout.columns || 80, io.stdout.rows || 25);
    io.stdin.setRawMode?.(true);
    io.stdin.resume();
    io.stdin.on("data", onInput);
    io.stdout.on?.("resize", onResize);

    function cleanup() {
      io.stdin.off?.("data", onInput);
      io.stdout.off?.("resize", onResize);
      io.stdin.setRawMode?.(false);
    }
  });
}

function runWithPipes(command, args, io) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: io.cwd,
      env: io.env,
      stdio: ["pipe", "pipe", "pipe"]
    });

    io.stdin.pipe(child.stdin);
    child.stdout.pipe(io.stdout);
    child.stderr.pipe(io.stderr);
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) resolve(code);
      else reject(new Error(`${command} exited with code ${code}`));
    });
  });
}
