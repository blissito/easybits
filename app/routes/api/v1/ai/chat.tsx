import { randomUUID } from "node:crypto";
import { askBittor } from "~/.server/core/bittor";
import { checkBittorRate } from "~/.server/rateLimiter";
import type { Route } from "./+types/chat";

// POST /api/v1/ai/chat — Bittor, la burbuja pública de la landing. Contrato que consume
// `useBittor`: body `{ message, history }` → `{ role: "assistant", content }`. El historial
// del navegador ya no se reenvía: la memoria vive en la conversación del FleetAgent, una por
// visitante (cookie `bittor_vid` → groupId `web-<uuid>`).
const COOKIE = "bittor_vid";
const MAX_CHARS = 2000;

const reply = (content: string, init: ResponseInit = {}, cookie?: string) =>
  Response.json(
    { role: "assistant", content },
    { ...init, headers: { ...(init.headers ?? {}), ...(cookie ? { "Set-Cookie": cookie } : {}) } }
  );

function visitorId(request: Request): { id: string; cookie?: string } {
  const raw = request.headers.get("cookie") ?? "";
  const m = raw.match(/(?:^|;\s*)bittor_vid=([0-9a-f-]{36})/);
  if (m) return { id: m[1] };
  const id = randomUUID();
  const secure = process.env.NODE_ENV === "production" ? "; Secure" : "";
  return { id, cookie: `${COOKIE}=${id}; Path=/api/v1/ai; Max-Age=${60 * 60 * 24 * 30}; HttpOnly; SameSite=Lax${secure}` };
}

export const action = async ({ request }: Route.ActionArgs) => {
  if (!(await checkBittorRate(request))) {
    return reply("Vas muy rápido 🙂 Espera unos minutos y me vuelves a preguntar.", {
      status: 429,
      headers: { "Retry-After": "120" },
    });
  }
  const body = await request.json().catch(() => ({}));
  const message = typeof body?.message === "string" ? body.message.trim() : "";
  if (!message) return Response.json({ error: "Mensaje requerido" }, { status: 400 });

  const visitor = visitorId(request);
  try {
    const out = await askBittor(visitor.id, message.slice(0, MAX_CHARS));
    return reply(out.content, {}, visitor.cookie);
  } catch (e) {
    console.error("[bittor]", e instanceof Error ? e.message : e);
    return reply(
      "Se me cruzaron los cables y no pude responder. Intenta de nuevo en un momento; la documentación está en https://www.easybits.cloud/docs.",
      { status: 502 },
      visitor.cookie
    );
  }
};
