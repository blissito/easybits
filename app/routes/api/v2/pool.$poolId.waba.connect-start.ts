import type { Route } from "./+types/pool.$poolId.waba.connect-start";
import { db } from "~/.server/db";
import { getUserOrRedirect } from "~/.server/getters";
import { buildPopupUrl } from "~/.server/integrations/whatsapp/formmyPartner";

// POST /api/v2/pool/:poolId/waba/connect/start
//
// Starts the Embedded Signup flow for connecting a WhatsApp Business number to
// THIS pool. EasyBits doesn't run Meta's SDK in-house — Formmy hosts the popup
// (it holds the Meta App Secret). We return a popup URL signed with the easybits
// partner secret so Formmy verifies the opener is a legit partner. The browser
// opens it, listens for the postMessage `{ code, phoneNumberId, wabaId }`, and
// posts that to /waba/connect.
export async function action({ request, params }: Route.ActionArgs) {
  const user = await getUserOrRedirect(request);
  const pool = await db.pool.findUnique({ where: { id: params.poolId! } });
  if (!pool || pool.ownerId !== user.id) {
    return Response.json({ error: "Not found" }, { status: 404 });
  }

  // The popup posts back to THIS origin. Behind Fly's proxy TLS terminates
  // outside, so request.url may be http:// — take the real host + forwarded proto.
  const url = new URL(request.url);
  const proto = request.headers.get("x-forwarded-proto") || url.protocol.replace(/:$/, "");
  const host = request.headers.get("host") || url.host;
  const origin = `${proto}://${host}`;

  try {
    return Response.json({ popupUrl: buildPopupUrl(origin) });
  } catch (e) {
    // FORMMY_PARTNER_SECRET_EASYBITS not set, etc.
    return Response.json(
      { error: e instanceof Error ? e.message : "WABA connect not configured" },
      { status: 500 }
    );
  }
}

export async function loader() {
  return Response.json({ error: "Method not allowed" }, { status: 405 });
}
