import type { Route } from "./+types/me";
import { authenticateRequest, requireAuth } from "~/.server/apiAuth";

// GET /api/v2/me — identidad del portador del token. A diferencia de
// /api/v1/user (que usa getUserOrNull → solo cookie de sesión), esto va por
// authenticateRequest, así que acepta el Bearer del JWT OAuth (y API keys y
// cookie). Lo usa el SSO de ghosty.studio para resolver email + verificación.
export async function loader({ request }: Route.LoaderArgs) {
  const { user } = requireAuth(await authenticateRequest(request));
  return Response.json({
    id: user.id,
    email: user.email,
    verified_email: user.verified_email ?? false,
    confirmed: user.confirmed ?? false,
  });
}
