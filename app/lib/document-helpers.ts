/** Shared helpers for structured document templates (quotations, screening reports, scorecards) */

export function fmt(n: number): string {
  return n.toLocaleString("es-MX", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export function fmtDate(dateStr: string): string {
  if (!dateStr) return "";
  try {
    const d = new Date(dateStr);
    return d.toLocaleDateString("es-MX", { year: "numeric", month: "long", day: "numeric" });
  } catch {
    return dateStr;
  }
}

export function escapeHtml(str: string): string {
  return str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

/** Wrap content in a standard letter-page section */
export function letterPage(content: string, opts?: { brandColor?: string }): string {
  const color = opts?.brandColor || "#1a1a1a";
  return `<section class="w-[8.5in] h-[11in] relative overflow-hidden flex flex-col" style="font-family:'Inter',system-ui,sans-serif; color:#1a1a1a; line-height:1.5;">
  <div style="height:3px; background:${escapeHtml(color)}; flex-shrink:0;"></div>
  <div style="flex:1; overflow:hidden; padding:0.5in 0.75in;">
    ${content}
  </div>
</section>`;
}
