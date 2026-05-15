import type { Route } from "./+types/agent-admin";
import { authenticateRequest, requireAuth } from "~/.server/apiAuth";
import { db } from "~/.server/db";

const HOST_URL = (process.env.SANDBOX_HOST_URL ?? "").replace(/\/$/, "");
const HOST_TOKEN = process.env.SANDBOX_HOST_TOKEN ?? "";

// POST /api/v2/agents/:id/admin
//
// Owner-only generic passthrough al admin API privado del daemon (escucha en
// port 8787 dentro del microVM). Body: { method?, path, body? }.
//
// Auth hacia el daemon: usamos `agent.embedToken` como Bearer — easybits ya
// lo planta como NANOCLAW_ADMIN_TOKEN al spawn (sandboxOperations.ts:707).
//
// Reusable para cualquier admin op: CLAUDE.md CRUD, listar grupos, activity,
// logs, etc. Whitelist mínima: path debe empezar con `/admin/`.
export async function action({ request, params }: Route.ActionArgs) {
  if (request.method !== "POST") {
    return Response.json({ error: "Method not allowed" }, { status: 405 });
  }
  const ctx = requireAuth(await authenticateRequest(request));

  let body: { method?: string; path: string; body?: unknown };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return Response.json({ error: "JSON body required" }, { status: 400 });
  }
  if (!body.path || !body.path.startsWith("/admin/")) {
    return Response.json({ error: "path must start with /admin/" }, { status: 400 });
  }

  const agent = await db.agent.findUnique({ where: { id: params.id! } });
  if (!agent || agent.ownerId !== ctx.user.id) {
    return Response.json({ error: "agent not found" }, { status: 404 });
  }

  // sandbox-host's proxy genérico exige `content` o `rawBody` siempre — incluso
  // para GETs admin que no necesitan body. Pasamos string vacío como rawBody en
  // ese caso; el daemon ignora el body en GETs.
  const proxyBody = {
    port: agent.port ?? 8787,
    path: body.path,
    method: body.method ?? "GET",
    headers: {
      Authorization: `Bearer ${agent.embedToken}`,
      Accept: "application/json",
    },
    rawBody: body.body !== undefined ? body.body : "",
  };
  console.log("[agent-admin] →", agent.sandboxId, JSON.stringify({ port: proxyBody.port, path: proxyBody.path, method: proxyBody.method, hasRawBody: body.body !== undefined }));

  const upstream = await fetch(
    `${HOST_URL}/v1/sandbox/${agent.sandboxId}/agent/message`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${HOST_TOKEN}`,
        "Content-Type": "application/json",
        "X-Easybits-Owner": agent.ownerId,
      },
      body: JSON.stringify(proxyBody),
    },
  );

  const upstreamText = await upstream.text();
  console.log("[agent-admin] ←", upstream.status, upstreamText.slice(0, 300));

  // Forward status + body 1:1; el daemon ya devuelve JSON.
  return new Response(upstreamText, {
    status: upstream.status,
    headers: { "Content-Type": "application/json" },
  });
}
