import type { Route } from "./+types/fleet-vision.$fleetAgentId.mcp";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { z } from "zod";
import { db } from "~/.server/db";
import type { AuthContext } from "~/.server/apiAuth";
import { ok, fail } from "~/.server/mcp/responses";
import { consumeService } from "~/.server/services/consume";
import { getClientForFile, getReadClientForPlatformFile } from "~/.server/storage";
import type { DescribeImageOutput } from "~/.server/services/providers/describe";

// Dedicated, always-on `vision` MCP server for FleetAgents — Streamable-HTTP.
// Injected per-turn into EVERY fleet agent (NOT gated by the easybits builtin
// toggle), so a TEXT-ONLY engine (DeepSeek/GLM/…) can actually SEE an image.
// Blind engines otherwise confabulate image contents (the harness used to tell
// them "open it with Read" — Read doesn't do vision). Backed by the existing
// describeImageService (Gemini flash, description + OCR). Auth = fleetAgent token.
//
// Mirrors fleet-render.$fleetAgentId.mcp.ts (same transport + token auth) and the
// `describe_image` handler in mcp/server.ts (same image resolution + billing).

async function ctxForOwner(ownerId: string): Promise<AuthContext | null> {
  const user = await db.user.findUnique({ where: { id: ownerId } });
  return user ? { user, scopes: ["READ", "WRITE", "DELETE"] } : null;
}

// Resolve a single image to raw bytes: fileId (EasyBits library, owner-scoped)
// wins over a public URL. Same logic as the describe_image builtin.
async function resolveImage(
  ctx: AuthContext,
  imageFileId?: string,
  imageUrl?: string,
): Promise<{ data: Uint8Array; mediaType: string }> {
  if (imageFileId) {
    const file = await db.file.findUnique({ where: { id: imageFileId } });
    if (!file || file.status === "DELETED") throw new Error(`File not found: ${imageFileId}`);
    if (file.ownerId !== ctx.user.id) throw new Error(`Forbidden: ${imageFileId}`);
    if (!file.contentType.startsWith("image/")) throw new Error(`File is not an image: ${imageFileId}`);
    const sourceClient = file.storageProviderId
      ? await getClientForFile(file.storageProviderId, ctx.user.id)
      : getReadClientForPlatformFile(file);
    const readUrl = await sourceClient.getReadUrl(file.storageKey);
    const r = await fetch(readUrl);
    if (!r.ok) throw new Error(`download failed: ${imageFileId}`);
    return { data: new Uint8Array(await r.arrayBuffer()), mediaType: file.contentType };
  }
  if (imageUrl) {
    const r = await fetch(imageUrl);
    if (!r.ok) throw new Error(`download failed: ${imageUrl}`);
    const ct = r.headers.get("content-type") || "image/png";
    return { data: new Uint8Array(await r.arrayBuffer()), mediaType: ct };
  }
  throw new Error("pasa imageUrl o imageFileId");
}

function buildVisionServer(ctx: AuthContext): McpServer {
  const server = new McpServer({ name: "easybits-vision", version: "1.0.0" });
  const tool = (name: string, desc: string, shape: Record<string, unknown>, cb: (p: any) => Promise<unknown>) =>
    server.tool(name, desc, shape as any, cb as any);

  tool(
    "see_image",
    "MÍRA una imagen y devuelve texto: qué muestra + transcripción del texto visible (OCR). NO adivines el contenido de una imagen — SIEMPRE usa esta tool para verla. Úsala también sobre un PDF/PNG que TÚ generaste (pasa su url) para VERIFICAR el resultado antes de decir que quedó bien. Cost: 1 crédito por llamada.\n\nCómo usar:\n- `imageUrl` (URL pública https — así llega una imagen del chat, y así devuelven la url render_url/render_html) O `imageFileId` (File de imagen de la librería EasyBits). Si pasas ambos, gana `imageFileId`.\n- `question`: opcional — una pregunta específica ('¿de qué color el fondo?', '¿el contenido se corta en la página?', 'extrae el total de la factura'). Sin pregunta = descripción detallada + OCR.\n- Devuelve `description` (texto).",
    {
      imageUrl: z.string().url().optional().describe("URL pública (https) de la imagen. Así llega una imagen del chat y así devuelven la url las tools de render."),
      imageFileId: z.string().optional().describe("File de imagen de la librería EasyBits (fileId). Alternativa a imageUrl."),
      question: z.string().max(1000).optional().describe("Pregunta específica sobre la imagen. Omite para descripción + OCR."),
    },
    async (p) => {
      try {
        if (!p.imageUrl && !p.imageFileId) return fail("pasa imageUrl o imageFileId");
        const image = await resolveImage(ctx, p.imageFileId, p.imageUrl);
        const result = await consumeService<DescribeImageOutput>(
          "image.gemini.describe",
          { images: [image], question: p.question },
          { userId: ctx.user.id },
        );
        return ok({ description: result.data.description, modelId: result.data.modelId });
      } catch (e) {
        return fail((e as Error).message);
      }
    },
  );

  return server;
}

async function handle(request: Request, fleetAgentId: string): Promise<Response> {
  const url = new URL(request.url);
  const bearer =
    request.headers.get("Authorization")?.replace(/^Bearer\s+/i, "") ||
    url.searchParams.get("token") ||
    "";
  const fleetAgent = await db.fleetAgent.findUnique({ where: { id: fleetAgentId } });
  if (!fleetAgent || !bearer || fleetAgent.token !== bearer) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }
  const ctx = await ctxForOwner(fleetAgent.ownerId);
  if (!ctx) return Response.json({ error: "owner not found" }, { status: 401 });

  const server = buildVisionServer(ctx);
  const transport = new WebStandardStreamableHTTPServerTransport({ sessionIdGenerator: undefined });
  await server.connect(transport);
  return transport.handleRequest(request, { authInfo: ctx as any });
}

export async function action({ request, params }: Route.ActionArgs) {
  return handle(request, params.fleetAgentId!);
}

export async function loader({ request, params }: Route.LoaderArgs) {
  return handle(request, params.fleetAgentId!);
}
