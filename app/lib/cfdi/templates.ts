import type { CFDIData } from "./parseCFDI";

function fmt(n: number): string {
  return n.toLocaleString("es-MX", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function fmtDate(dateStr: string): string {
  if (!dateStr) return "";
  try {
    const d = new Date(dateStr);
    return d.toLocaleDateString("es-MX", { year: "numeric", month: "long", day: "numeric" });
  } catch {
    return dateStr;
  }
}

function escapeHtml(str: string): string {
  return str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function truncateSello(sello: string, chars = 40): string {
  if (!sello || sello.length <= chars * 2) return escapeHtml(sello || "");
  return escapeHtml(sello.slice(0, chars)) + "..." + escapeHtml(sello.slice(-chars));
}

function timbreSection(data: CFDIData): string {
  if (!data.timbre) return "";
  return `
    <div style="margin-top:24px; border-top:2px solid var(--color-primary, #1a1a1a); padding-top:16px;">
      <p style="font-weight:700; font-size:13px; margin-bottom:8px; color:var(--color-primary, #1a1a1a);">TIMBRE FISCAL DIGITAL</p>
      <table style="width:100%; font-size:11px; line-height:1.5;">
        <tr><td style="width:160px; font-weight:600; color:#555;">UUID</td><td>${escapeHtml(data.timbre.uuid)}</td></tr>
        <tr><td style="font-weight:600; color:#555;">Fecha timbrado</td><td>${fmtDate(data.timbre.fechaTimbrado)}</td></tr>
        <tr><td style="font-weight:600; color:#555;">No. certificado SAT</td><td>${escapeHtml(data.timbre.noCertificadoSAT)}</td></tr>
        <tr><td style="font-weight:600; color:#555;">Sello CFDI</td><td style="word-break:break-all; font-family:monospace; font-size:9px;">${truncateSello(data.timbre.selloCFD)}</td></tr>
        <tr><td style="font-weight:600; color:#555;">Sello SAT</td><td style="word-break:break-all; font-family:monospace; font-size:9px;">${truncateSello(data.timbre.selloSAT)}</td></tr>
      </table>
      ${data.qrUrl ? `<p style="margin-top:8px; font-size:10px; color:#888;">Verificar: <a href="${escapeHtml(data.qrUrl)}" style="color:var(--color-accent, #2563eb);">${escapeHtml(data.qrUrl.slice(0, 80))}...</a></p>` : ""}
    </div>`;
}

function headerSection(data: CFDIData, title: string): string {
  return `
    <div style="display:flex; justify-content:space-between; align-items:flex-start; margin-bottom:24px;">
      <div>
        <h1 style="font-size:24px; font-weight:800; color:var(--color-primary, #1a1a1a); margin:0 0 4px 0;">${escapeHtml(title)}</h1>
        <p style="font-size:12px; color:#888; margin:0;">CFDI ${data.version} — ${escapeHtml(data.tipoDesc)}</p>
      </div>
      <div style="text-align:right; font-size:12px;">
        ${data.serie || data.folio ? `<p style="font-weight:700; font-size:16px; color:var(--color-primary, #1a1a1a); margin:0;">${escapeHtml([data.serie, data.folio].filter(Boolean).join(" "))}</p>` : ""}
        <p style="color:#555; margin:4px 0 0 0;">${fmtDate(data.fecha)}</p>
      </div>
    </div>`;
}

function partiesSection(data: CFDIData): string {
  return `
    <div style="display:grid; grid-template-columns:1fr 1fr; gap:24px; margin-bottom:24px;">
      <div style="background:var(--color-surface, #f8f8f8); border-radius:8px; padding:16px;">
        <p style="font-weight:700; font-size:11px; text-transform:uppercase; color:var(--color-primary, #1a1a1a); margin:0 0 8px 0; letter-spacing:0.05em;">Emisor</p>
        <p style="font-weight:600; font-size:14px; margin:0 0 4px 0;">${escapeHtml(data.emisor.nombre)}</p>
        <p style="font-size:12px; color:#555; margin:0;">RFC: ${escapeHtml(data.emisor.rfc)}</p>
        ${data.emisor.regimenFiscalDesc ? `<p style="font-size:11px; color:#777; margin:4px 0 0 0;">Régimen: ${escapeHtml(data.emisor.regimenFiscalDesc)}</p>` : ""}
      </div>
      <div style="background:var(--color-surface, #f8f8f8); border-radius:8px; padding:16px;">
        <p style="font-weight:700; font-size:11px; text-transform:uppercase; color:var(--color-primary, #1a1a1a); margin:0 0 8px 0; letter-spacing:0.05em;">Receptor</p>
        <p style="font-weight:600; font-size:14px; margin:0 0 4px 0;">${escapeHtml(data.receptor.nombre)}</p>
        <p style="font-size:12px; color:#555; margin:0;">RFC: ${escapeHtml(data.receptor.rfc)}</p>
        ${data.receptor.usoCFDIDesc ? `<p style="font-size:11px; color:#777; margin:4px 0 0 0;">Uso CFDI: ${escapeHtml(data.receptor.usoCFDIDesc)}</p>` : ""}
        ${data.receptor.domicilioFiscal ? `<p style="font-size:11px; color:#777; margin:2px 0 0 0;">C.P.: ${escapeHtml(data.receptor.domicilioFiscal)}</p>` : ""}
      </div>
    </div>`;
}

// --- Tipo I: Factura de Ingreso ---
export function buildFacturaHTML(data: CFDIData): string {
  const conceptosRows = data.conceptos.map((c) => `
    <tr>
      <td style="padding:8px 12px; border-bottom:1px solid #eee; font-size:12px;">${escapeHtml(c.descripcion)}</td>
      <td style="padding:8px 12px; border-bottom:1px solid #eee; font-size:12px; text-align:center;">${c.cantidad}</td>
      <td style="padding:8px 12px; border-bottom:1px solid #eee; font-size:12px; text-align:center;">${escapeHtml(c.claveUnidad)}${c.unidad ? ` (${escapeHtml(c.unidad)})` : ""}</td>
      <td style="padding:8px 12px; border-bottom:1px solid #eee; font-size:12px; text-align:right;">$${fmt(c.valorUnitario)}</td>
      <td style="padding:8px 12px; border-bottom:1px solid #eee; font-size:12px; text-align:right;">$${fmt(c.importe)}</td>
    </tr>`).join("");

  const totalsRows: string[] = [];
  totalsRows.push(`<tr><td style="text-align:right; padding:4px 12px; font-size:12px;">Subtotal</td><td style="text-align:right; padding:4px 12px; font-size:12px; font-weight:600;">$${fmt(data.subTotal)}</td></tr>`);
  if (data.descuento) {
    totalsRows.push(`<tr><td style="text-align:right; padding:4px 12px; font-size:12px;">Descuento</td><td style="text-align:right; padding:4px 12px; font-size:12px;">-$${fmt(data.descuento)}</td></tr>`);
  }
  if (data.impuestos?.traslados) {
    for (const t of data.impuestos.traslados) {
      totalsRows.push(`<tr><td style="text-align:right; padding:4px 12px; font-size:12px;">${escapeHtml(t.impuestoDesc)} (${(t.tasaOCuota * 100).toFixed(0)}%)</td><td style="text-align:right; padding:4px 12px; font-size:12px;">$${fmt(t.importe)}</td></tr>`);
    }
  }
  if (data.impuestos?.retenciones) {
    for (const r of data.impuestos.retenciones) {
      totalsRows.push(`<tr><td style="text-align:right; padding:4px 12px; font-size:12px;">${escapeHtml(r.impuestoDesc)} Ret.</td><td style="text-align:right; padding:4px 12px; font-size:12px;">-$${fmt(r.importe)}</td></tr>`);
    }
  }
  totalsRows.push(`<tr><td style="text-align:right; padding:8px 12px; font-size:16px; font-weight:800; border-top:2px solid var(--color-primary, #1a1a1a);">Total</td><td style="text-align:right; padding:8px 12px; font-size:16px; font-weight:800; border-top:2px solid var(--color-primary, #1a1a1a);">$${fmt(data.total)} ${escapeHtml(data.moneda)}</td></tr>`);

  return `<section style="max-width:8.5in; margin:0 auto; padding:40px; font-family:'Inter',system-ui,sans-serif; color:#1a1a1a; line-height:1.5;">
    ${headerSection(data, "FACTURA")}
    ${partiesSection(data)}

    ${data.formaPagoDesc || data.metodoPagoDesc ? `
    <div style="display:flex; gap:24px; margin-bottom:20px; font-size:12px;">
      ${data.formaPagoDesc ? `<div><span style="font-weight:600; color:#555;">Forma de pago:</span> ${escapeHtml(data.formaPagoDesc)}</div>` : ""}
      ${data.metodoPagoDesc ? `<div><span style="font-weight:600; color:#555;">Método de pago:</span> ${escapeHtml(data.metodoPagoDesc)}</div>` : ""}
      ${data.moneda !== "MXN" ? `<div><span style="font-weight:600; color:#555;">Moneda:</span> ${escapeHtml(data.monedaDesc)}</div>` : ""}
    </div>` : ""}

    <table style="width:100%; border-collapse:collapse; margin-bottom:24px;">
      <thead>
        <tr style="background:var(--color-primary, #1a1a1a); color:white;">
          <th style="padding:10px 12px; text-align:left; font-size:11px; text-transform:uppercase; letter-spacing:0.05em;">Descripción</th>
          <th style="padding:10px 12px; text-align:center; font-size:11px; text-transform:uppercase; letter-spacing:0.05em;">Cant.</th>
          <th style="padding:10px 12px; text-align:center; font-size:11px; text-transform:uppercase; letter-spacing:0.05em;">Unidad</th>
          <th style="padding:10px 12px; text-align:right; font-size:11px; text-transform:uppercase; letter-spacing:0.05em;">P. Unit.</th>
          <th style="padding:10px 12px; text-align:right; font-size:11px; text-transform:uppercase; letter-spacing:0.05em;">Importe</th>
        </tr>
      </thead>
      <tbody>${conceptosRows}</tbody>
    </table>

    <div style="display:flex; justify-content:flex-end;">
      <table style="min-width:280px;">${totalsRows.join("")}</table>
    </div>

    ${timbreSection(data)}
  </section>`;
}

// --- Tipo P: Complemento de Pago ---
export function buildReciboHTML(data: CFDIData): string {
  const pagosHtml = data.pagos.map((p, i) => {
    const docsRows = p.docRelacionados.map((d) => `
      <tr>
        <td style="padding:6px 10px; border-bottom:1px solid #eee; font-size:11px; font-family:monospace;">${escapeHtml(d.idDocumento.slice(0, 8))}...</td>
        <td style="padding:6px 10px; border-bottom:1px solid #eee; font-size:11px;">${[d.serie, d.folio].filter(Boolean).join(" ") || "—"}</td>
        <td style="padding:6px 10px; border-bottom:1px solid #eee; font-size:11px; text-align:right;">${d.impSaldoAnt != null ? `$${fmt(d.impSaldoAnt)}` : "—"}</td>
        <td style="padding:6px 10px; border-bottom:1px solid #eee; font-size:11px; text-align:right; font-weight:600;">${d.impPagado != null ? `$${fmt(d.impPagado)}` : "—"}</td>
        <td style="padding:6px 10px; border-bottom:1px solid #eee; font-size:11px; text-align:right;">${d.impSaldoInsoluto != null ? `$${fmt(d.impSaldoInsoluto)}` : "—"}</td>
      </tr>`).join("");

    // Sum taxes from doc relacionados
    const taxRows: string[] = [];
    for (const d of p.docRelacionados) {
      if (d.impuestos?.traslados) {
        for (const t of d.impuestos.traslados) {
          if (t.importe > 0) {
            taxRows.push(`<tr><td style="padding:4px 10px; font-size:11px;">${escapeHtml(t.impuestoDesc)} (${(t.tasaOCuota * 100).toFixed(0)}%)</td><td style="padding:4px 10px; font-size:11px; text-align:right;">Base: $${fmt(t.base)}</td><td style="padding:4px 10px; font-size:11px; text-align:right;">$${fmt(t.importe)}</td></tr>`);
          }
        }
      }
    }

    return `
    <div style="margin-bottom:20px; ${i > 0 ? "border-top:1px solid #ddd; padding-top:20px;" : ""}">
      <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:12px;">
        <div>
          <p style="font-weight:700; font-size:20px; margin:0; color:var(--color-primary, #1a1a1a);">$${fmt(p.monto)} <span style="font-size:12px; font-weight:400; color:#888;">${escapeHtml(p.moneda)}</span></p>
          <p style="font-size:12px; color:#555; margin:4px 0 0 0;">${fmtDate(p.fechaPago)}</p>
        </div>
        <div style="text-align:right; font-size:12px;">
          <p style="margin:0;"><span style="font-weight:600; color:#555;">Forma:</span> ${escapeHtml(p.formaPagoDesc || p.formaPago)}</p>
          ${p.numOperacion ? `<p style="margin:2px 0 0 0;"><span style="font-weight:600; color:#555;">Operación:</span> ${escapeHtml(p.numOperacion)}</p>` : ""}
          ${p.rfcBeneficiario ? `<p style="margin:2px 0 0 0;"><span style="font-weight:600; color:#555;">Banco:</span> ${escapeHtml(p.rfcBeneficiario)}</p>` : ""}
        </div>
      </div>

      ${p.docRelacionados.length > 0 ? `
      <table style="width:100%; border-collapse:collapse; margin-bottom:12px;">
        <thead>
          <tr style="background:var(--color-surface, #f5f5f5);">
            <th style="padding:8px 10px; text-align:left; font-size:10px; text-transform:uppercase; letter-spacing:0.05em;">Doc. Relacionado</th>
            <th style="padding:8px 10px; text-align:left; font-size:10px; text-transform:uppercase; letter-spacing:0.05em;">Serie/Folio</th>
            <th style="padding:8px 10px; text-align:right; font-size:10px; text-transform:uppercase; letter-spacing:0.05em;">Saldo Ant.</th>
            <th style="padding:8px 10px; text-align:right; font-size:10px; text-transform:uppercase; letter-spacing:0.05em;">Pagado</th>
            <th style="padding:8px 10px; text-align:right; font-size:10px; text-transform:uppercase; letter-spacing:0.05em;">Saldo Ins.</th>
          </tr>
        </thead>
        <tbody>${docsRows}</tbody>
      </table>` : ""}

      ${taxRows.length > 0 ? `
      <div style="background:var(--color-surface, #f8f8f8); border-radius:6px; padding:10px; margin-bottom:8px;">
        <p style="font-weight:600; font-size:11px; margin:0 0 6px 0; color:#555;">Impuestos</p>
        <table style="width:100%; border-collapse:collapse;">${taxRows.join("")}</table>
      </div>` : ""}
    </div>`;
  }).join("");

  return `<section style="max-width:8.5in; margin:0 auto; padding:40px; font-family:'Inter',system-ui,sans-serif; color:#1a1a1a; line-height:1.5;">
    ${headerSection(data, "RECIBO DE PAGO")}
    ${partiesSection(data)}
    ${pagosHtml}
    ${timbreSection(data)}
  </section>`;
}

// --- Tipo E: Nota de Crédito ---
export function buildNotaCreditoHTML(data: CFDIData): string {
  // Nota de crédito is structurally similar to factura but with different header
  const inner = buildFacturaHTML(data);
  return inner.replace("FACTURA", "NOTA DE CRÉDITO");
}

// --- Entry point ---
export function buildCFDIDocument(data: CFDIData): string {
  switch (data.tipo) {
    case "P":
      return buildReciboHTML(data);
    case "E":
      return buildNotaCreditoHTML(data);
    case "I":
    default:
      return buildFacturaHTML(data);
  }
}
