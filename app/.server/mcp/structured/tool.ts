/**
 * `structured_doc` — single experimental MCP tool for generating documents
 * from JSON-DSL templates + JSON data via @react-pdf/renderer.
 *
 * Design goals (see /Users/bliss/.claude/plans/partitioned-yawning-deer.md):
 * - The LLM never writes layout; it only produces JSON data that fills a
 *   curated template.
 * - Templates are shared across agents (library), documents are private per user.
 * - All sub-operations go through one tool with an `action` discriminator so
 *   the agent sees a single entry point.
 */
import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { nanoid } from "nanoid";
import { db } from "../../db";
import { getPlatformDefaultClient } from "../../storage";
import { dslTreeSchema } from "./types";
import { renderDslToPdf } from "./renderer";

type AuthCtx = { user: { id: string } };

const actionSchema = z.enum([
  "list_templates",
  "get_template",
  "create_template",
  "create_doc",
  "get_doc",
  "patch_doc",
  "edit_doc",
  "render_doc",
]);

/** RFC6902-lite: we accept a partial JSON object and shallow-merge into doc.data.
 *  Arrays in the patch replace the array in data (no index patching — keep it
 *  simple; the agent can read + pass the full array if needed). */
function mergePatch(target: any, patch: any): any {
  if (patch == null || typeof patch !== "object" || Array.isArray(patch)) return patch;
  const out: any = { ...(target ?? {}) };
  for (const k of Object.keys(patch)) {
    const v = patch[k];
    if (v === null) delete out[k];
    else if (typeof v === "object" && !Array.isArray(v)) out[k] = mergePatch(out[k], v);
    else out[k] = v;
  }
  return out;
}

/**
 * Persist a rendered PDF. If the doc already has a `lastPdfFileId`, overwrite
 * that File's storage and row in-place — WhatsApp flow edits the same doc many
 * times and we don't want to leak one File per render. Creates a new File only
 * on the first render.
 */
async function upsertPdf(ownerId: string, name: string, pdf: Buffer, docId: string, existingFileId: string | null): Promise<string> {
  const client = getPlatformDefaultClient({ prefix: "mcp/" });
  if (existingFileId) {
    const existing = await db.file.findFirst({ where: { id: existingFileId, ownerId } });
    if (existing) {
      await client.putObject(existing.storageKey, pdf, "application/pdf");
      await db.file.update({
        where: { id: existing.id },
        data: { name: `${name}.pdf`, size: pdf.length, updatedAt: new Date() },
      });
      return existing.id;
    }
    // Fall through and create fresh if the linked file vanished.
  }
  const key = `${ownerId}/${nanoid(3)}`;
  await client.putObject(key, pdf, "application/pdf");
  const file = await db.file.create({
    data: {
      name: `${name}.pdf`,
      storageKey: key,
      slug: key,
      size: pdf.length,
      contentType: "application/pdf",
      ownerId,
      access: "private",
      url: "",
      status: "DONE",
      source: "mcp",
      metadata: { type: "structured_doc", structuredDocId: docId },
    },
  });
  return file.id;
}

export function registerStructuredDocTool(server: McpServer) {
  server.tool(
    "structured_doc",
    `Create and edit structured documents (quotations, invoices, proposals) via JSON-DSL templates + @react-pdf/renderer.

Pattern: TEMPLATE (curated, shared library, JSON tree of {type, style, children}) + DATA (JSON filled by you, privado al agente/usuario). You NEVER write layout — templates handle that. You only produce the data object that the template consumes.

Actions:
- list_templates: List available templates (yours + public). Returns [{id, name, description, dataSchema}].
- get_template: { templateId } → { id, name, tree, dataSchema }. Inspect before creating a doc.
- create_template: { name, description?, tree, dataSchema, isPublic? } → { templateId }. Create a reusable template. 'tree' is the JSON-DSL (see types.ts for node shape). Admin/setup action.
- create_doc: { templateId, name, data } → { docId, pdfFileId, bytes, renderedIn } + PDF inline as resource (base64). The agent receives the rendered PDF immediately, no follow-up get_file needed.
- get_doc: { docId } → { id, name, templateId, data } + cached PDF inline as resource (if previously rendered). Use this to read a doc for editing. The JSON is the source of truth — the PDF is a convenience so you can show the current state without a re-render.
- patch_doc: { docId, patch } → { id, data }. Shallow-merge patch into data. Does NOT re-render; use when batching several edits.
- edit_doc: { docId, patch } → { docId, data, pdfFileId, bytes, renderedIn } + updated PDF inline. **Preferred for WhatsApp / single-turn edits** — patches data AND re-renders in one call, overwriting the previous PDF (no file accumulation).
- render_doc: { docId } → { pdfFileId, bytes, renderedIn } + PDF inline as resource. Re-render from current data without patching. Overwrites the previous PDF.

The DSL supports: Text (with {{data.path}} interpolation), View (container with flexbox), Image, Link. Nodes can repeat with 'each: "items"' and condition with 'if: "path"'. See types.ts for the full schema.`,
    {
      action: actionSchema,
      // Optional fields — which ones apply depends on the action.
      templateId: z.string().optional(),
      docId: z.string().optional(),
      name: z.string().optional(),
      description: z.string().optional(),
      tree: z.unknown().optional().describe("JSON-DSL tree for create_template"),
      dataSchema: z.record(z.string(), z.unknown()).optional().describe("Free-form JSON schema describing the `data` shape expected by this template"),
      data: z.record(z.string(), z.unknown()).optional().describe("Data object for create_doc"),
      patch: z.record(z.string(), z.unknown()).optional().describe("Partial data object for patch_doc"),
      isPublic: z.boolean().optional(),
    },
    async (params: any, extra: any) => {
      try {
        const ctx = extra.authInfo as AuthCtx;
        const userId = ctx.user.id;
        const out = await handleAction(params, userId);
        // create_doc / render_doc attach the PDF Buffer as a resource so the
        // agent receives the PDF inline without a follow-up get_file call.
        const content: any[] = [{ type: "text" as const, text: JSON.stringify(out.json, null, 2) }];
        if (out.pdf) {
          content.push({
            type: "resource" as const,
            resource: {
              uri: `easybits://structured-doc/${encodeURIComponent(out.pdf.name)}.pdf`,
              mimeType: "application/pdf",
              blob: out.pdf.buffer.toString("base64"),
            },
          });
        }
        return { content };
      } catch (err) {
        return {
          content: [{ type: "text" as const, text: JSON.stringify({ error: String(err instanceof Error ? err.message : err) }, null, 2) }],
          isError: true,
        };
      }
    }
  );
}

type ActionResult = { json: any; pdf?: { buffer: Buffer; name: string } };

async function handleAction(params: any, userId: string): Promise<ActionResult> {
  switch (params.action) {
    case "list_templates": {
      const rows = await db.mcpTemplate.findMany({
        where: { OR: [{ ownerId: userId }, { isPublic: true }] },
        orderBy: { updatedAt: "desc" },
        take: 100,
      });
      return { json: rows.map((r) => ({
        id: r.id,
        name: r.name,
        description: r.description,
        dataSchema: r.dataSchema,
        isPublic: r.isPublic,
        owned: r.ownerId === userId,
      })) };
    }

    case "get_template": {
      if (!params.templateId) throw new Error("templateId required");
      const t = await db.mcpTemplate.findFirst({
        where: { id: params.templateId, OR: [{ ownerId: userId }, { isPublic: true }] },
      });
      if (!t) throw new Error("Template not found");
      return { json: { id: t.id, name: t.name, description: t.description, tree: t.tree, dataSchema: t.dataSchema } };
    }

    case "create_template": {
      if (!params.name || !params.tree || !params.dataSchema) {
        throw new Error("name, tree, dataSchema required");
      }
      // Validate tree shape before persisting — catches malformed JSON early.
      const parsed = dslTreeSchema.safeParse(params.tree);
      if (!parsed.success) throw new Error(`Invalid tree: ${parsed.error.message}`);
      const t = await db.mcpTemplate.create({
        data: {
          name: params.name,
          description: params.description ?? null,
          tree: parsed.data as any,
          dataSchema: params.dataSchema as any,
          ownerId: userId,
          isPublic: !!params.isPublic,
        },
      });
      return { json: { templateId: t.id } };
    }

    case "create_doc": {
      if (!params.templateId || !params.name || !params.data) {
        throw new Error("templateId, name, data required");
      }
      const t = await db.mcpTemplate.findFirst({
        where: { id: params.templateId, OR: [{ ownerId: userId }, { isPublic: true }] },
      });
      if (!t) throw new Error("Template not found");
      const tree = dslTreeSchema.parse(t.tree);

      const doc = await db.mcpStructuredDoc.create({
        data: {
          name: params.name,
          templateId: t.id,
          data: params.data as any,
          ownerId: userId,
        },
      });

      const start = Date.now();
      const pdf = await renderDslToPdf(tree, params.data);
      const pdfFileId = await upsertPdf(userId, params.name, pdf, doc.id, null);
      await db.mcpStructuredDoc.update({ where: { id: doc.id }, data: { lastPdfFileId: pdfFileId } });

      return {
        json: { docId: doc.id, pdfFileId, bytes: pdf.length, renderedIn: `${Date.now() - start}ms` },
        pdf: { buffer: pdf, name: params.name },
      };
    }

    case "edit_doc": {
      // Atomic patch + render for WhatsApp-style single-turn edits. Overwrites
      // the same PDF file in-place so the doc keeps a single storage slot.
      if (!params.docId || !params.patch) throw new Error("docId and patch required");
      const d = await db.mcpStructuredDoc.findFirst({ where: { id: params.docId, ownerId: userId }, include: { template: true } });
      if (!d) throw new Error("Doc not found");
      const merged = mergePatch(d.data, params.patch);
      const tree = dslTreeSchema.parse(d.template.tree);
      const start = Date.now();
      const pdf = await renderDslToPdf(tree, merged as any);
      const pdfFileId = await upsertPdf(userId, d.name, pdf, d.id, d.lastPdfFileId);
      await db.mcpStructuredDoc.update({ where: { id: d.id }, data: { data: merged, lastPdfFileId: pdfFileId } });
      return {
        json: { docId: d.id, data: merged, pdfFileId, bytes: pdf.length, renderedIn: `${Date.now() - start}ms` },
        pdf: { buffer: pdf, name: d.name },
      };
    }

    case "get_doc": {
      if (!params.docId) throw new Error("docId required");
      const d = await db.mcpStructuredDoc.findFirst({ where: { id: params.docId, ownerId: userId } });
      if (!d) throw new Error("Doc not found");
      const json: any = { id: d.id, name: d.name, templateId: d.templateId, data: d.data };
      // Attach cached PDF if available — avoids forcing a re-render just to
      // view the doc. Fetch via signed URL (same pattern the rest of the app uses).
      if (d.lastPdfFileId) {
        try {
          const file = await db.file.findFirst({ where: { id: d.lastPdfFileId, ownerId: userId } });
          if (file) {
            const client = getPlatformDefaultClient({ prefix: "mcp/" });
            const url = await client.getReadUrl(file.storageKey, 300);
            const res = await fetch(url);
            if (res.ok) {
              const buffer = Buffer.from(await res.arrayBuffer());
              return { json: { ...json, pdfFileId: file.id, bytes: buffer.length }, pdf: { buffer, name: d.name } };
            }
          }
        } catch (e) {
          // Non-fatal: still return JSON. Log and continue.
          console.warn("[structured_doc] get_doc: failed to fetch cached PDF", e);
        }
      }
      return { json };
    }

    case "patch_doc": {
      if (!params.docId || !params.patch) throw new Error("docId and patch required");
      const d = await db.mcpStructuredDoc.findFirst({ where: { id: params.docId, ownerId: userId } });
      if (!d) throw new Error("Doc not found");
      const merged = mergePatch(d.data, params.patch);
      const updated = await db.mcpStructuredDoc.update({ where: { id: d.id }, data: { data: merged } });
      return { json: { id: updated.id, data: updated.data } };
    }

    case "render_doc": {
      if (!params.docId) throw new Error("docId required");
      const d = await db.mcpStructuredDoc.findFirst({ where: { id: params.docId, ownerId: userId }, include: { template: true } });
      if (!d) throw new Error("Doc not found");
      const tree = dslTreeSchema.parse(d.template.tree);
      const start = Date.now();
      const pdf = await renderDslToPdf(tree, d.data as any);
      const pdfFileId = await upsertPdf(userId, d.name, pdf, d.id, d.lastPdfFileId);
      await db.mcpStructuredDoc.update({ where: { id: d.id }, data: { lastPdfFileId: pdfFileId } });
      return {
        json: { docId: d.id, pdfFileId, bytes: pdf.length, renderedIn: `${Date.now() - start}ms` },
        pdf: { buffer: pdf, name: d.name },
      };
    }

    default:
      throw new Error(`Unknown action: ${params.action}`);
  }
}
