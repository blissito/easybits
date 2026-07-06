#!/usr/bin/env node
/**
 * SIIQTEC / Totequim — cotización determinista. JSON in, hosted PDF URL out.
 *
 * Patrón oficial de custom-tool de la flota (ver ../../README.md): el agente NO
 * calcula ni arma el HTML — corre ESTE script. Valida estricto (sin math
 * alucinado), calcula totales en código, genera link MercadoPago, arma la
 * plantilla oficial (productos paginados + ficha de depósito con datos bancarios
 * y QR), y la sube vía `create_quotation` (pages) del MCP de EasyBits.
 *
 * Uso en el worker:
 *   node quote.mjs /tmp/input.json      # input = un QuoteInput (ver schema abajo)
 *   echo '<json>' | node quote.mjs      # o por stdin
 *
 * Env (ya inyectado en el worker):
 *   EASYBITS_API_KEY   — llave del owner (scopea create_quotation a su cuenta)
 *   EASYBITS_BASE_URL  — default https://www.easybits.cloud
 *   MP_ACCESS_TOKEN    — si el conector MercadoPago está encendido (link de pago)
 *   QUOTE_*            — branding por marca (defaults = SIIQTEC). Ver BRAND.
 *
 * Salida (stdout, última línea): JSON { pdfUrl, folio, total, paymentUrl, pages }
 */

import { spawn } from 'node:child_process';
import fs from 'node:fs';

const ITEMS_PER_PRODUCT_PAGE = 6;
const FOLIO_REGEX = /^\d{6}-\d{3}$/;
const VALID_UNITS = new Set(['PZA', 'GARRAFA', 'KG', 'LT', 'CAJA', 'BOLSA', 'PAR', 'JGO']);
const AI_DISCLAIMER = 'Esta cotización es generada con IA y puede tener errores';

// Emisor branding — overridable por deployment vía QUOTE_* para servir marcas
// hermanas (SIIQTEC, Totequim, ...). Defaults = SIIQTEC byte-for-byte.
const BRAND = {
  logoUrl: process.env.QUOTE_LOGO_URL || 'https://easybits-public.fly.storage.tigris.dev/69e19ed033ef9abb7cd5a54b/90R',
  bankLogoUrl: process.env.QUOTE_BANK_LOGO_URL || 'https://easybits-public.fly.storage.tigris.dev/69e19ed033ef9abb7cd5a54b/eHr',
  razonSocial: process.env.QUOTE_RAZON_SOCIAL || 'SIIQTEC SA DE CV',
  rfc: process.env.QUOTE_RFC || 'SII140827F4A',
  addr1: process.env.QUOTE_ADDR_1 || 'ENTRADA SAN ISIDRO 142 · Col: RANCHO SAN ISIDRO C.P.: 42188',
  addr2: process.env.QUOTE_ADDR_2 || 'MINERAL DE LA REFORMA, HIDALGO, MÉXICO',
  contactLine: process.env.QUOTE_CONTACT_LINE || 'Tel: 7712211359 · TOTEQUIM 7717010389 · siiqtec@hotmail.com',
  shortName: process.env.QUOTE_BRAND_SHORT || 'SIIQTEC',
  web: process.env.QUOTE_WEB || 'siiqtec.com.mx',
  footerContact: process.env.QUOTE_FOOTER_CONTACT || 'ventas@siiqtec.com.mx · Tel: 7712211359',
  // Datos bancarios (ficha de depósito). Overridables por marca.
  bankCuenta: process.env.QUOTE_BANK_CUENTA || '7830037',
  bankSucursal: process.env.QUOTE_BANK_SUCURSAL || '7008',
  bankClabe: process.env.QUOTE_BANK_CLABE || '002290700878300370',
};

class QuoteError extends Error {
  constructor(msg) { super(`siiqtec_quote: ${msg}`); }
}

const fmtMoney = (n) => '$ ' + n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const escapeHtml = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
function todayMx() {
  const d = new Date();
  return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`;
}
// Los thumbnails se embeben a full-res y engordan el PDF (5-9MB → timeout).
// weserv devuelve un ~1-3KB.
const thumbUrl = (url) => `https://images.weserv.nl/?url=${encodeURIComponent(url)}&w=96&h=96&fit=contain&output=jpg&q=72`;

/** Validación estricta. Rechaza cualquier cosa que lleve a una cotización mala. */
export function validate(input) {
  if (!input || typeof input !== 'object') throw new QuoteError('input must be an object');
  if (!input.folio || !FOLIO_REGEX.test(input.folio)) throw new QuoteError(`folio must match YYMMDD-NNN, got ${JSON.stringify(input.folio)}`);
  if (!input.cliente?.nombre?.trim()) throw new QuoteError('cliente.nombre is required');
  if (!input.cliente?.domicilio?.trim()) throw new QuoteError('cliente.domicilio is required (needed for shipping)');
  if (!Array.isArray(input.items) || input.items.length === 0) throw new QuoteError('items[] must have at least one product');
  if (input.items.length > 99) throw new QuoteError(`items[] too long: ${input.items.length} > 99`);
  input.items.forEach((it, i) => {
    if (!it.sku?.trim()) throw new QuoteError(`items[${i}].sku is required`);
    if (!it.nombre?.trim()) throw new QuoteError(`items[${i}].nombre is required`);
    if (!Number.isFinite(it.qty) || it.qty <= 0) throw new QuoteError(`items[${i}].qty must be > 0, got ${it.qty}`);
    if (!Number.isFinite(it.unit_price) || it.unit_price < 0) throw new QuoteError(`items[${i}].unit_price must be >= 0, got ${it.unit_price}`);
    if (!VALID_UNITS.has(it.unit)) throw new QuoteError(`items[${i}].unit must be one of ${[...VALID_UNITS].join(',')}, got ${JSON.stringify(it.unit)}`);
  });
  const env = input.envio;
  if (!env || typeof env !== 'object') throw new QuoteError('envio is required');
  if (env.modo === 'ruta_siiqtec') {
    if (!env.dia?.trim()) throw new QuoteError("envio.dia is required when modo='ruta_siiqtec'");
    if (!env.destino?.trim()) throw new QuoteError("envio.destino is required when modo='ruta_siiqtec'");
  } else if (env.modo === 'paqueteria') {
    if (!env.carrier?.trim()) throw new QuoteError("envio.carrier is required when modo='paqueteria'");
    if (!Number.isFinite(env.costo) || env.costo < 0) throw new QuoteError(`envio.costo must be >= 0 when modo='paqueteria', got ${env.costo}`);
  } else {
    throw new QuoteError(`envio.modo must be 'ruta_siiqtec' or 'paqueteria', got ${JSON.stringify(env.modo)}`);
  }
}

/** Montos DETERMINISTAS (el agente no los pasa). Precios ya incluyen IVA. */
export function computeTotals(input) {
  const amounts = input.items.map((it) => Math.round(it.qty * it.unit_price * 100) / 100);
  const subtotal = Math.round(amounts.reduce((a, b) => a + b, 0) * 100) / 100;
  let envioCost = 0, envioLabel = '', envioValueText = '', envioColor = '#16A34A';
  if (input.envio.modo === 'ruta_siiqtec') {
    envioCost = 0;
    envioLabel = `Ruta ${BRAND.shortName} — ${input.envio.destino} · Entrega ${input.envio.dia}`;
    envioValueText = 'GRATIS';
  } else {
    envioCost = Math.round(input.envio.costo * 100) / 100;
    envioLabel = `${input.envio.carrier} · CP ${input.envio.cp} · ${input.envio.dias}`;
    envioValueText = fmtMoney(envioCost);
    envioColor = '#2B3659';
  }
  const total = Math.round((subtotal + envioCost) * 100) / 100;
  return { amounts, subtotal, envioCost, envioLabel, envioValueText, envioColor, total };
}

/** Link de pago MercadoPago (checkout preference). Devuelve init_point. */
async function createMpLink(total, folio) {
  const token = process.env.MP_ACCESS_TOKEN;
  if (!token) throw new QuoteError('include_payment_link=true pero falta MP_ACCESS_TOKEN en el env (enciende el conector MercadoPago)');
  const res = await fetch('https://api.mercadopago.com/checkout/preferences', {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ items: [{ title: `Cotización ${folio}`, quantity: 1, unit_price: total, currency_id: 'MXN' }] }),
  });
  if (!res.ok) throw new QuoteError(`MercadoPago ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const j = await res.json();
  const url = j.init_point || j.sandbox_init_point;
  if (!url) throw new QuoteError(`MercadoPago no devolvió init_point: ${JSON.stringify(j).slice(0, 200)}`);
  return url;
}

/** HEAD-check de una imagen. true solo en 2xx con content-type image/*. */
async function imageOk(url, timeoutMs = 3000) {
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), timeoutMs);
    const res = await fetch(url, { method: 'HEAD', signal: ctrl.signal });
    clearTimeout(t);
    return res.ok && (res.headers.get('content-type') || '').startsWith('image/');
  } catch { return false; }
}

/** Sustituye cualquier imagen inalcanzable por null → placeholder S/I. */
async function pruneBrokenImages(items) {
  await Promise.all(items.map(async (it) => {
    if (it.imagen_url && !(await imageOk(it.imagen_url))) it.imagen_url = null;
  }));
}

function renderItemRow(item, amount) {
  const imgCell = item.imagen_url
    ? `<img src="${escapeHtml(thumbUrl(item.imagen_url))}" class="w-10 h-10 object-contain" />`
    : `<div class="w-10 h-10 bg-gray-100 rounded flex items-center justify-center"><span class="text-gray-300" style="font-size:8px">S/I</span></div>`;
  return `        <tr class="border-b border-gray-200 align-middle">
          <td class="py-1.5 px-2">${imgCell}<p class="text-gray-400 text-center" style="font-size:7px">${escapeHtml(item.sku)}</p></td>
          <td class="py-1.5 px-2 text-center font-semibold">${item.qty}</td>
          <td class="py-1.5 px-2 text-center">${escapeHtml(item.unit)}</td>
          <td class="py-1.5 px-2 font-medium text-gray-800">${escapeHtml(item.nombre)}</td>
          <td class="py-1.5 px-2 text-right whitespace-nowrap">${fmtMoney(item.unit_price)}</td>
          <td class="py-1.5 px-2 text-right font-semibold whitespace-nowrap">${fmtMoney(amount)}</td>
        </tr>`;
}

function renderTotalsBlock(subtotal, envioLabel, envioValueText, envioColor, total) {
  return `      <tfoot>
        <tr class="border-t border-gray-300 bg-gray-50">
          <td colspan="5" class="py-2 px-2 text-right text-gray-500">Subtotal productos</td>
          <td class="py-2 px-2 text-right font-semibold text-gray-700 whitespace-nowrap">${fmtMoney(subtotal)}</td>
        </tr>
        <tr class="border-t border-gray-200 bg-gray-50">
          <td colspan="5" class="py-2 px-2 text-right text-gray-500">
            <span class="inline-flex items-center gap-1">
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="${envioColor}" stroke-width="2"><rect x="1" y="3" width="15" height="13" rx="1"/><path d="M16 8h4l3 3v5h-7V8z"/><circle cx="5.5" cy="18.5" r="2.5"/><circle cx="18.5" cy="18.5" r="2.5"/></svg>
              ${escapeHtml(envioLabel)}
            </span>
          </td>
          <td class="py-2 px-2 text-right font-semibold whitespace-nowrap" style="color:${envioColor}">${escapeHtml(envioValueText)}</td>
        </tr>
        <tr class="border-t-2 border-gray-400">
          <td colspan="5" class="py-2.5 px-2 text-right font-black tracking-wide text-sm" style="color:#2B3659">TOTAL</td>
          <td class="py-2.5 px-2 text-right font-black text-lg whitespace-nowrap" style="color:#2B3659">${fmtMoney(total)}</td>
        </tr>
      </tfoot>`;
}

function renderProductPage({ input, pageItems, pageAmounts, pageNum, pageTotal, totalsBlock }) {
  const c = input.cliente;
  const dash = (v) => (v && String(v).trim() ? escapeHtml(v) : '—');
  const fechaStr = escapeHtml(input.fecha || todayMx());
  const rows = pageItems.map((it, i) => renderItemRow(it, pageAmounts[i])).join('\n');
  const tfoot = totalsBlock || '';
  return `<section class="w-[8.5in] h-[11in] relative overflow-hidden flex flex-col bg-white font-sans">
  <div class="shrink-0 flex justify-between items-center px-8 pt-3 pb-2 border-b-2 border-gray-800">
    <div class="flex items-center gap-4">
      <img src="${BRAND.logoUrl}" class="h-16 w-auto object-contain" />
      <div class="text-left text-xs text-gray-700">
        <p class="text-sm font-black tracking-wide text-gray-900">${escapeHtml(BRAND.razonSocial)}</p>
        <p class="mt-0.5">RFC: ${escapeHtml(BRAND.rfc)}</p>
        <p>${escapeHtml(BRAND.addr1)}</p>
        <p>${escapeHtml(BRAND.addr2)}</p>
        <p>${escapeHtml(BRAND.contactLine)}</p>
      </div>
    </div>
    <div class="text-right border border-gray-300 rounded px-4 py-2 min-w-36">
      <p class="text-sm font-bold text-gray-700">Cotización</p>
      <p class="text-lg font-black" style="color:#A73547">${escapeHtml(input.folio)}</p>
      <p class="text-xs text-gray-500 mt-1">Fecha</p>
      <p class="text-sm font-semibold text-gray-800">${fechaStr}</p>
      <p class="text-xs text-gray-500 mt-0.5">Moneda: MXN</p>
    </div>
  </div>
  <div class="shrink-0 flex px-8 py-1 border-b border-gray-400 bg-gray-50">
    <div class="w-10 flex items-center justify-center mr-3">
      <p class="text-xs font-bold text-gray-400 tracking-widest" style="writing-mode:vertical-rl;transform:rotate(180deg)">RECEPTOR</p>
    </div>
    <div class="flex-1 grid grid-cols-2 gap-x-8 gap-y-0.5 text-xs py-0.5">
      <div><span class="text-gray-500">Nombre: </span><span class="font-semibold text-gray-800">${dash(c.nombre)}</span></div>
      <div><span class="text-gray-500">R.F.C.: </span><span class="font-semibold text-gray-800">${dash(c.rfc)}</span></div>
      <div><span class="text-gray-500">Email: </span><span class="text-gray-700">${dash(c.email)}</span></div>
      <div><span class="text-gray-500">Tel: </span><span class="text-gray-700">${dash(c.tel)}</span></div>
      <div><span class="text-gray-500">Domicilio: </span><span class="text-gray-700">${dash(c.domicilio)}</span></div>
      <div><span class="text-gray-500">Colonia: </span><span class="text-gray-700">${dash(c.colonia)}</span></div>
      <div><span class="text-gray-500">Ciudad: </span><span class="text-gray-700">${dash(c.ciudad)}</span></div>
      <div><span class="text-gray-500">Vendedor: </span><span class="text-gray-700">${dash(c.vendedor || BRAND.shortName)}</span></div>
    </div>
  </div>
  <div class="flex-1 overflow-hidden px-8 py-3">
    <table class="w-full text-xs border-collapse">
      <thead>
        <tr class="text-white" style="background:#2B3659">
          <th class="py-1.5 px-2 text-left w-16">IMG/CLAVE</th>
          <th class="py-1.5 px-2 text-center w-10">CANT</th>
          <th class="py-1.5 px-2 text-center w-14">UNIDAD</th>
          <th class="py-1.5 px-2 text-left">DESCRIPCIÓN</th>
          <th class="py-1.5 px-2 text-right w-24">P. UNIT.</th>
          <th class="py-1.5 px-2 text-right w-24">IMPORTE</th>
        </tr>
      </thead>
      <tbody>
${rows}
      </tbody>
${tfoot}
    </table>
  </div>
  <div class="shrink-0 px-8 pb-3 pt-2 border-t border-gray-300">
    <div class="flex justify-between items-end text-xs">
      <div>
        <p class="text-gray-500">Vendedor</p>
        <p class="font-semibold text-gray-800 mt-3 border-t border-gray-400 pt-1 w-40">${dash(c.vendedor || BRAND.shortName)}</p>
      </div>
      <div class="text-right text-gray-500">
        <p class="italic text-gray-400">${AI_DISCLAIMER}</p>
        <p class="mt-0.5">Todos los precios incluyen I.V.A.</p>
        <p class="mt-0.5">Vigencia: 3 días naturales a partir de la fecha de emisión</p>
        <p class="mt-1 font-medium">Página ${pageNum} de ${pageTotal}</p>
      </div>
    </div>
  </div>
</section>`;
}

function renderDepositPage({ folio, total, paymentUrl }) {
  const totalStr = fmtMoney(total);
  const urlEnc = paymentUrl ? encodeURIComponent(paymentUrl) : '';
  const mpCard = !paymentUrl ? '' : `
  <div class="shrink-0 px-10 pb-4">
    <div class="w-full rounded-xl overflow-hidden" style="border:2px solid #2B3659">
      <div class="text-center py-1.5 text-white text-xs font-black tracking-widest" style="background:#2B3659">
        PAGA EN LÍNEA — SEGURO Y RÁPIDO · MERCADOPAGO
      </div>
      <div class="flex items-center gap-6 px-6 py-4" style="background:#F0F2F8">
        <div class="shrink-0 flex flex-col items-center gap-1">
          <img src="https://api.qrserver.com/v1/create-qr-code/?size=130x130&data=${urlEnc}" class="w-28 h-28" />
          <p class="text-xs text-center" style="color:#2B3659;font-size:9px">Escanea para pagar</p>
        </div>
        <div class="self-stretch w-px" style="background:#2B3659;opacity:0.2"></div>
        <div class="flex-1">
          <p class="text-sm font-black" style="color:#2B3659">Pago seguro en línea</p>
          <p class="text-xs text-gray-500 mt-1">Cotización: <span class="font-semibold">${escapeHtml(folio)}</span></p>
          <p class="text-xs text-gray-500 mt-0.5">Vigencia: 3 días naturales · Todos los precios incluyen I.V.A.</p>
          <p class="text-xs mt-2 text-gray-400 break-all">${escapeHtml(paymentUrl)}</p>
        </div>
        <div class="shrink-0 flex flex-col items-end gap-3">
          <div class="text-right">
            <p class="text-xs text-gray-500">Total a pagar</p>
            <p class="text-3xl font-black whitespace-nowrap" style="color:#2B3659">${totalStr}</p>
            <p class="text-xs text-gray-400">MXN</p>
          </div>
          <a href="${escapeHtml(paymentUrl)}" style="background:#A73547;color:#ffffff;font-size:12px;font-weight:800;padding:10px 24px;border-radius:8px;text-decoration:none;display:inline-block">💳 Clic para pagar</a>
        </div>
      </div>
    </div>
  </div>`;
  return `<section class="w-[8.5in] h-[11in] relative overflow-hidden flex flex-col bg-white font-sans">
  <div class="shrink-0 h-2 w-full" style="background:#2B3659"></div>
  <div class="shrink-0 px-10 py-6">
    <div class="flex gap-0 border border-gray-300">
      <div class="flex border-r border-gray-300" style="min-width:280px;max-width:280px">
        <div class="flex items-center justify-center bg-gray-100 border-r border-gray-300 px-1">
          <p class="text-xs text-gray-500 font-bold tracking-widest" style="writing-mode:vertical-rl;transform:rotate(180deg);white-space:nowrap">DATOS DE LA EMPRESA</p>
        </div>
        <div class="flex-1 flex flex-col items-center justify-center py-6 px-6 gap-3">
          <img src="${BRAND.logoUrl}" class="h-36 w-auto object-contain" />
          <table class="w-full text-xs border-collapse">
            <tr><td class="border border-gray-300 px-3 py-1 bg-gray-50 text-center text-gray-500">Razón Social</td></tr>
            <tr><td class="border border-gray-300 px-3 py-2 text-center font-bold text-gray-800">${escapeHtml(BRAND.razonSocial)}</td></tr>
          </table>
        </div>
      </div>
      <div class="flex-1 flex flex-col">
        <div class="shrink-0 border-b border-gray-300 text-center py-2">
          <p class="text-base font-black tracking-widest text-gray-800">FICHA DE DEPÓSITO</p>
        </div>
        <div class="flex border-b border-gray-300">
          <div class="flex items-center justify-center bg-gray-100 border-r border-gray-300 px-1">
            <p class="text-xs text-gray-500 font-bold tracking-widest" style="writing-mode:vertical-rl;transform:rotate(180deg);white-space:nowrap">DATOS BANCARIOS</p>
          </div>
          <div class="flex-1 flex items-center gap-4 px-4 py-3">
            <img src="${BRAND.bankLogoUrl}" class="h-10 w-auto object-contain flex-shrink-0" />
            <table class="flex-1 text-xs border-collapse">
              <thead><tr>
                <th class="border border-gray-300 px-4 py-1 bg-gray-50 text-gray-600 font-semibold">Cuenta</th>
                <th class="border border-gray-300 px-4 py-1 bg-gray-50 text-gray-600 font-semibold">Sucursal</th>
              </tr></thead>
              <tbody>
                <tr>
                  <td class="border border-gray-300 px-4 py-2 text-center font-bold text-gray-800 text-sm">${escapeHtml(BRAND.bankCuenta)}</td>
                  <td class="border border-gray-300 px-4 py-2 text-center font-bold text-gray-800 text-sm">${escapeHtml(BRAND.bankSucursal)}</td>
                </tr>
                <tr><td colspan="2" class="border border-gray-300 px-4 py-1 text-center bg-gray-50 text-gray-600 text-xs font-semibold">CLABE</td></tr>
                <tr><td colspan="2" class="border border-gray-300 px-4 py-2 text-center font-bold text-gray-800 tracking-widest">${escapeHtml(BRAND.bankClabe)}</td></tr>
              </tbody>
            </table>
          </div>
        </div>
        <div class="flex">
          <div class="flex items-center justify-center bg-gray-100 border-r border-gray-300 px-1">
            <p class="text-xs text-gray-500 font-bold tracking-widest" style="writing-mode:vertical-rl;transform:rotate(180deg);white-space:nowrap">DATOS DE PAGO</p>
          </div>
          <div class="flex-1">
            <table class="w-full text-xs border-collapse">
              <thead><tr>
                <th class="border border-gray-300 px-4 py-1 bg-gray-50 text-gray-600 font-semibold">Concepto</th>
                <th class="border border-gray-300 px-4 py-1 bg-gray-50 text-gray-600 font-semibold w-40">TOTAL</th>
              </tr></thead>
              <tbody><tr>
                <td class="border border-gray-300 px-4 py-3 text-center text-gray-800">Cotización No. ${escapeHtml(folio)}</td>
                <td class="border border-gray-300 px-4 py-3 text-center font-black text-gray-800 text-sm whitespace-nowrap">${totalStr} MXN</td>
              </tr></tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  </div>
${mpCard}
  <div class="shrink-0 w-full px-10 py-3 border-t border-gray-200 mt-auto text-xs text-gray-400">
    <div class="flex justify-between">
      <p>${escapeHtml(BRAND.shortName)} · ${escapeHtml(BRAND.web)}</p>
      <p>${escapeHtml(BRAND.footerContact)}</p>
    </div>
    <p class="text-right italic mt-0.5">${AI_DISCLAIMER}</p>
  </div>
</section>`;
}

/** Arma los pages[] HTML deterministas (productos paginados + ficha de depósito). */
export function buildPages(input, totals, paymentUrl) {
  const chunks = [], amountChunks = [];
  for (let i = 0; i < input.items.length; i += ITEMS_PER_PRODUCT_PAGE) {
    chunks.push(input.items.slice(i, i + ITEMS_PER_PRODUCT_PAGE));
    amountChunks.push(totals.amounts.slice(i, i + ITEMS_PER_PRODUCT_PAGE));
  }
  const totalPages = chunks.length + 1;
  const totalsBlock = renderTotalsBlock(totals.subtotal, totals.envioLabel, totals.envioValueText, totals.envioColor, totals.total);
  const pages = chunks.map((pageItems, idx) =>
    renderProductPage({
      input, pageItems, pageAmounts: amountChunks[idx], pageNum: idx + 1, pageTotal: totalPages,
      totalsBlock: idx === chunks.length - 1 ? totalsBlock : null,
    })
  );
  pages.push(renderDepositPage({ folio: input.folio, total: totals.total, paymentUrl }));
  return pages;
}

/** Llama a create_quotation (pages) vía el MCP proxy de EasyBits → { pdfUrl }. */
async function createQuotationViaMcp(name, pages) {
  const messages = [
    { jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2024-11-05', capabilities: {}, clientInfo: { name: 'siiqtec-quote', version: '2' } } },
    { jsonrpc: '2.0', method: 'notifications/initialized' },
    { jsonrpc: '2.0', id: 2, method: 'tools/call', params: { name: 'create_quotation', arguments: { name, pages } } },
  ];
  return new Promise((resolve, reject) => {
    const child = spawn('npx', ['-y', '@easybits.cloud/mcp'], { env: process.env });
    let stdout = '', stderr = '';
    const timer = setTimeout(() => { child.kill('SIGKILL'); reject(new QuoteError('create_quotation timed out after 120s')); }, 120000);
    child.stdout.on('data', (d) => (stdout += d));
    child.stderr.on('data', (d) => (stderr += d));
    child.on('error', (e) => { clearTimeout(timer); reject(new QuoteError(`MCP spawn failed: ${e.message}`)); });
    child.on('close', () => {
      clearTimeout(timer);
      let last;
      for (const line of stdout.split('\n').filter(Boolean)) {
        try { const o = JSON.parse(line); if (o.id === 2) last = o; } catch { /* skip */ }
      }
      if (!last) return reject(new QuoteError(`create_quotation: no result. stderr=${stderr.slice(0, 300)}`));
      if (last.error) return reject(new QuoteError(`create_quotation error: ${JSON.stringify(last.error)}`));
      const text = (last.result?.content || []).map((c) => c.text || '').join('\n');
      // La respuesta trae dos bloques JSON: { id, name } y { pdfUrl }.
      const m = text.match(/"pdfUrl"\s*:\s*"([^"]+)"/);
      if (!m) return reject(new QuoteError(`create_quotation: sin pdfUrl en la respuesta: ${text.slice(0, 300)}`));
      const idm = text.match(/"id"\s*:\s*"([^"]+)"/);
      resolve({ pdfUrl: m[1], documentId: idm?.[1] });
    });
    child.stdin.write(messages.map((m) => JSON.stringify(m)).join('\n') + '\n');
    child.stdin.end();
  });
}

export async function runQuote(input) {
  validate(input);
  await pruneBrokenImages(input.items);
  const totals = computeTotals(input);
  const paymentUrl = input.include_payment_link ? await createMpLink(totals.total, input.folio) : null;
  const pages = buildPages(input, totals, paymentUrl);
  const name = `COT-${input.folio} — ${input.cliente.nombre}`;
  const { pdfUrl, documentId } = await createQuotationViaMcp(name, pages);
  return { pdfUrl, documentId, folio: input.folio, total: totals.total, paymentUrl, pages: pages.length };
}

// --- CLI ---------------------------------------------------------------------
async function readInput() {
  const arg = process.argv[2];
  if (arg && fs.existsSync(arg)) return JSON.parse(fs.readFileSync(arg, 'utf8'));
  if (arg && arg.trim().startsWith('{')) return JSON.parse(arg);
  const chunks = [];
  for await (const c of process.stdin) chunks.push(c);
  const raw = Buffer.concat(chunks).toString('utf8').trim();
  if (!raw) throw new QuoteError('sin input: pasa un path a JSON, el JSON inline, o por stdin');
  return JSON.parse(raw);
}

// Corre solo como CLI (no cuando se importa para tests).
const isMain = process.argv[1] && import.meta.url === `file://${process.argv[1]}`;
if (isMain) {
  readInput()
    .then(runQuote)
    .then((r) => { console.log(JSON.stringify(r)); })
    .catch((e) => { console.error(e instanceof Error ? e.message : String(e)); process.exit(1); });
}
