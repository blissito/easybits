import type { Route } from "./+types/fleet-agents.$fleetAgentId.capabilities";
import { db } from "~/.server/db";
import {
  mergedCapabilities,
  DEFAULT_MCP_CATALOG,
  CURATED_CAPABILITIES,
  type GroupConfig,
} from "~/.server/core/fleetAgentOperations";
import { createSecret, listSecrets } from "~/.server/core/secretOperations";

// API-first capability config for a FleetAgent. Both the EasyBits dashboard AND
// the external "Slack-type" app configure agents through THIS surface — the UI is
// just one client. Auth = fleetAgent.token (owner-trusted bearer). GET returns the
// catalog + per-channel state; POST applies one mutation.
//
//   GET  → { builtins, capabilities, secretsPresent, groups: {id: config} }
//   POST { action, groupId, ... }
//     set-cap-level   { cap, level: off|read|write }
//     toggle-builtin  { builtin, on }
//     set-prompt      { systemPrompt }
//     toggle-asset    { fileId, on }
//     set-secret      { name, value }   (owner vault; no groupId)

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

const cfgs = (fa: { groupConfigs?: unknown }) =>
  ({ ...((fa.groupConfigs as Record<string, GroupConfig> | null) ?? {}) });

export async function loader({ request, params }: Route.LoaderArgs) {
  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS });
  const fa = await auth(request, params.fleetAgentId!);
  if (!fa) return json({ error: "Unauthorized" }, 401);
  const secretNames = new Set((await listSecrets(fa.ownerId).catch(() => [])).map((s) => s.name));
  const capabilities = mergedCapabilities(fa)
    .filter((e) => !e.builtin)
    .map((e) => ({
      name: e.name,
      label: e.label ?? e.name,
      mode: e.mode ?? "mcp",
      requiredSecrets: e.requiredSecrets ?? [],
      secretFields: e.secretFields ?? {},
      secretsPresent: (e.requiredSecrets ?? []).every((n) => secretNames.has(n)),
      // Access levels declared by the connector (Off implicit). null = simple on/off.
      levels: e.toolsets?.levels?.map((l) => ({ key: l.key, label: l.label })) ?? null,
      curated: CURATED_CAPABILITIES.some((c) => c.name === e.name),
    }));
  // On-demand (pesado): archivos públicos + bases del owner — para el picker de
  // Archivos y el scope DB. Se cargan al ABRIR el modal, no en la lista/poll.
  // Los archivos SELECCIONADOS (en cualquier canal, incl. el default "*") se unen
  // SIEMPRE aunque caigan fuera del top-200 → un asset adjunto viejo se ve marcado,
  // no como "N seleccionados" con la lista vacía.
  const selectedIds = [
    ...new Set(
      Object.values(cfgs(fa)).flatMap((g) => (g as GroupConfig).assets ?? [])
    ),
  ];
  const [recentFiles, selectedFiles, ownerDbs] = await Promise.all([
    db.file.findMany({ where: { ownerId: fa.ownerId, access: "public", status: { not: "DELETED" } }, select: { id: true, name: true, contentType: true }, orderBy: { createdAt: "desc" }, take: 200 }).catch(() => []),
    selectedIds.length
      ? db.file.findMany({ where: { id: { in: selectedIds }, ownerId: fa.ownerId, status: { not: "DELETED" } }, select: { id: true, name: true, contentType: true } }).catch(() => [])
      : Promise.resolve([]),
    db.database.findMany({ where: { userId: fa.ownerId }, select: { name: true, namespace: true }, orderBy: { createdAt: "desc" } }).catch(() => []),
  ]);
  const seen = new Set(recentFiles.map((f) => f.id));
  const ownerFiles = [...selectedFiles.filter((f) => !seen.has(f.id)), ...recentFiles];
  return json({
    builtins: DEFAULT_MCP_CATALOG.map((e) => ({ name: e.name, label: e.label ?? e.name })),
    capabilities,
    secretsPresent: [...secretNames],
    groups: cfgs(fa),
    ownerFiles,
    ownerDbs,
  });
}

export async function action({ request, params }: Route.ActionArgs) {
  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS });
  const fa = await auth(request, params.fleetAgentId!);
  if (!fa) return json({ error: "Unauthorized" }, 401);
  const b = await request.json().catch(() => ({}));
  const action = String(b?.action ?? "");
  const groupId = String(b?.groupId ?? "");

  // Owner-vault secret (no group). Used to configure a connector's credentials.
  if (action === "set-secret") {
    const name = String(b?.name ?? "");
    const value = String(b?.value ?? "");
    try {
      await createSecret(fa.ownerId, { name, value });
    } catch (e) {
      return json({ error: e instanceof Error ? e.message : "bad secret" }, 400);
    }
    return json({ ok: true });
  }

  if (!groupId) return json({ error: "groupId required" }, 400);
  const configs = cfgs(fa);
  const cur = configs[groupId] ?? {};

  if (action === "set-cap-level") {
    const cap = String(b?.cap ?? "");
    const level = String(b?.level ?? "");
    if (!mergedCapabilities(fa).some((e) => e.name === cap && !e.builtin)) return json({ error: "unknown capability" }, 400);
    const set = new Set(cur.mcpServers ?? []);
    const levels = { ...(cur.capLevels ?? {}) };
    if (level === "off") { set.delete(cap); delete levels[cap]; }
    else { set.add(cap); levels[cap] = level; }
    configs[groupId] = { ...cur, mcpServers: [...set], capLevels: levels };
  } else if (action === "toggle-builtin") {
    const builtin = String(b?.builtin ?? "");
    if (!DEFAULT_MCP_CATALOG.some((e) => e.name === builtin)) return json({ error: "unknown builtin" }, 400);
    const set = new Set(cur.disabledBuiltins ?? []);
    if (b?.on) set.delete(builtin); else set.add(builtin);
    configs[groupId] = { ...cur, disabledBuiltins: [...set] };
  } else if (action === "set-prompt") {
    const systemPrompt = String(b?.systemPrompt ?? "").slice(0, 8000);
    configs[groupId] = { ...cur, systemPrompt: systemPrompt || undefined };
  } else if (action === "toggle-asset") {
    const fileId = String(b?.fileId ?? "");
    const set = new Set(cur.assets ?? []);
    if (b?.on) set.add(fileId); else set.delete(fileId);
    configs[groupId] = { ...cur, assets: [...set] };
  } else {
    return json({ error: "unknown action" }, 400);
  }

  await db.fleetAgent.update({ where: { id: fa.id }, data: { groupConfigs: configs } });
  return json({ ok: true });
}
