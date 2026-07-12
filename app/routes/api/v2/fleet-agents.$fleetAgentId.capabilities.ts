import type { Route } from "./+types/fleet-agents.$fleetAgentId.capabilities";
import { db } from "~/.server/db";
import {
  mergedCapabilities,
  DEFAULT_MCP_CATALOG,
  CURATED_CAPABILITIES,
  FLEET_DEFAULT_MODEL,
  FLEET_DEFAULT_EFFORT,
  fleetSkills,
  type GroupConfig,
  type McpCatalogEntry,
} from "~/.server/core/fleetAgentOperations";
import { FLEET_BUCKETS, GROUP_ALLOWLISTS, bucketsToToolsParam, toolsParamToBuckets, type ToolGroupKey } from "~/.server/mcp/toolGroups";
import { createSecret, listSecrets } from "~/.server/core/secretOperations";

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
//     add-mcp          { name, label?, pkg?|url?, requiredSecret?, envVar? }
//     remove-mcp       { name }
//     toggle-skill     { skillId, on }
//     delete-skill     { skillId }

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
  // Picker de Archivos = SEARCH-DRIVEN (ligero). NO cargamos 200 archivos (siiqtec
  // tiene 1400+ COT-*.pdf → lista inútil y pesada). Devolvemos SIEMPRE los archivos
  // SELECCIONADOS (para que se vean marcados) + los que matcheen `?q=` (búsqueda
  // server-side, cap 40). Sin `q` y sin selección → lista vacía + el buscador.
  const q = (new URL(request.url).searchParams.get("q") || "").trim();
  const selectedIds = [
    ...new Set(
      Object.values(cfgs(fa)).flatMap((g) => (g as GroupConfig).assets ?? [])
    ),
  ];
  const [matchFiles, selectedFiles, ownerDbs] = await Promise.all([
    q
      ? db.file.findMany({ where: { ownerId: fa.ownerId, access: "public", status: { not: "DELETED" }, name: { contains: q, mode: "insensitive" } }, select: { id: true, name: true, contentType: true }, orderBy: { createdAt: "desc" }, take: 40 }).catch(() => [])
      : Promise.resolve([]),
    selectedIds.length
      ? db.file.findMany({ where: { id: { in: selectedIds }, ownerId: fa.ownerId, status: { not: "DELETED" } }, select: { id: true, name: true, contentType: true } }).catch(() => [])
      : Promise.resolve([]),
    db.database.findMany({ where: { userId: fa.ownerId }, select: { name: true, namespace: true }, orderBy: { createdAt: "desc" } }).catch(() => []),
  ]);
  const seen = new Set(matchFiles.map((f) => f.id));
  const ownerFiles = [...selectedFiles.filter((f) => !seen.has(f.id)), ...matchFiles];
  // Agent-level config (persona/model/effort/buckets) — the fields GTeams ports to
  // give any agent the same panel. Buckets default = groupConfigs["*"] then persona env.
  const persona = ((fa.persona ?? {}) as { env?: Record<string, string> });
  const env = persona.env ?? {};
  const groupCfgs = cfgs(fa);
  const bucketsParam = groupCfgs["*"]?.toolGroup ?? env.EASYBITS_TOOL_GROUP;
  return json({
    builtins: DEFAULT_MCP_CATALOG.map((e) => ({ name: e.name, label: e.label ?? e.name, channel: e.channel ?? null, bucketScoped: !!e.bucketScoped })),
    capabilities,
    secretsPresent: [...secretNames],
    groups: groupCfgs,
    ownerFiles,
    ownerDbs,
    agent: {
      systemPrompt: env.SYSTEM_PROMPT ?? "",
      // Model lever REAL por template (no inventado): ghosty-gc usa GHOSTY_LLM
      // (deepseek/easybits), codex-worker usa CODEX_MODEL (Codex/OpenAI), el resto
      // ANTHROPIC_MODEL (Claude). El valor es el efectivo (override o default).
      workerTemplate: fa.workerTemplate,
      model:
        fa.workerTemplate === "ghosty-gc"
          ? (env.GHOSTY_LLM ?? "deepseek")
          : fa.workerTemplate === "codex-worker"
          ? (env.CODEX_MODEL ?? "gpt-5.6-sol")
          : (env.ANTHROPIC_MODEL ?? FLEET_DEFAULT_MODEL),
      modelLabel: fa.workerTemplate === "ghosty-gc" ? "Cerebro (LLM)" : "Modelo",
      effort: env.FLEET_EFFORT ?? FLEET_DEFAULT_EFFORT,
      hasOwnNumber: !!fa.hasOwnNumber,
      buckets: [...toolsParamToBuckets(bucketsParam)],
    },
    // Opciones de modelo REALES para ESTE template (fuente = levers del dash).
    models: fa.workerTemplate === "ghosty-gc"
      ? [
          { key: "deepseek", label: "DeepSeek — tu key (off-meter)" },
          { key: "easybits", label: "EasyBits — Claude medido" },
        ]
      : [
          { key: "claude-sonnet-5", label: "Sonnet 5 (equilibrado)" },
          { key: "claude-opus-4-8", label: "Opus 4.8 (máxima capacidad)" },
          { key: "claude-haiku-4-5-20251001", label: "Haiku 4.5 (rápido y barato)" },
        ],
    buckets: FLEET_BUCKETS.map((b) => ({
      key: b.key,
      label: b.label,
      description: b.description,
      admin: !!b.admin,
      // Buckets con niveles granulares (ej. db: lectura/escritura/borrado). Cada nivel
      // declara el SET de sub-buckets que activa → el cliente arma el ?tools= completo.
      levels: b.levels?.map((l) => ({ key: l.key, label: l.label, buckets: l.buckets })) ?? null,
    })),
    // Tools de CADA bucket key (incluidos los sub-buckets de nivel) → el cliente pinta
    // el checklist per-tool (default todo ON; destildar = deny). Se une por buckets activos.
    bucketTools: Object.fromEntries(
      [...new Set(FLEET_BUCKETS.flatMap((b) => [b.key, ...(b.levels?.flatMap((l) => l.buckets) ?? [])]))]
        .map((k) => [k, [...(GROUP_ALLOWLISTS[k as ToolGroupKey] ?? [])]] as const)
    ),
    efforts: ["low", "medium", "high", "xhigh"],
    skills: fleetSkills(fa).map((s) => ({ id: s.id, name: s.name, description: s.description, enabled: s.enabled !== false, fileCount: (s.files ?? []).length })),
    customMcps: mergedCapabilities(fa).filter((e) => !e.builtin && !CURATED_CAPABILITIES.some((c) => c.name === e.name)).map((e) => ({ name: e.name, label: e.label ?? e.name, transport: e.transport ?? "stdio", requiredSecrets: e.requiredSecrets ?? [] })),
  });
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

  // ── Agent-level actions (no groupId): persona / model / effort / catalog / skills ──
  const persona = ((fa.persona ?? {}) as { env?: Record<string, string> });
  const setEnv = async (patch: Record<string, string | undefined>) => {
    const env = { ...(persona.env ?? {}) };
    for (const [k, v] of Object.entries(patch)) { if (v) env[k] = v; else delete env[k]; }
    await db.fleetAgent.update({ where: { id: fa.id }, data: { persona: { ...persona, env } as object } });
  };

  if (action === "set-agent-prompt") {
    await setEnv({ SYSTEM_PROMPT: String(b?.systemPrompt ?? "").slice(0, 120000) || undefined });
    return json({ ok: true });
  }
  if (action === "set-model") {
    // El lever REAL depende del template: ghosty-gc = GHOSTY_LLM (deepseek/easybits),
    // el resto = ANTHROPIC_MODEL (Claude). Se escribe el campo correcto server-side.
    const model = String(b?.model ?? "").trim();
    if (fa.workerTemplate === "ghosty-gc") {
      if (model && !["deepseek", "easybits"].includes(model)) return json({ error: "cerebro inválido" }, 400);
      await setEnv({ GHOSTY_LLM: model || undefined });
    } else {
      if (model && !/^claude-/.test(model)) return json({ error: "modelo inválido" }, 400);
      await setEnv({ ANTHROPIC_MODEL: model || undefined });
    }
    return json({ ok: true });
  }
  if (action === "set-effort") {
    const effort = String(b?.effort ?? "").trim();
    if (effort && !["low", "medium", "high", "xhigh"].includes(effort)) return json({ error: "effort inválido" }, 400);
    await setEnv({ FLEET_EFFORT: effort || undefined });
    return json({ ok: true });
  }
  if (action === "toggle-own-number") {
    await db.fleetAgent.update({ where: { id: fa.id }, data: { hasOwnNumber: !!b?.on } });
    return json({ ok: true });
  }
  if (action === "add-mcp") {
    const name = String(b?.name ?? "").trim().toLowerCase().replace(/[^a-z0-9_-]/g, "");
    const label = String(b?.label ?? "").trim() || name;
    const pkg = String(b?.pkg ?? "").trim();
    const url = String(b?.url ?? "").trim();
    const secretName = String(b?.requiredSecret ?? "").trim();
    const envVar = String(b?.envVar ?? "").trim() || secretName;
    if (!name) return json({ error: "nombre requerido" }, 400);
    if (CURATED_CAPABILITIES.some((e) => e.name === name)) return json({ error: "ese nombre es una capacidad incluida" }, 400);
    const catalog = (fa.mcpCatalog as McpCatalogEntry[] | null) ?? [];
    if (catalog.some((e) => e.name === name)) return json({ error: "ya existe ese MCP" }, 400);
    if (!pkg && !url) return json({ error: "da un paquete npm (stdio) o una URL (http)" }, 400);
    if (secretName && !/^[A-Z_][A-Z0-9_]*$/.test(secretName)) return json({ error: "el secret debe ser MAYÚSCULAS_CON_GUION_BAJO" }, 400);
    const cenv = secretName ? { [envVar]: `$secret:${secretName}` } : undefined;
    const entry: McpCatalogEntry = url
      ? { name, label, transport: "http", url, ...(cenv ? { env: cenv } : {}), ...(secretName ? { requiredSecrets: [secretName] } : {}) }
      : { name, label, transport: "stdio", command: "npx", args: ["-y", pkg], ...(cenv ? { env: cenv } : {}), ...(secretName ? { requiredSecrets: [secretName] } : {}) };
    await db.fleetAgent.update({ where: { id: fa.id }, data: { mcpCatalog: [...catalog, entry] } });
    return json({ ok: true });
  }
  if (action === "remove-mcp") {
    const name = String(b?.name ?? "");
    if (CURATED_CAPABILITIES.some((e) => e.name === name)) return json({ error: "no se puede quitar una capacidad incluida" }, 400);
    const catalog = (fa.mcpCatalog as McpCatalogEntry[] | null) ?? [];
    const target = catalog.find((e) => e.name === name);
    if (!target) return json({ error: "no existe" }, 404);
    if (target.builtin) return json({ error: "no se puede quitar un MCP builtin" }, 400);
    const configs = cfgs(fa);
    for (const jid of Object.keys(configs)) {
      const list = configs[jid].mcpServers;
      if (list?.includes(name)) configs[jid] = { ...configs[jid], mcpServers: list.filter((n) => n !== name) };
    }
    await db.fleetAgent.update({ where: { id: fa.id }, data: { mcpCatalog: catalog.filter((e) => e.name !== name), groupConfigs: configs } });
    return json({ ok: true });
  }
  if (action === "toggle-skill") {
    const skillId = String(b?.skillId ?? "");
    const skills = fleetSkills(fa).map((s) => (s.id === skillId ? { ...s, enabled: !!b?.on } : s));
    await db.fleetAgent.update({ where: { id: fa.id }, data: { skills } });
    return json({ ok: true });
  }
  if (action === "delete-skill") {
    const skillId = String(b?.skillId ?? "");
    const skills = fleetSkills(fa).filter((s) => s.id !== skillId);
    await db.fleetAgent.update({ where: { id: fa.id }, data: { skills } });
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
  } else if (action === "set-db-allow") {
    // Scope del bucket DB: qué namespaces puede tocar el agente. [] / ausente = todas.
    // Se inyecta al prompt del turno (enforcement en el MCP db = follow-up).
    // Filtra vacíos/whitespace: un "" colado (toggle sin namespace) quedaba como
    // [""], que downstream era truthy y pisaba el wildcard con una allowlist vacía.
    const dbs = Array.isArray(b?.dbAllow)
      ? (b.dbAllow as unknown[]).map((s) => String(s)).filter((s) => s.trim())
      : [];
    configs[groupId] = { ...cur, dbAllow: dbs };
  } else if (action === "set-toolgroup") {
    // EasyBits tool buckets for this group (GTeams uses "*" = agent default). Touching
    // buckets IS the easybits surface → re-enable the easybits builtin for this group.
    const inherit = !!b?.inherit;
    const list = Array.isArray(b?.buckets) ? (b.buckets as unknown[]).map((s) => String(s)) : [];
    const disabled = (cur.disabledBuiltins ?? []).filter((n) => n !== "easybits");
    configs[groupId] = { ...cur, toolGroup: inherit ? undefined : bucketsToToolsParam(list), disabledBuiltins: disabled };
  } else if (action === "set-tool-deny") {
    // Per-tool: `on:false` = destildar = DENY esa tool; `on:true` = re-permitir (quitar del deny).
    const tool = String(b?.tool ?? "").trim();
    if (!tool) return json({ error: "tool required" }, 400);
    const set = new Set(cur.toolDeny ?? []);
    if (b?.on) set.delete(tool); else set.add(tool);
    configs[groupId] = { ...cur, toolDeny: [...set] };
  } else {
    return json({ error: "unknown action" }, 400);
  }

  await db.fleetAgent.update({ where: { id: fa.id }, data: { groupConfigs: configs } });
  return json({ ok: true });
}
