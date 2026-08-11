import type { Route } from "./+types/machine-secrets";
import { authenticateRequest, requireAuth } from "~/.server/apiAuth";
import { applySandboxRateLimit } from "~/.server/rateLimiter";
import {
  listMachineSecrets,
  setMachineSecrets,
  unsetMachineSecret,
} from "~/.server/core/releaseOperations";

// GET /api/v2/machines/:id/secrets — qué secretos usa la app. Sólo nombres:
// un valor guardado no se vuelve a leer por API, ni siquiera por su dueño.
export async function loader({ request, params }: Route.LoaderArgs) {
  const ctx = requireAuth(await authenticateRequest(request));
  return Response.json(await listMachineSecrets(ctx, params.id!));
}

// PUT /api/v2/machines/:id/secrets — cargar secretos, { NOMBRE: valor }.
// DELETE /api/v2/machines/:id/secrets?name=NOMBRE — dejar de inyectar uno.
//
// Los valores van cifrados al vault del dueño y sólo se materializan dentro de
// la máquina al construir y al arrancar. Nunca entran al runspec ni al tarball
// del release.
export async function action({ request, params }: Route.ActionArgs) {
  const ctx = requireAuth(await authenticateRequest(request));

  if (request.method === "DELETE") {
    const name = new URL(request.url).searchParams.get("name");
    if (!name) {
      return Response.json({ error: "Falta ?name=NOMBRE" }, { status: 400 });
    }
    return Response.json(await unsetMachineSecret(ctx, params.id!, name));
  }

  if (request.method !== "PUT" && request.method !== "POST") {
    return Response.json({ error: "Method not allowed" }, { status: 405 });
  }

  const limited = await applySandboxRateLimit(ctx.apiKey?.id ?? ctx.user.id, "op");
  if (limited) return limited;

  const body = await request.json().catch(() => null);
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return Response.json(
      { error: "Manda un objeto plano { NOMBRE: valor }" },
      { status: 400 }
    );
  }

  const secrets: Record<string, string> = {};
  for (const [k, v] of Object.entries(body as Record<string, unknown>)) {
    if (typeof v !== "string") {
      return Response.json(
        { error: `El valor de ${k} debe ser texto` },
        { status: 400 }
      );
    }
    secrets[k] = v;
  }

  try {
    return Response.json(await setMachineSecrets(ctx, params.id!, secrets));
  } catch (e: any) {
    if (e instanceof Response) return e;
    return Response.json(
      { error: e?.code ?? "SecretsFailed", message: String(e?.message ?? e) },
      { status: e?.status ?? 400 }
    );
  }
}
