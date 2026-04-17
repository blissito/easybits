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

/** Wrap content in a standard letter-page section.
 * opts.brandColor is accepted for BC but ignored — colors come from the user's
 * brand kit via Tailwind semantic classes (bg-surface, text-on-surface,
 * bg-primary) resolved against the doc's customColors metadata. */
export function letterPage(content: string, _opts?: { brandColor?: string }): string {
  return `<section class="w-[8.5in] h-[11in] relative overflow-hidden flex flex-col bg-surface text-on-surface" style="font-family:'Inter',system-ui,sans-serif; line-height:1.5;">
  <div class="h-[3px] bg-primary shrink-0"></div>
  <div class="flex-1 overflow-hidden" style="padding:0.5in 0.75in;">
    ${content}
  </div>
</section>`;
}
