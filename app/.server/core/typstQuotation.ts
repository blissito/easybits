import { execFile } from "node:child_process";
import { writeFile, readFile, unlink, mkdir } from "node:fs/promises";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import type { QuotationData } from "~/lib/quotation/templates";

const TMP_DIR = "/tmp/typst-quotations";

function esc(s: string): string {
  // Escape Typst special chars
  return s.replace(/[\\#\[\]@*_`$<>]/g, (c) => `\\${c}`);
}

function fmtNum(n: number): string {
  return n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function fmtDate(dateStr?: string): string {
  if (!dateStr) return new Date().toLocaleDateString("es-MX", { year: "numeric", month: "long", day: "numeric" });
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return dateStr;
  return d.toLocaleDateString("es-MX", { year: "numeric", month: "long", day: "numeric" });
}

function hexToTypstRgb(hex: string): string {
  const h = hex.replace("#", "");
  return `rgb("${h}")`;
}

export function buildTypstSource(data: QuotationData & { paymentUrl?: string; logoUrl?: string; logoExt?: string }): string {
  const bc = data.brandColor || "#1a1a1a";
  const bcTypst = hexToTypstRgb(bc);
  const cur = data.currency || "MXN";
  const hasCode = data.items.some((i) => i.code);
  const hasDiscount = data.items.some((i) => i.discount);
  const date = fmtDate(data.date);

  // Build column specs for items table
  const cols: string[] = [];
  const headers: string[] = [];
  if (hasCode) {
    cols.push("auto");
    headers.push(`table.cell(fill: ${bcTypst})[#text(fill: white, size: 8pt, weight: "bold")[CÓDIGO]]`);
  }
  cols.push("1fr");
  headers.push(`table.cell(fill: ${bcTypst})[#text(fill: white, size: 8pt, weight: "bold")[DESCRIPCIÓN]]`);
  cols.push("auto");
  headers.push(`table.cell(fill: ${bcTypst})[#text(fill: white, size: 8pt, weight: "bold")[CANT.]]`);
  cols.push("auto");
  headers.push(`table.cell(fill: ${bcTypst})[#text(fill: white, size: 8pt, weight: "bold")[P. UNIT.]]`);
  if (hasDiscount) {
    cols.push("auto");
    headers.push(`table.cell(fill: ${bcTypst})[#text(fill: white, size: 8pt, weight: "bold")[DESC.]]`);
  }
  cols.push("auto");
  headers.push(`table.cell(fill: ${bcTypst})[#text(fill: white, size: 8pt, weight: "bold")[TOTAL]]`);

  // Build item rows
  const rows = data.items.map((item, i) => {
    const bg = i % 2 === 1 ? `fill: rgb("fafafa"),` : "";
    const cells: string[] = [];
    if (hasCode) cells.push(`table.cell(${bg})[#text(size: 9pt)[${esc(item.code || "")}]]`);
    cells.push(`table.cell(${bg})[#text(size: 9pt)[${esc(item.description)}]]`);
    cells.push(`table.cell(${bg})[#align(center)[#text(size: 9pt)[${item.quantity}${item.unit ? ` ${esc(item.unit)}` : ""}]]]`);
    cells.push(`table.cell(${bg})[#align(right)[#text(size: 9pt)[\\$${fmtNum(item.unitPrice)}]]]`);
    if (hasDiscount) cells.push(`table.cell(${bg})[#align(right)[#text(size: 9pt)[${item.discount ? `\\$${fmtNum(item.discount)}` : "—"}]]]`);
    cells.push(`table.cell(${bg})[#align(right)[#text(size: 9pt)[\\$${fmtNum(item.total)}]]]`);
    return cells.join(",\n    ");
  }).join(",\n    ");

  // Build totals rows
  const totalRows: string[] = [];
  totalRows.push(`[#align(right)[#text(size: 9pt)[Subtotal]]], [#align(right)[#text(size: 9pt, weight: "semibold")[\\$${fmtNum(data.subtotal)}]]],`);
  if (data.discount) {
    totalRows.push(`[#align(right)[#text(size: 9pt)[Descuento]]], [#align(right)[#text(size: 9pt)[-\\$${fmtNum(data.discount)}]]],`);
  }
  if (data.tax != null) {
    const taxLabel = data.taxRate ? `IVA (${data.taxRate}%)` : "IVA";
    totalRows.push(`[#align(right)[#text(size: 9pt)[${taxLabel}]]], [#align(right)[#text(size: 9pt)[\\$${fmtNum(data.tax)}]]],`);
  }
  totalRows.push(`table.hline(stroke: 1.5pt + ${bcTypst}),
    [#align(right)[#text(size: 12pt, weight: "bold")[Total]]], [#align(right)[#text(size: 12pt, weight: "bold", fill: ${bcTypst})[\\$${fmtNum(data.total)} ${esc(cur)}]]],`);

  // Payment link — big CTA with QR code
  const paymentBlock = data.paymentUrl ? `
  #v(16pt)
  #block(fill: ${bcTypst}, radius: 8pt, width: 100%, inset: 20pt)[
    #grid(
      columns: (1fr, auto),
      gutter: 16pt,
      align(horizon)[
        #align(center)[
          #text(fill: white, size: 10pt, weight: "medium", tracking: 0.5pt)[PAGO EN LÍNEA]
          #v(6pt)
          #link("${data.paymentUrl}")[
            #text(fill: white, size: 18pt, weight: "bold")[Pagar \\$${fmtNum(data.total)} ${esc(cur)}]
          ]
          #v(6pt)
          #text(fill: rgb("ffffff99"), size: 9pt)[Haz clic o escanea el código QR para pagar]
        ]
      ],
      [
        #block(fill: white, radius: 6pt, inset: 6pt)[
          #image("qr.png", width: 90pt)
        ]
      ],
    )
  ]` : "";

  // Build notes
  const notesBlock = data.notes?.length ? `
  // Notes
  #block(fill: rgb("f8f8f8"), radius: 6pt, inset: 12pt, width: 100%)[
    #text(size: 8pt, weight: "bold", fill: rgb("999999"), tracking: 0.5pt)[NOTAS Y CONDICIONES]
    #v(6pt)
    #set text(size: 9pt, fill: rgb("555555"))
    ${data.notes.map((n) => `- ${esc(n)}`).join("\n    ")}
  ]` : "";

  // Client info lines
  const clientLines: string[] = [];
  clientLines.push(`#text(size: 10pt, weight: "semibold")[${esc(data.client.name)}]`);
  if (data.client.company) clientLines.push(`#text(size: 9pt, fill: rgb("555555"))[${esc(data.client.company)}]`);
  if (data.client.email) clientLines.push(`#text(size: 9pt, fill: rgb("555555"))[${esc(data.client.email)}]`);
  if (data.client.phone) clientLines.push(`#text(size: 9pt, fill: rgb("555555"))[Tel: ${esc(data.client.phone)}]`);
  if (data.client.address) clientLines.push(`#text(size: 9pt, fill: rgb("555555"))[${esc(data.client.address)}]`);

  // Company info lines
  const companyExtra: string[] = [];
  if (data.company.rfc) companyExtra.push(`#text(size: 8pt, fill: rgb("666666"))[RFC: ${esc(data.company.rfc)}]`);
  if (data.company.address) companyExtra.push(`#text(size: 8pt, fill: rgb("666666"))[${esc(data.company.address)}]`);
  if (data.company.phone) companyExtra.push(`#text(size: 8pt, fill: rgb("666666"))[Tel: ${esc(data.company.phone)}]`);
  if (data.company.email) companyExtra.push(`#text(size: 8pt, fill: rgb("666666"))[${esc(data.company.email)}]`);

  return `#set page(
  paper: "us-letter",
  margin: (top: 0.6in, bottom: 0.8in, left: 0.5in, right: 0.5in),
  header: [
    #place(top + left, dx: -0.5in, dy: -0.6in)[
      #rect(width: 8.5in, height: 6pt, fill: ${bcTypst})
    ]
  ],
  footer: [
    #line(length: 100%, stroke: 0.5pt + rgb("dddddd"))
    #v(4pt)
    #set text(size: 8pt, fill: rgb("999999"))
    #grid(
      columns: (1fr, auto),
      [${esc(data.company.address || data.company.name)}],
      [Página #context counter(page).display("1") de #context counter(page).final().at(0)],
    )
  ],
)

#set text(font: "Helvetica", size: 10pt)

// Header
#grid(
  columns: (1fr, auto),
  [
    ${data.logoUrl ? `#grid(columns: (auto, 1fr), gutter: 10pt, align(horizon)[#image("logo.${data.logoExt || "png"}", height: 36pt)], [
      #text(size: 15pt, weight: "bold", fill: ${bcTypst})[${esc(data.company.name)}]
      ${companyExtra.length ? "\n      " + companyExtra.join("\n      ") : ""}
    ])` : `#text(size: 15pt, weight: "bold", fill: ${bcTypst})[${esc(data.company.name)}]
    ${companyExtra.length ? "\n    " + companyExtra.join("\n    ") : ""}`}
  ],
  align(right)[
    #text(size: 16pt, weight: "bold", fill: ${bcTypst})[COTIZACIÓN]
    ${data.folio ? `\n    #text(size: 11pt, weight: "bold", fill: ${bcTypst})[${esc(data.folio)}]` : ""}
    #text(size: 9pt, fill: rgb("555555"))[${esc(date)}]
    ${data.validity ? `#text(size: 8pt, fill: rgb("888888"))[Vigencia: ${esc(data.validity)}]` : ""}
  ],
)

#v(14pt)

// Client card
#block(fill: rgb("f8f8f8"), radius: 6pt, inset: 12pt, width: 100%)[
  #text(size: 8pt, weight: "bold", fill: rgb("999999"), tracking: 0.5pt)[CLIENTE]
  #v(4pt)
  ${clientLines.join("\n  ")}
]

#v(14pt)

// Items table
#table(
  columns: (${cols.join(", ")}),
  stroke: none,
  inset: 7pt,
  ${headers.join(",\n  ")},
  ${rows}
)

#v(8pt)

// Totals
#align(right)[
  #table(
    columns: (auto, auto),
    stroke: none,
    inset: (x: 8pt, y: 3pt),
    ${totalRows.join("\n    ")}
  )
]

${paymentBlock}

#v(12pt)
${notesBlock}
`;
}

export async function compileTypstPdf(typstSource: string, opts?: { paymentUrl?: string; logoUrl?: string; logoBase64?: string }): Promise<Buffer> {
  await mkdir(TMP_DIR, { recursive: true });
  const id = randomUUID().slice(0, 8);
  const dir = join(TMP_DIR, id);
  await mkdir(dir, { recursive: true });
  const typFile = join(dir, "main.typ");
  const pdfFile = join(dir, "main.pdf");
  const qrFile = join(dir, "qr.png");

  try {
    // Generate QR code if payment URL provided
    if (opts?.paymentUrl) {
      const QRCode = (await import("qrcode")).default;
      await QRCode.toFile(qrFile, opts.paymentUrl, { width: 200, margin: 1, color: { dark: "#000000", light: "#ffffff" } });
    }

    // Write logo if provided (base64 or URL) — auto-detect format
    const writeLogo = async (buf: Buffer) => {
      const isSvg = buf[0] === 0x3C || buf.toString("utf-8", 0, 5).trim().startsWith("<");
      const ext = isSvg ? "svg" : "png";
      await writeFile(join(dir, `logo.${ext}`), buf);
      return ext;
    };
    let logoExt = "png";
    if (opts?.logoBase64) {
      logoExt = await writeLogo(Buffer.from(opts.logoBase64, "base64"));
    } else if (opts?.logoUrl) {
      const res = await fetch(opts.logoUrl);
      if (res.ok) logoExt = await writeLogo(Buffer.from(await res.arrayBuffer()));
    }

    await writeFile(typFile, typstSource, "utf-8");

    await new Promise<void>((resolve, reject) => {
      execFile("typst", ["compile", typFile, pdfFile], { timeout: 10_000 }, (err, _stdout, stderr) => {
        if (err) reject(new Error(`Typst compilation failed: ${stderr || err.message}`));
        else resolve();
      });
    });

    return await readFile(pdfFile);
  } finally {
    const { rm } = await import("node:fs/promises");
    await rm(dir, { recursive: true, force: true }).catch(() => {});
  }
}
