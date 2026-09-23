import type { Route } from "./+types/machine-github-hook";
import { handleGithubHook } from "~/.server/core/pushDeployOperations";

// POST /api/v2/machines/:id/github-hook — receptor del webhook de GitHub.
//
// Pública a propósito: la autenticación es la firma `x-hub-signature-256` con
// el secreto que devolvió `POST /machines/:id/push-deploy`. Ruta de RECURSO:
// sin `export default` (con componente, React Router serviría el shell SPA).
export async function action({ request, params }: Route.ActionArgs) {
  if (request.method !== "POST") {
    return Response.json({ error: "Method not allowed" }, { status: 405 });
  }
  const raw = await request.text();
  const res = await handleGithubHook(params.id!, raw, request.headers);
  return Response.json(res.body, { status: res.status });
}
