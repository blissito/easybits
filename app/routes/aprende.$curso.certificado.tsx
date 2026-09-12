import { redirect } from "react-router";
import { getUserOrRedirect } from "~/.server/getters";
import { certificateToken } from "~/.server/core/courseProgress";
import type { Route } from "./+types/aprende.$curso.certificado";

// Ruta de RECURSO (sin default export): emite el token y manda a la URL pública.
export const loader = async ({ request, params }: Route.LoaderArgs) => {
  const user = await getUserOrRedirect(request);
  return redirect(`/aprende/${params.curso}/certificado/${certificateToken(user.id, params.curso)}`);
};
