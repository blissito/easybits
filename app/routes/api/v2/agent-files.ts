import type { Route } from "./+types/agent-files";
import { authenticateRequest, requireAuth } from "~/.server/apiAuth";
import { applySandboxRateLimit } from "~/.server/rateLimiter";
import { deleteAgentFile, listAgentFiles, machineErrorResponse, putAgentFile } from "~/.server/core/agentMachineOperations";

// Archivos de conocimiento de un agente con máquina (ghosty-lite / goose), en /data/work.
//   GET    /api/v2/agents/:id/files[/sub]  → { dir, files: [{ path, size }] }
//   PUT    /api/v2/agents/:id/files/<ruta> cuerpo = bytes crudos (máx 10 MB) → { path, bytes, en }
//   DELETE /api/v2/agents/:id/files/<ruta> → { deleted }
// Mismo contrato que gs; sin restart: el cerebro los ve en cuanto están en disco.
export async function loader({ request, params }: Route.LoaderArgs) {
  const ctx = requireAuth(await authenticateRequest(request));
  try {
    return Response.json(await listAgentFiles(ctx, params.id!, params["*"] || null));
  } catch (e) {
    return machineErrorResponse(e);
  }
}

export async function action({ request, params }: Route.ActionArgs) {
  if (request.method !== "PUT" && request.method !== "DELETE") {
    return Response.json({ error: "method_not_allowed" }, { status: 405 });
  }
  const ctx = requireAuth(await authenticateRequest(request));
  const limited = await applySandboxRateLimit(ctx.apiKey?.id ?? ctx.user.id, "op");
  if (limited) return limited;
  const rel = params["*"] ?? "";
  try {
    if (request.method === "DELETE") return Response.json(await deleteAgentFile(ctx, params.id!, rel));
    const bytes = new Uint8Array(await request.arrayBuffer());
    return Response.json(await putAgentFile(ctx, params.id!, rel, bytes));
  } catch (e) {
    return machineErrorResponse(e);
  }
}
