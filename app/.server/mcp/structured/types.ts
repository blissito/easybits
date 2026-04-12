/**
 * JSON-DSL for structured_doc templates.
 *
 * A template is a tree of nodes (no executable code). The renderer walks the
 * tree and maps each node to an @react-pdf/renderer component. String fields
 * support {{path.to.data}} interpolation against the document `data`. Nodes
 * can repeat with `each` (array path) or render conditionally with `if`.
 *
 * This DSL is intentionally small — enough for quotations, invoices, proposals.
 * If a template needs logic the DSL can't express, add a new node type here.
 */
import { z } from "zod";

// Subset of React PDF StyleSheet properties we allow.
// Any unknown property is passed through as-is; keeping this open-ended avoids
// having to maintain a whitelist that drifts from upstream.
export const styleSchema = z.record(z.string(), z.union([z.string(), z.number()])).optional();

const baseNode = {
  style: styleSchema,
  /** Dotted path into `data` whose array value should repeat this node. Inside
   *  the repeated subtree, `{{item.xxx}}` or `{{.xxx}}` refers to the row. */
  each: z.string().optional(),
  /** Dotted path into `data`; node renders only when value is truthy. */
  if: z.string().optional(),
  /** Alias for `if` with inverted meaning. */
  unless: z.string().optional(),
};

// Recursive node type — declared via z.lazy.
export type DslNode =
  | { type: "Text"; content: string; style?: Record<string, any>; each?: string; if?: string; unless?: string }
  | { type: "View"; children?: DslNode[]; style?: Record<string, any>; each?: string; if?: string; unless?: string }
  | { type: "Image"; src: string; style?: Record<string, any>; if?: string; unless?: string }
  | { type: "Link"; src: string; content: string; style?: Record<string, any> };

export const dslNodeSchema: z.ZodType<DslNode> = z.lazy(() =>
  z.discriminatedUnion("type", [
    z.object({ type: z.literal("Text"), content: z.string(), ...baseNode }),
    z.object({ type: z.literal("View"), children: z.array(dslNodeSchema).optional(), ...baseNode }),
    z.object({ type: z.literal("Image"), src: z.string(), style: styleSchema, if: z.string().optional(), unless: z.string().optional() }),
    z.object({ type: z.literal("Link"), src: z.string(), content: z.string(), style: styleSchema }),
  ])
);

export const dslPageSchema = z.object({
  size: z.enum(["A4", "LETTER", "LEGAL"]).optional().default("LETTER"),
  orientation: z.enum(["portrait", "landscape"]).optional().default("portrait"),
  style: styleSchema,
  children: z.array(dslNodeSchema),
});

export const dslTreeSchema = z.object({
  /** Default styles applied to every Page unless overridden. */
  defaultPageStyle: styleSchema,
  pages: z.array(dslPageSchema).min(1),
});

export type DslTree = z.infer<typeof dslTreeSchema>;
export type DslPage = z.infer<typeof dslPageSchema>;
