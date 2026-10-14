import { redirect } from "react-router";
import type { Route } from "./+types/mailmask-callback";
import { getUserOrRedirect } from "~/.server/getters";
import { mailmaskStateCookie, type MailmaskState } from "~/.server/mailmaskState";
import { mailmaskExchange } from "~/.server/core/mailmaskOperations";
import { autoConfigureDomainDns } from "~/.server/core/customDomainOperations";

// GET /dash/integrations/mailmask/callback?code&state — Mailmask regresa aquí tras el
// consentimiento. Canjea el code, guarda la conexión y, si venía un dominio, lo configura.
export async function loader({ request }: Route.LoaderArgs) {
  const user = await getUserOrRedirect(request);
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const st = (await mailmaskStateCookie.parse(request.headers.get("Cookie"))) as MailmaskState | null;
  const clear = { "Set-Cookie": await mailmaskStateCookie.serialize("", { maxAge: 0 }) };
  const back = (q: string) => redirect(`/dash/developer/domains?mailmask=${q}`, { headers: clear });
  if (url.searchParams.get("error")) return back("denied");
  if (!code || !st?.s || state !== st.s) return back("state");
  try {
    await mailmaskExchange(user.id, code, st.v);
  } catch (e: any) {
    console.error("[mailmask] callback:", e?.message ?? e);
    return back("error");
  }
  if (!st.d) return back("connected");
  try {
    const r = await autoConfigureDomainDns(st.d, user.id);
    return back(r.verified ? "configured" : "written");
  } catch (e: any) {
    console.error("[mailmask] auto-configure:", e?.message ?? e);
    return back(/no está en tu cuenta de Mailmask/.test(String(e?.message)) ? "nozone" : "error");
  }
}
