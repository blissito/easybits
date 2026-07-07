import type { Route } from "./+types/fleet-agents.$fleetAgentId.message";
import { db } from "~/.server/db";
import { routeMessage, FleetAgentAtCapacity, FleetAgentRateLimited } from "~/.server/core/fleetAgentOperations";
import { checkFleetAgentWebIp } from "~/.server/rateLimiter";
import type { WabaConfig } from "~/.server/integrations/whatsapp/waba.server";
import { getUserOrNull } from "~/.server/getters";

// POST /api/v2/fleet-agents/:fleetAgentId/message
//
// The always-on Baileys SURFACE (nano) calls this per inbound WhatsApp group
// message. Auth = the fleetAgent's bearer token. WhatsApp is non-streaming, so we
// collect the worker's reply server-side and return it as JSON for the surface
// to send back to the group.
const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Authorization, Content-Type",
};

export async function loader({ request }: Route.LoaderArgs) {
  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS });
  return Response.json({ error: "Method not allowed" }, { status: 405, headers: CORS });
}

export async function action({ request, params }: Route.ActionArgs) {
  const fleetAgentId = params.fleetAgentId!;
  const bearer = request.headers.get("Authorization")?.replace(/^Bearer\s+/i, "") ?? "";
  const fleetAgent = await db.fleetAgent.findUnique({ where: { id: fleetAgentId } });
  // Two owner-level bearers authorize this route:
  //  - fleetAgent.token: the Baileys/web surface (denik widget, admin assistant).
  //  - wabaConfig.formmySecret: the secret Formmy already holds from the WABA
  //    connect. Ghosty reuses it to drive ADMIN turns — no new credential.
  const formmySecret = (fleetAgent?.wabaConfig as WabaConfig | null)?.formmySecret ?? "";
  const byToken = !!fleetAgent && !!bearer && bearer === fleetAgent.token;
  const byFormmy = !!fleetAgent && !!bearer && !!formmySecret && bearer === formmySecret;
  if (!byToken && !byFormmy) {
    return Response.json({ error: "Unauthorized" }, { status: 401, headers: CORS });
  }

  // Guard por-IP: el groupId lo controla el cliente, rotarlo no debe saltar el cupo.
  if (!(await checkFleetAgentWebIp(request))) {
    return Response.json(
      { error: "rate_limited", message: "Too many requests, please slow down." },
      { status: 429, headers: { ...CORS, "Retry-After": "30" } }
    );
  }

  const body = await request.json().catch(() => ({}));
  const groupId = typeof body?.groupId === "string" ? body.groupId : "";
  // A2A parts (FileParts + TextParts) — canal GTeams (ver message-stream). FileParts
  // → `files` (media por MIME); TextParts se funden al texto.
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
  // Full media surface (same as message-stream): inbound image → native vision,
  // audio → transcribed, mediaUrl → attachment. Valid if text OR any media.
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
    return Response.json({ error: "groupId and (text or media) required" }, { status: 400, headers: CORS });
  }
  // ADMIN turn: inject the admin MCP + note so the agent self-administers (numbers,
  // identity, capabilities, set_agent_prompt). Honored ONLY cuando el caller probó ser
  // DUEÑO: formmySecret (Ghosty) O sesión web autenticada del owner. Token de widget
  // público NUNCA escala a admin.
  const sessionUser = body?.admin === true ? await getUserOrNull(request).catch(() => null) : null;
  const byOwnerSession = !!sessionUser && !!fleetAgent && sessionUser.id === fleetAgent.ownerId;
  const admin = body?.admin === true && (byFormmy || byOwnerSession);

  // Rate-limit lives in routeMessage now (per (fleetAgent, group)) so it covers both
  // this HTTP surface and the in-process Baileys path. FleetAgentRateLimited → 429.
  try {
    const reply = await routeMessage(fleetAgentId, {
      groupId,
      // Config unit key (systemPrompt + mcps + toolBuckets): un canal manda un
      // configGroupId ESTABLE (WABA: "waba:<id>", Teams: "teams") para compartir
      // una config entre todas sus conversaciones. Sin él, cae al groupId (por
      // conversación → solo el default `*`). Ver cfgId en routeMessage.
      configGroupId: typeof body?.configGroupId === "string" ? body.configGroupId : undefined,
      sender: typeof body?.sender === "string" ? body.sender : undefined,
      text,
      image,
      audio,
      files,
      mediaUrl,
      // Web channels (denik admin) scope the org per turn instead of pre-registering
      // a groupKey; WhatsApp omits it and falls back to fleetAgent.groupKeys.
      denikApiKey: typeof body?.denikApiKey === "string" ? body.denikApiKey : undefined,
      // Per-org personalization (layer 3) appended to the fleetAgent persona by the worker.
      appendSystemPrompt:
        typeof body?.appendSystemPrompt === "string" ? body.appendSystemPrompt : undefined,
      admin,
    });
    return Response.json({ reply }, { headers: CORS });
  } catch (e) {
    if (e instanceof FleetAgentRateLimited) {
      return Response.json(
        { error: "rate_limited", message: e.message },
        { status: 429, headers: { ...CORS, "Retry-After": "10" } }
      );
    }
    if (e instanceof FleetAgentAtCapacity) {
      // Surface should queue/retry — no worker available right now.
      return Response.json(
        { error: "fleet_agent_at_capacity", message: e.message },
        { status: 503, headers: { ...CORS, "Retry-After": "10" } }
      );
    }
    return Response.json(
      { error: e instanceof Error ? e.message : "fleetAgent error" },
      { status: 502, headers: CORS }
    );
  }
}
