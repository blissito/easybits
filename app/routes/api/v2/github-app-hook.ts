import type { Route } from "./+types/github-app-hook";
import { handleAppWebhook } from "~/.server/core/githubImportOperations";

// POST /api/v2/github/app-hook — webhook de la GitHub App (ghosty-studio).
// Pública: la autenticación es la firma con GITHUB_APP_WEBHOOK_SECRET. Ruta de
// RECURSO (sin `export default`). GitHub corta a los 10 s: el deploy va en
// segundo plano dentro de acceptPush.
export async function action({ request }: Route.ActionArgs) {
  if (request.method !== "POST") {
    return Response.json({ error: "Method not allowed" }, { status: 405 });
  }
  const res = await handleAppWebhook(await request.text(), request.headers);
  return Response.json(res.body, { status: res.status });
}
