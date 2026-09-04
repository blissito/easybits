import type { Route } from "./+types/fleet-agents.$fleetAgentId.capabilities";
import { db } from "~/.server/db";
import { buildCapabilitiesView, applyCapabilityAction, cfgs } from "~/.server/core/fleetCapabilityActions";

// API-first capability config for a FleetAgent. Both the EasyBits dashboard AND
// the external "Slack-type" app configure agents through THIS surface — the UI is
// just one client. Auth = fleetAgent.token (owner-trusted bearer). GET returns the
// catalog + per-channel state; POST applies one mutation.
//
//   GET  → { builtins, capabilities, secretsPresent, groups, agent, buckets, models, skills, customMcps }
//   POST { action, groupId?, ... }
//     — per-group (need groupId; GTeams uses "*" = agent default) —
//     set-cap-level   { cap, level: off|read|write }
//     toggle-builtin  { builtin, on }
//     set-prompt      { systemPrompt }        (per-channel append, layer 3)
//     toggle-asset    { fileId, on }
//     set-toolgroup   { buckets: string[], inherit? }
//     — agent-level (no groupId) —
//     set-secret       { name, value }        (owner vault)
//     set-agent-prompt { systemPrompt }       (persona.env.SYSTEM_PROMPT, layer 2, all channels)
//     set-model        { model }
//     set-effort       { effort: low|medium|high|xhigh }
//     toggle-own-number{ on }
//     add-mcp          { name, label?, pkg?|url?, requiredSecret?, envVar? }  (http → Authorization: Bearer <secret>; stdio → env var)
//     remove-mcp       { name }
//     toggle-skill     { skillId, on }
//     delete-skill     { skillId }
//     recycle-box      {}                     (destruye cajas vivas/dormidas; próximo turno cold-spawn con env fresco)


const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Authorization, Content-Type",
};
const json = (b: unknown, status = 200) => Response.json(b, { status, headers: CORS });

async function auth(request: Request, fleetAgentId: string) {
  // Bearer del fleetAgent, por header (app externa) O `?token=` (el dashboard lo
  // pasa así porque useFetcher.load no manda headers). Mismo patrón que fleet-render.
  const bearer =
    request.headers.get("Authorization")?.replace(/^Bearer\s+/i, "") ||
    new URL(request.url).searchParams.get("token") ||
    "";
  const fleetAgent = await db.fleetAgent.findUnique({ where: { id: fleetAgentId } });
  if (!fleetAgent || !bearer || fleetAgent.token !== bearer) return null;
  return fleetAgent;
}


export async function loader({ request, params }: Route.LoaderArgs) {
  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS });
  const fa = await auth(request, params.fleetAgentId!);
  if (!fa) return json({ error: "Unauthorized" }, 401);
  return json(await buildCapabilitiesView(fa, new URL(request.url).searchParams.get("q")));
}

export async function action({ request, params }: Route.ActionArgs) {
  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS });
  const fa = await auth(request, params.fleetAgentId!);
  if (!fa) return json({ error: "Unauthorized" }, 401);

  // Subida directa de un entregable (multipart): sube un archivo PÚBLICO del owner y
  // lo adjunta al set de assets del grupo. Espeja el intent `upload-asset` del dash.
  if ((request.headers.get("content-type") || "").includes("multipart/form-data")) {
    const fd = await request.formData().catch(() => null);
    if (!fd || String(fd.get("action") || "") !== "upload-asset") return json({ error: "unknown action" }, 400);
    const file = fd.get("file");
    const groupId = String(fd.get("groupId") || "*");
    if (!(file instanceof File)) return json({ error: "no file" }, 400);
    const buf = Buffer.from(await file.arrayBuffer());
    const { getPlatformPublicClient, buildPublicAssetUrl } = await import("~/.server/storage");
    const { randomUUID } = await import("node:crypto");
    const safe = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
    const storageKey = `${fa.ownerId}/${randomUUID()}-${safe}`;
    const ctype = file.type || "application/octet-stream";
    await getPlatformPublicClient().putObject(storageKey, buf, ctype);
    const created = await db.file.create({
      data: { storageKey, slug: storageKey, name: file.name, size: buf.length, contentType: ctype, status: "DONE", url: buildPublicAssetUrl(storageKey), access: "public", ownerId: fa.ownerId, assetIds: [] },
      select: { id: true },
    });
    const configs = cfgs(fa);
    const cur = configs[groupId] ?? {};
    configs[groupId] = { ...cur, assets: [...new Set([...(cur.assets ?? []), created.id])] };
    await db.fleetAgent.update({ where: { id: fa.id }, data: { groupConfigs: configs } });
    return json({ ok: true, fileId: created.id, name: file.name });
  }

  const b = await request.json().catch(() => ({}));
  const { status, body } = await applyCapabilityAction(fa, b && typeof b === "object" ? b : {});
  return json(body, status);
}
