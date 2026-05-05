import { detectTerminalCapabilities } from "../core/capabilities.js";
import { findChafa } from "./chafa-runner.js";

export function diagnoseAvatarRenderer({
  env = process.env,
  config = {},
  cwd = process.cwd(),
  caps = detectTerminalCapabilities({ env }),
  symbolic = true,
  chafaInfo = findChafa({ env, config, cwd })
} = {}) {
  const forcedEnv = String(env?.TERMVIS_LIFE_AVATAR_SYMBOLS || "").trim().toLowerCase();
  
  const termProgram = String(caps.termProgram || "");
  const term = String(caps.term || "");
  const isJetBrains = /jetbrains|jediterm|vscode/i.test(termProgram) || /\bvscode\b/i.test(term);
  
  const protocol = caps.pixelProtocol || "none";
  
  const capability = {
    kitty: protocol === "kitty" || env.KITTY_WINDOW_ID || /xterm-kitty/i.test(term),
    iterm: protocol === "iterm" || /iTerm\.app/i.test(termProgram) || env.ITERM_SESSION_ID,
    sixel: protocol === "sixels" || /sixel/i.test(term) || env.TERMVIS_SIXEL === "1",
    truecolor: caps.colorDepth >= 24
  };
  
  const hasImageProtocol = capability.kitty || capability.iterm || capability.sixel;

  const chafa = {
    available: chafaInfo.available,
    path: chafaInfo.path
  };

  const terminal = {
    term,
    program: termProgram,
    colorterm: String(env.COLORTERM || ""),
    isJetBrains
  };

  let mode = "plain";
  let fallback = true;
  let reason = "terminal_protocol_unsupported";
  let suggestion = "Use TERMVIS_LIFE_AVATAR_SYMBOLS=safe or run in iTerm2/Ghostty/Kitty for image protocol rendering.";

  if (forcedEnv === "ascii") {
    mode = "ascii";
    reason = "forced_ascii";
    suggestion = "Remove TERMVIS_LIFE_AVATAR_SYMBOLS=ascii to allow richer rendering.";
  } else if (forcedEnv === "safe") {
    mode = caps.colorDepth >= 24 ? "symbols-truecolor" : (caps.colorDepth >= 8 ? "symbols-256" : "ascii");
    reason = "forced_safe_symbols";
  } else if (isJetBrains) {
    mode = "ascii"; // Since shouldForceAsciiAvatarSymbols returns "ascii" for JetBrains/vscode
    reason = "jetbrains_conservative_symbols";
    suggestion = "JetBrains terminal is conservative. Run in iTerm2/Kitty for image protocol rendering.";
  } else if (symbolic) {
    mode = caps.colorDepth >= 24 ? "symbols-truecolor" : (caps.colorDepth >= 8 ? "symbols-256" : "ascii");
    reason = "config_symbolic_enabled";
    suggestion = "Set life.symbolic=false in config to attempt image protocol rendering.";
  } else if (!chafa.available) {
    mode = "plain";
    reason = "chafa_unavailable";
    suggestion = "Install chafa (e.g., brew install chafa) for avatar rendering.";
  } else if (hasImageProtocol) {
    mode = capability.kitty ? "kitty" : (capability.iterm ? "iterm" : "sixels");
    fallback = false;
    reason = "selected_image_protocol";
    suggestion = undefined;
  } else {
    mode = caps.colorDepth >= 24 ? "symbols-truecolor" : (caps.colorDepth >= 8 ? "symbols-256" : "ascii");
    reason = "terminal_protocol_unsupported";
  }

  return {
    mode,
    symbolic,
    terminal,
    chafa,
    capability,
    fallback,
    reason,
    suggestion
  };
}
