import { fmtDate, escapeHtml, letterPage } from "../document-helpers";

export interface SubjectInfo {
  name: string;
  rfc?: string;
  curp?: string;
  dob?: string;
  nationality?: string;
}

export interface ListResult {
  name: string;
  searched: boolean;
  match: boolean;
  details?: string;
}

export interface ScreeningReportData {
  subject: SubjectInfo;
  searchDate: string;
  lists: ListResult[];
  riskLevel: "none" | "low" | "medium" | "high" | "critical";
  findings?: string[];
  analyst?: string;
  folio?: string;
  notes?: string;
  companyName?: string;
  companyLogo?: string;
}

const RISK_COLORS: Record<string, { bg: string; text: string; label: string }> = {
  none: { bg: "#dcfce7", text: "#166534", label: "SIN RIESGO" },
  low: { bg: "#dbeafe", text: "#1e40af", label: "RIESGO BAJO" },
  medium: { bg: "#fef3c7", text: "#92400e", label: "RIESGO MEDIO" },
  high: { bg: "#fee2e2", text: "#991b1b", label: "RIESGO ALTO" },
  critical: { bg: "#fecaca", text: "#7f1d1d", label: "ALERTA CRÍTICA" },
};

function subjectCardHtml(data: ScreeningReportData): string {
  const s = data.subject;
  const fields = [
    s.rfc && `<span style="font-size:12px; color:#555;">RFC: <strong>${escapeHtml(s.rfc)}</strong></span>`,
    s.curp && `<span style="font-size:12px; color:#555;">CURP: <strong>${escapeHtml(s.curp)}</strong></span>`,
    s.dob && `<span style="font-size:12px; color:#555;">Fecha Nac.: <strong>${fmtDate(s.dob)}</strong></span>`,
    s.nationality && `<span style="font-size:12px; color:#555;">Nacionalidad: <strong>${escapeHtml(s.nationality)}</strong></span>`,
  ].filter(Boolean);

  return `<div style="background:#f8f8f8; border-radius:8px; padding:16px; margin-bottom:20px;">
    <p style="font-weight:700; font-size:10px; text-transform:uppercase; letter-spacing:0.05em; color:#999; margin:0 0 8px 0;">SUJETO DE BÚSQUEDA</p>
    <p style="font-weight:700; font-size:18px; margin:0 0 8px 0;">${escapeHtml(s.name)}</p>
    ${fields.length ? `<div style="display:flex; gap:20px; flex-wrap:wrap;">${fields.join("")}</div>` : ""}
  </div>`;
}

function listsTableHtml(lists: ListResult[]): string {
  const rows = lists.map((l) => {
    const icon = !l.searched ? "—" : l.match ? "⚠️" : "✅";
    const status = !l.searched ? '<span style="color:#999;">No consultada</span>' : l.match ? '<span style="color:#dc2626; font-weight:600;">COINCIDENCIA</span>' : '<span style="color:#16a34a; font-weight:600;">Sin coincidencia</span>';
    return `<tr>
      <td style="padding:8px 12px; border-bottom:1px solid #eee; font-size:13px; text-align:center;">${icon}</td>
      <td style="padding:8px 12px; border-bottom:1px solid #eee; font-size:13px; font-weight:500;">${escapeHtml(l.name)}</td>
      <td style="padding:8px 12px; border-bottom:1px solid #eee; font-size:12px;">${status}</td>
      <td style="padding:8px 12px; border-bottom:1px solid #eee; font-size:11px; color:#666;">${l.details ? escapeHtml(l.details) : ""}</td>
    </tr>`;
  }).join("");

  return `<table style="width:100%; border-collapse:collapse; margin-bottom:20px;">
    <thead>
      <tr style="background:#1a1a1a; color:white;">
        <th style="padding:8px 12px; text-align:center; font-size:10px; text-transform:uppercase; width:50px;"></th>
        <th style="padding:8px 12px; text-align:left; font-size:10px; text-transform:uppercase; letter-spacing:0.05em;">Lista</th>
        <th style="padding:8px 12px; text-align:left; font-size:10px; text-transform:uppercase; letter-spacing:0.05em;">Resultado</th>
        <th style="padding:8px 12px; text-align:left; font-size:10px; text-transform:uppercase; letter-spacing:0.05em;">Detalle</th>
      </tr>
    </thead>
    <tbody>${rows}</tbody>
  </table>`;
}

function riskBadgeHtml(level: string): string {
  const r = RISK_COLORS[level] || RISK_COLORS.none;
  return `<div style="display:inline-block; background:${r.bg}; color:${r.text}; padding:6px 16px; border-radius:6px; font-weight:800; font-size:14px; letter-spacing:0.05em;">
    ${r.label}
  </div>`;
}

/** Build a single-page screening report from structured data */
export function buildScreeningReportHTML(data: ScreeningReportData): string {
  const date = fmtDate(data.searchDate);
  const company = data.companyName || "BlackPLD";

  let content = "";

  // Header
  content += `<div style="display:flex; justify-content:space-between; align-items:flex-start; margin-bottom:20px;">
    <div>
      <h1 style="font-size:20px; font-weight:800; margin:0 0 2px 0;">${escapeHtml(company)}</h1>
      <p style="font-size:12px; color:#888; margin:0;">Reporte de Screening en Listas</p>
    </div>
    <div style="text-align:right;">
      ${data.folio ? `<p style="font-size:14px; font-weight:700; margin:0;">${escapeHtml(data.folio)}</p>` : ""}
      <p style="font-size:12px; color:#555; margin:4px 0 0 0;">${date}</p>
    </div>
  </div>`;

  // Subject
  content += subjectCardHtml(data);

  // Risk badge
  content += `<div style="margin-bottom:20px;">${riskBadgeHtml(data.riskLevel)}</div>`;

  // Lists table
  content += listsTableHtml(data.lists);

  // Findings
  if (data.findings?.length) {
    const items = data.findings.map((f) => `<li style="margin-bottom:4px;">${escapeHtml(f)}</li>`).join("");
    content += `<div style="margin-bottom:20px;">
      <p style="font-weight:700; font-size:12px; text-transform:uppercase; letter-spacing:0.05em; color:#555; margin:0 0 8px 0;">HALLAZGOS</p>
      <ul style="margin:0; padding-left:18px; font-size:12px; color:#333;">${items}</ul>
    </div>`;
  }

  // Notes
  if (data.notes) {
    content += `<div style="background:#f8f8f8; border-radius:8px; padding:12px 14px; margin-bottom:20px; font-size:12px; color:#555;">
      <p style="font-weight:700; font-size:10px; text-transform:uppercase; color:#999; margin:0 0 6px 0;">NOTAS</p>
      ${escapeHtml(data.notes)}
    </div>`;
  }

  // Footer with analyst
  content += `<div style="margin-top:auto; border-top:1px solid #ddd; padding-top:10px; display:flex; justify-content:space-between; font-size:10px; color:#999;">
    <span>${escapeHtml(company)} — Reporte de Screening</span>
    ${data.analyst ? `<span>Analista: ${escapeHtml(data.analyst)}</span>` : ""}
  </div>`;

  return letterPage(content);
}
