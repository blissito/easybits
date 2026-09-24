import { redirect } from "react-router";
import { nanoid } from "nanoid";
import type { Route } from "./+types/hosting-github-connect";
import { getUserOrRedirect } from "~/.server/getters";
import { githubStateCookie } from "~/.server/githubState";
import { githubAppEnabled, installUrl, STATE_PREFIX } from "~/.server/core/githubApp";

// GET /dash/hosting/github/connect → instalar la App (o cambiar sus repos).
// La misma liga sirve para las dos cosas: GitHub muestra la pantalla que toca.
export async function loader({ request }: Route.LoaderArgs) {
  await getUserOrRedirect(request);
  if (!githubAppEnabled()) throw redirect("/dash/hosting?github=off");
  const nonce = nanoid(24);
  return redirect(installUrl(`${STATE_PREFIX}${nonce}`), {
    headers: { "Set-Cookie": await githubStateCookie.serialize(nonce) },
  });
}
