import { redirect } from "react-router";
import { getUserOrRedirect } from "~/.server/getters";

// "Ghosty Teams" — entrada del sidebar. Manda al ingress ESTABLE de Formmy
// (teams.formmy.app), NO a la caja cruda sb-xxx: ese dominio resuelve team→VM,
// muestra el selector/provisión y REVIVE la caja por uso. Un link directo al
// sb-xxx bypasea todo eso y muere ("not a valid preview host") cuando el reaper
// la recoge. El env solo se usa para override/local.
export const loader = async ({ request }: { request: Request }) => {
  await getUserOrRedirect(request);
  const url = process.env.GHOSTY_TEAMS_URL ?? "https://teams.formmy.app";
  return redirect(url);
};
