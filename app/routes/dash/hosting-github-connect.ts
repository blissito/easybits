import { redirect } from "react-router";
import { nanoid } from "nanoid";
import type { Route } from "./+types/hosting-github-connect";
import { getUserOrRedirect } from "~/.server/getters";
import { githubStateCookie } from "~/.server/githubState";
import { authorizeUrl, githubAppEnabled, installUrl, STATE_PREFIX } from "~/.server/core/githubApp";

// GET /dash/hosting/github/connect → autorizar primero (regresa solo aunque la
// App ya esté instalada); si el callback no ve instalaciones, manda a instalar.
// `?add=1` abre directo la pantalla de instalar/elegir repos.
// `?site=<id>` = «Conectar a GitHub» de un sitio: el callback crea su repo y vuelve al editor.
export async function loader({ request }: Route.LoaderArgs) {
  await getUserOrRedirect(request);
  const params = new URL(request.url).searchParams;
  const site = params.get("site") || undefined;
  if (!githubAppEnabled()) throw redirect(site ? `/c/${site}?github=off` : "/dash/hosting?github=off");
  const nonce = nanoid(24);
  const state = `${STATE_PREFIX}${nonce}`;
  const add = params.get("add") === "1";
  return redirect(add ? installUrl(state) : authorizeUrl(state), {
    headers: {
      "Set-Cookie": await githubStateCookie.serialize(
        site ? { n: nonce, site, pub: params.get("visibility") === "public" } : nonce
      ),
    },
  });
}
