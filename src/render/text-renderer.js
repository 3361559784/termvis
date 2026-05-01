import { renderCard } from "../core/layout.js";

export function renderTextFallback({ alt = "Visual preview unavailable", source = "", caps = {}, reason = "" } = {}) {
  if (!caps.isTTY || caps.termDumb) {
    return `[visual: ${alt}${source ? ` (${source})` : ""}${reason ? `; ${reason}` : ""}]\n`;
  }
  return `${renderCard({
    title: "Visual fallback",
    body: `${alt}${source ? `\nSource: ${source}` : ""}${reason ? `\nReason: ${reason}` : ""}`,
    width: Math.min(Math.max(32, caps.cols || 80), 100)
  }).join("\n")}\n`;
}

export function renderPlainResult({ alt, source, reason } = {}) {
  return {
    mode: "plain",
    payload: renderTextFallback({ alt, source, reason }),
    altText: alt || "Visual preview unavailable",
    metrics: {
      renderMs: 0,
      fallback: true
    }
  };
}
