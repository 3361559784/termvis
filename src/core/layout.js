import { cellWidth, padCells, truncateCells, wrapCells } from "./width.js";

export function renderLayout(node, viewport = {}) {
  const width = Math.max(1, viewport.width || 80);
  const height = viewport.height ? Math.max(1, viewport.height) : undefined;
  const lines = renderNode(node, width, height);
  return height ? fitHeight(lines, height, width) : lines;
}

export function renderLayoutToString(node, viewport = {}) {
  return renderLayout(node, viewport).join("\n");
}

export function renderCard({ title = "", body = "", lines, width = 80, padding = 1, border = true } = {}) {
  const contentWidth = Math.max(1, width - (border ? 2 : 0) - padding * 2);
  const bodyLines = lines || wrapCells(body, contentWidth);
  const padded = bodyLines.flatMap((line) => {
    const normalized = padCells(line, contentWidth);
    const left = " ".repeat(padding);
    const right = " ".repeat(padding);
    return border ? [`│${left}${normalized}${right}│`] : [`${left}${normalized}${right}`];
  });

  if (!border) return padded.map((line) => padCells(line, width));

  const titleText = title ? ` ${truncateCells(title, Math.max(0, width - 4))} ` : "";
  const topFill = Math.max(0, width - 2 - cellWidth(titleText));
  const top = `┌${titleText}${"─".repeat(topFill)}┐`;
  const bottom = `└${"─".repeat(Math.max(0, width - 2))}┘`;
  return [padCells(top, width), ...padded.map((line) => padCells(line, width)), padCells(bottom, width)];
}

export function renderLayoutDemo(width = 80) {
  const demo = {
    type: "split",
    direction: "row",
    children: [
      { type: "card", title: "Capabilities", body: "TTY probe -> fallback chain -> chafa runner" },
      { type: "card", title: "Sidecar", body: "JSON-RPC methods: ping, probeCaps, renderBlock, layoutCard" }
    ]
  };
  return renderLayoutToString(demo, { width });
}

function renderNode(node, width, height) {
  if (!node || node.type === "text") return renderTextNode(node, width, height);
  if (node.type === "card") {
    const lines = renderCard({ ...node, width });
    return height ? fitHeight(lines, height, width) : lines;
  }
  if (node.type === "stack") return renderStack(node, width, height);
  if (node.type === "split") return renderSplit(node, width, height);
  throw new Error(`Unknown layout node type: ${node.type}`);
}

function renderTextNode(node = {}, width, height) {
  const lines = wrapCells(node.text ?? node.body ?? "", width);
  return height ? fitHeight(lines, height, width) : lines;
}

function renderStack(node, width, height) {
  const children = node.children || [];
  const lines = children.flatMap((child, index) => {
    const rendered = renderNode(child, width);
    return index === 0 ? rendered : [" ".repeat(width), ...rendered];
  });
  return height ? fitHeight(lines, height, width) : lines;
}

function renderSplit(node, width, height) {
  const children = node.children || [];
  if (children.length === 0) return [];
  const direction = node.direction || "row";
  if (direction === "column") {
    const childHeight = height ? Math.max(1, Math.floor(height / children.length)) : undefined;
    const lines = children.flatMap((child) => renderNode(child, width, childHeight));
    return height ? fitHeight(lines, height, width) : lines;
  }

  const gap = node.gap ?? 1;
  const totalGap = gap * (children.length - 1);
  const widths = distribute(width - totalGap, children.map((child) => child.width || child.ratio || 1));
  const rendered = children.map((child, index) => renderNode(child, widths[index], height));
  const maxHeight = height || Math.max(...rendered.map((lines) => lines.length));
  const result = [];
  for (let row = 0; row < maxHeight; row += 1) {
    const pieces = rendered.map((lines, index) => padCells(lines[row] || "", widths[index]));
    result.push(pieces.join(" ".repeat(gap)));
  }
  return result.map((line) => padCells(line, width));
}

function distribute(width, weights) {
  const safeWidth = Math.max(1, width);
  const fixed = weights.map((value) => Number(value) || 1);
  const total = fixed.reduce((sum, value) => sum + value, 0);
  const raw = fixed.map((value) => Math.floor((safeWidth * value) / total));
  let remaining = safeWidth - raw.reduce((sum, value) => sum + value, 0);
  for (let i = 0; remaining > 0; i = (i + 1) % raw.length) {
    raw[i] += 1;
    remaining -= 1;
  }
  return raw.map((value) => Math.max(1, value));
}

function fitHeight(lines, height, width) {
  const clipped = lines.slice(0, height);
  while (clipped.length < height) clipped.push(" ".repeat(width));
  return clipped.map((line) => padCells(line, width));
}
