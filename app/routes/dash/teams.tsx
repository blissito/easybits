import { redirect } from "react-router";
import { getUserOrRedirect } from "~/.server/getters";

// "Ghosty Teams" — entrada del sidebar. Abre/lanza el chat de equipo con Ghosty.
// La URL de la instancia vive en UN solo lugar (env GHOSTY_TEAMS_URL) para no
// romper el sidebar cuando el link de la instancia cambie (hasta que haya
// subdominio/dominio custom permanente). Cuando exista el provisioning por-owner,
// aquí se spinnea/enruta a la instancia del user desde su cuenta EasyBits.
export const loader = async ({ request }: { request: Request }) => {
  await getUserOrRedirect(request);
  const url =
    process.env.GHOSTY_TEAMS_URL ??
    "https://sb-b260df3c-68ab-41ea-88a4-ef67f413b0ff-3000.sandboxes.easybits.cloud";
  return redirect(url);
};
