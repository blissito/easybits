import type { Route } from "./+types/fleet-agents.$fleetAgentId.message-stream";
import { authFleetAgent, type FleetAuthResult } from "~/.server/apiAuth";
import { corsForFleetAuth } from "~/.server/core/fleetCors";
import { withAdmitRetry } from "~/.server/core/fleetAdmitHold";
import { db } from "~/.server/db";
import { routeMessage, FleetAgentAtCapacity, FleetAgentRateLimited } from "~/.server/core/fleetAgentOperations";
import { checkFleetAgentWebIp, checkFleetTokenRate } from "~/.server/rateLimiter";
import { getUserOrNull } from "~/.server/getters";

// POST /api/v2/fleet-agents/:fleetAgentId/message-stream
//
// Streaming twin of /message for WEB channels (denik widget / admin assistant).
// Same auth (fleetAgent bearer token) and body, but responds SSE so the browser sees
// the reply token-by-token. Emits:
//   data: {"type":"chunk","value":"..."}   (live preview, best-effort)
//   data: {"type":"done","value":"<full>"} (authoritative final reply)
//   data: {"type":"error","message":"..."}
// The `done.value` is the full reply returned by routeMessage — clients should
// treat it as authoritative (it stays correct even if a dead-box self-heal retry
// re-emitted some chunks mid-stream).
const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Authorization, Content-Type",
};

export async function loader({ request, params }: Route.LoaderArgs) {
  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS });
  // GET ?groupId=… → historial persistido de la conversación (mismo store que los
  // canales, FleetAgentMessage). Lo usa el drawer de prueba para NO perder el hilo
  // al cerrar/reabrir. Auth = mismo bearer que el POST (token del agente).
  const url = new URL(request.url);
  const groupId = url.searchParams.get("groupId") ?? "";
  if (!groupId) return Response.json({ error: "Method not allowed" }, { status: 405, headers: CORS });
  const fleetAgentId = params.fleetAgentId!;
  try {
    await authFleetAgent(request, fleetAgentId, "MESSAGE", { allowFormmySecret: true });
  } catch {
    return Response.json({ error: "Unauthorized" }, { status: 401, headers: CORS });
  }
  const rows = await db.fleetAgentMessage.findMany({
    where: { fleetAgentId, groupId },
    orderBy: { createdAt: "asc" },
    take: 200,
    select: { role: true, text: true, createdAt: true },
  });
  return Response.json({ messages: rows }, { headers: CORS });
}

export async function action({ request, params }: Route.ActionArgs) {
  const fleetAgentId = params.fleetAgentId!;
  // Mandar un turno exige sólo MESSAGE (ver fleet-agents.$fleetAgentId.message.ts).
  let auth: FleetAuthResult;
  try {
    auth = await authFleetAgent(request, fleetAgentId, "MESSAGE", { allowFormmySecret: true });
  } catch (e) {
    const status = e instanceof Response ? e.status : 401;
    return Response.json({ error: status === 403 ? "Forbidden" : "Unauthorized" }, { status, headers: CORS });
  }
  const byFormmy = auth.kind === "formmySecret";
  const cors = corsForFleetAuth(request, auth, CORS);

  // Guard por-TOKEN: una llave filtrada se usa desde muchas IPs, así que el tope por
  // IP no la frena. Va antes del de IP para que el 429 identifique a la credencial.
  if (auth.tokenId && !(await checkFleetTokenRate(auth.tokenId))) {
    return Response.json(
      { error: "rate_limited", message: "Too many requests for this token." },
      { status: 429, headers: { ...cors, "Retry-After": "30" } }
    );
  }
  // Guard por-IP: el groupId lo controla el cliente, rotarlo no debe saltar el cupo.
  if (!(await checkFleetAgentWebIp(request))) {
    return Response.json(
      { error: "rate_limited", message: "Too many requests, please slow down." },
      { status: 429, headers: { ...cors, "Retry-After": "30" } }
    );
  }

  const body = await request.json().catch(() => ({}));
  const groupId = typeof body?.groupId === "string" ? body.groupId : "";
  // A2A parts (FileParts + TextParts) — el canal GTeams entrega media uniformemente
  // por MIME. Extrae los FileParts a `files` y funde cualquier TextPart al texto.
  const parts: any[] = Array.isArray(body?.parts) ? body.parts : [];
  const files = parts
    .filter((p) => p?.kind === "file" && p?.file && typeof p.file.mimeType === "string" && (typeof p.file.uri === "string" || typeof p.file.bytes === "string"))
    .map((p) => ({
      name: typeof p.file.name === "string" ? p.file.name : undefined,
      mimeType: p.file.mimeType as string,
      uri: typeof p.file.uri === "string" ? p.file.uri : undefined,
      bytes: typeof p.file.bytes === "string" ? p.file.bytes : undefined,
    }));
  const partText = parts.filter((p) => p?.kind === "text" && typeof p.text === "string").map((p) => p.text).join("\n");
  const text = (typeof body?.text === "string" ? body.text : "") || partText;
  // Full media surface: an inbound image (native Claude vision — bytes dropped on
  // the worker's disk, agent opens with Read), audio (transcribed), or a plain
  // attachment URL. Slack-type clients send image/audio as base64. A message is
  // valid if it carries text OR any media — image-only (no caption) is allowed.
  const image =
    body?.image && typeof body.image?.base64 === "string" && typeof body.image?.ext === "string"
      ? { base64: body.image.base64, ext: body.image.ext, url: typeof body.image.url === "string" ? body.image.url : undefined }
      : undefined;
  const audio =
    body?.audio && typeof body.audio?.base64 === "string" && typeof body.audio?.mimeType === "string"
      ? { base64: body.audio.base64, mimeType: body.audio.mimeType }
      : undefined;
  const mediaUrl = typeof body?.mediaUrl === "string" ? body.mediaUrl : undefined;
  if (!groupId || (!text.trim() && !image && !audio && !mediaUrl && files.length === 0)) {
    return Response.json({ error: "groupId and (text or media) required" }, { status: 400, headers: cors });
  }
  // ADMIN turn: inject the admin MCP + note so the agent self-administers (numbers,
  // identity, capabilities, set_agent_prompt). Honored ONLY cuando el caller probó
  // ser DUEÑO: tiene el formmySecret (Ghosty) O una sesión web autenticada del owner
  // del agente (el drawer de prueba en /dash/flota). El token del widget público NUNCA
  // escala a admin — sin sesión + sin formmySecret = admin false.
  const sessionUser = body?.admin === true ? await getUserOrNull(request).catch(() => null) : null;
  const byOwnerSession = !!sessionUser && sessionUser.id === auth.fleetAgent.ownerId;
  const admin = body?.admin === true && (byFormmy || byOwnerSession);

  const encoder = new TextEncoder();
  const sse = (obj: unknown) => encoder.encode(`data: ${JSON.stringify(obj)}\n\n`);

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      // Heartbeat: en un cold spawn (~30-40s) routeMessage no emite chunks hasta que
      // el worker arranca; sin datos, un proxy idle puede matar el SSE → el agente
      // "no responde" en frío (el caso de blue/ghosty-gc). Un comentario SSE (`: ka`)
      // cada 15s mantiene viva la conexión — el cliente lo ignora (solo parsea `data:`).
      const heartbeat = setInterval(() => {
        try {
          controller.enqueue(encoder.encode(`: ka\n\n`));
        } catch {
          /* stream ya cerrado */
        }
      }, 15_000);
      try {
        const reply = await withAdmitRetry(() =>
          routeMessage(fleetAgentId, {
          groupId,
          // Config unit key estable por canal (Teams manda "teams", WABA "waba:<id>");
          // sin él cae al groupId (por conversación → solo el default `*`). Ver cfgId.
          // Un token atado a un tenant (`cfgId`) GANA sobre lo que mande el cliente.
          configGroupId:
            auth.cfgId ?? (typeof body?.configGroupId === "string" ? body.configGroupId : undefined),
          sender: typeof body?.sender === "string" ? body.sender : undefined,
          text,
          image,
          audio,
          files,
          mediaUrl,
          denikApiKey: typeof body?.denikApiKey === "string" ? body.denikApiKey : undefined,
          // BYOK del ENGINE por turno: la llave del proveedor con la que corre
          // el modelo. Es la llave del propio caller, así que sólo cambia a
          // quién le factura su proveedor — no da acceso a nada de esta
          // plataforma. `resolveEngineApiKey` ya la prefiere sobre
          // `groupEngineKeys` y sobre la horneada; faltaba dejarla entrar por HTTP.
          engineApiKey:
            typeof body?.engineApiKey === "string" ? body.engineApiKey : undefined,
          appendSystemPrompt:
            typeof body?.appendSystemPrompt === "string" ? body.appendSystemPrompt : undefined,
          // IANA timezone del tenant → localiza la fecha/hora fresca del turno.
          timezone: typeof body?.timezone === "string" ? body.timezone : undefined,
          admin,
        }, {
          onChunk: (value) => controller.enqueue(sse({ type: "chunk", value })),
          // `tool` lleva el ciclo COMPLETO: `phase:"start"` con el argumento corto y
          // `phase:"end"` con `ok` y `durationMs`. El worker mandaba las dos mitades
          // desde siempre; hasta ahora esta ruta tiraba todo menos el nombre, y el
          // consumidor no podía saber qué tardó ni qué falló sin cronometrar por fuera.
          onTool: (name, ev) =>
            controller.enqueue(
              sse({
                type: "tool",
                name,
                ...(ev
                  ? {
                      id: ev.id,
                      phase: ev.phase,
                      ...(ev.ok !== undefined ? { ok: ev.ok } : {}),
                      ...(ev.detail ? { detail: ev.detail } : {}),
                      ...(ev.durationMs !== undefined ? { durationMs: ev.durationMs } : {}),
                    }
                  : {}),
              })
            ),
          // Cierre contable del turno, ANTES de `done`: tokens, modelo, duración y
          // número de tools. Nombres alineados con las convenciones GenAI de OTel.
          onUsage: (u) => controller.enqueue(sse({ type: "usage", ...u })),
          })
        );
        controller.enqueue(sse({ type: "done", value: reply }));
      } catch (e) {
        // La saturación NO es un error del turno: es "vuelve a intentar". Emitirla como
        // `error` hacía que un cliente la tratara como fallo definitivo y perdiera el
        // mensaje; con `capacity` + retryAfter puede reintentar como hace Baileys.
        if (e instanceof FleetAgentAtCapacity) {
          controller.enqueue(
            sse({ type: "capacity", message: e.message, reason: e.reason, retryAfter: 10 })
          );
        } else {
          const message =
            e instanceof FleetAgentRateLimited
              ? e.message
              : e instanceof Error
                ? e.message
                : "fleetAgent error";
          controller.enqueue(sse({ type: "error", message }));
        }
      } finally {
        clearInterval(heartbeat);
        controller.close();
      }
    },
  });

  return new Response(stream, {
    status: 200,
    headers: {
      ...cors,
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
