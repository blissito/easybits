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

// =============================================================================
// Guard de precios — el modelo NO es la fuente de verdad del dinero.
//
// Incidente que lo motiva (sofi-0, 2026-07-27, nanoclaw cbc12ad): una sesión de
// WhatsApp llevaba viva desde mayo. La única consulta completa al catálogo corrió
// el día uno; los precios subieron en junio. Dos meses y medio después el agente
// cotizó $90/u sacados de su propio contexto. El tell: TODOS los aromas con el
// precio viejo excepto el único SKU que le tocó re-consultar en junio.
//
// tania-0 (flota) tenía el mismo hueco: `unit_price` llegaba del modelo y solo se
// validaba `>= 0`. Este bloque es el port de `catalog-price-guard.ts` de nanoclaw,
// adaptado al esquema de `catalogo_totequim` (escalones en prosa, no numéricos).
//
// Decisiones que vale la pena conservar:
//  - Fail OPEN si el catálogo no responde: comparte host con el render, así que la
//    cotización fallaría segundos después de todos modos. Fallar cerrado aquí solo
//    agrega una forma nueva de tumbar una venta durante un parpadeo.
//  - Fail CLOSED en clave desconocida: esa sí se imprimiría en el PDF.
//  - El mensaje de rechazo NUNCA nombra `price_override`. Los modelos aprenden
//    bypasses del texto de error mucho más rápido que del system prompt; el escape
//    hatch se enseña solo en el SKILL.md, donde controlamos el encuadre.
// =============================================================================

/** `totequim-tania` — catálogo TOTEQUIM (519 productos), el que cotiza tania-0. */
const CATALOG_DB_ID = process.env.QUOTE_CATALOG_DB_ID || '6a10c84c1b7bf9a7cc596d56';
/** `siiqtec-catalogo` — respaldo, DB DISTINTA (960 productos). Ojo: `totequim-tania`
 *  tiene además su propia tabla `catalogo` con solo 200 filas, un remanente parcial;
 *  apuntar el respaldo ahí daría claves "inexistentes" que sí existen. */
const CATALOG_FALLBACK_DB_ID = process.env.QUOTE_CATALOG_FALLBACK_DB_ID || '69fd58e5fb8904ba077f0fba';
const CATALOG_QUERY_TIMEOUT_MS = 6000;
const CATALOG_RETRY_DELAY_MS = 400;

/** Medio centavo. Los precios de catálogo son pesos enteros o 2 decimales, así que
 *  esto cacha $95 vs $95.01 y absorbe el ruido de float del round-trip por JSON.
 *  Deliberadamente ABSOLUTO, no porcentaje: 1% de $110 es $1.10, suficientemente
 *  ancho para dejar pasar un precio genuinamente equivocado. */
const PRICE_EPSILON = 0.005;

/** Tope al escape hatch. Generoso a propósito: las promos aquí se autorizan
 *  conversando en el grupo admin ("un MOSSI y un cloro por $250"), así que una
 *  cotización con TODAS las líneas overrideadas es un martes normal, no una
 *  anomalía — una regla de proporción rechazaría ventas reales. Esto solo caza
 *  el uso absurdo; el control de verdad es que cada override queda logueado. */
const MAX_OVERRIDES = Number(process.env.QUOTE_MAX_OVERRIDES) || 8;

const OVERRIDE_KINDS = new Set([
  'promocion',
  'precio_especial_autorizado',
  'servicio_sin_sku',
  'producto_no_catalogado',
]);

/** Las dos tablas de catálogo tienen esquemas distintos. Se normalizan a una forma
 *  común `{key, nombre, presentacion, tiers[]}` para que el resto no sepa de cuál vino.
 *
 *  `catalogo_totequim` (TOTEQUIM, el que cotiza tania-0): llave `clave`, precio base
 *  `precio_publico`, escalones con `condicion_precio_N` en PROSA.
 *  `catalogo` (SIIQTEC, respaldo): llave `sku`, precio base `precio_publico_directo`,
 *  escalones con mínimos numéricos. */
const CATALOG_SOURCES = [
  {
    dbId: CATALOG_DB_ID,
    table: process.env.QUOTE_CATALOG_TABLE || 'catalogo_totequim',
    keyCols: ['clave', 'clave_alterna'],
    cols: [
      'clave', 'clave_alterna', 'nombre', 'presentacion', 'precio_publico',
      'precio_2', 'condicion_precio_2', 'precio_3', 'condicion_precio_3',
      'precio_4', 'condicion_precio_4',
    ],
    base: 'precio_publico',
    tiers: [
      ['precio_2', 'condicion_precio_2'],
      ['precio_3', 'condicion_precio_3'],
      ['precio_4', 'condicion_precio_4'],
    ],
    prose: true,
  },
  {
    dbId: CATALOG_FALLBACK_DB_ID,
    table: 'catalogo',
    keyCols: ['sku'],
    cols: [
      'sku', 'nombre', 'presentacion', 'precio_publico_directo',
      'precio_2', 'min_piezas_precio_2', 'precio_3', 'min_piezas_precio_3',
    ],
    base: 'precio_publico_directo',
    tiers: [
      ['precio_2', 'min_piezas_precio_2'],
      ['precio_3', 'min_piezas_precio_3'],
    ],
    prose: false,
  },
];

class QuotePriceError extends Error {
  constructor(msg) { super(msg); this.name = 'QuotePriceError'; }
}
class GuardUnavailable extends Error {}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const pricesEqual = (a, b) => Math.abs(a - b) < PRICE_EPSILON;

function num(v) {
  if (v === null || v === undefined || v === '') return null;
  const n = typeof v === 'number' ? v : Number(String(v).replace(/[^0-9.\-]/g, ''));
  return Number.isFinite(n) ? n : null;
}

const WORD_NUMS = {
  UN: 1, UNA: 1, DOS: 2, TRES: 3, CUATRO: 4, CINCO: 5, SEIS: 6,
  SIETE: 7, OCHO: 8, NUEVE: 9, DIEZ: 10, DOCE: 12, VEINTICUATRO: 24,
};

/**
 * `condicion_precio_N` → cantidad mínima que activa ese escalón.
 *
 * Los 50 valores distintos vivos en `catalogo_totequim` caen en cuatro formas:
 * "A PARTIR DE 6 PIEZAS" (y sus erratas APARTIR / A PASRTIR), "MAS DE 2 PIEZAS",
 * "DE 10 GARRAFAS EN ADELANTE" y "SOLO POR PAQUETE DE 36 PIEZAS". El resto
 * ('PIPA', 'NEGOCIABLE SI LLEVA MAS PRODUCTOS', 'nan', 'SOLO POR PAQUETE DE' sin
 * número) NO son condiciones de volumen y por diseño devuelven null.
 *
 * Devolver null significa QUE EL ESCALÓN NO CALIFICA NUNCA, no que se acepte a
 * ciegas. Sin eso el guard degrada de calificación a mera pertenencia, que es
 * exactamente lo que dejaba pasar el incidente original.
 *
 * "MAS DE N" se interpreta como N+1, no como N: estrictamente significa "más que
 * N", y ante la duda conviene el lado que exige más volumen.
 */
export function parseCondicionMin(raw) {
  if (raw === null || raw === undefined) return null;
  const s = String(raw)
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .toUpperCase().trim();
  if (!s || s === 'NAN') return null;

  const qty = (tok) => {
    const n = Number(tok);
    if (Number.isFinite(n) && n >= 1) return n;
    return WORD_NUMS[tok] ?? null;
  };

  let m = s.match(/M[AÁ]S\s+DE\s+([A-Z]+|\d+)/);
  if (m) { const n = qty(m[1]); return n === null ? null : n + 1; }

  m = s.match(/A\s*PA[RS]*TIR\s*(?:DE\s*)?([A-Z]+|\d+)/);
  if (m) return qty(m[1]);

  m = s.match(/\bDE\s+(\d+)\s+\w+\s+EN\s+ADELANTE/);
  if (m) return qty(m[1]);

  m = s.match(/SOLO\s+POR\s+PAQUETE\s+DE\s+(\d+)/);
  if (m) return qty(m[1]);

  return null;
}

/** Fila cruda → escalones `[{min, price}]` ordenados por min ascendente. */
export function tiersFor(row, src) {
  const out = [];
  const base = num(row[src.base]);
  if (base !== null && base > 0) out.push({ min: 1, price: base });

  for (const [priceCol, condCol] of src.tiers) {
    const price = num(row[priceCol]);
    if (price === null || price <= 0) continue;
    const min = src.prose ? parseCondicionMin(row[condCol]) : num(row[condCol]);
    // Sin un mínimo confiable el escalón no puede calificar. `precio_distribuidor`
    // se ignora en la lista de columnas por la misma razón: no es precio de lista
    // al público, y si de veras aplica va por price_override auditado.
    if (min === null || !(min >= 1)) continue;
    out.push({ min, price });
  }
  return out.sort((a, b) => a.min - b.min);
}

/** El escalón que le toca a esta cantidad (el de mayor `min` que no la rebasa). */
function expectedTier(tiers, qty) {
  let best = null;
  for (const t of tiers) if (t.min <= qty && (!best || t.min > best.min)) best = t;
  return best;
}

/** "$110.00 (1 pza) · $95.00 (desde 2 pzas)" */
export function describeTiers(tiers) {
  if (!tiers.length) return 'sin precio en catálogo';
  return tiers
    .map((t) => (t.min <= 1 ? `${fmtMoney(t.price)} (1 pza)` : `${fmtMoney(t.price)} (desde ${t.min} pzas)`))
    .join(' · ');
}

async function queryCatalog(src, keys) {
  const apiKey = (process.env.EASYBITS_API_KEY || '').trim();
  if (!apiKey) throw new GuardUnavailable('EASYBITS_API_KEY no está definida');
  const base = (process.env.EASYBITS_BASE_URL || 'https://www.easybits.cloud').replace(/\/+$/, '');

  // Una clave puede vivir en `clave` o en `clave_alterna` — buscar en ambas evita
  // un unknown_sku falso, que al ser fail-CLOSED tumbaría una cotización buena.
  const where = src.keyCols
    .map((c) => `${c} IN (${keys.map(() => '?').join(',')})`)
    .join(' OR ');
  const sql = `SELECT ${src.cols.join(', ')} FROM ${src.table} WHERE ${where}`;
  const args = src.keyCols.flatMap(() => keys);
  const body = JSON.stringify({ sql, args });
  const url = `${base}/api/v2/databases/${src.dbId}/query`;

  let lastErr;
  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
        body,
        signal: AbortSignal.timeout(CATALOG_QUERY_TIMEOUT_MS),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return await res.json();
    } catch (e) {
      lastErr = e;
      if (attempt === 1) await sleep(CATALOG_RETRY_DELAY_MS);
    }
  }
  throw new GuardUnavailable(`catálogo inalcanzable: ${lastErr?.message || lastErr}`);
}

/** Indexa la respuesta por CADA una de sus columnas-llave, normalizada. */
function indexRows(json, src) {
  const cols = Array.isArray(json?.cols) ? json.cols : [];
  const rows = Array.isArray(json?.rows) ? json.rows : [];
  const out = new Map();
  for (const raw of rows) {
    const row = {};
    cols.forEach((c, i) => { row[c] = Array.isArray(raw) ? raw[i] : raw?.[c]; });
    const entry = {
      nombre: String(row.nombre ?? '').trim(),
      presentacion: String(row.presentacion ?? '').trim() || '(sin presentación)',
      tiers: tiersFor(row, src),
    };
    for (const c of src.keyCols) {
      const k = String(row[c] ?? '').trim().toUpperCase();
      if (!k) continue;
      const list = out.get(k);
      if (list) list.push(entry); else out.set(k, [entry]);
    }
  }
  return out;
}

/**
 * Busca las claves en `catalogo_totequim` y cae a `catalogo` (SIIQTEC) solo para
 * las que no aparecieron — el mismo orden de lookup que ya usa el agente.
 */
export async function fetchCatalogRows(keys) {
  const found = new Map();
  let pending = keys.map((k) => k.trim().toUpperCase()).filter(Boolean);
  let firstErr = null;

  for (const src of CATALOG_SOURCES) {
    if (!pending.length) break;
    try {
      const idx = indexRows(await queryCatalog(src, pending), src);
      for (const k of pending) { const v = idx.get(k); if (v?.length) found.set(k, v); }
      pending = pending.filter((k) => !found.has(k));
    } catch (e) {
      // Si la PRIMERA fuente no responde no sabemos nada: es indisponibilidad real.
      // Si falla el respaldo pero la principal contestó, seguimos con lo que hay.
      if (!firstErr) firstErr = e;
    }
  }
  if (!found.size && firstErr) throw firstErr;
  return found;
}

/**
 * Decide, con las filas ya en mano, qué ítems están mal.
 *
 * Una clave puede mapear a varias filas (GARRAFA 10L y CAJA 2 PZAS 10L a precios
 * distintos), así que se acepta el precio si coincide con un escalón PARA EL QUE LA
 * CANTIDAD CALIFICA, en cualquier fila.
 *
 * La parte de calificación no es opcional. Una versión anterior en nanoclaw aceptaba
 * cualquier escalón de la fila, bajo la teoría de que un precio presente en el
 * catálogo no puede ser un fósil. Dejaba pasar el incidente exacto: el SKU tenía un
 * tercer escalón a $90 desde 10 piezas, así que el $90 en una orden de 4 se veía
 * válido. Cobrar precio de volumen sin el volumen es la misma falla con otra forma.
 *
 * Cobrar de MÁS (precio de lista habiendo mayoreo disponible) queda en warning, no
 * en rechazo: es un precio real de catálogo al que el cliente sí califica.
 */
export function checkItems(items, rowsByKey) {
  const rejections = [];
  const warnings = [];

  for (const item of items) {
    if (item.price_override) continue;
    const key = String(item.sku ?? '').trim().toUpperCase();
    const rows = rowsByKey.get(key) ?? [];
    if (!rows.length) {
      rejections.push({ type: 'unknown_sku', sku: item.sku, nombre: item.nombre });
      continue;
    }

    const matched = rows.find((r) =>
      r.tiers.some((t) => t.min <= item.qty && pricesEqual(t.price, item.unit_price)),
    );
    if (matched) {
      const exp = expectedTier(matched.tiers, item.qty);
      if (exp && !pricesEqual(exp.price, item.unit_price)) {
        warnings.push(
          `${item.sku} (${matched.nombre}): cotizaste ${fmtMoney(item.unit_price)} para qty ${item.qty}; ` +
          `el escalón que corresponde es ${fmtMoney(exp.price)}. Revisa si aplica mayoreo.`,
        );
      }
      continue;
    }

    // La fila con más escalones es la mejor apuesta de "presentación principal"
    // cuando no podemos saber a cuál se refería el agente.
    const richest = rows.reduce((a, b) => (b.tiers.length > a.tiers.length ? b : a));
    const exp = expectedTier(richest.tiers, item.qty);

    // ¿El precio existía, pero solo por encima de esta cantidad? Es un error distinto
    // y merece su propia redacción: dio precio de mayoreo sin el mayoreo.
    let requiresQty;
    for (const r of rows) {
      for (const t of r.tiers) {
        if (pricesEqual(t.price, item.unit_price) && t.min > item.qty) {
          requiresQty = requiresQty === undefined ? t.min : Math.min(requiresQty, t.min);
        }
      }
    }

    rejections.push({
      type: requiresQty === undefined ? 'price_mismatch' : 'insufficient_qty',
      sku: item.sku,
      nombre: richest.nombre || item.nombre,
      qty: item.qty,
      sent: item.unit_price,
      rows: rows.map((r) => ({ presentacion: r.presentacion, tiers: r.tiers })),
      expected: exp ? exp.price : null,
      ...(requiresQty !== undefined && { requiresQty }),
    });
  }

  return { rejections, warnings };
}

/**
 * El mensaje que ve el agente. Dos propiedades cargan peso:
 *  1. TODOS los ítems malos en UN mensaje. Rechazar de a uno quema 3-4 round-trips
 *     por cotización y termina con el agente disculpándose con el cliente.
 *  2. Nunca menciona `price_override` (ver nota del encabezado).
 */
export function buildRejectionMessage(rejections) {
  const lines = ['PRECIO RECHAZADO — el precio enviado no coincide con el catálogo vigente.', ''];

  for (const r of rejections) {
    if (r.type === 'unknown_sku') {
      lines.push(`• ${r.sku} — "${r.nombre}"`);
      lines.push('  Esta clave no existe en el catálogo. Verifícala con db_query antes de cotizar.');
      lines.push('');
      continue;
    }
    lines.push(`• ${r.sku} — ${r.nombre}`);
    lines.push(`  Enviaste: ${fmtMoney(r.sent)} · qty ${r.qty}`);
    if (r.type === 'insufficient_qty') {
      lines.push(`  ${fmtMoney(r.sent)} es precio de mayoreo desde ${r.requiresQty} pzas — el cliente pide ${r.qty}.`);
    }
    lines.push('  Precios vigentes en catálogo:');
    for (const row of r.rows) lines.push(`    - ${row.presentacion}: ${describeTiers(row.tiers)}`);
    if (r.expected !== null) lines.push(`  Para qty ${r.qty} corresponde: ${fmtMoney(r.expected)}`);
    lines.push('');
  }

  // Decirle "usa los precios de arriba" cuando el único problema era una clave
  // inexistente lo manda a buscar precios que no están ahí.
  if (rejections.every((r) => r.type === 'unknown_sku')) {
    lines.push('No se generó ningún PDF. Busca la clave correcta en el catálogo con db_query y vuelve a correr el script.');
  } else {
    lines.push(
      'No se generó ningún PDF. Los precios que recuerdas de mensajes anteriores pueden estar',
      'desactualizados: el catálogo cambia. Vuelve a correr el script con los precios de arriba, y',
      'ANTES avisa al cliente en el chat que corriges el precio (ej: "Una corrección: MOSSI 10L',
      'quedó en $95 c/u, no $90").',
    );
  }
  return lines.join('\n');
}

/** Leído en cada llamada, no al cargar el módulo: pasar de dry-run a enforce es un
 *  cambio de env y reciclar la caja, sin re-subir el script. */
export function currentMode() {
  const raw = (process.env.QUOTE_GUARD_MODE || '').trim().toLowerCase();
  if (raw === 'enforce') return 'enforce';
  if (raw === 'off') return 'off';
  return 'dry-run';
}

/**
 * Deja constancia del uso de overrides. Nunca lanza: un log no escribible no puede
 * costarle al cliente su cotización.
 *
 * Con el guard en enforce, el override es **el único camino que le queda a un precio
 * malo** para llegar al PDF. Eso lo vuelve el registro más importante de los dos, no el
 * menos: un rechazo es el sistema funcionando, un override es el sistema siendo
 * puenteado — con autorización o sin ella. Por eso va al mismo sink durable
 * (`quote_overrides` en la DB del catálogo) y no solo a un archivo que muere con la caja.
 *
 * `catalog` guarda los escalones vigentes al momento: el delta entre lo que se cobró y
 * lo que decía el catálogo es lo que de veras mira un humano al revisar.
 */
export async function recordOverrides(folio, overrides) {
  if (!overrides.length) return;
  const ts = new Date().toISOString();
  for (const o of overrides) {
    console.error(JSON.stringify({ tag: 'quote-price-override', ts, folio, ...o }));
  }
  try {
    const line = overrides
      .map((o) => `${ts}  ${folio}  ${o.sku}  ${o.nombre}  qty=${o.qty}  ${fmtMoney(o.unit_price)}  ${o.kind}  "${o.reason}"${o.catalog ? `  (catálogo: ${o.catalog})` : ''}`)
      .join('\n');
    fs.appendFileSync(process.env.QUOTE_OVERRIDE_LOG || '/tmp/quote-overrides.log', line + '\n');
  } catch (e) {
    console.error(`[quote-guard] no se pudo escribir el log de overrides: ${e.message}`);
  }
  await auditToDb(
    'quote_overrides',
    'CREATE TABLE IF NOT EXISTS quote_overrides (ts TEXT, folio TEXT, sku TEXT, nombre TEXT, ' +
    'qty REAL, unit_price REAL, kind TEXT, reason TEXT, catalogo TEXT)',
    'INSERT INTO quote_overrides (ts, folio, sku, nombre, qty, unit_price, kind, reason, catalogo) VALUES (?,?,?,?,?,?,?,?,?)',
    overrides.map((o) => [ts, folio, o.sku, o.nombre, o.qty, o.unit_price, o.kind, o.reason, o.catalog ?? null])
  );
}

/**
 * Append best-effort a la DB del catálogo. Compartido por overrides y rechazos.
 * NUNCA lanza ni propaga: la auditoría no puede costarle al cliente su cotización,
 * que es el fallo exacto que este archivo existe para evitar.
 */
async function auditToDb(label, ddl, insert, rows) {
  try {
    const apiKey = (process.env.EASYBITS_API_KEY || '').trim();
    if (!apiKey) return;
    const base = (process.env.EASYBITS_BASE_URL || 'https://www.easybits.cloud').replace(/\/+$/, '');
    const url = `${base}/api/v2/databases/${CATALOG_DB_ID}/query`;
    const post = (sql, args) =>
      fetch(url, {
        method: 'POST',
        headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ sql, args }),
        signal: AbortSignal.timeout(CATALOG_QUERY_TIMEOUT_MS),
      });
    await post(ddl);
    for (const args of rows) await post(insert, args);
  } catch (e) {
    console.error(`[quote-guard] no se pudo registrar en ${label}: ${e.message}`);
  }
}

/**
 * Deja constancia de los RECHAZOS. Gemelo de `recordOverrides`, y la razón por la que
 * se puede prender enforce sin volar a ciegas.
 *
 * El sink que importa es el DURABLE. En la flota el worker vive en un microVM efímero:
 * su stderr muere con la caja, y un archivo en /tmp también. Prueba de que no basta:
 * en sofi-0, tras una semana en dry-run, quedaban CERO `WOULD REJECT` recuperables en
 * cualquier lado — o sea, una semana de datos perdidos justo cuando se necesitaban para
 * decidir el enforce.
 *
 * Por eso la tabla `quote_rejections` en la DB del catálogo. Es la fuente para saber si
 * el enforce está bien calibrado: un falso rechazo se ve en horas, no cuando se queja un
 * cliente.
 *
 * Best-effort de principio a fin: NUNCA lanza. Un log caído no puede costarle al cliente
 * su cotización — que es exactamente el fallo que este archivo existe para evitar.
 */
export async function recordRejections(folio, rejections, mode) {
  if (!rejections.length) return;
  const ts = new Date().toISOString();
  const flat = rejections.map((r) => ({
    ts, folio, mode,
    sku: r.sku,
    nombre: r.nombre,
    tipo: r.type,
    qty: r.type === 'unknown_sku' ? null : r.qty,
    enviado: r.type === 'unknown_sku' ? null : r.sent,
    esperado: r.type === 'unknown_sku' ? null : r.expected,
    requiere_qty: r.requiresQty ?? null,
    catalogo: r.type === 'unknown_sku' ? null : r.rows.map((x) => `${x.presentacion}: ${describeTiers(x.tiers)}`).join(' | '),
  }));

  for (const f of flat) console.error(JSON.stringify({ tag: 'quote-price-rejection', ...f }));

  try {
    const line = flat
      .map((f) => `${f.ts}  ${f.mode}  ${f.folio}  ${f.sku}  ${f.tipo}  qty=${f.qty ?? '-'}  enviado=${f.enviado ?? '-'}  esperado=${f.esperado ?? '-'}  ${f.nombre}`)
      .join('\n');
    fs.appendFileSync(process.env.QUOTE_REJECTION_LOG || '/tmp/quote-rejections.log', line + '\n');
  } catch { /* archivo inescribible: el stderr y la DB siguen en pie */ }

  await auditToDb(
    'quote_rejections',
    'CREATE TABLE IF NOT EXISTS quote_rejections (ts TEXT, folio TEXT, mode TEXT, sku TEXT, ' +
    'nombre TEXT, tipo TEXT, qty REAL, enviado REAL, esperado REAL, requiere_qty REAL, catalogo TEXT)',
    'INSERT INTO quote_rejections (ts, folio, mode, sku, nombre, tipo, qty, enviado, esperado, requiere_qty, catalogo) ' +
    'VALUES (?,?,?,?,?,?,?,?,?,?,?)',
    flat.map((f) => [f.ts, f.folio, f.mode, f.sku, f.nombre, f.tipo, f.qty, f.enviado, f.esperado, f.requiere_qty, f.catalogo])
  );
}

/**
 * Valida el `unit_price` de cada ítem contra el catálogo vivo.
 *
 * Lanza QuotePriceError cuando un precio está mal (solo en modo enforce). NUNCA lanza
 * por problemas de infraestructura — esos vuelven como modo `skipped:*` más un
 * warning, porque un parpadeo del catálogo no puede tumbar una venta.
 */
export async function assertCatalogPrices(items, folio) {
  const mode = currentMode();
  const overrides = items
    .filter((it) => it.price_override)
    .map((it) => ({
      sku: it.sku, nombre: it.nombre, qty: it.qty, unit_price: it.unit_price,
      kind: it.price_override.kind, reason: it.price_override.reason,
    }));

  if (mode === 'off') return { mode: 'off', overrides, warnings: [] };

  const bad = overrides.find((o) => !OVERRIDE_KINDS.has(o.kind) || !String(o.reason || '').trim());
  if (bad) {
    const msg = `price_override inválido en ${bad.sku}: requiere kind ∈ {${[...OVERRIDE_KINDS].join(', ')}} y un reason no vacío.`;
    if (mode === 'enforce') throw new QuotePriceError(msg);
    console.error(`[quote-guard] WOULD REJECT (override inválido): ${bad.sku}`);
  }

  if (overrides.length > MAX_OVERRIDES) {
    const msg =
      `Demasiados price_override (${overrides.length} de ${items.length} ítems). Los overrides son ` +
      'para promociones puntuales y servicios sin clave, no para cotizaciones completas. ' +
      'Consulta el catálogo con db_query y cotiza con los precios vigentes.';
    if (mode === 'enforce') throw new QuotePriceError(msg);
    console.error(`[quote-guard] WOULD REJECT (tope de overrides): ${overrides.length}/${items.length}`);
    await recordOverrides(folio, overrides);
    return { mode: 'dry-run', overrides, warnings: [msg] };
  }

  const toCheck = items.filter((it) => !it.price_override);
  // Se consultan TAMBIÉN las claves overrideadas. No para validarlas —el override es
  // justamente la dispensa— sino para poder guardar contra qué precio se dispensó. Sin
  // esto, una cotización 100% overrideada (el caso normal de una promo de paquete) no
  // trae claves que consultar y el registro queda sin el delta, que es lo único que un
  // humano de verdad mira al auditar.
  const keys = [...new Set(items.map((it) => String(it.sku ?? '').trim()).filter(Boolean))];

  let rowsByKey;
  try {
    rowsByKey = keys.length ? await fetchCatalogRows(keys) : new Map();
  } catch (e) {
    if (e instanceof GuardUnavailable) {
      console.error(`[quote-guard] verificación omitida — ${e.message}`);
      await recordOverrides(folio, overrides);
      return {
        mode: /EASYBITS_API_KEY/.test(e.message) ? 'skipped:no_key' : 'skipped:unreachable',
        overrides,
        warnings: [`No se pudo verificar precios contra el catálogo (${e.message}).`],
      };
    }
    throw e;
  }

  const { rejections, warnings } = checkItems(toCheck, rowsByKey);

  // El delta entre lo que se cobró y lo que dice el catálogo es lo que de veras mira
  // un humano al revisar el log.
  for (const rec of overrides) {
    const rows = rowsByKey.get(String(rec.sku ?? '').trim().toUpperCase());
    if (rows?.length) rec.catalog = describeTiers(rows[0].tiers);
  }
  await recordOverrides(folio, overrides);

  if (rejections.length) {
    const message = buildRejectionMessage(rejections);
    // Se registra ANTES de lanzar: en enforce el throw corta el flujo, y es
    // justamente el caso donde saber qué se bloqueó vale más.
    await recordRejections(folio, rejections, mode === 'enforce' ? 'enforce' : 'dry-run');
    if (mode === 'enforce') throw new QuotePriceError(message);
    for (const r of rejections) {
      console.error(
        r.type === 'unknown_sku'
          ? `[quote-guard] WOULD REJECT sku=${r.sku} reason=unknown_sku`
          : `[quote-guard] WOULD REJECT sku=${r.sku} sent=${r.sent} expected=${r.expected ?? 'n/a'} qty=${r.qty} reason=${r.type}`,
      );
    }
    return { mode: 'dry-run', overrides, warnings: [...warnings, message] };
  }

  for (const w of warnings) console.error(`[quote-guard] warning: ${w}`);
  return { mode: mode === 'enforce' ? 'enforced' : 'dry-run', overrides, warnings };
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
  // Colonia/Ciudad/CP salen del resuelto: si el agente los dejó dentro del domicilio, el
  // parseo los recupera y el PDF deja de mostrar guiones donde sí había dato.
  const d = resolveDireccion(input);
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
      <div><span class="text-gray-500">Colonia: </span><span class="text-gray-700">${dash(d.colonia)}</span></div>
      <div><span class="text-gray-500">Ciudad: </span><span class="text-gray-700">${dash(d.ciudad)}</span></div>
      ${d.cp ? `<div><span class="text-gray-500">C.P.: </span><span class="text-gray-700">${escapeHtml(d.cp)}</span></div>` : ''}
      ${d.mapsUrl ? `<div><span class="text-gray-500">Ubicación: </span><a href="${escapeHtml(d.mapsUrl)}" class="text-gray-700 underline">ver mapa</a></div>` : ''}
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

// REST API v2 de EasyBits (convención oficial de la flota — `$EASYBITS_API_KEY` +
// `$EASYBITS_BASE_URL` ya en el env del worker). create_quotation está oculto por
// default (LEGACY_DOC_TOOLS), así que usamos create_document (visible) + export PDF
// + subida pública para obtener una URL sendeable.
function apiBase() {
  return (process.env.EASYBITS_BASE_URL || process.env.EASYBITS_URL || 'https://www.easybits.cloud').replace(/\/$/, '');
}
function apiKey() {
  const k = process.env.EASYBITS_API_KEY;
  if (!k) throw new QuoteError('falta EASYBITS_API_KEY en el env');
  return k;
}

/** Crea el documento (pages → sections) vía REST. Devuelve el id. */
async function createDocumentRest(name, pages) {
  const sections = pages.map((html, i) => ({ id: `p${i + 1}`, order: i, html }));
  const res = await fetch(`${apiBase()}/api/v2/documents`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey()}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, sections }),
  });
  if (!res.ok) throw new QuoteError(`create_document ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const j = await res.json();
  const id = j.document?.id;
  if (!id) throw new QuoteError(`create_document sin id: ${JSON.stringify(j).slice(0, 200)}`);
  return id;
}

/** Exporta el PDF del documento (Playwright server-side) → Buffer. */
async function exportPdfRest(documentId) {
  const res = await fetch(`${apiBase()}/api/v2/documents/${documentId}/pdf`, {
    headers: { Authorization: `Bearer ${apiKey()}` },
  });
  if (!res.ok) throw new QuoteError(`export pdf ${res.status}: ${(await res.text()).slice(0, 200)}`);
  return Buffer.from(await res.arrayBuffer());
}

/** Sube el PDF como archivo PÚBLICO (2-step presigned) → URL sendeable. */
async function uploadPublicPdf(buf, fileName) {
  const create = await fetch(`${apiBase()}/api/v2/files`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey()}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ fileName, contentType: 'application/pdf', size: buf.length, access: 'public' }),
  });
  if (!create.ok) throw new QuoteError(`upload create ${create.status}: ${(await create.text()).slice(0, 200)}`);
  const { file, putUrl } = await create.json();
  if (!putUrl || !file?.url) throw new QuoteError(`upload sin putUrl/url: ${JSON.stringify(file).slice(0, 200)}`);
  const put = await fetch(putUrl, { method: 'PUT', headers: { 'Content-Type': 'application/pdf' }, body: buf });
  if (!put.ok) throw new QuoteError(`upload PUT ${put.status}`);
  return file.url;
}

// --- CRM (Formmy) ----------------------------------------------------------------
// El registro del pedido NO puede depender de que el agente se acuerde de llamar una tool:
// se probó con instrucción suave y con paso obligatorio en el prompt, y las dos veces cerró
// el turno sin hacerlo (las tools del MCP llegan diferidas y no las va a buscar). Acá es
// determinista: si se generó la cotización, queda en el tablero.
//
// Best-effort ABSOLUTO: cualquier fallo se loguea a stderr y la cotización sigue su curso.
// Nunca tirar una venta porque el CRM no contestó.
function formmyEnv() {
  const key = process.env.FORMMY_SECRET_KEY;
  const jid = process.env.NANOCLAW_CHAT_JID || '';
  const m = /^waba:([^:]+):(.+)$/.exec(jid); // waba:<integrationId>:<phone>
  if (!key || !m) return null;
  return {
    key,
    base: (process.env.FORMMY_API_URL || 'https://formmy.app').replace(/\/$/, ''),
    integrationId: m[1],
    phone: m[2],
  };
}

async function formmySdk(cfg, intent, params, body, method) {
  const url = new URL(`${cfg.base}/api/v2/sdk`);
  url.searchParams.set('intent', intent);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, String(v));
  const res = await fetch(url, {
    // /api/v2/sdk solo tiene handler GET y POST. Las mutaciones son POST; las
    // lecturas (conversations.get) van por GET o el router no las encuentra.
    method: method || 'POST',
    headers: { 'X-Secret-Key': cfg.key, ...(body ? { 'Content-Type': 'application/json' } : {}) },
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(15000),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data?.error || `sdk ${res.status}`);
  return data;
}
const formmyPost = (cfg, intent, params, body) => formmySdk(cfg, intent, params, body, 'POST');
const formmyGet = (cfg, intent, params) => formmySdk(cfg, intent, params, undefined, 'GET');

// Etapa en la que nace una cotización. Mientras la orden siga AHÍ, nadie la ha movido
// a pago/cierre, así que una re-cotización es la MISMA venta corrigiéndose.
const ESTATUS_INICIAL = () => process.env.QUOTE_CRM_ESTATUS || 'Cotización enviada';

async function registerOrderInFormmy({ input, totals, pdfUrl }) {
  const cfg = formmyEnv();
  if (!cfg) { console.error('[quote] CRM: sin FORMMY_SECRET_KEY o sin NANOCLAW_CHAT_JID — omitido'); return null; }
  try {
    // La conversación se resuelve por el JID del turno → siempre la del cliente que está
    // escribiendo, nunca otra.
    const r = await formmyPost(cfg, 'conversations.resolveByPhone', {
      integrationId: cfg.integrationId,
      phone: cfg.phone,
    });
    const conversationId = r?.conversationId;
    if (!conversationId) throw new Error('resolveByPhone sin conversationId');

    const productos = input.items.map((it, i) => ({
      nombre: it.nombre,
      sku: it.sku,
      cantidad: it.qty,
      precioUnitario: it.unit_price,
      subtotal: totals.amounts?.[i] ?? it.qty * it.unit_price,
      imagen: it.imagen_url || undefined,
    }));
    const envio = input.envio || {};
    const dir = resolveDireccion(input);
    console.error(`[quote] dirección: ciudad=${dir.ciudad || '-'} cp=${dir.cp || '-'} colonia=${dir.colonia || '-'} maps=${dir.mapsUrl ? 'sí' : 'no'}`);
    const envioTxt = envio.modo === 'paqueteria'
      ? `Paquetería ${envio.carrier || ''} · CP ${envio.cp || ''} · ${envio.dias || ''} · ${envio.costo ?? 0}`
      : `Ruta propia ${envio.dia || ''} · ${envio.destino || ''}`;

    // Re-cotizar NO es un pedido nuevo. Antes esto llamaba createOrder siempre, así que
    // corregir un precio dejaba una tarjeta extra por intento: caso real 2026-07-27,
    // 3 órdenes en 5 min para la misma venta (1480 → 1350 → 1270) mientras el cliente
    // corregía precios. Ahora, si la orden más reciente sigue en la etapa INICIAL —o sea
    // nadie la movió a pago/cierre— la parcheamos en vez de crear otra. Si ya avanzó de
    // columna, sí es una venta distinta y se crea nueva.
    //
    // updateOrder/createOrder actúan sobre la orden MÁS RECIENTE de la conversación (el
    // SDK no direcciona por id), que es justo la que queremos parchear.
    let modo = 'creada';
    let folioVigente = input.folio;
    let previa = null;
    try {
      const conv = await formmyGet(cfg, 'conversations.get', { conversationId });
      previa = conv?.conversation?.ordenes?.[0] ?? null;
    } catch (e) {
      // Sin lectura no podemos decidir → seguimos creando (comportamiento anterior).
      console.error(`[quote] CRM: no pude leer órdenes previas (${e instanceof Error ? e.message : String(e)}) — creo una nueva`);
    }
    const patchable = previa && (previa.estatus ?? ESTATUS_INICIAL()) === ESTATUS_INICIAL();
    const payload = {
      cliente: input.cliente?.nombre,
      tel: input.cliente?.tel || telFromJid() || undefined,
      total: totals.total,
      cotizacionUrl: pdfUrl,
      notas: `Folio ${folioVigente} · ${input.items.length} producto(s) · Total ${totals.total}\nEnvío: ${envioTxt}\nVigencia: 3 días naturales${dir.mapsUrl ? `\nUbicación: ${dir.mapsUrl}` : ''}`,
      productos,
      direccionEntrega: dir.direccion
        ? { direccion: dir.direccion, ciudad: dir.ciudad, cp: dir.cp, ...(dir.mapsUrl ? { mapsUrl: dir.mapsUrl } : {}) }
        : undefined,
    };
    if (patchable) {
      // Conservamos el folio ORIGINAL: el cliente ya lo vio en el primer PDF y el
      // operador lo usa para referirse a la venta.
      modo = 'actualizada';
      folioVigente = previa.folio || input.folio;
      payload.notas = `Folio ${folioVigente} · ${input.items.length} producto(s) · Total ${totals.total}\nEnvío: ${envioTxt}\nVigencia: 3 días naturales${dir.mapsUrl ? `\nUbicación: ${dir.mapsUrl}` : ''}`;
      await formmyPost(cfg, 'conversations.updateOrder', { conversationId }, { ...payload, folio: folioVigente });
    } else {
      await formmyPost(cfg, 'conversations.createOrder', { conversationId }, {
        ...payload,
        folio: input.folio,
        estatus: ESTATUS_INICIAL(),
      });
    }
    console.error(`[quote] CRM: orden ${folioVigente} ${modo} en ${conversationId}${patchable ? ` (re-cotización; etapa "${previa.estatus}")` : ''}`);

    // Ficha de contacto: el domicilio es REQUISITO del input, así que a estas alturas
    // siempre lo tenemos — dejarlo fuera del CRM y que el operador vea "--" no tiene
    // sentido. email/rfc/razón social solo si el cliente los dio. Best-effort aparte:
    // si esto falla, la orden ya quedó registrada.
    const contacto = {};
    if (input.cliente?.email) contacto.email = input.cliente.email;
    if (input.cliente?.rfc) contacto.rfc = input.cliente.rfc;
    if (input.cliente?.negocio) contacto.razonSocial = input.cliente.negocio;
    if (dir.direccion) {
      contacto.direccion = {
        label: 'Entrega',
        direccion: dir.direccion,
        ciudad: dir.ciudad,
        cp: dir.cp,
        mapsUrl: dir.mapsUrl,
      };
    }
    if (Object.keys(contacto).length) {
      try {
        await formmyPost(cfg, 'conversations.setContact', { conversationId }, contacto);
        console.error(`[quote] CRM: contacto actualizado (${Object.keys(contacto).join(', ')})`);
      } catch (e) {
        console.error(`[quote] CRM: setContact falló (${e instanceof Error ? e.message : String(e)})`);
      }
    }
    return conversationId;
  } catch (e) {
    console.error(`[quote] CRM: no se registró la orden (${e instanceof Error ? e.message : String(e)})`);
    return null;
  }
}

// El teléfono del cliente YA lo sabemos: es el número con el que está escribiendo. Si el
// agente no lo puso en el input (pasa seguido), lo tomamos del JID del turno en vez de
// dejar la cotización sin contacto. Normaliza 52/521 + 10 dígitos → 10 dígitos.
function telFromJid() {
  const m = /^waba:[^:]+:(\d+)$/.exec(process.env.NANOCLAW_CHAT_JID || '');
  if (!m) return null;
  const d = m[1].replace(/\D/g, '');
  return d.length >= 10 ? d.slice(-10) : null;
}

// Estados de México, para reconocer dónde termina la ciudad al desglosar un domicilio
// escrito de corrido ("…, Cuautepec de Hinojosa, Hidalgo, CP 43740").
const MX_ESTADOS = ['Aguascalientes','Baja California','Baja California Sur','Campeche','Chiapas','Chihuahua','Coahuila','Colima','Ciudad de México','CDMX','Durango','Estado de México','México','Guanajuato','Guerrero','Hidalgo','Jalisco','Michoacán','Morelos','Nayarit','Nuevo León','Oaxaca','Puebla','Querétaro','Quintana Roo','San Luis Potosí','Sinaloa','Sonora','Tabasco','Tamaulipas','Tlaxcala','Veracruz','Yucatán','Zacatecas'];

/** Desglosa un domicilio escrito de corrido. Red de seguridad: SOLO se usa para rellenar
 *  huecos, nunca para pisar lo que el agente ya mandó estructurado. */
export function parseDomicilio(s) {
  const out = {};
  const str = String(s || '').trim();
  if (!str) return out;
  // CP: se prefiere el marcado explícitamente; 5 dígitos sueltos SOLO al final, para no
  // confundir un número exterior largo con un código postal.
  const cpm = str.match(/\bC\.?\s*P\.?\s*:?\s*(\d{5})\b/i) || str.match(/\b(\d{5})\s*$/);
  if (cpm) out.cp = cpm[1];
  const parts = str.split(',').map((p) => p.trim()).filter(Boolean);
  const colRe = /^(col\.?|colonia|fracc\.?|fraccionamiento|barrio|u\.?h\.?|unidad habitacional)\s+/i;
  const col = parts.find((p) => colRe.test(p));
  if (col) out.colonia = col.replace(colRe, '').trim();
  const iEstado = parts.findIndex((p) => MX_ESTADOS.some((e) => p.toLowerCase() === e.toLowerCase()));
  // Quita el CP del segmento, venga marcado ("CP 43740") o suelto al final ("… 06600").
  const limpia = (v) => v.replace(/\bC\.?\s*P\.?\s*:?\s*\d{5}\b/i, '').replace(/\s*\b\d{5}\b\s*$/, '').replace(/,\s*$/, '').trim();
  if (iEstado > 0) {
    out.estado = parts[iEstado];
    const ciudad = limpia(parts[iEstado - 1]);
    if (ciudad && ciudad !== col) out.ciudad = ciudad;
  } else {
    // Sin estado reconocible: la ciudad es el último segmento útil que no sea la calle.
    const cand = [...parts].reverse().find((p) => p !== col && !/^C\.?\s*P\.?/i.test(p) && !/^\d{5}$/.test(p));
    if (cand && cand !== parts[0]) { const c = limpia(cand); if (c) out.ciudad = c; }
  }
  return out;
}

/** Dirección final: lo estructurado del agente MANDA, el parseo sólo rellena. El agente
 *  tiene contexto que el string no tiene (el cliente pudo corregir la ciudad), así que el
 *  parseo nunca puede empeorar un dato bueno. Mismo criterio que telFromJid(). */
export function resolveDireccion(input) {
  const c = input.cliente || {};
  const env = input.envio || {};
  const p = parseDomicilio(c.domicilio);
  const t = (v) => (typeof v === 'string' && v.trim() ? v.trim() : undefined);
  return {
    direccion: c.domicilio,
    ciudad: t(c.ciudad) || p.ciudad,
    colonia: t(c.colonia) || p.colonia,
    estado: t(c.estado) || p.estado,
    cp: t(c.cp) || t(env.cp) || p.cp,
    // La ubicación compartida por WhatsApp llega por env desde el canal (puede ser de un
    // turno anterior); un maps_url explícito del agente le gana. Si no hay ninguna de las
    // dos, se DERIVA del domicilio: un pin exacto es mejor, pero una búsqueda con la
    // dirección le sirve al repartidor mucho más que un campo vacío — y estaba vacío en el
    // 100% de las órdenes, porque casi nadie comparte ubicación.
    mapsUrl:
      t(c.maps_url) ||
      t(process.env.WABA_LAST_LOCATION_URL) ||
      mapsSearchUrl([c.domicilio, t(c.colonia) || p.colonia, t(c.ciudad) || p.ciudad, t(c.cp) || t(env.cp) || p.cp]),
  };
}

/** Búsqueda de Google Maps a partir de las partes del domicilio. */
export function mapsSearchUrl(partes) {
  const q = (partes || [])
    .map((x) => (typeof x === 'string' ? x.trim() : ''))
    .filter(Boolean)
    .join(', ');
  if (!q) return undefined;
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(q)}`;
}

export async function runQuote(input) {
  if (input?.cliente && !String(input.cliente.tel || '').trim()) {
    const tel = telFromJid();
    if (tel) { input.cliente.tel = tel; console.error(`[quote] tel del cliente tomado del chat: ${tel}`); }
  }
  validate(input);
  // Antes de calcular un solo peso: el precio que mandó el modelo se contrasta
  // contra el catálogo vivo. En dry-run solo loguea WOULD REJECT.
  const guard = await assertCatalogPrices(input.items, input.folio);
  console.error(`[quote-guard] modo=${guard.mode} overrides=${guard.overrides.length} warnings=${guard.warnings.length}`);
  await pruneBrokenImages(input.items);
  const totals = computeTotals(input);
  const paymentUrl = input.include_payment_link ? await createMpLink(totals.total, input.folio) : null;
  const pages = buildPages(input, totals, paymentUrl);
  const name = `COT-${input.folio} — ${input.cliente.nombre}`;
  const documentId = await createDocumentRest(name, pages);
  const pdf = await exportPdfRest(documentId);
  const pdfUrl = await uploadPublicPdf(pdf, `COT-${input.folio}.pdf`);
  const crmConversationId = await registerOrderInFormmy({ input, totals, pdfUrl });
  return { pdfUrl, documentId, folio: input.folio, total: totals.total, paymentUrl, pages: pages.length, crmConversationId, guardMode: guard.mode };
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
