// SVG diagram generators for landing blocks
// Each function takes items and returns inline SVG string

interface DiagramItem {
  label: string;
  value?: number;
  color?: string;
}

const DEFAULT_COLORS = [
  "var(--landing-accent)",
  "#6366f1",
  "#f59e0b",
  "#10b981",
  "#ef4444",
  "#8b5cf6",
  "#ec4899",
  "#14b8a6",
];

function getColor(i: number, item?: DiagramItem): string {
  return item?.color || DEFAULT_COLORS[i % DEFAULT_COLORS.length];
}

function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

export function renderDiagramSvg(type: string, items: DiagramItem[]): string {
  switch (type) {
    case "funnel": return funnel(items);
    case "venn": return venn(items);
    case "roadmap": return roadmap(items);
    case "puzzle": return puzzle(items);
    case "versus": return versus(items);
    case "target": return target(items);
    case "pyramid": return pyramid(items);
    case "cycle": return cycle(items);
    default: return `<svg viewBox="0 0 400 200"><text x="200" y="100" text-anchor="middle" fill="currentColor">Diagrama: ${esc(type)}</text></svg>`;
  }
}

function funnel(items: DiagramItem[]): string {
  const h = 60;
  const totalH = items.length * h;
  const maxW = 360;
  const rows = items.map((item, i) => {
    const w = maxW - (i * (maxW - 100)) / Math.max(items.length - 1, 1);
    const x = (400 - w) / 2;
    const y = i * h;
    const color = getColor(i, item);
    return `<rect x="${x}" y="${y}" width="${w}" height="${h - 4}" rx="6" fill="${color}" opacity="0.85"/>
      <text x="200" y="${y + h / 2 + 2}" text-anchor="middle" fill="white" font-size="14" font-weight="bold">${esc(item.label)}${item.value != null ? ` (${item.value})` : ""}</text>`;
  }).join("\n");
  return `<svg viewBox="0 0 400 ${totalH}" xmlns="http://www.w3.org/2000/svg">${rows}</svg>`;
}

function pyramid(items: DiagramItem[]): string {
  const h = 50;
  const totalH = items.length * h + 20;
  const maxW = 360;
  const reversed = [...items].reverse();
  const rows = reversed.map((item, i) => {
    const w = 80 + (i * (maxW - 80)) / Math.max(reversed.length - 1, 1);
    const x = (400 - w) / 2;
    const y = i * h + 10;
    const color = getColor(items.length - 1 - i, item);
    return `<polygon points="${x},${y + h - 2} ${x + w},${y + h - 2} ${x + w - (maxW - w) / (2 * reversed.length)},${y} ${x + (maxW - w) / (2 * reversed.length)},${y}" fill="${color}" opacity="0.85"/>
      <text x="200" y="${y + h / 2 + 4}" text-anchor="middle" fill="white" font-size="13" font-weight="bold">${esc(item.label)}</text>`;
  }).join("\n");
  return `<svg viewBox="0 0 400 ${totalH}" xmlns="http://www.w3.org/2000/svg">${rows}</svg>`;
}

function venn(items: DiagramItem[]): string {
  const count = Math.min(items.length, 3);
  const cx = 200, cy = 150, r = 80;
  const offsets = count === 1 ? [[0, 0]] : count === 2 ? [[-45, 0], [45, 0]] : [[-45, 20], [45, 20], [0, -40]];
  const circles = items.slice(0, count).map((item, i) => {
    const [ox, oy] = offsets[i];
    const color = getColor(i, item);
    return `<circle cx="${cx + ox}" cy="${cy + oy}" r="${r}" fill="${color}" opacity="0.35" stroke="${color}" stroke-width="2"/>
      <text x="${cx + ox * 1.4}" y="${cy + oy * 1.4}" text-anchor="middle" fill="currentColor" font-size="13" font-weight="bold">${esc(item.label)}</text>`;
  }).join("\n");
  return `<svg viewBox="0 0 400 300" xmlns="http://www.w3.org/2000/svg">${circles}</svg>`;
}

function roadmap(items: DiagramItem[]): string {
  const stepW = 400 / Math.max(items.length, 1);
  const rows = items.map((item, i) => {
    const x = i * stepW + stepW / 2;
    const color = getColor(i, item);
    const line = i < items.length - 1 ? `<line x1="${x + 16}" y1="50" x2="${x + stepW - 16}" y2="50" stroke="${color}" stroke-width="2" stroke-dasharray="6,3"/>` : "";
    return `<circle cx="${x}" cy="50" r="16" fill="${color}"/>
      <text x="${x}" y="55" text-anchor="middle" fill="white" font-size="12" font-weight="bold">${i + 1}</text>
      <text x="${x}" y="90" text-anchor="middle" fill="currentColor" font-size="11" font-weight="bold">${esc(item.label)}</text>
      ${line}`;
  }).join("\n");
  return `<svg viewBox="0 0 400 110" xmlns="http://www.w3.org/2000/svg">${rows}</svg>`;
}

function cycle(items: DiagramItem[]): string {
  const cx = 200, cy = 160, r = 110;
  const n = items.length;
  const nodes = items.map((item, i) => {
    const angle = (2 * Math.PI * i) / n - Math.PI / 2;
    const x = cx + r * Math.cos(angle);
    const y = cy + r * Math.sin(angle);
    const nextAngle = (2 * Math.PI * ((i + 1) % n)) / n - Math.PI / 2;
    const nx = cx + r * Math.cos(nextAngle);
    const ny = cy + r * Math.sin(nextAngle);
    const color = getColor(i, item);
    const midAngle = (angle + nextAngle + (nextAngle < angle ? 2 * Math.PI : 0)) / 2;
    const arrowR = r - 10;
    return `<circle cx="${x}" cy="${y}" r="30" fill="${color}" opacity="0.85"/>
      <text x="${x}" y="${y + 4}" text-anchor="middle" fill="white" font-size="10" font-weight="bold">${esc(item.label)}</text>
      <line x1="${x + 30 * Math.cos(midAngle)}" y1="${y + 30 * Math.sin(midAngle)}" x2="${nx - 30 * Math.cos(midAngle)}" y2="${ny - 30 * Math.sin(midAngle)}" stroke="${color}" stroke-width="2" marker-end="url(#arrow)"/>`;
  }).join("\n");
  return `<svg viewBox="0 0 400 320" xmlns="http://www.w3.org/2000/svg">
    <defs><marker id="arrow" viewBox="0 0 10 10" refX="5" refY="5" markerWidth="4" markerHeight="4" orient="auto-start-reverse"><path d="M 0 0 L 10 5 L 0 10 z" fill="currentColor"/></marker></defs>
    ${nodes}</svg>`;
}

function puzzle(items: DiagramItem[]): string {
  const cols = 2;
  const cellW = 180, cellH = 80, gap = 10;
  const rows = Math.ceil(items.length / cols);
  const totalH = rows * (cellH + gap) + 10;
  const pieces = items.map((item, i) => {
    const col = i % cols;
    const row = Math.floor(i / cols);
    const x = 10 + col * (cellW + gap);
    const y = 10 + row * (cellH + gap);
    const color = getColor(i, item);
    return `<rect x="${x}" y="${y}" width="${cellW}" height="${cellH}" rx="12" fill="${color}" opacity="0.85"/>
      <text x="${x + cellW / 2}" y="${y + cellH / 2 + 5}" text-anchor="middle" fill="white" font-size="14" font-weight="bold">${esc(item.label)}</text>`;
  }).join("\n");
  return `<svg viewBox="0 0 400 ${totalH}" xmlns="http://www.w3.org/2000/svg">${pieces}</svg>`;
}

function versus(items: DiagramItem[]): string {
  const left = items[0] || { label: "A" };
  const right = items[1] || { label: "B" };
  const leftColor = getColor(0, left);
  const rightColor = getColor(1, right);
  return `<svg viewBox="0 0 400 200" xmlns="http://www.w3.org/2000/svg">
    <rect x="10" y="20" width="170" height="160" rx="16" fill="${leftColor}" opacity="0.85"/>
    <text x="95" y="110" text-anchor="middle" fill="white" font-size="20" font-weight="bold">${esc(left.label)}</text>
    <rect x="220" y="20" width="170" height="160" rx="16" fill="${rightColor}" opacity="0.85"/>
    <text x="305" y="110" text-anchor="middle" fill="white" font-size="20" font-weight="bold">${esc(right.label)}</text>
    <circle cx="200" cy="100" r="24" fill="white" stroke="currentColor" stroke-width="2"/>
    <text x="200" y="106" text-anchor="middle" fill="currentColor" font-size="16" font-weight="bold">VS</text>
  </svg>`;
}

function target(items: DiagramItem[]): string {
  const cx = 200, cy = 160;
  const maxR = 140;
  const n = items.length;
  const rings = [...items].reverse().map((item, i) => {
    const r = maxR - (i * (maxR - 30)) / Math.max(n - 1, 1);
    const color = getColor(n - 1 - i, item);
    return `<circle cx="${cx}" cy="${cy}" r="${r}" fill="${color}" opacity="0.25" stroke="${color}" stroke-width="2"/>`;
  }).join("\n");
  const labels = items.map((item, i) => {
    const r = maxR - (i * (maxR - 30)) / Math.max(n - 1, 1);
    const y = cy - r + 18;
    return `<text x="${cx}" y="${y}" text-anchor="middle" fill="currentColor" font-size="11" font-weight="bold">${esc(item.label)}</text>`;
  }).join("\n");
  return `<svg viewBox="0 0 400 320" xmlns="http://www.w3.org/2000/svg">${rings}${labels}</svg>`;
}
