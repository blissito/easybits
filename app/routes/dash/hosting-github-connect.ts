import { redirect } from "react-router";
import { nanoid } from "nanoid";
import type { Route } from "./+types/hosting-github-connect";
import { getUserOrRedirect } from "~/.server/getters";
import { githubStateCookie } from "~/.server/githubState";
import { authorizeUrl, githubAppEnabled, installUrl, STATE_PREFIX } from "~/.server/core/githubApp";

// GET /dash/hosting/github/connect → autorizar primero (regresa solo aunque la
// App ya esté instalada); si el callback no ve instalaciones, manda a instalar.
// `?add=1` abre directo la pantalla de instalar/elegir repos.
export async function loader({ request }: Route.LoaderArgs) {
  await getUserOrRedirect(request);
  if (!githubAppEnabled()) throw redirect("/dash/hosting?github=off");
  const nonce = nanoid(24);
  const state = `${STATE_PREFIX}${nonce}`;
  const add = new URL(request.url).searchParams.get("add") === "1";
  return redirect(add ? installUrl(state) : authorizeUrl(state), {
    headers: { "Set-Cookie": await githubStateCookie.serialize(nonce) },
  });
}
