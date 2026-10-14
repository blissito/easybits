import { redirect } from "react-router";
import type { Route } from "./+types/mailmask-connect";
import { getUserOrRedirect } from "~/.server/getters";
import { mailmaskStateCookie } from "~/.server/mailmaskState";
import { mailmaskAuthorize } from "~/.server/core/mailmaskOperations";

// GET /dash/integrations/mailmask/connect?domain=<customDomainId> → consentimiento en Mailmask.
// Al volver, el callback configura ese dominio solo.
export async function loader({ request }: Route.LoaderArgs) {
  await getUserOrRedirect(request);
  const domainId = new URL(request.url).searchParams.get("domain") || undefined;
  try {
    const { url, state, verifier } = await mailmaskAuthorize();
    return redirect(url, {
      headers: { "Set-Cookie": await mailmaskStateCookie.serialize({ s: state, v: verifier, d: domainId }) },
    });
  } catch (e: any) {
    console.error("[mailmask] connect:", e?.message ?? e);
    return redirect("/dash/developer/domains?mailmask=error");
  }
}
