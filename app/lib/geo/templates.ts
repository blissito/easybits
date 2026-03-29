import { escapeHtml } from "../document-helpers";

export interface Dimension {
  name: string;
  score: number;
  maxScore: number;
  details?: string;
}

export interface GeoScorecardData {
  domain: string;
  overallScore: number;
  maxScore?: number;
  dimensions: Dimension[];
  recommendations?: string[];
  date?: string;
  analyst?: string;
}

function scoreColor(score: number, max: number): string {
  const pct = score / max;
  if (pct >= 0.8) return "#22c55e";
  if (pct >= 0.6) return "#eab308";
  if (pct >= 0.4) return "#f97316";
  return "#ef4444";
}

function progressBar(score: number, max: number): string {
  const pct = Math.min(100, (score / max) * 100);
  const color = scoreColor(score, max);
  return `<div style="display:flex; align-items:center; gap:10px; width:100%;">
    <div style="flex:1; height:8px; background:#333; border-radius:4px; overflow:hidden;">
      <div style="width:${pct}%; height:100%; background:${color}; border-radius:4px;"></div>
    </div>
    <span style="font-weight:700; font-size:14px; color:${color}; min-width:50px; text-align:right;">${score}/${max}</span>
  </div>`;
}

/** Build GEO Scorecard pages (dark theme) from structured data */
export function buildGeoScorecardHTML(data: GeoScorecardData): string[] {
  const max = data.maxScore || 10;
  const color = scoreColor(data.overallScore, max);
  const date = data.date || new Date().toISOString().split("T")[0];

  // Page 1: Score overview + dimensions
  let p1 = "";

  // Header
  p1 += `<div style="display:flex; justify-content:space-between; align-items:flex-start; margin-bottom:24px;">
    <div>
      <p style="font-size:11px; text-transform:uppercase; letter-spacing:0.1em; color:#888; margin:0 0 4px 0;">GEO SCORECARD</p>
      <h1 style="font-size:26px; font-weight:800; margin:0; color:#fff;">${escapeHtml(data.domain)}</h1>
      <p style="font-size:12px; color:#666; margin:4px 0 0 0;">Generative Engine Optimization — ${date}</p>
    </div>
    <div style="text-align:center; background:#1e1e1e; border-radius:12px; padding:14px 20px; border:2px solid ${color};">
      <p style="font-size:36px; font-weight:900; margin:0; color:${color};">${data.overallScore}</p>
      <p style="font-size:11px; color:#888; margin:2px 0 0 0;">/ ${max}</p>
    </div>
  </div>`;

  // Dimensions
  p1 += `<div style="margin-bottom:20px;">
    <p style="font-weight:700; font-size:11px; text-transform:uppercase; letter-spacing:0.05em; color:#888; margin:0 0 14px 0;">DIMENSIONES</p>`;

  for (const dim of data.dimensions) {
    p1 += `<div style="margin-bottom:14px;">
      <div style="display:flex; justify-content:space-between; margin-bottom:4px;">
        <span style="font-size:13px; font-weight:600; color:#e5e5e5;">${escapeHtml(dim.name)}</span>
      </div>
      ${progressBar(dim.score, dim.maxScore)}
      ${dim.details ? `<p style="font-size:11px; color:#777; margin:4px 0 0 0;">${escapeHtml(dim.details)}</p>` : ""}
    </div>`;
  }
  p1 += `</div>`;

  // Analyst footer
  p1 += `<div style="margin-top:auto; border-top:1px solid #333; padding-top:8px; display:flex; justify-content:space-between; font-size:10px; color:#666;">
    <span>GEO Scorecard — ${escapeHtml(data.domain)}</span>
    ${data.analyst ? `<span>Analista: ${escapeHtml(data.analyst)}</span>` : ""}
  </div>`;

  const page1 = `<section class="w-[8.5in] h-[11in] relative overflow-hidden flex flex-col" style="font-family:'Inter',system-ui,sans-serif; background:#111; color:#e5e5e5; line-height:1.5;">
    <div style="height:3px; background:${color}; flex-shrink:0;"></div>
    <div style="flex:1; overflow:hidden; padding:0.5in 0.75in;">${p1}</div>
  </section>`;

  const pages = [page1];

  // Page 2: Recommendations (if any)
  if (data.recommendations?.length) {
    let p2 = "";
    p2 += `<div style="margin-bottom:24px;">
      <p style="font-weight:700; font-size:11px; text-transform:uppercase; letter-spacing:0.05em; color:#888; margin:0 0 14px 0;">RECOMENDACIONES</p>`;

    data.recommendations.forEach((rec, i) => {
      p2 += `<div style="display:flex; gap:12px; margin-bottom:14px; align-items:flex-start;">
        <span style="flex-shrink:0; width:28px; height:28px; background:#1e1e1e; border-radius:6px; display:flex; align-items:center; justify-content:center; font-weight:700; font-size:13px; color:#888; border:1px solid #333;">${i + 1}</span>
        <p style="font-size:13px; margin:4px 0 0 0; color:#ccc;">${escapeHtml(rec)}</p>
      </div>`;
    });
    p2 += `</div>`;

    p2 += `<div style="margin-top:auto; border-top:1px solid #333; padding-top:8px; display:flex; justify-content:space-between; font-size:10px; color:#666;">
      <span>GEO Scorecard — ${escapeHtml(data.domain)}</span>
      <span>Página 2</span>
    </div>`;

    pages.push(`<section class="w-[8.5in] h-[11in] relative overflow-hidden flex flex-col" style="font-family:'Inter',system-ui,sans-serif; background:#111; color:#e5e5e5; line-height:1.5;">
      <div style="height:3px; background:${color}; flex-shrink:0;"></div>
      <div style="flex:1; overflow:hidden; padding:0.5in 0.75in;">${p2}</div>
    </section>`);
  }

  return pages;
}
