import type { Route } from "./+types/fleet-artifact.$fleetAgentId.mcp";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { z } from "zod";
import { db } from "~/.server/db";
import type { AuthContext } from "~/.server/apiAuth";
import { ok, fail } from "~/.server/mcp/responses";
import { createArtifact, updateArtifact, getArtifact } from "~/.server/core/artifactOperations";

// Always-on `artifact` MCP server for FleetAgents — Streamable-HTTP. Injected per-turn
// into EVERY fleet agent (mirrors fleet-render). Da al agente el edit-in-place: crear un
// artefacto vivo (doc) y ACTUALIZARLO por id → nueva versión sobre la MISMA identidad
// (no un doc nuevo). El contenido en vivo (Canvas) viaja por el fence del texto; esta
// tool es el commit + identidad + versión. Auth = fleetAgent.token (header o ?token=).

async function ctxForOwner(ownerId: string): Promise<AuthContext | null> {
  const user = await db.user.findUnique({ where: { id: ownerId } });
  return user ? ({ user, scopes: ["READ", "WRITE", "DELETE"] } as AuthContext) : null;
}

function buildArtifactServer(ctx: AuthContext): McpServer {
  const server = new McpServer({ name: "easybits-artifact", version: "1.0.0" });
  const tool = (name: string, desc: string, shape: Record<string, unknown>, cb: (p: any) => Promise<unknown>) =>
    server.tool(name, desc, shape as any, cb as any);

  tool(
    "artifact_create",
    "Crea un ARTEFACTO vivo y visible (documento) con identidad + versiones. Úsalo para un documento de prosa NUEVO (contrato, carta, oficio, demanda, dictamen). Pasa el contenido como Markdown. Devuelve { artifactId, version, title }. GUARDA el artifactId: para MODIFICAR este documento después usa artifact_update con ese id (NO crees uno nuevo).",
    {
      title: z.string().describe("título del documento"),
      markdown: z.string().describe("contenido del documento en Markdown"),
      kind: z.enum(["doc"]).default("doc"),
    },
    async (p) => {
      try {
        return ok(await createArtifact(ctx, { kind: p.kind, title: p.title, markdown: p.markdown }));
      } catch (e) {
        return fail((e as Error).message);
      }
    }
  );

  tool(
    "artifact_update",
    "EDIT-IN-PLACE: actualiza un artefacto EXISTENTE por su id → NUEVA VERSIÓN sobre la MISMA identidad (el usuario ve avanzar el mismo documento, no una tarjeta nueva). Úsalo SIEMPRE que el usuario pida modificar/ajustar/corregir/reescribir un documento que ya existe. Pasa el contenido COMPLETO actualizado en Markdown. Devuelve { artifactId, version }.",
    {
      id: z.string().describe("artifactId del documento a modificar (el que devolvió artifact_create)"),
      markdown: z.string().describe("contenido COMPLETO y actualizado del documento en Markdown"),
    },
    async (p) => {
      try {
        return ok(await updateArtifact(ctx, p.id, { markdown: p.markdown }));
      } catch (e) {
        return fail((e as Error).message);
      }
    }
  );

  tool(
    "artifact_get",
    "Devuelve el estado de un artefacto (kind, versión actual, título, shareUrl) por su id.",
    { id: z.string().describe("artifactId") },
    async (p) => {
      try {
        return ok(await getArtifact(ctx, p.id));
      } catch (e) {
        return fail((e as Error).message);
      }
    }
  );

  return server;
}

async function handle(request: Request, fleetAgentId: string): Promise<Response> {
  const url = new URL(request.url);
  const bearer =
    request.headers.get("Authorization")?.replace(/^Bearer\s+/i, "") || url.searchParams.get("token") || "";
  const fleetAgent = await db.fleetAgent.findUnique({ where: { id: fleetAgentId } });
  if (!fleetAgent || !bearer || fleetAgent.token !== bearer) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }
  const ctx = await ctxForOwner(fleetAgent.ownerId);
  if (!ctx) return Response.json({ error: "owner not found" }, { status: 401 });

  const server = buildArtifactServer(ctx);
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
