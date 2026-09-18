import type { Route } from "./+types/template-snapshots-collection";
import { authenticateRequest, requireAuth } from "~/.server/apiAuth";
import { getTemplateSnapshot, listTemplateSnapshots } from "~/.server/core/sandboxOperations";

// GET /api/v2/template-snapshots            — lista las plantillas derivadas del caller
// GET /api/v2/template-snapshots?key=&hash= — una por clave de contenido
//     (404 DerivedTemplateNotProvisioned si no existe: la comprobación barata antes de bootstrapear)
export async function loader({ request }: Route.LoaderArgs) {
  const ctx = requireAuth(await authenticateRequest(request));
  const url = new URL(request.url);
  const key = url.searchParams.get("key");
  const hash = url.searchParams.get("hash");
  if (key || hash) {
    if (!key || !hash) return Response.json({ error: "key y hash van juntos" }, { status: 400 });
    return Response.json(await getTemplateSnapshot(ctx, { key, hash }));
  }
  return Response.json({ items: await listTemplateSnapshots(ctx) });
}
