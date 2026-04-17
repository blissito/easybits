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
  /** @deprecated brandColor is ignored — colors come from the user's brand kit via customColors. Kept for BC. */
  brandColor?: string;
  currency?: string;
}

const ITEMS_PER_PAGE = 8;

const round2 = (n: number) => Math.round(n * 100) / 100;

/** Recalculate all totals from unit prices — LLMs often get arithmetic wrong */
export function fixQuotationMath(data: QuotationData): QuotationData {
  let corrected = false;
  for (const item of data.items) {
    const expected = round2(item.quantity * item.unitPrice - (item.discount || 0));
    if (item.total !== expected) {
      corrected = true;
      item.total = expected;
    }
  }
  const subtotal = round2(data.items.reduce((s, i) => s + i.total, 0));
  if (data.subtotal !== subtotal) { corrected = true; data.subtotal = subtotal; }

  if (data.taxRate != null) {
    const taxBase = subtotal - (data.discount || 0);
    const tax = round2(taxBase * data.taxRate / 100);
    if (data.tax !== tax) { corrected = true; data.tax = tax; }
  }

  const total = round2(data.subtotal - (data.discount || 0) + (data.tax || 0));
  if (data.total !== total) { corrected = true; data.total = total; }

  if (corrected) console.info("[fixQuotationMath] Corrected arithmetic in quotation data");
  return data;
}

function headerHtml(data: QuotationData): string {
  const date = data.date ? fmtDate(data.date) : fmtDate(new Date().toISOString());
  return `<div class="flex justify-between items-start mb-5">
    <div>
      <h1 class="text-xl font-extrabold m-0 mb-0.5 text-primary">${escapeHtml(data.company.name)}</h1>
      ${data.company.rfc ? `<p class="text-xs text-on-surface-muted m-0">RFC: ${escapeHtml(data.company.rfc)}</p>` : ""}
      ${data.company.address ? `<p class="text-xs text-on-surface-muted m-0 mt-0.5">${escapeHtml(data.company.address)}</p>` : ""}
      ${data.company.phone ? `<p class="text-xs text-on-surface-muted m-0 mt-0.5">Tel: ${escapeHtml(data.company.phone)}</p>` : ""}
      ${data.company.email ? `<p class="text-xs text-on-surface-muted m-0 mt-0.5">${escapeHtml(data.company.email)}</p>` : ""}
    </div>
    <div class="text-right">
      <h2 class="text-2xl font-extrabold m-0 text-primary">COTIZACIÓN</h2>
      ${data.folio ? `<p class="text-sm font-bold m-0 mt-1 text-primary">${escapeHtml(data.folio)}</p>` : ""}
      <p class="text-xs text-on-surface-muted m-0 mt-1">${date}</p>
      ${data.validity ? `<p class="text-xs text-on-surface-muted m-0 mt-0.5">Vigencia: ${escapeHtml(data.validity)}</p>` : ""}
    </div>
  </div>`;
}

function clientHtml(data: QuotationData): string {
  const c = data.client;
  return `<div class="bg-surface-alt rounded-lg px-4 py-3.5 mb-5">
    <p class="font-bold text-[10px] uppercase tracking-wider text-on-surface-muted m-0 mb-1.5">CLIENTE</p>
    <p class="font-semibold text-sm m-0 mb-0.5 text-on-surface">${escapeHtml(c.name)}</p>
    ${c.company ? `<p class="text-xs text-on-surface-muted m-0 mb-0.5">${escapeHtml(c.company)}</p>` : ""}
    ${c.email ? `<p class="text-xs text-on-surface-muted m-0 mb-0.5">${escapeHtml(c.email)}</p>` : ""}
    ${c.phone ? `<p class="text-xs text-on-surface-muted m-0 mb-0.5">Tel: ${escapeHtml(c.phone)}</p>` : ""}
    ${c.address ? `<p class="text-xs text-on-surface-muted m-0">${escapeHtml(c.address)}</p>` : ""}
  </div>`;
}

function itemsTableHtml(items: QuotationItem[], data: QuotationData): string {
  const hasCode = items.some((i) => i.code);
  const hasDiscount = items.some((i) => i.discount);

  const th = (align: string, label: string) =>
    `<th class="px-2.5 py-2 text-${align} text-[10px] uppercase tracking-wider">${label}</th>`;

  const headerCols = [
    ...(hasCode ? [th("left", "Código")] : []),
    th("left", "Descripción"),
    th("center", "Cant."),
    th("right", "P. Unit."),
    ...(hasDiscount ? [th("right", "Desc.")] : []),
    th("right", "Total"),
  ];

  const td = (align: string, content: string) =>
    `<td class="px-2.5 py-[7px] border-b border-on-surface-muted/15 text-xs text-${align} text-on-surface">${content}</td>`;

  const rows = items.map((item, i) => {
    const bg = i % 2 === 1 ? " bg-surface-alt/50" : "";
    return `<tr class="${bg.trim()}">
      ${hasCode ? td("left", escapeHtml(item.code || "")) : ""}
      ${td("left", escapeHtml(item.description))}
      ${td("center", `${item.quantity}${item.unit ? ` ${escapeHtml(item.unit)}` : ""}`)}
      ${td("right", `$${fmt(item.unitPrice)}`)}
      ${hasDiscount ? td("right", item.discount ? `$${fmt(item.discount)}` : "—") : ""}
      ${td("right", `$${fmt(item.total)}`)}
    </tr>`;
  });

  return `<table class="w-full border-collapse mb-4">
    <thead>
      <tr class="bg-primary text-on-primary">${headerCols.join("")}</tr>
    </thead>
    <tbody>${rows.join("")}</tbody>
  </table>`;
}

function totalsHtml(data: QuotationData): string {
  const cur = data.currency || "MXN";
  const rows: string[] = [];
  rows.push(`<tr><td class="text-right px-2.5 py-[3px] text-xs text-on-surface">Subtotal</td><td class="text-right px-2.5 py-[3px] text-xs font-semibold text-on-surface">$${fmt(data.subtotal)}</td></tr>`);
  if (data.discount) {
    rows.push(`<tr><td class="text-right px-2.5 py-[3px] text-xs text-on-surface">Descuento</td><td class="text-right px-2.5 py-[3px] text-xs text-on-surface">-$${fmt(data.discount)}</td></tr>`);
  }
  if (data.tax != null) {
    const label = data.taxRate ? `IVA (${data.taxRate}%)` : "IVA";
    rows.push(`<tr><td class="text-right px-2.5 py-[3px] text-xs text-on-surface">${label}</td><td class="text-right px-2.5 py-[3px] text-xs text-on-surface">$${fmt(data.tax)}</td></tr>`);
  }
  rows.push(`<tr><td class="text-right px-2.5 py-1.5 text-base font-extrabold border-t-2 border-primary text-on-surface">Total</td><td class="text-right px-2.5 py-1.5 text-base font-extrabold border-t-2 border-primary text-primary">$${fmt(data.total)} ${escapeHtml(cur)}</td></tr>`);

  return `<div class="flex justify-end mb-4">
    <table class="min-w-[260px]">${rows.join("")}</table>
  </div>`;
}

function notesHtml(notes: string[]): string {
  if (!notes.length) return "";
  const items = notes.map((n) => `<li class="mb-1">${escapeHtml(n)}</li>`).join("");
  return `<div class="bg-surface-alt rounded-lg px-4 py-3.5 mb-4">
    <p class="font-bold text-[10px] uppercase tracking-wider text-on-surface-muted m-0 mb-2">NOTAS Y CONDICIONES</p>
    <ul class="m-0 pl-[18px] text-xs text-on-surface-muted">${items}</ul>
  </div>`;
}

function footerHtml(data: QuotationData, pageNum: number, totalPages: number): string {
  return `<div class="shrink-0 border-t border-on-surface-muted/20 pt-2 flex justify-between text-[10px] text-on-surface-muted mt-auto">
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

    pages.push(letterPage(content));
  }

  return pages;
}
