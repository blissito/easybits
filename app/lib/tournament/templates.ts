import { escapeHtml } from "../document-helpers";

// ─── Types ──────────────────────────────────────────────────────────

export interface TournamentMatch {
  court: string;
  startTime: string; // "HH:mm" 24h
  endTime: string;   // "HH:mm" 24h
  category: string;  // e.g. "Primera Varonil Pro"
  phase: string;     // e.g. "Fase de grupos", "playoff", "semifinal", "final"
  teamA?: string;
  teamB?: string;
  group?: string;    // e.g. "Varonil"
  notes?: string;    // e.g. "Por definir"
  color?: string;    // override card color: "green", "blue", "yellow", "purple"
}

export interface TournamentScheduleData {
  tournamentName: string;
  dateRange?: string;       // e.g. "Del 19 de diciembre al 31 de enero de 2026"
  clubName: string;
  location: string;         // e.g. "Pachuca, Hidalgo"
  gameDate: string;         // e.g. "20 de diciembre 2025"
  matches: TournamentMatch[];
  courts?: string[];        // override court names; auto-detected from matches if omitted
  logoUrl?: string;         // URL or data URI for the logo
  logoSvg?: string;         // Raw SVG string for inline logo
  brandColor?: string;      // primary brand color
  disclaimer?: string;      // footer text
  startHour?: number;       // grid start hour (default: auto from matches)
  endHour?: number;         // grid end hour (default: auto from matches)
  watermarkSvg?: string;    // Raw SVG for background watermark
}

// ─── Constants ──────────────────────────────────────────────────────

// Colors matched from the original Smatch PDF
const PHASE_COLORS: Record<string, { bg: string; text: string; border: string }> = {
  green:    { bg: "#dcf0dc", text: "#2d6a2d", border: "#4caf50" },
  blue:     { bg: "#5b69b8", text: "#ffffff", border: "#4a58a8" },
  yellow:   { bg: "#b3a530", text: "#ffffff", border: "#9e9220" },
  purple:   { bg: "#7c4dff", text: "#ffffff", border: "#651fff" },
  default:  { bg: "#e3f2fd", text: "#1565c0", border: "#64b5f6" },
};

function getPhaseColor(phase: string, colorOverride?: string) {
  if (colorOverride && PHASE_COLORS[colorOverride]) return PHASE_COLORS[colorOverride];
  const lower = phase.toLowerCase();
  if (lower.includes("playoff") || lower.includes("final") || lower.includes("semifinal")) return PHASE_COLORS.green;
  if (lower.includes("grupo")) return PHASE_COLORS.blue;
  return PHASE_COLORS.yellow;
}

function parseTime(t: string): number {
  const [h, m] = t.split(":").map(Number);
  return h * 60 + (m || 0);
}

function formatHour(hour: number): string {
  if (hour === 0 || hour === 24) return "12 AM";
  if (hour === 12) return "12 PM";
  if (hour < 12) return `${hour} AM`;
  return `${hour - 12} PM`;
}

function formatTimeAmPm(time24: string): string {
  const [h, m] = time24.split(":").map(Number);
  const suffix = h >= 12 ? "PM" : "AM";
  const h12 = h === 0 ? 12 : h > 12 ? h - 12 : h;
  return `${h12}:${String(m || 0).padStart(2, "0")}${suffix}`;
}

// Smatch bird watermark (the swoosh paths from the logo icon)
function buildWatermarkSvg(color: string): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 75 68" fill="none">
  <path d="M46.5299 2.92929C41.3086 6.57144 38.8819 12.7278 39.7273 18.6258C39.8291 18.7511 39.9308 18.8764 40.0483 18.9939C41.2146 20.2158 42.7724 20.8032 44.7999 20.8032C47.0778 20.8032 49.4028 20.255 51.8529 19.6753C55.8452 18.7354 59.9785 17.7642 64.1273 19.2211C66.7419 20.1453 68.8633 22.0173 69.9905 24.3201C72.9887 19.0331 72.8947 12.2814 69.1921 6.96307C64.049 -0.415216 53.9039 -2.22454 46.5299 2.91363V2.92929Z" fill="${color}"/>
  <path d="M65.145 29.6463C66.3113 28.8317 67.3368 27.8918 68.2214 26.8579C68.2214 26.8344 68.2136 26.8031 68.2057 26.7796C67.6734 24.5081 65.7399 22.4795 63.2897 21.6179C59.8375 20.4038 56.2445 21.2498 52.4322 22.1427C49.9429 22.7301 47.3753 23.3332 44.7999 23.3332C43.3125 23.3332 41.9896 23.0669 40.8154 22.5421C41.2538 23.5917 41.8096 24.6178 42.4906 25.5968C47.6336 32.9751 57.7788 34.7844 65.1528 29.6463H65.145Z" fill="${color}"/>
  <path d="M40.0483 33.2886L0 64.0001C0 64.0001 36.0403 43.1576 45.387 37.1814C43.4535 36.171 41.653 34.8708 40.0483 33.2886Z" fill="${color}"/>
  <path d="M34.4121 24.1011L0.31311 49.8233L37.011 29.5682C35.8759 27.8294 35.007 25.9966 34.4121 24.1089V24.1011Z" fill="${color}"/>
  <path d="M34.099 11.6626L3.71832 34.3692L33.3866 18.1166C33.3083 15.9392 33.551 13.7696 34.099 11.6704V11.6626Z" fill="${color}"/>
</svg>`;
}

// ─── Build HTML ─────────────────────────────────────────────────────

export function buildTournamentScheduleHTML(data: TournamentScheduleData): string {
  const bc = data.brandColor || "#1a1a1a";
  const courts = data.courts || [...new Set(data.matches.map((m) => m.court))].sort();
  const courtCount = courts.length;

  // Fixed hour range — always the same grid, matches placed on top
  const startHour = data.startHour ?? 6;
  const endHour = data.endHour ?? 21; // 6 AM to 8 PM (inclusive label)
  const totalHours = endHour - startHour;

  // Portrait letter: grid ALWAYS fills available page space
  const GRID_HEIGHT = 820;
  const ROW_H = Math.floor(GRID_HEIGHT / totalHours);
  const TIME_COL_W = 60;
  const COL_W = `calc((100% - ${TIME_COL_W}px) / ${courtCount})`;

  // ─── Default Smatch logo (full wordmark + bird icon) ───
  const smatchLogoSvg = `<svg style="height:48px;width:auto" width="421" height="64" viewBox="0 0 421 64" fill="none" xmlns="http://www.w3.org/2000/svg"><g clip-path="url(#clip0_187_1352)"><path d="M99.2283 30.7507C99.2283 30.0144 99.2831 29.0588 99.6197 28.0406H114.728C114.673 28.1502 114.673 28.7142 114.673 28.8317C114.673 30.8055 116.927 31.6514 120.2 31.6514C123.863 31.6514 126.626 30.5235 126.626 28.3226C126.626 26.5759 124.654 25.8396 122.509 25.5577L117.327 24.8214C110.454 23.8658 102.782 21.61 102.782 14.4981C102.782 4.57418 114.109 0.399414 126.736 0.399414C137.39 0.399414 145.508 3.83792 145.508 10.2136C145.508 11.0047 145.398 11.9055 145.281 12.8062H129.554C129.609 12.4146 129.664 12.0151 129.664 11.6783C129.664 9.47737 127.746 8.80377 125.382 8.80377C122.227 8.80377 119.519 9.87683 119.519 12.3598C119.519 14.2239 121.1 14.5607 123.691 15.0698L129.382 16.1429C135.864 17.3804 143.191 19.6989 143.191 26.5211C143.191 36.2805 132.928 41.1837 118.391 41.1837C107.51 41.1837 99.2283 37.6903 99.2283 30.7507Z" fill="${escapeHtml(bc)}"/><path d="M205.361 40.5651H191.497L197.306 13.2685L182.253 40.5651H169.735L166.299 12.8143L160.381 40.5651H146.517L154.909 1.08105H176.781L179.654 24.4848L191.544 1.08105H213.753L205.353 40.5573L205.361 40.5651Z" fill="${escapeHtml(bc)}"/><path d="M243.679 35.3721H229.135L226.598 40.5573H209.69L234.27 1.08105H251.687L260.541 40.5573H244.196L243.687 35.3721H243.679ZM242.951 27.4768L241.37 10.441L233.025 27.4768H242.943H242.951Z" fill="${escapeHtml(bc)}"/><path d="M312.613 10.6681H296.323L289.951 40.5573H273.715L280.087 10.6681H263.742L265.77 1.08105H314.64L312.613 10.6681Z" fill="${escapeHtml(bc)}"/><path d="M314.695 26.4037C314.695 9.14855 325.122 0.344727 344.121 0.344727C353.875 0.344727 364.529 2.93731 364.529 12.3599C364.529 13.4878 364.356 14.6157 364.075 15.7436H348.121C348.176 15.4068 348.176 15.1248 348.176 14.8428C348.176 11.4043 345.749 9.82215 342.031 9.82215C334.195 9.82215 331.205 17.5451 331.205 25.503C331.205 29.5602 333.177 31.7612 337.404 31.7612C341.631 31.7612 344.677 29.897 345.749 25.8946H362.039C359.894 37.2283 350.031 41.2386 335.432 41.2386C324.105 41.2386 314.687 37.9646 314.687 26.4037H314.695Z" fill="${escapeHtml(bc)}"/><path d="M421 1.08105L412.601 40.5573H396.365L399.52 25.6675H384.185L381.03 40.5573H364.795L373.194 1.08105H389.43L386.22 16.0804H401.547L404.757 1.08105H420.992H421Z" fill="${escapeHtml(bc)}"/><path d="M46.5299 2.92929C41.3086 6.57144 38.8819 12.7278 39.7273 18.6258C39.8291 18.7511 39.9308 18.8764 40.0483 18.9939C41.2146 20.2158 42.7724 20.8032 44.7999 20.8032C47.0778 20.8032 49.4028 20.255 51.8529 19.6753C55.8452 18.7354 59.9785 17.7642 64.1273 19.2211C66.7419 20.1453 68.8633 22.0173 69.9905 24.3201C72.9887 19.0331 72.8947 12.2814 69.1921 6.96307C64.049 -0.415216 53.9039 -2.22454 46.5299 2.91363V2.92929Z" fill="${escapeHtml(bc)}"/><path d="M65.145 29.6463C66.3113 28.8317 67.3368 27.8918 68.2214 26.8579C68.2214 26.8344 68.2136 26.8031 68.2057 26.7796C67.6734 24.5081 65.7399 22.4795 63.2897 21.6179C59.8375 20.4038 56.2445 21.2498 52.4322 22.1427C49.9429 22.7301 47.3753 23.3332 44.7999 23.3332C43.3125 23.3332 41.9896 23.0669 40.8154 22.5421C41.2538 23.5917 41.8096 24.6178 42.4906 25.5968C47.6336 32.9751 57.7788 34.7844 65.1528 29.6463H65.145Z" fill="${escapeHtml(bc)}"/><path d="M40.0483 33.2886L0 64.0001C0 64.0001 36.0403 43.1576 45.387 37.1814C43.4535 36.171 41.653 34.8708 40.0483 33.2886Z" fill="${escapeHtml(bc)}"/><path d="M34.4121 24.1011L0.31311 49.8233L37.011 29.5682C35.8759 27.8294 35.007 25.9966 34.4121 24.1089V24.1011Z" fill="${escapeHtml(bc)}"/><path d="M34.099 11.6626L3.71832 34.3692L33.3866 18.1166C33.3083 15.9392 33.551 13.7696 34.099 11.6704V11.6626Z" fill="${escapeHtml(bc)}"/></g><defs><clipPath id="clip0_187_1352"><rect width="421" height="64" fill="${escapeHtml(bc)}"/></clipPath></defs></svg>`;

  // Resolve logo: explicit > default Smatch logo
  const resolvedLogoSvg = data.logoSvg || (!data.logoUrl ? smatchLogoSvg : "");

  // ─── Header ───
  let html = `<div style="display:flex; justify-content:space-between; align-items:flex-start; margin-bottom:12px;">
    <div>
      <h1 style="font-size:20px; font-weight:900; margin:0 0 2px 0; color:${escapeHtml(bc)};">${escapeHtml(data.tournamentName)}</h1>
      ${data.dateRange ? `<p style="font-size:11px; color:#666; margin:0 0 6px 0;">${escapeHtml(data.dateRange)}</p>` : ""}
      <p style="font-size:13px; font-weight:700; margin:0 0 1px 0;">${escapeHtml(data.clubName)}</p>
      <p style="font-size:11px; color:#666; margin:0;">${escapeHtml(data.location)}</p>
    </div>
    ${data.logoUrl ? `<img src="${escapeHtml(data.logoUrl)}" style="height:48px; object-fit:contain;" alt="Logo" />` : ""}
    ${resolvedLogoSvg ? resolvedLogoSvg.replace(/var\(--primary\)/g, escapeHtml(bc)) : ""}
  </div>`;

  html += `<p style="font-size:13px; font-weight:600; margin:0 0 10px 0; color:#333;">Calendario de juegos - ${escapeHtml(data.gameDate)}</p>`;

  // ─── Grid ───
  html += `<div style="border:1px solid #e0e0e0; border-radius:10px; overflow:hidden; font-size:11px; position:relative;">`;

  // ─── Watermark (behind everything) ───
  const watermarkColor = "#c8cce0"; // light blue-gray
  const watermarkSvg = data.watermarkSvg || buildWatermarkSvg(watermarkColor);
  html += `<div style="position:absolute; top:50%; left:50%; transform:translate(-50%,-50%); width:350px; height:350px; opacity:0.15; z-index:0; pointer-events:none;">${watermarkSvg}</div>`;

  // Column headers
  html += `<div style="display:flex; border-bottom:1px solid #e0e0e0; background:#fafafa; position:relative; z-index:1;">`;
  html += `<div style="width:${TIME_COL_W}px; flex-shrink:0; padding:6px 4px; text-align:center;"></div>`;
  for (const court of courts) {
    html += `<div style="width:${COL_W}; flex-shrink:0; padding:8px 4px; text-align:center; font-weight:600; color:#333; border-left:1px solid #e0e0e0;">${escapeHtml(court)}</div>`;
  }
  html += `</div>`;

  // Grid body
  html += `<div style="position:relative; height:${totalHours * ROW_H}px;">`;

  // Hour lines + labels
  for (let h = 0; h < totalHours; h++) {
    const y = h * ROW_H;
    html += `<div style="position:absolute; left:0; top:${y}px; width:${TIME_COL_W}px; height:${ROW_H}px; display:flex; align-items:flex-start; justify-content:center; padding-top:2px; font-size:10px; color:#999; z-index:1;">${formatHour(startHour + h)}</div>`;
    if (h > 0) {
      html += `<div style="position:absolute; left:${TIME_COL_W}px; right:0; top:${y}px; height:1px; background:#f0f0f0;"></div>`;
    }
  }

  // Column dividers
  for (let c = 0; c < courtCount; c++) {
    const x = `calc(${TIME_COL_W}px + ${COL_W} * ${c})`;
    html += `<div style="position:absolute; left:${x}; top:0; bottom:0; width:1px; background:#f0f0f0;"></div>`;
  }

  // ─── Match cards ───
  for (const match of data.matches) {
    const courtIdx = courts.indexOf(match.court);
    if (courtIdx === -1) continue;

    const startMin = parseTime(match.startTime) - startHour * 60;
    const endMin = parseTime(match.endTime) - startHour * 60;
    const topPx = (startMin / 60) * ROW_H;
    const heightPx = Math.max(((endMin - startMin) / 60) * ROW_H - 6, 50);

    const colors = getPhaseColor(match.phase, match.color);
    const leftCalc = `calc(${TIME_COL_W}px + ${COL_W} * ${courtIdx} + 4px)`;
    const widthCalc = `calc(${COL_W} - 8px)`;

    const title = [match.category, match.group, match.phase].filter(Boolean).join(" · ");
    const timeStr = `${formatTimeAmPm(match.startTime)} - ${formatTimeAmPm(match.endTime)}`;

    html += `<div style="position:absolute; left:${leftCalc}; width:${widthCalc}; top:${topPx}px; height:${heightPx}px; background:${colors.bg}; border-left:3px solid ${colors.border}; border-radius:8px; padding:5px 7px; overflow:hidden; box-sizing:border-box; z-index:2;">`;
    html += `<p style="font-weight:700; font-size:8px; margin:0 0 1px 0; color:${colors.text}; display:-webkit-box; -webkit-line-clamp:2; -webkit-box-orient:vertical; overflow:hidden; line-height:1.25;">${escapeHtml(title)}</p>`;
    html += `<p style="font-size:7.5px; color:${colors.text}; opacity:0.85; margin:0 0 1px 0;">⏱ ${escapeHtml(timeStr)}</p>`;
    if (match.teamA) {
      html += `<p style="font-size:7.5px; color:${colors.text}; opacity:0.85; margin:0;">🏸 ${escapeHtml(match.teamA)}${match.teamB ? ` y ${escapeHtml(match.teamB)}` : ""}</p>`;
    }
    if (match.notes) {
      html += `<p style="font-size:7.5px; color:${colors.text}; opacity:0.7; margin:1px 0 0 0;">⚡ ${escapeHtml(match.notes)}</p>`;
    }
    html += `</div>`;
  }

  html += `</div>`; // grid body
  html += `</div>`; // grid container

  // ─── Disclaimer footer ───
  if (data.disclaimer) {
    html += `<p style="font-size:8px; color:#999; margin-top:10px; line-height:1.4;">${escapeHtml(data.disclaimer)}</p>`;
  }

  // Portrait letter page (8.5in × 11in)
  return `<section class="w-[8.5in] h-[11in] relative overflow-hidden flex flex-col" style="font-family:'Inter',system-ui,sans-serif; color:#1a1a1a; line-height:1.5; -webkit-print-color-adjust:exact; print-color-adjust:exact;">
  <div style="height:3px; background:${escapeHtml(bc)}; flex-shrink:0;"></div>
  <div style="flex:1; overflow:hidden; padding:0.4in 0.5in;">
    ${html}
  </div>
</section>`;
}
