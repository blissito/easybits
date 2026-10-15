import type { Route } from "./+types/sites.$id.theme";
import { authenticateRequest, requireAuth } from "~/.server/apiAuth";
import { getSiteTheme, setSiteTheme } from "~/.server/core/siteOperations";

// Tema de un sitio de /dash/sitios (Bearer o sesión). El botón «Tema» del editor y el
// agente (MCP site_set_theme) pasan por aquí: GET = colores actuales y si el sitio usa
// tokens; POST {themeId} | {colors} = lo reescribe sin modelo. 409 no_tokens = sitio
// anterior a los temas. Ruta de recurso: sin export default.
export async function loader({ request, params }: Route.LoaderArgs) {
  const ctx = requireAuth(await authenticateRequest(request));
  return Response.json(await getSiteTheme(ctx, params.id!));
}

export async function action({ request, params }: Route.ActionArgs) {
  const ctx = requireAuth(await authenticateRequest(request));
  if (request.method !== "POST") return Response.json({ error: "method_not_allowed" }, { status: 405 });
  const body = await request.json().catch(() => ({}));
  return Response.json(
    await setSiteTheme(ctx, params.id!, {
      themeId: typeof body?.themeId === "string" ? body.themeId : undefined,
      colors: body?.colors,
    })
  );
}
