/**
 * Lightweight share editor for documents — invitee with `edit` permission lands here
 * instead of the full dash editor. Renders Canvas v3 + FloatingToolbar without the dash
 * shell, keeping the experience focused on editing.
 *
 * `view` and `download` permissions are NOT served here — they keep going to the PDF
 * pipeline via `/share/:token`.
 */
import { redirect } from "react-router";
import type { Route } from "./+types/share.document.$token";
import { verifyShareToken, buildShareCookie, type SharePermission } from "~/.server/shareLinks";
import { db } from "~/.server/db";
import type { Section3 } from "~/lib/landing3/types";
import DocumentShareEditor from "~/components/share/DocumentShareEditor";

export const meta = () => [
  { title: "Editar documento — EasyBits" },
  { name: "robots", content: "noindex" },
];

// RRv7 doesn't propagate loader Response headers to the document render (only
// Set-Cookie is merged). Forward the embed CSP (frame-ancestors) set in the loader.
export function headers({ loaderHeaders }: Route.HeadersArgs) {
  const csp = loaderHeaders.get("Content-Security-Policy");
  return csp ? { "Content-Security-Policy": csp } : {};
}

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

export const loader = async ({ params, request }: Route.LoaderArgs) => {
  const token = params.token;
  if (!token) throw errorPage("invalid");

  const embed = new URL(request.url).searchParams.get("embed") === "1";

  const result = await verifyShareToken(token);
  if (!result.ok) throw errorPage(result.reason);

  const { link } = result;
  const permission = result.payload.perm as SharePermission;

  if (link.resourceType !== "document" || permission !== "edit") {
    // Fall back to the regular share entry if this URL was reached with the wrong shape.
    throw redirect(`/share/${token}`);
  }

  const landing = await db.landing.findUnique({ where: { id: link.resourceId } });
  if (!landing || landing.version !== 4) throw errorPage("not_found");

  const owner = await db.user.findUnique({ where: { id: link.ownerId } });
  if (!owner) throw errorPage("not_found");

  const meta = (landing.metadata as Record<string, unknown> | null) || {};
  const format =
    (meta.format as { width?: number; height?: number } | undefined) ?? null;
  const theme = (meta.theme as string) || "minimal";
  const customColors =
    (meta.customColors as Record<string, string> | undefined) ?? null;

  const sections = (((landing.sections as unknown) as Section3[]) || []).filter(
    (s) => s.id !== "__grapes_css__"
  );

  // Refresh the share cookie so this tab can hit the persistence endpoint.
  const headers = new Headers();
  headers.append("Set-Cookie", buildShareCookie(token, link.expiresAt));

  // Embed mode: restrict which third-party origins may iframe this editor.
  // The persistence fetch runs same-origin inside the iframe, so frame-ancestors
  // (not CORS) is the control surface here. No allowedOrigins → not embeddable.
  if (embed && link.allowedOrigins.length > 0) {
    headers.set(
      "Content-Security-Policy",
      `frame-ancestors ${link.allowedOrigins.join(" ")}`
    );
  }

  return new Response(
    JSON.stringify({
      landingId: landing.id,
      landingName: landing.name,
      sections,
      theme,
      customColors,
      format: format && format.width && format.height ? format : null,
      ownerEmail: owner.email,
      token,
      expiresAt: link.expiresAt.toISOString(),
      embed,
    }),
    { headers: { ...Object.fromEntries(headers), "Content-Type": "application/json" } }
  );
};

export default function ShareDocumentRoute({ loaderData }: Route.ComponentProps) {
  const data = loaderData as {
    landingId: string;
    landingName: string;
    sections: Section3[];
    theme: string;
    customColors: Record<string, string> | null;
    format: { width: number; height: number } | null;
    ownerEmail: string;
    token: string;
    expiresAt: string;
    embed: boolean;
  };
  return <DocumentShareEditor {...data} />;
}
