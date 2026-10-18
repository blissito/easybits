import type { Route } from "./+types/receive";
import { appendInboxEvent, inboxByToken, keepHeaders, INBOX_BODY_MAX } from "~/.server/core/inboxOperations";
import { applyRateLimit } from "~/.server/rateLimiter";

// Receptor público de un buzón de eventos: POST/PUT /hooks/<token> con cualquier cuerpo. El token
// es la única autorización para escribir. Ruta de RECURSO: sin `export default` a propósito (con
// componente, React Router serviría el shell de la SPA con 200).

const help = () =>
  Response.json({ error: "Este es un buzón de EasyBits: manda los eventos con POST (cualquier cuerpo, hasta 256 KB)." }, { status: 405, headers: { Allow: "POST, PUT" } });

export async function loader() {
  return help();
}

export async function action({ request, params }: Route.ActionArgs) {
  if (request.method !== "POST" && request.method !== "PUT") return help();
  const limited = await applyRateLimit(request);
  if (limited) return limited;
  const inbox = await inboxByToken(params.token ?? "");
  if (!inbox) return Response.json({ error: "Buzón no encontrado" }, { status: 404 });
  const declared = Number(request.headers.get("content-length") ?? 0);
  if (declared > INBOX_BODY_MAX) return Response.json({ error: "El cuerpo pasa de 256 KB" }, { status: 413 });
  const body = await request.text();
  try {
    const { seq } = await appendInboxEvent(inbox, {
      source: "http",
      method: request.method,
      contentType: request.headers.get("content-type"),
      headers: keepHeaders(request.headers),
      body,
    });
    return Response.json({ ok: true, seq }, { status: 202 });
  } catch (e) {
    if (e instanceof Response) return e;
    throw e;
  }
}
