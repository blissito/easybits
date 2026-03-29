import { fmt, fmtDate, escapeHtml, letterPage } from "../document-helpers";

export interface CompanyInfo {
  name: string;
  address?: string;
  phone?: string;
  email?: string;
  rfc?: string;
}

export interface ClientInfo {
  name: string;
  company?: string;
  email?: string;
  phone?: string;
  address?: string;
}

export interface QuotationItem {
  description: string;
  quantity: number;
  unit?: string;
  unitPrice: number;
  total: number;
  code?: string;
  discount?: number;
}

export interface QuotationData {
  company: CompanyInfo;
  client: ClientInfo;
  folio?: string;
  date?: string;
  validity?: string;
  items: QuotationItem[];
  notes?: string[];
  subtotal: number;
  tax?: number;
  taxRate?: number;
  discount?: number;
  total: number;
  brandColor?: string;
  currency?: string;
}

const ITEMS_PER_PAGE = 8;

function headerHtml(data: QuotationData): string {
  const bc = data.brandColor || "#1a1a1a";
  const date = data.date ? fmtDate(data.date) : fmtDate(new Date().toISOString());
  return `<div style="display:flex; justify-content:space-between; align-items:flex-start; margin-bottom:20px;">
    <div>
      <h1 style="font-size:20px; font-weight:800; margin:0 0 2px 0; color:${escapeHtml(bc)};">${escapeHtml(data.company.name)}</h1>
      ${data.company.rfc ? `<p style="font-size:11px; color:#666; margin:0;">RFC: ${escapeHtml(data.company.rfc)}</p>` : ""}
      ${data.company.address ? `<p style="font-size:11px; color:#666; margin:2px 0 0 0;">${escapeHtml(data.company.address)}</p>` : ""}
      ${data.company.phone ? `<p style="font-size:11px; color:#666; margin:2px 0 0 0;">Tel: ${escapeHtml(data.company.phone)}</p>` : ""}
      ${data.company.email ? `<p style="font-size:11px; color:#666; margin:2px 0 0 0;">${escapeHtml(data.company.email)}</p>` : ""}
    </div>
    <div style="text-align:right;">
      <h2 style="font-size:22px; font-weight:800; margin:0; color:${escapeHtml(bc)};">COTIZACIÓN</h2>
      ${data.folio ? `<p style="font-size:14px; font-weight:700; margin:4px 0 0 0; color:${escapeHtml(bc)};">${escapeHtml(data.folio)}</p>` : ""}
      <p style="font-size:12px; color:#555; margin:4px 0 0 0;">${date}</p>
      ${data.validity ? `<p style="font-size:11px; color:#888; margin:2px 0 0 0;">Vigencia: ${escapeHtml(data.validity)}</p>` : ""}
    </div>
  </div>`;
}

function clientHtml(data: QuotationData): string {
  const c = data.client;
  return `<div style="background:#f8f8f8; border-radius:8px; padding:14px 16px; margin-bottom:20px;">
    <p style="font-weight:700; font-size:10px; text-transform:uppercase; letter-spacing:0.05em; color:#999; margin:0 0 6px 0;">CLIENTE</p>
    <p style="font-weight:600; font-size:14px; margin:0 0 2px 0;">${escapeHtml(c.name)}</p>
    ${c.company ? `<p style="font-size:12px; color:#555; margin:0 0 2px 0;">${escapeHtml(c.company)}</p>` : ""}
    ${c.email ? `<p style="font-size:12px; color:#555; margin:0 0 2px 0;">${escapeHtml(c.email)}</p>` : ""}
    ${c.phone ? `<p style="font-size:12px; color:#555; margin:0 0 2px 0;">Tel: ${escapeHtml(c.phone)}</p>` : ""}
    ${c.address ? `<p style="font-size:12px; color:#555; margin:0;">${escapeHtml(c.address)}</p>` : ""}
  </div>`;
}

function itemsTableHtml(items: QuotationItem[], data: QuotationData): string {
  const bc = data.brandColor || "#1a1a1a";
  const hasCode = items.some((i) => i.code);
  const hasDiscount = items.some((i) => i.discount);
  const cur = data.currency || "MXN";

  const headerCols = [
    ...(hasCode ? [`<th style="padding:8px 10px; text-align:left; font-size:10px; text-transform:uppercase; letter-spacing:0.05em;">Código</th>`] : []),
    `<th style="padding:8px 10px; text-align:left; font-size:10px; text-transform:uppercase; letter-spacing:0.05em;">Descripción</th>`,
    `<th style="padding:8px 10px; text-align:center; font-size:10px; text-transform:uppercase; letter-spacing:0.05em;">Cant.</th>`,
    `<th style="padding:8px 10px; text-align:right; font-size:10px; text-transform:uppercase; letter-spacing:0.05em;">P. Unit.</th>`,
    ...(hasDiscount ? [`<th style="padding:8px 10px; text-align:right; font-size:10px; text-transform:uppercase; letter-spacing:0.05em;">Desc.</th>`] : []),
    `<th style="padding:8px 10px; text-align:right; font-size:10px; text-transform:uppercase; letter-spacing:0.05em;">Total</th>`,
  ];

  const rows = items.map((item, i) => {
    const bg = i % 2 === 1 ? " background:#fafafa;" : "";
    return `<tr style="${bg}">
      ${hasCode ? `<td style="padding:7px 10px; border-bottom:1px solid #eee; font-size:12px;">${escapeHtml(item.code || "")}</td>` : ""}
      <td style="padding:7px 10px; border-bottom:1px solid #eee; font-size:12px;">${escapeHtml(item.description)}</td>
      <td style="padding:7px 10px; border-bottom:1px solid #eee; font-size:12px; text-align:center;">${item.quantity}${item.unit ? ` ${escapeHtml(item.unit)}` : ""}</td>
      <td style="padding:7px 10px; border-bottom:1px solid #eee; font-size:12px; text-align:right;">$${fmt(item.unitPrice)}</td>
      ${hasDiscount ? `<td style="padding:7px 10px; border-bottom:1px solid #eee; font-size:12px; text-align:right;">${item.discount ? `$${fmt(item.discount)}` : "—"}</td>` : ""}
      <td style="padding:7px 10px; border-bottom:1px solid #eee; font-size:12px; text-align:right;">$${fmt(item.total)}</td>
    </tr>`;
  });

  return `<table style="width:100%; border-collapse:collapse; margin-bottom:16px;">
    <thead>
      <tr style="background:${escapeHtml(bc)}; color:white;">${headerCols.join("")}</tr>
    </thead>
    <tbody>${rows.join("")}</tbody>
  </table>`;
}

function totalsHtml(data: QuotationData): string {
  const bc = data.brandColor || "#1a1a1a";
  const cur = data.currency || "MXN";
  const rows: string[] = [];
  rows.push(`<tr><td style="text-align:right; padding:3px 10px; font-size:12px;">Subtotal</td><td style="text-align:right; padding:3px 10px; font-size:12px; font-weight:600;">$${fmt(data.subtotal)}</td></tr>`);
  if (data.discount) {
    rows.push(`<tr><td style="text-align:right; padding:3px 10px; font-size:12px;">Descuento</td><td style="text-align:right; padding:3px 10px; font-size:12px;">-$${fmt(data.discount)}</td></tr>`);
  }
  if (data.tax != null) {
    const label = data.taxRate ? `IVA (${data.taxRate}%)` : "IVA";
    rows.push(`<tr><td style="text-align:right; padding:3px 10px; font-size:12px;">${label}</td><td style="text-align:right; padding:3px 10px; font-size:12px;">$${fmt(data.tax)}</td></tr>`);
  }
  rows.push(`<tr><td style="text-align:right; padding:6px 10px; font-size:16px; font-weight:800; border-top:2px solid ${escapeHtml(bc)};">Total</td><td style="text-align:right; padding:6px 10px; font-size:16px; font-weight:800; border-top:2px solid ${escapeHtml(bc)}; color:${escapeHtml(bc)};">$${fmt(data.total)} ${escapeHtml(cur)}</td></tr>`);

  return `<div style="display:flex; justify-content:flex-end; margin-bottom:16px;">
    <table style="min-width:260px;">${rows.join("")}</table>
  </div>`;
}

function notesHtml(notes: string[]): string {
  if (!notes.length) return "";
  const items = notes.map((n) => `<li style="margin-bottom:4px;">${escapeHtml(n)}</li>`).join("");
  return `<div style="background:#f8f8f8; border-radius:8px; padding:14px 16px; margin-bottom:16px;">
    <p style="font-weight:700; font-size:10px; text-transform:uppercase; letter-spacing:0.05em; color:#999; margin:0 0 8px 0;">NOTAS Y CONDICIONES</p>
    <ul style="margin:0; padding-left:18px; font-size:12px; color:#555;">${items}</ul>
  </div>`;
}

function footerHtml(data: QuotationData, pageNum: number, totalPages: number): string {
  return `<div style="flex-shrink:0; border-top:1px solid #ddd; padding-top:8px; display:flex; justify-content:space-between; font-size:10px; color:#999; margin-top:auto;">
    <span>${data.company.address ? escapeHtml(data.company.address) : escapeHtml(data.company.name)}</span>
    <span>Página ${pageNum} de ${totalPages}</span>
  </div>`;
}

/** Build quotation HTML pages from structured data */
export function buildQuotationHTML(data: QuotationData): string[] {
  const totalPages = Math.max(1, Math.ceil(data.items.length / ITEMS_PER_PAGE));
  const pages: string[] = [];

  for (let p = 0; p < totalPages; p++) {
    const pageItems = data.items.slice(p * ITEMS_PER_PAGE, (p + 1) * ITEMS_PER_PAGE);
    const isFirst = p === 0;
    const isLast = p === totalPages - 1;

    let content = "";
    if (isFirst) {
      content += headerHtml(data);
      content += clientHtml(data);
    }
    content += itemsTableHtml(pageItems, data);
    if (isLast) {
      content += totalsHtml(data);
      if (data.notes?.length) content += notesHtml(data.notes);
    }
    content += footerHtml(data, p + 1, totalPages);

    pages.push(letterPage(content, { brandColor: data.brandColor }));
  }

  return pages;
}
