/**
 * Collaborative document editor (Tiptap + Yjs). Same token-auth surface as
 * /share/document/:token but mounts the REAL-TIME co-editing editor instead of
 * the canvas share editor. Embeddable (?embed=1 + allowedOrigins) → the GTeams
 * artifact panel iframes this.
 *
 * Only `edit` + document links land here. The loader does NOT spawn the collab
 * box (that's the client's /api/v2/collab/:token/room call) to keep page load fast.
 */
import { redirect } from "react-router";
import type { Route } from "./+types/collab.document.$token";
import { verifyShareToken, buildShareCookie, type SharePermission } from "~/.server/shareLinks";
import { db } from "~/.server/db";
import type { Section3 } from "~/lib/landing3/types";
import CollabDocumentEditor from "~/components/share/CollabDocumentEditor";

export const meta = () => [
  { title: "Editar documento — EasyBits" },
  { name: "robots", content: "noindex" },
];

export function headers({ loaderHeaders }: Route.HeadersArgs) {
  const csp = loaderHeaders.get("Content-Security-Policy");
  return csp ? { "Content-Security-Policy": csp } : {};
}

function errorPage(reason: string) {
  const msgs: Record<string, string> = {
    invalid: "Este link no es válido.",
    expired: "Este link ha expirado.",
    revoked: "Este link fue revocado por el dueño.",
    not_found: "Este link ya no existe.",
  };
  const msg = msgs[reason] || "No fue posible abrir este link.";
  return new Response(
    `<!doctype html><html lang="es"><head><meta charset="utf-8"><title>Link inválido — EasyBits</title>
    <style>body{font-family:system-ui,sans-serif;background:#fafafa;display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0;padding:24px}
    .card{max-width:480px;background:#fff;border:2px solid #000;border-radius:12px;padding:32px;box-shadow:6px 6px 0 #000}</style></head>
    <body><div class="card"><h1>Link no disponible</h1><p>${msg}</p></div></body></html>`,
    { status: 410, headers: { "Content-Type": "text/html; charset=utf-8" } },
  );
}

export const loader = async ({ params, request }: Route.LoaderArgs) => {
  const token = params.token;
  if (!token) throw errorPage("invalid");

  const embed = new URL(request.url).searchParams.get("embed") === "1";

  const result = await verifyShareToken(token);
  if (!result.ok) throw errorPage(result.reason);

  const { link } = result;
  const permission = result.payload.perm as SharePermission;
  if (link.resourceType !== "document" || permission !== "edit") {
    throw redirect(`/share/${token}`);
  }

  const landing = await db.landing.findUnique({ where: { id: link.resourceId } });
  if (!landing || landing.version !== 4) throw errorPage("not_found");

  const sections = (((landing.sections as unknown) as Section3[]) || []).filter(
    (s) => s.id !== "__grapes_css__",
  );

  const headers = new Headers();
  headers.append("Set-Cookie", buildShareCookie(token, link.expiresAt));
  if (embed && link.allowedOrigins.length > 0) {
    headers.set("Content-Security-Policy", `frame-ancestors ${link.allowedOrigins.join(" ")}`);
  }

  return new Response(
    JSON.stringify({ landingId: landing.id, sections, token, embed }),
    { headers: { ...Object.fromEntries(headers), "Content-Type": "application/json" } },
  );
};

export default function CollabDocumentRoute({ loaderData }: Route.ComponentProps) {
  const data = loaderData as {
    landingId: string;
    sections: Section3[];
    token: string;
    embed: boolean;
  };
  return <CollabDocumentEditor {...data} />;
}
