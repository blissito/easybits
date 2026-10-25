import type { Route } from "./+types/sites.$id.chat";
import { db } from "~/.server/db";
import { getUserOrNull } from "~/.server/getters";
import type { AuthContext } from "~/.server/apiAuth";
import { ensureBuilderAgent, getSite, siteGroupId, siteEngineFor } from "~/.server/core/siteOperations";
import { AppDraining, startSiteTurn, steerAgentTurn, subscribeSiteTurn, siteTurnStatus, TurnBusy, TERMINAL_TURN_EVENTS, type TurnEvent } from "~/.server/core/siteTurns.server";
import { engineIsMetered } from "~/lib/fleetEngines";
import { checkLLMTokenLimit } from "~/.server/llmTokenLimit";

// Chat del creador de sitios. Auth = sesión del dueño (el token del builder NUNCA
// baja al browser). El turno vive APARTE de la petición (siteTurns.server.ts): el POST lo
// arranca y se suscribe; si el navegador se va, el turno sigue y `GET ?attach=1` se
// re-engancha (snapshot + en vivo); `GET ?preview=1` dice si la vista previa de la caja ya responde. Eventos SSE: `chunk`, `tool`, `snapshot`, `done`,
// `error`, `capacity`, `interrupted`, `idle`. GET sin attach = historial + estado del turno.
async function ctxFor(request: Request) {
  const user = await getUserOrNull(request).catch(() => null);
  if (!user) throw Response.json({ error: "Unauthorized" }, { status: 401 });
  return { user, scopes: ["READ", "WRITE"] } as AuthContext;
}

/** SSE suscrito al turno del sitio; se cierra con el evento final o cuando el navegador se va. */
function turnStream(request: Request, groupId: string, snapshot: boolean) {
  const encoder = new TextEncoder();
  let unsubscribe: (() => void) | null = null;
  let heartbeat: ReturnType<typeof setInterval> | null = null;
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      let closed = false;
      const close = () => {
        if (closed) return;
        closed = true;
        unsubscribe?.();
        if (heartbeat) clearInterval(heartbeat);
        try { controller.close(); } catch { /* ya cerrado */ }
      };
      const send = (e: TurnEvent) => {
        if (closed) return;
        try { controller.enqueue(encoder.encode(`data: ${JSON.stringify(e)}\n\n`)); } catch { return close(); }
        if (TERMINAL_TURN_EVENTS.has(e.type) || e.type === "idle") close();
      };
      controller.enqueue(encoder.encode(`retry: 2000\n\n`));
      // Keep-alive: un cold spawn tarda ~30 s sin emitir nada.
      heartbeat = setInterval(() => {
        try { controller.enqueue(encoder.encode(`: ka\n\n`)); } catch { close(); }
      }, 15_000);
      unsubscribe = subscribeSiteTurn(groupId, send, { snapshot });
      request.signal.addEventListener("abort", close);
    },
    cancel() {
      unsubscribe?.();
      if (heartbeat) clearInterval(heartbeat);
    },
  });
  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}

export async function loader({ request, params }: Route.LoaderArgs) {
  const ctx = await ctxFor(request);
  const site = await getSite(ctx, params.id!);
  const q = new URL(request.url).searchParams;
  if (q.get("attach")) return turnStream(request, siteGroupId(site.id), true);
  if (q.get("preview")) {
    // ¿Ya responde la vista previa de la caja? El navegador no puede leer el status de otro origen.
    if (!site.previewUrl?.startsWith("https://")) return Response.json({ ready: false, previewUrl: site.previewUrl });
    const res = await fetch(site.previewUrl, { signal: AbortSignal.timeout(5000), redirect: "manual" }).catch(() => null);
    return Response.json({ ready: !!res && res.status < 400, previewUrl: site.previewUrl });
  }
  const engine = siteEngineFor(site);
  const builder = await ensureBuilderAgent(ctx, engine.id);
  const rows = await db.fleetAgentMessage.findMany({
    where: { fleetAgentId: builder.id, groupId: siteGroupId(params.id!) },
    orderBy: { createdAt: "asc" },
    take: 200,
    select: { role: true, text: true, createdAt: true },
  });
  // Saldo solo aplica al motor medido; BYOK paga a su proveedor.
  const lim = engineIsMetered(engine) ? await checkLLMTokenLimit(ctx.user.id) : null;
  const turn = await siteTurnStatus(siteGroupId(site.id));
  return Response.json({ messages: rows, tokens: lim ? { remaining: lim.remaining, limit: lim.limit } : null, ...turn });
}

export async function action({ request, params }: Route.ActionArgs) {
  const ctx = await ctxFor(request);
  const site = await getSite(ctx, params.id!);
  const engine = siteEngineFor(site);
  const builder = await ensureBuilderAgent(ctx, engine.id);
  const body = await request.json().catch(() => ({}));
  const text = typeof body?.text === "string" ? body.text.trim() : "";
  if (!text) return Response.json({ error: "text required" }, { status: 400 });
  // Gate ANTES del turno: sin saldo el proxy medido responde 402 dentro del worker,
  // pero para entonces ya se pagó un cold-spawn. Mejor cortar aquí con un mensaje claro.
  const lim = engineIsMetered(engine) ? await checkLLMTokenLimit(ctx.user.id) : null;
  if (lim && lim.remaining <= 0) {
    return Response.json(
      { error: "insufficient_quota", message: "Sin tokens LLM. Recarga un pack o sube de plan para seguir construyendo." },
      { status: 402 }
    );
  }
  const selection =
    body?.selection && typeof body.selection.id === "string" && typeof body.selection.tag === "string"
      ? { id: body.selection.id.slice(0, 80), tag: body.selection.tag.slice(0, 20) }
      : null;

  const image =
    body?.image && typeof body.image.base64 === "string" && /^(png|jpg|jpeg|webp)$/.test(body.image.ext ?? "")
      ? { base64: body.image.base64 as string, ext: body.image.ext as string }
      : undefined;
  if (image && image.base64.length > 7_000_000) {
    return Response.json({ error: "image_too_large", message: "La imagen supera 5 MB." }, { status: 413 });
  }
  // STEER: con un turno corriendo, el mensaje entra a ése (sin selección ni imagen: van
  // en el prompt del turno, no en el texto inyectado). Si el turno ya terminó, sigue como
  // turno normal.
  if (body?.steer === true && !image) {
    const r = await steerAgentTurn(siteGroupId(site.id), text);
    if (r === "injected") return Response.json({ steered: true }, { status: 202 });
    if (r !== "not_live") {
      return Response.json(
        { error: "steer_unavailable", message: r === "unsupported" ? "Este motor no recibe mensajes a media respuesta; espera a que termine." : "El agente está terminando en otro servidor; reintenta en unos segundos." },
        { status: 409 }
      );
    }
  }
  const continueTurnId = typeof body?.continueTurnId === "string" ? body.continueTurnId : undefined;
  try {
    await startSiteTurn(ctx, site, builder, {
      text,
      selection,
      image,
      turnId: typeof body?.turnId === "string" ? body.turnId : undefined,
      continueTurnId,
    });
  } catch (e) {
    if (e instanceof AppDraining) {
      return Response.json({ error: "draining", message: e.message }, { status: 503, headers: { "Retry-After": "3" } });
    }
    if (e instanceof TurnBusy) {
      return Response.json({ error: "turn_busy", message: e.message, activeTurnId: e.activeTurnId }, { status: 409 });
    }
    throw e;
  }
  // Suscribirse sin snapshot: el turno acaba de nacer y el navegador ya pintó su burbuja.
  return turnStream(request, siteGroupId(site.id), false);
}
