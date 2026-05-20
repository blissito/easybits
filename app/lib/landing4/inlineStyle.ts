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
