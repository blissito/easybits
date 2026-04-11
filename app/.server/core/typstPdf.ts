import { esc, fmtDate, hexToTypstRgb, compileTypst } from "./typstCompiler";

// ── Types ──────────────────────────────────────────────────────────────

export type SectionType =
  | { type: "heading"; level: 1 | 2 | 3; text: string }
  | { type: "paragraph"; text: string }
  | { type: "table"; headers: string[]; rows: string[][] }
  | { type: "list"; items: string[]; ordered?: boolean }
  | { type: "callout"; title?: string; text: string; variant?: "info" | "warning" | "success" }
  | { type: "two-column"; left: string; right: string }
  | { type: "columns"; columns: string[]; gutter?: string }
  | { type: "quote"; text: string; attribution?: string }
  | { type: "divider" }
  | { type: "stats"; items: Array<{ value: string; label: string }> }
  | { type: "image"; url?: string; base64?: string; caption?: string; width?: string }
  | { type: "typst"; code: string };

export type StylePreset = "corporate" | "modern" | "minimal" | "bold";

export interface FastPdfData {
  name: string;
  title: string;
  subtitle?: string;
  author?: string;
  date?: string;
  brandColor?: string;
  accentColor?: string;
  logoUrl?: string;
  logoBase64?: string;
  coverPage?: boolean;
  pageSize?: "us-letter" | "a4";
  style?: StylePreset;
  headerFooter?: boolean;
  sections: SectionType[];
}

// ── Style presets ──────────────────────────────────────────────────────

interface StyleConfig {
  bodyFont: string;
  headingFont: string;
  bodySize: string;
  leading: string;
  parSpacing: string;
  h1: (bc: string, ac: string) => string;
  h2: (bc: string, ac: string) => string;
  h3: (bc: string, ac: string) => string;
  calloutStyle: "border" | "rounded" | "line" | "bar";
}

const STYLES: Record<StylePreset, StyleConfig> = {
  corporate: {
    bodyFont: "Helvetica",
    headingFont: "Helvetica",
    bodySize: "10pt",
    leading: "0.7em",
    parSpacing: "0.6em",
    h1: (bc) => `
#show heading.where(level: 1): it => {
  set text(font: "Helvetica", size: 18pt, weight: "bold", fill: ${bc})
  upper(it.body)
  v(4pt)
  line(length: 40pt, stroke: 2.5pt + ${bc})
  v(8pt)
}`,
    h2: (bc) => `
#show heading.where(level: 2): it => {
  set text(font: "Helvetica", size: 13pt, weight: "semibold", fill: ${bc}, tracking: 0.3pt)
  v(6pt)
  it.body
  v(4pt)
}`,
    h3: (bc, ac) => `
#show heading.where(level: 3): it => {
  set text(font: "Helvetica", size: 11pt, weight: "semibold", fill: ${ac})
  v(4pt)
  it.body
  v(2pt)
}`,
    calloutStyle: "border",
  },
  modern: {
    bodyFont: "Helvetica",
    headingFont: "Helvetica",
    bodySize: "10pt",
    leading: "0.75em",
    parSpacing: "0.7em",
    h1: (bc) => `
#show heading.where(level: 1): it => {
  set text(font: "Helvetica", size: 22pt, weight: "bold", fill: ${bc})
  v(4pt)
  it.body
  v(10pt)
}`,
    h2: (bc) => `
#show heading.where(level: 2): it => {
  set text(font: "Helvetica", size: 14pt, weight: "medium", fill: ${bc})
  v(8pt)
  it.body
  v(4pt)
}`,
    h3: (bc, ac) => `
#show heading.where(level: 3): it => {
  set text(font: "Helvetica", size: 11pt, weight: "medium", fill: ${ac})
  v(4pt)
  it.body
  v(2pt)
}`,
    calloutStyle: "rounded",
  },
  minimal: {
    bodyFont: "New Computer Modern",
    headingFont: "New Computer Modern",
    bodySize: "10.5pt",
    leading: "0.7em",
    parSpacing: "0.65em",
    h1: (bc) => `
#show heading.where(level: 1): it => {
  set text(font: "New Computer Modern", size: 17pt, weight: "regular", fill: ${bc}, tracking: 1pt)
  v(6pt)
  upper(it.body)
  v(2pt)
  line(length: 100%, stroke: 0.5pt + rgb("cccccc"))
  v(6pt)
}`,
    h2: (bc) => `
#show heading.where(level: 2): it => {
  set text(font: "New Computer Modern", size: 13pt, weight: "regular", fill: ${bc}, tracking: 0.5pt)
  v(6pt)
  it.body
  v(3pt)
}`,
    h3: (bc, ac) => `
#show heading.where(level: 3): it => {
  set text(font: "New Computer Modern", size: 11pt, style: "italic", fill: ${ac})
  v(4pt)
  it.body
  v(2pt)
}`,
    calloutStyle: "line",
  },
  bold: {
    bodyFont: "Helvetica",
    headingFont: "Helvetica",
    bodySize: "10pt",
    leading: "0.7em",
    parSpacing: "0.65em",
    h1: (bc) => `
#show heading.where(level: 1): it => {
  v(4pt)
  block(fill: ${bc}, radius: 4pt, inset: (x: 12pt, y: 8pt), width: 100%)[
    #text(font: "Helvetica", size: 20pt, weight: "bold", fill: white)[#it.body]
  ]
  v(8pt)
}`,
    h2: (bc) => `
#show heading.where(level: 2): it => {
  set text(font: "Helvetica", size: 14pt, weight: "bold", fill: ${bc})
  v(6pt)
  it.body
  v(2pt)
  line(length: 100%, stroke: 2pt + ${bc})
  v(4pt)
}`,
    h3: (bc, ac) => `
#show heading.where(level: 3): it => {
  set text(font: "Helvetica", size: 11pt, weight: "bold", fill: ${ac})
  v(4pt)
  it.body
  v(2pt)
}`,
    calloutStyle: "bar",
  },
};

// ── Section renderers ──────────────────────────────────────────────────

function renderHeading(s: Extract<SectionType, { type: "heading" }>): string {
  return `${"=".repeat(s.level)} ${esc(s.text)}`;
}

function renderParagraph(s: Extract<SectionType, { type: "paragraph" }>): string {
  return esc(s.text);
}

function renderTable(s: Extract<SectionType, { type: "table" }>, bc: string): string {
  const cols = s.headers.map(() => "1fr").join(", ");
  const headerCells = s.headers
    .map((h) => `table.cell(fill: ${bc})[#text(fill: white, size: 8pt, weight: "bold")[${esc(h)}]]`)
    .join(",\n    ");
  const rows = s.rows
    .map((row, i) => {
      const bg = i % 2 === 1 ? `fill: ${bc}.lighten(96%),` : "";
      return row.map((cell) => `table.cell(${bg})[#text(size: 9pt)[${esc(cell)}]]`).join(",\n    ");
    })
    .join(",\n    ");
  return `#table(
  columns: (${cols}),
  stroke: none,
  inset: 7pt,
  ${headerCells},
  ${rows}
)`;
}

function renderList(s: Extract<SectionType, { type: "list" }>): string {
  if (s.ordered) {
    return s.items.map((item, i) => `+ ${esc(item)}`).join("\n");
  }
  return s.items.map((item) => `- ${esc(item)}`).join("\n");
}

function renderCallout(
  s: Extract<SectionType, { type: "callout" }>,
  bc: string,
  ac: string,
  style: StyleConfig["calloutStyle"]
): string {
  // Derive variant colors from brand/accent palette instead of hardcoded values
  const variantColors: Record<string, string> = {
    info: bc,
    warning: ac,
    success: `${ac}.darken(15%)`,
  };
  const variantBg: Record<string, string> = {
    info: `${bc}.lighten(92%)`,
    warning: `${ac}.lighten(88%)`,
    success: `${ac}.lighten(92%)`,
  };
  const color = s.variant ? variantColors[s.variant] : ac;
  const bg = s.variant ? variantBg[s.variant] : `${bc}.lighten(95%)`;
  const titleBlock = s.title
    ? `#text(size: 8pt, weight: "bold", fill: ${color}, tracking: 0.5pt)[${esc(s.title.toUpperCase())}]\n    #v(4pt)`
    : "";

  switch (style) {
    case "border":
      return `#block(
  stroke: (left: 3pt + ${color}),
  fill: ${bg},
  inset: 12pt,
  width: 100%,
)[
  ${titleBlock}
  #text(size: 9pt)[${esc(s.text)}]
]`;
    case "rounded":
      return `#block(
  fill: ${bg},
  radius: 8pt,
  inset: 14pt,
  width: 100%,
)[
  ${titleBlock}
  #text(size: 9pt)[${esc(s.text)}]
]`;
    case "line":
      return `#block(
  stroke: (left: 1pt + ${color}),
  inset: (left: 12pt, y: 6pt),
  width: 100%,
)[
  ${titleBlock}
  #text(size: 9pt, fill: rgb("444444"))[${esc(s.text)}]
]`;
    case "bar":
      return `#block(
  fill: ${color},
  radius: 4pt,
  inset: 12pt,
  width: 100%,
)[
  ${s.title ? `#text(size: 8pt, weight: "bold", fill: white, tracking: 0.5pt)[${esc(s.title.toUpperCase())}]\n  #v(4pt)` : ""}
  #text(size: 9pt, fill: white)[${esc(s.text)}]
]`;
  }
}

function renderTwoColumn(s: Extract<SectionType, { type: "two-column" }>): string {
  return `#grid(
  columns: (1fr, 1fr),
  gutter: 20pt,
  [${esc(s.left)}],
  [${esc(s.right)}],
)`;
}

function renderColumns(s: Extract<SectionType, { type: "columns" }>): string {
  const gutter = s.gutter || "16pt";
  const cols = s.columns.map(() => "1fr").join(", ");
  const cells = s.columns.map((c) => `[#text(size: 9pt)[${esc(c)}]]`).join(",\n  ");
  return `#block(width: 100%)[
  #columns(${s.columns.length}, gutter: ${gutter})[
    #set text(size: 9pt)
    #set par(justify: true)
    ${s.columns.map((c, i) => esc(c) + (i < s.columns.length - 1 ? "\n    #colbreak()" : "")).join("\n    ")}
  ]
]`;
}

function renderQuote(s: Extract<SectionType, { type: "quote" }>, ac: string): string {
  const attr = s.attribution ? `\n  #v(6pt)\n  #align(right)[#text(size: 9pt, fill: rgb("888888"), style: "italic")[— ${esc(s.attribution)}]]` : "";
  return `#block(
  stroke: (left: 3pt + ${ac}),
  inset: (left: 16pt, y: 8pt, right: 8pt),
  width: 100%,
)[
  #text(size: 11pt, style: "italic", fill: rgb("444444"))[${esc(s.text)}]${attr}
]`;
}

function renderDivider(bc: string): string {
  return `#v(2pt)\n#line(length: 100%, stroke: 0.5pt + ${bc}.lighten(80%))\n#v(2pt)`;
}

function renderStats(s: Extract<SectionType, { type: "stats" }>, bc: string, ac: string): string {
  const cols = s.items.map(() => "1fr").join(", ");
  const cells = s.items
    .map(
      (item) => `align(center)[
      #text(size: 22pt, weight: "bold", fill: ${bc})[${esc(item.value)}]
      #v(2pt)
      #text(size: 9pt, fill: rgb("666666"), tracking: 0.3pt)[${esc(item.label.toUpperCase())}]
    ]`
    )
    .join(",\n  ");
  return `#block(fill: ${bc}.lighten(95%), radius: 6pt, inset: 16pt, width: 100%)[
  #grid(
    columns: (${cols}),
    gutter: 12pt,
    ${cells}
  )
]`;
}

function renderImage(s: Extract<SectionType, { type: "image" }>, imageIndex: number): string {
  const w = s.width || "100%";
  // Extension resolved at compile time — use wildcard-safe name
  const filename = `img-${imageIndex}`;
  const cap = s.caption
    ? `\n#align(center)[#text(size: 8pt, fill: rgb("888888"), style: "italic")[${esc(s.caption)}]]`
    : "";
  return `#align(center)[#image("${filename}", width: ${w})]${cap}`;
}

// ── Cover page ─────────────────────────────────────────────────────────

function buildCoverPage(data: FastPdfData, bc: string, ac: string, styleConfig: StyleConfig): string {
  const date = fmtDate(data.date);
  const hasLogo = !!(data.logoUrl || data.logoBase64);
  const logoExt = data.logoBase64
    ? (data.logoBase64.length >= 20 && Buffer.from(data.logoBase64.slice(0, 20), "base64")[0] === 0x3C ? "svg" : "png")
    : data.logoUrl?.endsWith(".svg") ? "svg" : "png";

  return `// Cover page
#page(margin: 0pt, background: {
  // Large gradient circle — bottom-right, oversized (clipped by page)
  place(bottom + right, dx: 2in, dy: 1.5in,
    circle(radius: 3.5in, fill: gradient.radial(${ac}.lighten(80%), ${ac}.lighten(95%), white))
  )
  // Medium circle — top-left accent
  place(top + left, dx: -1in, dy: -0.8in,
    circle(radius: 1.8in, fill: gradient.radial(${bc}.lighten(88%), ${bc}.lighten(96%), white))
  )
  // Small dot cluster — mid-right
  place(right + horizon, dx: 0.6in, dy: -1in,
    circle(radius: 0.35in, fill: ${ac}.lighten(75%))
  )
  place(right + horizon, dx: 1.1in, dy: -0.3in,
    circle(radius: 0.2in, fill: ${ac}.lighten(85%))
  )
  // Top accent bar
  place(top + left, rect(width: 100%, height: 6pt, fill: ${bc}))
})[
  // Content centered
  #align(center + horizon)[
    #block(width: 70%)[
      ${hasLogo ? `#image("logo.${logoExt}", height: 48pt)\n      #v(24pt)` : ""}
      #text(font: "${styleConfig.headingFont}", size: 28pt, weight: "bold", fill: ${bc})[${esc(data.title)}]
      ${data.subtitle ? `#v(10pt)\n      #text(font: "${styleConfig.bodyFont}", size: 14pt, fill: rgb("555555"))[${esc(data.subtitle)}]` : ""}
      #v(24pt)
      #line(length: 60pt, stroke: 2.5pt + ${ac})
      #v(20pt)
      ${data.author ? `#text(font: "${styleConfig.bodyFont}", size: 11pt, weight: "medium", fill: rgb("444444"))[${esc(data.author)}]\n      #v(6pt)` : ""}
      #text(font: "${styleConfig.bodyFont}", size: 10pt, fill: rgb("888888"))[${esc(date)}]
    ]
  ]
]
`;
}

// ── Main builder ───────────────────────────────────────────────────────

export function buildFastPdfSource(data: FastPdfData): string {
  const style = STYLES[data.style || "corporate"];
  const bc = hexToTypstRgb(data.brandColor || "#7C5AE6");
  const ac = hexToTypstRgb(data.accentColor || data.brandColor || "#9870ED");
  const paper = data.pageSize || "us-letter";
  const date = fmtDate(data.date);
  const showHF = data.headerFooter !== false;
  const hasLogo = !!(data.logoUrl || data.logoBase64);
  const logoExt = data.logoBase64
    ? (data.logoBase64.length >= 20 && Buffer.from(data.logoBase64.slice(0, 20), "base64")[0] === 0x3C ? "svg" : "png")
    : data.logoUrl?.endsWith(".svg") ? "svg" : "png";

  // Track image indices for file references
  let imageIndex = 0;

  const header = showHF
    ? `header: [
    #place(top + left, dx: -0.5in, dy: -0.6in)[
      #rect(width: 8.5in, height: 4pt, fill: ${bc})
    ]
  ],`
    : "";

  const footer = showHF
    ? `footer: [
    #line(length: 100%, stroke: 0.5pt + rgb("dddddd"))
    #v(4pt)
    #set text(size: 8pt, fill: rgb("999999"))
    #grid(
      columns: (1fr, auto),
      [${esc(data.title)}],
      [Página #context counter(page).display("1") de #context counter(page).final().at(0)],
    )
  ],`
    : "";

  const cover = data.coverPage ? buildCoverPage(data, bc, ac, style) : "";

  // Page header with logo + title (no cover page mode)
  const inlineHeader = !data.coverPage
    ? `// Document header
#grid(
  columns: (${hasLogo ? "auto, " : ""}1fr),
  gutter: 10pt,
  ${hasLogo ? `align(horizon)[#image("logo.${logoExt}", height: 32pt)],` : ""}
  [
    #text(font: "${style.headingFont}", size: 16pt, weight: "bold", fill: ${bc})[${esc(data.title)}]
    ${data.subtitle ? `\n    #text(size: 10pt, fill: rgb("666666"))[${esc(data.subtitle)}]` : ""}
    ${data.author || data.date ? `\n    #text(size: 9pt, fill: rgb("888888"))[${[data.author, date].filter(Boolean).map(s => esc(s!)).join(" · ")}]` : ""}
  ],
)
#v(14pt)
`
    : "";

  // ── Static layout validator ──────────────────────────────────────────
  // Estimate section heights in pt to detect orphan headings and sparse pages.
  // Page usable height: us-letter = 11in - 0.7in top - 0.8in bottom = 9.5in ≈ 684pt
  // A4 = 11.69in - 1.5in margins ≈ 733pt. We use a conservative estimate.
  const pageHeight = paper === "a4" ? 700 : 650; // usable pt after margins/header/footer

  function estimateHeight(s: SectionType): number {
    switch (s.type) {
      case "heading": return s.level === 1 ? 50 : s.level === 2 ? 38 : 30;
      case "paragraph": {
        const chars = s.text.length;
        const linesApprox = Math.ceil(chars / 85); // ~85 chars per line at 10pt
        return linesApprox * 14 + 8; // 14pt line height + spacing
      }
      case "table": return 30 + s.rows.length * 26; // header + rows
      case "list": return s.items.length * 18 + 8;
      case "callout": return 60 + Math.ceil(s.text.length / 80) * 14;
      case "two-column": return Math.max(Math.ceil(s.left.length / 42) * 14, Math.ceil(s.right.length / 42) * 14) + 16;
      case "columns": return Math.max(...s.columns.map(c => Math.ceil(c.length / 35) * 14)) + 16;
      case "quote": return 40 + Math.ceil(s.text.length / 75) * 16;
      case "divider": return 12;
      case "stats": return 80;
      case "image": return 200; // conservative default
      case "typst": return Math.max(60, s.code.split("\n").length * 14);
    }
  }

  // Merge heading with its content group to prevent orphaned/split sections.
  // A "group" = heading + all sections until the next h1 heading or divider.
  // If the group doesn't fit in remaining page space, push heading to next page.
  let cursor = data.coverPage ? 0 : 80; // inline header ~80pt if no cover
  const mergedSections: SectionType[] = [];
  for (let i = 0; i < data.sections.length; i++) {
    const s = data.sections[i];
    const h = estimateHeight(s);
    const remaining = pageHeight - (cursor % pageHeight);

    if (s.type === "heading") {
      // Calculate height of heading + its content group (up to next h1/divider, max 4 sections)
      let groupHeight = h;
      for (let j = i + 1; j < data.sections.length && j <= i + 4; j++) {
        const next = data.sections[j];
        if (next.type === "divider" || (next.type === "heading" && next.level === 1)) break;
        groupHeight += estimateHeight(next);
      }
      // If group doesn't fit and we're past the first 20% of the page, push to next page
      if (remaining < groupHeight && remaining < pageHeight * 0.80) {
        mergedSections.push({ type: "typst", code: "#pagebreak()" });
        cursor = h;
      } else {
        cursor += h;
      }
    } else {
      cursor += h;
    }

    // Track page breaks
    if (cursor >= pageHeight) {
      cursor = cursor % pageHeight;
    }

    mergedSections.push(s);
  }

  // Replace sections with merged version for rendering
  const sectionsToRender = mergedSections;

  // Sanitize typst sections: strip standalone #pagebreak() and empty #page() calls
  const sanitizedSections = sectionsToRender.map((s, idx) => {
    if (s.type !== "typst") return s;
    // Preserve pagebreaks inserted by the layout validator (exact match)
    if (s.code.trim() === "#pagebreak()") return s;
    let code = s.code;
    // Remove standalone #pagebreak() lines from agent-provided typst (they create blank pages)
    code = code.replace(/^\s*#pagebreak\(\)\s*$/gm, "");
    // Remove empty #page(...)[] blocks (background-only pages with no content)
    code = code.replace(/#page\([^)]*\)\s*\[\s*\]/g, "");
    // If after cleanup the section is empty/whitespace-only, skip it
    if (!code.trim()) return null;
    return { ...s, code };
  }).filter((s): s is SectionType => s !== null);

  // Warn if too many typst sections (likely agent misuse)
  const typstCount = sanitizedSections.filter(s => s.type === "typst").length;
  if (typstCount > 4) {
    console.warn(`[fast_pdf] ${typstCount} typst sections detected — agent likely overusing freeform. Built-in types preferred.`);
  }

  // Render sections
  const sectionBlocks = sanitizedSections
    .map((s) => {
      switch (s.type) {
        case "heading": return renderHeading(s);
        case "paragraph": return renderParagraph(s);
        case "table": return renderTable(s, bc);
        case "list": return renderList(s);
        case "callout": return renderCallout(s, bc, ac, style.calloutStyle);
        case "two-column": return renderTwoColumn(s);
        case "columns": return renderColumns(s);
        case "quote": return renderQuote(s, ac);
        case "divider": return renderDivider(bc);
        case "stats": return renderStats(s, bc, ac);
        case "image": return renderImage(s, imageIndex++);
        case "typst": return s.code;
      }
    })
    .join("\n\n#v(4pt)\n\n");

  // If first section is freeform typst (with its own #page/#set page), skip initial page setup
  const firstIsTypst = !data.coverPage && data.sections[0]?.type === "typst";

  const pageSetup = firstIsTypst ? "" : `#set page(
  paper: "${paper}",
  margin: (top: 0.7in, bottom: 0.8in, left: 0.6in, right: 0.6in),
  ${header}
  ${footer}
)

`;

  return `${cover}${pageSetup}#set text(font: "${style.bodyFont}", size: ${style.bodySize})
#set par(leading: ${style.leading}, spacing: ${style.parSpacing})

// Heading styles
${style.h1(bc, ac)}
${style.h2(bc, ac)}
${style.h3(bc, ac)}

${firstIsTypst ? "" : inlineHeader}${sectionBlocks}
`;
}

function detectImageExt(buf: Buffer, url?: string): string {
  // Check magic bytes
  if (buf[0] === 0x89 && buf[1] === 0x50) return "png";
  if (buf[0] === 0xFF && buf[1] === 0xD8) return "jpg";
  if (buf[0] === 0x47 && buf[1] === 0x49) return "gif";
  if (buf[0] === 0x3C || buf.toString("utf-8", 0, 5).trim().startsWith("<")) return "svg";
  // Fallback to URL extension
  if (url) {
    const u = url.split("?")[0].toLowerCase();
    if (u.endsWith(".jpg") || u.endsWith(".jpeg")) return "jpg";
    if (u.endsWith(".svg")) return "svg";
    if (u.endsWith(".gif")) return "gif";
  }
  return "png";
}

// ── Compile ────────────────────────────────────────────────────────────

export async function compileFastPdf(data: FastPdfData): Promise<Buffer> {
  const source = buildFastPdfSource(data);
  const assets: Array<{ name: string; data: Buffer }> = [];

  // Logo
  if (data.logoBase64) {
    const buf = Buffer.from(data.logoBase64, "base64");
    const isSvg = buf[0] === 0x3C || buf.toString("utf-8", 0, 5).trim().startsWith("<");
    assets.push({ name: `logo.${isSvg ? "svg" : "png"}`, data: buf });
  } else if (data.logoUrl) {
    const res = await fetch(data.logoUrl, { signal: AbortSignal.timeout(5000) }).catch(() => null);
    if (res?.ok) {
      const buf = Buffer.from(await res.arrayBuffer());
      const isSvg = buf[0] === 0x3C || buf.toString("utf-8", 0, 5).trim().startsWith("<");
      assets.push({ name: `logo.${isSvg ? "svg" : "png"}`, data: buf });
    }
  }

  // Images from sections — detect format, replace placeholder in source
  let imgIdx = 0;
  let finalSource = source;
  for (const s of data.sections) {
    if (s.type !== "image") continue;
    const idx = imgIdx++;
    let buf: Buffer | null = null;
    if (s.base64) {
      buf = Buffer.from(s.base64, "base64");
    } else if (s.url) {
      const res = await fetch(s.url, { signal: AbortSignal.timeout(5000) }).catch(() => null);
      if (res?.ok) buf = Buffer.from(await res.arrayBuffer());
    }
    if (buf) {
      const ext = detectImageExt(buf, s.url);
      const filename = `img-${idx}.${ext}`;
      assets.push({ name: filename, data: buf });
      finalSource = finalSource.replace(`"img-${idx}"`, `"${filename}"`);
    }
  }

  return compileTypst(finalSource, { assets });
}
