import type { Route } from "./+types/blog-read";
import { RateLimiter } from "~/.server/rateLimiter";
import {
  isBot,
  isKnownSlug,
  isValidViewId,
  recordView,
  updateView,
} from "~/.server/blog/postViews";

// Medición de lectura del blog. Dos intents: `open` al abrir el post, `close`
// cuando la pestaña se oculta (llega por sendBeacon).
//
// La ruta se llama `blog-read` y no `analytics` ni `telemetry` a propósito: los
// bloqueadores filtran por patrón de URL y esas dos palabras son las que buscan.
// Medir a quien nos lee no debería depender de esquivar nada, pero tampoco vale
// perder la mitad de los datos por el nombre del archivo.

const rl = new RateLimiter({ windowMs: 60_000, maxRequests: 60 });

const clientIp = (request: Request): string =>
  request.headers.get("x-forwarded-for")?.split(",")[0].trim() ||
  request.headers.get("x-real-ip") ||
  "unknown";

// Siempre 204: el cliente no hace nada con la respuesta, y un error visible en la
// consola de quien está leyendo un post es peor que un dato perdido.
const noContent = () => new Response(null, { status: 204 });

export async function action({ request }: Route.ActionArgs) {
  if (request.method !== "POST") return noContent();

  try {
    // Un rastreador no es un lector. Sin este filtro, el post más "leído" sería
    // el que más crawlearon.
    if (isBot(request.headers.get("user-agent"))) return noContent();

    const { allowed } = await rl.checkRateLimit(`blogread:${clientIp(request)}`);
    if (!allowed) return noContent();

    const body = await request.json().catch(() => null);
    if (!body || !isValidViewId(body.viewId)) return noContent();

    if (body.intent === "open") {
      // Un slug inventado no crea fila: nadie infla la tabla desde fuera.
      if (!(await isKnownSlug(body.slug))) return noContent();
      await recordView({
        viewId: body.viewId,
        slug: body.slug,
        lang: body.lang,
        referrer: body.referrer,
        selfHost: request.headers.get("host") ?? undefined,
      });
      return noContent();
    }

    if (body.intent === "close") {
      await updateView({
        viewId: body.viewId,
        seconds: body.seconds,
        depth: body.depth,
        completed: body.completed,
      });
      return noContent();
    }

    return noContent();
  } catch (error) {
    console.error("blog-read:", error);
    return noContent();
  }
}
