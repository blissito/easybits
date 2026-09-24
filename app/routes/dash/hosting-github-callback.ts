import { redirect } from "react-router";
import type { Route } from "./+types/hosting-github-callback";
import { getUserOrRedirect } from "~/.server/getters";
import { githubStateCookie } from "~/.server/githubState";
import { installUrl, STATE_PREFIX } from "~/.server/core/githubApp";
import { claimInstallations } from "~/.server/core/githubImportOperations";

// GET /dash/hosting/github/callback?code&state — llega rebotado por el relay de
// Teams (el callback registrado en la App es el suyo). Reclama las
// instalaciones que el usuario ve y vuelve al panel.
export async function loader({ request }: Route.LoaderArgs) {
  const user = await getUserOrRedirect(request);
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state") ?? "";
  const nonce = await githubStateCookie.parse(request.headers.get("Cookie"));
  const clear = { "Set-Cookie": await githubStateCookie.serialize("", { maxAge: 0 }) };
  if (!code || !nonce || state !== `${STATE_PREFIX}${nonce}`) {
    return redirect("/dash/hosting?github=state", { headers: clear });
  }
  try {
    const n = await claimInstallations(user.id, code);
    // Autorizó pero no la tiene instalada: a instalar, con el MISMO state (la
    // cookie sigue viva). Al instalar GitHub regresa aquí con otro code.
    if (!n) return redirect(installUrl(state));
    return redirect("/dash/hosting?github=ok", { headers: clear });
  } catch (e: any) {
    console.error("[github-app] callback:", e?.message ?? e);
    return redirect("/dash/hosting?github=error", { headers: clear });
  }
}
