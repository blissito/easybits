/**
 * Normalize agent-supplied document page HTML into a safe, self-contained `<section>`.
 *
 * Agents sometimes emit each page as a full standalone document
 * (`<!DOCTYPE html>…<body>…`). Dropped into the canvas/share/PDF as-is, the per-page
 * `<style>` leaks into the global iframe scope and collides across pages, and a
 * `body{height:…;overflow:hidden}` (or a `position:fixed` footer) clips content or
 * escapes the page box. This converts such input into a scoped fragment:
 *
 *   <section><style>…scoped to #pg-xxxx…</style><div id="pg-xxxx">…body…</div></section>
 *
 * Rules: every selector is prefixed with the page id (so styles never leak); the
 * `html`/`body` rule becomes the page root with `position:relative; width:100%;
 * min-height:<page>` (no fixed height / overflow trap); and `position:fixed` is
 * downgraded to `absolute` so footers stay inside their own page.
 *
 * Idempotent: input that is already a fragment (no `<html>`/`<body>`/`<!doctype>`)
 * is returned unchanged.
 */
export function normalizeDocumentPageHtml(
  html: string,
  opts: { minHeight?: string } = {}
): string {
  if (!html) return html;
  if (!/<!doctype|<html[\s>]|<body[\s>]/i.test(html)) return html; // already a fragment

  const minHeight = opts.minHeight || "11in";
  const scope = `pg-${Math.random().toString(36).slice(2, 8)}`;

  const css = (html.match(/<style[^>]*>([\s\S]*?)<\/style>/i) || [, ""])[1];
  const bodyInner = (html.match(/<body[^>]*>([\s\S]*?)<\/body>/i) || [, html])[1].trim();

  const rules: string[] = [];
  const re = /([^{}]+)\{([^{}]*)\}/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(css)) !== null) {
    const selectorGroup = m[1].trim();
    const decls = m[2].trim().replace(/position\s*:\s*fixed/gi, "position:absolute");
    if (selectorGroup.startsWith("@")) {
      rules.push(`${selectorGroup} { ${decls} }`); // leave @media/@keyframes untouched
      continue;
    }
    if (/^(html|body)$/i.test(selectorGroup)) {
      const kept = decls
        .split(";")
        .map((d) => d.trim())
        .filter(Boolean)
        .filter((d) => !/^(width|height|min-height|max-height|overflow|overflow-x|overflow-y|position)\s*:/i.test(d));
      kept.push("position:relative", "width:100%", `min-height:${minHeight}`);
      rules.push(`#${scope} { ${kept.join("; ")}; }`);
      continue;
    }
    const scoped = selectorGroup
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean)
      .map((s) => (s === "*" ? `#${scope}, #${scope} *` : `#${scope} ${s}`))
      .join(", ");
    rules.push(`${scoped} { ${decls} }`);
  }

  return `<section>\n<style>\n${rules.join("\n")}\n</style>\n<div id="${scope}">\n${bodyInner}\n</div>\n</section>`;
}
