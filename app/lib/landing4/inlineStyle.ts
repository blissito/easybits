/**
 * Detects elements that break the toolbar's class-based editing.
 *
 * The document design guideline (get_docs("document-design")) is: ONLY Tailwind
 * classes, NEVER inline styles — the only allowed exception is `font-family`.
 * When an element carries any other inline declaration it wins by specificity and
 * the toolbar's utility edits (color/size/spacing) silently do nothing. We don't
 * transform such HTML (lossy/fragile); we just flag it so the user understands why.
 */
export function hasInlineStyleConflict(style?: string | null): boolean {
  if (!style) return false;
  return style.split(";").some((decl) => {
    const prop = decl.split(":")[0]?.trim().toLowerCase();
    return !!prop && prop !== "font-family";
  });
}

/** Strip a set of CSS properties from an inline style string, keeping the rest. */
export function stripInlineProps(style: string, propsToStrip: string[]): string {
  if (!style) return "";
  const lower = propsToStrip.map((p) => p.toLowerCase());
  return style
    .split(";")
    .map((s) => s.trim())
    .filter((s) => s.length > 0)
    .filter((decl) => {
      const prop = decl.split(":")[0]?.trim().toLowerCase();
      return prop ? !lower.includes(prop) : true;
    })
    .join("; ");
}
