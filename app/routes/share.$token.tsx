import { redirect } from "react-router";
import type { Route } from "./+types/share.$token";
import {
  verifyShareToken,
  buildShareCookie,
  type SharePermission,
} from "~/.server/shareLinks";

const REASON_MESSAGES: Record<string, string> = {
  invalid: "Este link no es válido.",
  expired: "Este link ha expirado.",
  revoked: "Este link fue revocado por el dueño.",
  not_found: "Este link ya no existe.",
};

function errorPage(reason: string) {
  const msg = REASON_MESSAGES[reason] || "No fue posible abrir este link.";
  return new Response(
    `<!doctype html><html lang="es"><head><meta charset="utf-8"><title>Link inválido — EasyBits</title>
    <style>body{font-family:system-ui,sans-serif;background:#fafafa;display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0;padding:24px}
    .card{max-width:480px;background:#fff;border:2px solid #000;border-radius:12px;padding:32px;box-shadow:6px 6px 0 #000}
    h1{margin:0 0 12px;font-size:20px}
    p{margin:0;color:#444;line-height:1.5}
    a{color:#9870ED;font-weight:600;text-decoration:none;display:inline-block;margin-top:16px}</style></head>
    <body><div class="card"><h1>Link no disponible</h1><p>${msg}</p>
    <a href="https://www.easybits.cloud">Ir a EasyBits</a></div></body></html>`,
    { status: 410, headers: { "Content-Type": "text/html; charset=utf-8" } }
  );
}

function dashPathFor(resourceType: string, resourceId: string): string {
  if (resourceType === "landing") return `/dash/landings4/${resourceId}`;
  return `/dash/documents/${resourceId}`;
}

function pdfPathFor(
  resourceType: string,
  resourceId: string,
  token: string,
  inline: boolean
): string {
  if (resourceType === "landing") {
    // Landings v4 don't have a built-in PDF endpoint yet; for now route to the editor.
    return `/dash/landings4/${resourceId}`;
  }
  const disp = inline ? "&inline=1" : "";
  return `/api/v2/documents/${resourceId}/pdf?token=${encodeURIComponent(token)}${disp}`;
}

export const loader = async ({ params }: Route.LoaderArgs) => {
  const token = params.token;
  if (!token) throw errorPage("invalid");

  const result = await verifyShareToken(token);
  if (!result.ok) throw errorPage(result.reason);

  const { link } = result;
  const permission = result.payload.perm as SharePermission;

  // view → inline PDF (read-only snapshot rendered server-side). download → PDF
  // as attachment. Neither needs the editor or a cookie session. Documents only
  // for v1; landings fall through to the editor cookie path.
  if ((permission === "view" || permission === "download") && link.resourceType === "document") {
    throw redirect(
      pdfPathFor(link.resourceType, link.resourceId, token, permission === "view")
    );
  }

  // edit (and landing view/download for now) → set cookie scoped to this share,
  // then land in the existing editor. The editor's loader has a fallback that
  // detects the cookie and renders as the resource owner without login.
  const target = dashPathFor(link.resourceType, link.resourceId);
  throw redirect(target, {
    headers: {
      "Set-Cookie": buildShareCookie(token, link.expiresAt),
    },
  });
};

export default function ShareTokenRoute() {
  return null;
}
