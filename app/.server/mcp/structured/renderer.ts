/**
 * Renders a JSON-DSL template + data into a PDF Buffer using @react-pdf/renderer.
 *
 * The DSL is pure data (see ./types.ts) — no eval, no sandbox. Strings support
 * {{path}} interpolation and nodes can repeat with `each` or skip with `if`/`unless`.
 */
import React from "react";
import { Document, Page, View, Text, Image, Link, Font, renderToBuffer } from "@react-pdf/renderer";

// Register Twemoji as emoji source — Helvetica has no emoji glyphs and falls
// back to .notdef boxes that overlap the next character. Registering once at
// module load makes every {{interpolated}} emoji render as a PNG image.
Font.registerEmojiSource({
  format: "png",
  url: "https://cdn.jsdelivr.net/gh/jdecked/twemoji@15.0.3/assets/72x72/",
});
import type { DslNode, DslPage, DslTree } from "./types";

/** Walk a dotted path (supports "." for current item). Returns undefined if missing. */
function resolvePath(path: string, ctx: any, item: any): any {
  if (!path) return undefined;
  const trimmed = path.trim();
  if (trimmed === "." || trimmed === "item") return item;
  const parts = trimmed.startsWith("item.") ? trimmed.slice(5).split(".") : trimmed.startsWith(".") ? trimmed.slice(1).split(".") : trimmed.split(".");
  let target = trimmed.startsWith("item") || trimmed.startsWith(".") ? item : ctx;
  for (const p of parts) {
    if (target == null) return undefined;
    target = target[p];
  }
  return target;
}

/** Replace {{path}} occurrences in a string with resolved data. */
function interpolate(s: string, ctx: any, item: any): string {
  return s.replace(/\{\{\s*([^}]+?)\s*\}\}/g, (_m, path) => {
    const v = resolvePath(path, ctx, item);
    return v == null ? "" : String(v);
  });
}

function shouldRender(node: DslNode, ctx: any, item: any): boolean {
  if ("if" in node && node.if && !resolvePath(node.if, ctx, item)) return false;
  if ("unless" in node && node.unless && resolvePath(node.unless, ctx, item)) return false;
  return true;
}

/** Expand a single node — may produce 0, 1, or N elements (if `each`). */
function renderNode(node: DslNode, ctx: any, item: any, key: string): React.ReactNode {
  if (!shouldRender(node, ctx, item)) return null;

  // `each` repeats this node per array element.
  if ("each" in node && node.each) {
    const list = resolvePath(node.each, ctx, item);
    if (!Array.isArray(list)) return null;
    // Clone node without `each` to avoid infinite recursion.
    const { each, ...rest } = node as any;
    return list.map((row, i) => renderNode(rest as DslNode, ctx, row, `${key}-${i}`));
  }

  switch (node.type) {
    case "Text":
      return React.createElement(Text, { key, style: node.style as any }, interpolate(node.content, ctx, item));
    case "View":
      return React.createElement(
        View,
        { key, style: node.style as any },
        (node.children ?? []).map((child, i) => renderNode(child, ctx, item, `${key}-${i}`))
      );
    case "Image":
      // Image.src is static in DSL; interpolate to allow {{logo}} etc.
      return React.createElement(Image, { key, src: interpolate(node.src, ctx, item), style: node.style as any });
    case "Link":
      return React.createElement(
        Link,
        { key, src: interpolate(node.src, ctx, item), style: node.style as any },
        interpolate(node.content, ctx, item)
      );
  }
}

function renderPage(page: DslPage, ctx: any, defaultStyle: any, key: string): React.ReactElement {
  return React.createElement(
    Page,
    {
      key,
      size: page.size ?? "LETTER",
      orientation: page.orientation ?? "portrait",
      style: { ...(defaultStyle ?? {}), ...(page.style ?? {}) } as any,
    },
    page.children.map((child, i) => renderNode(child, ctx, undefined, `${key}-n${i}`))
  );
}

/**
 * Walk a DSL tree and collect every top-level `{{key}}` placeholder referenced
 * in `content` / `src` string fields. Used by `create_doc` validation to flag
 * unbound placeholders and dead data keys before the agent silently ships a
 * broken PDF.
 *
 * Only returns the FIRST segment of dotted paths (e.g. `{{cliente.nombre}}` →
 * `cliente`) because the data object is validated at top-level.
 */
export function collectTreePlaceholders(tree: DslTree): Set<string> {
  const found = new Set<string>();
  const re = /\{\{\s*([^}]+?)\s*\}\}/g;
  const addFromString = (s: string) => {
    let m: RegExpExecArray | null;
    while ((m = re.exec(s)) !== null) {
      const path = m[1].trim();
      if (!path || path === "." || path === "item") continue;
      const first = path.startsWith("item.") ? path.slice(5).split(".")[0] : path.split(".")[0];
      if (first) found.add(first);
    }
  };
  const visit = (node: any) => {
    if (!node || typeof node !== "object") return;
    if (typeof node.content === "string") addFromString(node.content);
    if (typeof node.src === "string") addFromString(node.src);
    if (Array.isArray(node.children)) node.children.forEach(visit);
  };
  for (const page of tree.pages) (page.children ?? []).forEach(visit);
  return found;
}

export async function renderDslToPdf(tree: DslTree, data: Record<string, any>): Promise<Buffer> {
  const doc = React.createElement(
    Document,
    null,
    tree.pages.map((p, i) => renderPage(p, data, tree.defaultPageStyle, `p${i}`))
  );
  // @react-pdf/renderer returns a Node Buffer here.
  return (await renderToBuffer(doc as any)) as Buffer;
}
