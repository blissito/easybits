import { redirect } from "react-router";
import type { Route } from "./+types/hosting-github-callback";
import { getUserOrRedirect } from "~/.server/getters";
import type { AuthContext } from "~/.server/apiAuth";
import { githubStateCookie, readGithubState } from "~/.server/githubState";
import { exchangeUserCode, installUrl, STATE_PREFIX } from "~/.server/core/githubApp";
import { claimInstallationsWithToken } from "~/.server/core/githubImportOperations";
import { connectSiteToGithub } from "~/.server/core/githubSiteOperations";

// GET /dash/hosting/github/callback?code&state — llega rebotado por el relay de
// Teams (el callback registrado en la App es el suyo). Reclama las
// instalaciones que el usuario ve y vuelve al panel. Si la cookie trae un sitio,
// además le crea su repo nuevo y vuelve a su editor.
export async function loader({ request }: Route.LoaderArgs) {
  const user = await getUserOrRedirect(request);
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state") ?? "";
  const st = readGithubState(await githubStateCookie.parse(request.headers.get("Cookie")));
  const clear = { "Set-Cookie": await githubStateCookie.serialize("", { maxAge: 0 }) };
  const back = (q: string) =>
    st?.site ? `/dash/sitios/${st.site}?github=${q}` : `/dash/hosting?github=${q}`;
  if (!code || !st || state !== `${STATE_PREFIX}${st.n}`) {
    return redirect(back("state"), { headers: clear });
  }
  try {
    // El code sirve UNA vez: se canjea aquí y el token se reparte.
    const userToken = await exchangeUserCode(code);
    if (st.site) {
      const ctx = { user, scopes: ["READ", "WRITE"] } as AuthContext;
      const r = await connectSiteToGithub(ctx, st.site, userToken, { isPrivate: !st.pub });
      // La App no está en su cuenta: a instalarla con el MISMO state (la cookie
      // sigue viva) y GitHub regresa aquí con otro code.
      if (!r.ok) return redirect(installUrl(state));
      return redirect(`/dash/sitios/${st.site}?github=connected`, { headers: clear });
    }
    const n = (await claimInstallationsWithToken(user.id, userToken)).length;
    if (!n) return redirect(installUrl(state));
    return redirect("/dash/hosting?github=ok", { headers: clear });
  } catch (e: any) {
    console.error("[github-app] callback:", e?.message ?? e);
    const q = e?.code === "GithubRepoPermission" ? "perm" : "error";
    return redirect(back(q), { headers: clear });
  }
}
