// Lógica de /api/v2/fleet-agents/:id/capabilities, extraída de la ruta para que la
// misma operación sirva a REST (ruta), al dashboard y a las tools MCP
// (`fleet_agent_capabilities` / `fleet_agent_configure`). La ruta sólo autentica
// y serializa; aquí no hay Request ni Response.
import { db } from "~/.server/db";
import {
  mergedCapabilities,
  DEFAULT_MCP_CATALOG,
  CURATED_CAPABILITIES,
  FLEET_DEFAULT_EFFORT,
  fleetSkills,
  type GroupConfig,
  type McpCatalogEntry,
} from "~/.server/core/fleetAgentOperations";
import { FLEET_BUCKETS, GROUP_ALLOWLISTS, bucketsToToolsParam, toolsParamToBuckets, type ToolGroupKey } from "~/.server/mcp/toolGroups";
import { createSecret, listSecrets } from "~/.server/core/secretOperations";
import { getEngineForAgent, FLEET_ENGINES } from "~/lib/fleetEngines";

export type FleetAgentRow = NonNullable<Awaited<ReturnType<typeof db.fleetAgent.findUnique>>>;
export type CapabilityActionResult = { status: number; body: unknown };

export const CAPABILITY_ACTIONS = [
  "set-secret", "recycle-box", "set-agent-prompt", "set-name", "set-model", "set-effort", "set-engine",
  "connect-teams", "toggle-own-number", "add-mcp", "remove-mcp", "toggle-skill", "delete-skill", "add-skill",
  "set-cap-level", "toggle-builtin", "set-prompt", "toggle-asset", "set-db-allow", "set-toolgroup", "set-tool-deny",
] as const;
export type CapabilityAction = (typeof CAPABILITY_ACTIONS)[number];

/**
 * Acciones que exigen scope ADMIN. El criterio es: ¿puede esta acción sacar una
 * credencial del vault del dueño, meter código/servidor ajeno en el turno, o
 * destruir trabajo?
 *   - set-secret / add-mcp: escriben o leen credenciales (un MCP http lleva
 *     `Authorization: Bearer <secret>`, así que añadir uno es exfiltración).
 *   - remove-mcp / delete-skill: destructivas.
 *   - set-engine: cambia con qué credencial corre el motor.
 *   - recycle-box: destruye las cajas vivas del agente.
 * Todo lo demás (prompt, modelo, effort, capacidades por canal) es MANAGE.
 */
export const ADMIN_CAPABILITY_ACTIONS = new Set<string>([
  "set-secret",
  "add-mcp",
  "remove-mcp",
  "add-skill",
  "delete-skill",
  "set-engine",
  "recycle-box",
]);

export const isAdminCapabilityAction = (action: string): boolean =>
  ADMIN_CAPABILITY_ACTIONS.has(action);

const r = (body: unknown, status = 200): CapabilityActionResult => ({ status, body });

export const cfgs = (fa: { groupConfigs?: unknown }) =>
  ({ ...((fa.groupConfigs as Record<string, GroupConfig> | null) ?? {}) });

// GET: catálogo + estado por canal + config del agente. `qRaw` filtra el picker de archivos.
export async function buildCapabilitiesView(fa: FleetAgentRow, qRaw?: string | null) {
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
  const q = (qRaw || "").trim();
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
  // Modelo — FUENTE ÚNICA = registro de Motores (FLEET_ENGINES), igual que el dash.
  // El engine se desambigua por template+GHOSTY_LLM; su modelo vive en persona.env
  // [modelEnv] (ANTHROPIC_MODEL/DEEPSEEK_MODEL/CODEX_MODEL). Motores sin modelEnv
  // (easybits fijo) → sin opciones → el cliente oculta el selector.
  const engForModel = getEngineForAgent(fa.workerTemplate, env);
  const modelEnvKey = engForModel?.modelEnv;
  const currentModel = modelEnvKey ? (env[modelEnvKey] ?? engForModel?.defaultModel ?? "") : "";
  // Label real del modelo actual (no genérico): el label del modelo resuelto en el
  // registro, o el nombre del motor si su modelo es fijo (easybits/glm sin modelEnv).
  const currentModelLabel =
    (engForModel?.models ?? []).find((m) => m.id === currentModel)?.label ??
    engForModel?.label ??
    "Modelo";
  const modelOptions = modelEnvKey
    ? (engForModel?.models ?? []).filter((m) => m.ready !== false).map((m) => ({ key: m.id, label: m.label }))
    : [];
  // Llave del MOTOR (BYOK): qué secret del vault necesita el proveedor de ESTE
  // agente + si ya está guardada. El spawn la lee del vault del owner por nombre
  // (getSecretValue), así que el panel solo la pide y recicla la caja. `null` para
  // el motor `easybits` (medido, sin credencial) → el cliente oculta la sección.
  const engineSecret = engForModel?.secret
    ? {
        name: engForModel.secret.name,
        kind: engForModel.secret.kind,
        placeholder: engForModel.secret.placeholder ?? "",
        present: secretNames.has(engForModel.secret.name),
      }
    : null;
  return ({
    builtins: DEFAULT_MCP_CATALOG.map((e) => ({ name: e.name, label: e.label ?? e.name, channel: e.channel ?? null, bucketScoped: !!e.bucketScoped })),
    capabilities,
    secretsPresent: [...secretNames],
    engineSecret,
    groups: groupCfgs,
    // Canales configurables del agente (para la UI): el canal WEB (burbujas en
    // landings) es SIEMPRE ofrecido bajo la clave estable "web" — su config
    // (prompt/tools per-canal via las acciones set-* con groupId:"web") aplica a
    // todas las burbujas. + los grupos WhatsApp/WABA/teams ya configurados.
    channels: [
      { key: "web", type: "web", label: "Canal web (burbuja)" },
      ...Object.keys(groupCfgs)
        .filter((k) => k !== "*" && k !== "web")
        .map((k) => ({
          key: k,
          type: k.startsWith("waba:") ? "waba" : k === "teams" ? "teams" : "whatsapp",
          label: k,
        })),
    ],
    ownerFiles,
    ownerDbs,
    agent: {
      systemPrompt: env.SYSTEM_PROMPT ?? "",
      // Modelo efectivo del agente (registry-driven, ver arriba). "" si el motor no
      // tiene modelo seleccionable (easybits) → el cliente oculta el selector.
      workerTemplate: fa.workerTemplate,
      model: currentModel,
      modelLabel: currentModelLabel,
      effort: env.FLEET_EFFORT ?? FLEET_DEFAULT_EFFORT,
      hasOwnNumber: !!fa.hasOwnNumber,
      buckets: [...toolsParamToBuckets(bucketsParam)],
    },
    // Opciones de modelo del proveedor (fuente única = FLEET_ENGINES). Vacío = sin
    // selector (motor de modelo fijo). Claude: Opus/Fable/Sonnet; DeepSeek: V4 Pro/
    // Flash; Codex: Sol/Terra/Luna.
    models: modelOptions,
    // Motor actual + catálogo de motores (para el selector de engine en la UI). El
    // motor define el worker (Claude/DeepSeek/Codex) → cambiarlo recicla la box.
    engine: engForModel?.id ?? null,
    engines: FLEET_ENGINES.map((e) => ({
      id: e.id,
      label: e.label,
      model: e.model,
      ready: e.models.some((m) => m.ready !== false),
    })),
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
    efforts: ["low", "medium", "high", "xhigh", "max"],
    skills: fleetSkills(fa).map((s) => ({ id: s.id, name: s.name, description: s.description, enabled: s.enabled !== false, fileCount: (s.files ?? []).length })),
    customMcps: mergedCapabilities(fa).filter((e) => !e.builtin && !CURATED_CAPABILITIES.some((c) => c.name === e.name)).map((e) => ({ name: e.name, label: e.label ?? e.name, transport: e.transport ?? "stdio", requiredSecrets: e.requiredSecrets ?? [] })),
  });
}

// POST { action, groupId?, ... }: aplica UNA mutación. Devuelve { status, body };
// la ruta lo serializa tal cual y la tool MCP lo mapea a ok()/fail().
export async function applyCapabilityAction(fa: FleetAgentRow, b: Record<string, unknown>): Promise<CapabilityActionResult> {
  const action = String(b?.action ?? "");
  const groupId = String(b?.groupId ?? "");

  // Owner-vault secret (no group). Used to configure a connector's credentials.
  if (action === "set-secret") {
    const name = String(b?.name ?? "");
    const value = String(b?.value ?? "");
    try {
      await createSecret(fa.ownerId, { name, value });
    } catch (e) {
      return r({ error: e instanceof Error ? e.message : "bad secret" }, 400);
    }
    return r({ ok: true });
  }

  // Recicla las cajas vivas del agente para que un cambio spawn-baked (típicamente
  // la llave del motor recién guardada con set-secret) aplique YA — sin esperar al
  // reaper. El próximo turno cold-spawnea con el env nuevo.
  if (action === "recycle-box") {
    const { recycleFleetAgentBoxes } = await import(
      "~/.server/core/fleetAgentOperations"
    );
    const res = await recycleFleetAgentBoxes(fa).catch(() => ({ recycled: 0 }));
    return r({ ok: true, ...res });
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
    return r({ ok: true });
  }
  if (action === "set-name") {
    // Renombrar = DOS campos: fleetAgent.assistantName (baileys lo antepone como
    // prefijo cuando hasOwnNumber=false) Y persona.env.ASSISTANT_NAME (identidad que
    // el worker inyecta en el system prompt). Tocar solo uno deja "Ghosty:" pegado.
    // Actualiza también la columna `name` (display en /dash/flota). Ver CLAUDE.md.
    const name = String(b?.name ?? "").trim().slice(0, 120);
    if (!name) return r({ error: "name required" }, 400);
    const env = { ...(persona.env ?? {}), ASSISTANT_NAME: name };
    await db.fleetAgent.update({
      where: { id: fa.id },
      data: { name, assistantName: name, persona: { ...persona, env } as object },
    });
    return r({ ok: true });
  }
  if (action === "set-model") {
    // Registry-driven (misma lógica que el dash): el engine (desambiguado por template+
    // GHOSTY_LLM) define modelEnv y la lista de modelos ready. Se escribe persona.env
    // [modelEnv] (ANTHROPIC_MODEL / DEEPSEEK_MODEL / CODEX_MODEL).
    const model = String(b?.model ?? "").trim();
    const eng = getEngineForAgent(fa.workerTemplate, persona.env);
    if (!eng?.modelEnv) return r({ error: "este motor no permite cambiar de modelo" }, 400);
    if (model && !eng.models.some((m) => m.id === model && m.ready !== false)) {
      return r({ error: "modelo no disponible" }, 400);
    }
    await setEnv({ [eng.modelEnv]: model || undefined });
    return r({ ok: true });
  }
  if (action === "set-effort") {
    const effort = String(b?.effort ?? "").trim();
    if (effort && !["low", "medium", "high", "xhigh", "max"].includes(effort)) return r({ error: "effort inválido" }, 400);
    await setEnv({ FLEET_EFFORT: effort || undefined });
    return r({ ok: true });
  }
  if (action === "set-engine") {
    // Cambia el MOTOR (workerTemplate + GHOSTY_LLM + modelo default). El template está
    // horneado en la VM al spawn → hay que RECICLAR las boxes para que corra el worker
    // nuevo. Se limpian todos los model-env del motor anterior y se setea el del nuevo.
    const { getEngine } = await import("~/lib/fleetEngines");
    const eng = getEngine(String(b?.engine ?? "").trim());
    if (!eng) return r({ error: "engine desconocido" }, 400);
    if (!eng.models.some((m) => m.ready !== false)) return r({ error: "motor no disponible aún" }, 400);
    const env = { ...(persona.env ?? {}) };
    delete env.GHOSTY_LLM; delete env.ANTHROPIC_MODEL; delete env.DEEPSEEK_MODEL; delete env.CODEX_MODEL;
    if (eng.env?.GHOSTY_LLM) env.GHOSTY_LLM = eng.env.GHOSTY_LLM;
    if (eng.modelEnv && eng.defaultModel) env[eng.modelEnv] = eng.defaultModel;
    await db.fleetAgent.update({ where: { id: fa.id }, data: { workerTemplate: eng.template, persona: { ...persona, env } as object } });
    // Ya actualizamos el DB (workerTemplate+persona); recycle solo mata las boxes por
    // id/ownerId → respawnean leyendo el DB nuevo (worker/engine nuevo).
    const { recycleFleetAgentBoxes } = await import("~/.server/core/fleetAgentOperations");
    await recycleFleetAgentBoxes(fa).catch(() => {});
    return r({ ok: true, engine: eng.id });
  }
  if (action === "connect-teams") {
    // Marca el canal "Ghosty Teams" como conectado (mismo campo `connectedAt` que
    // estampa routeMessage al primer turno). Idempotente. Para agentes agregados a Teams
    // desde ghosty-chat → aparecen "Conectado" de inmediato, sin esperar el primer mensaje.
    const gconf = (fa.groupConfigs as Record<string, { connectedAt?: string }> | null) ?? {};
    if (!gconf.teams?.connectedAt) {
      const next = { ...gconf, teams: { ...(gconf.teams ?? {}), connectedAt: new Date().toISOString() } };
      await db.fleetAgent.update({ where: { id: fa.id }, data: { groupConfigs: next } });
    }
    return r({ ok: true });
  }
  if (action === "toggle-own-number") {
    await db.fleetAgent.update({ where: { id: fa.id }, data: { hasOwnNumber: !!b?.on } });
    return r({ ok: true });
  }
  if (action === "add-mcp") {
    const name = String(b?.name ?? "").trim().toLowerCase().replace(/[^a-z0-9_-]/g, "");
    const label = String(b?.label ?? "").trim() || name;
    const pkg = String(b?.pkg ?? "").trim();
    const url = String(b?.url ?? "").trim();
    const secretName = String(b?.requiredSecret ?? "").trim();
    const envVar = String(b?.envVar ?? "").trim() || secretName;
    if (!name) return r({ error: "nombre requerido" }, 400);
    if (CURATED_CAPABILITIES.some((e) => e.name === name)) return r({ error: "ese nombre es una capacidad incluida" }, 400);
    const catalog = (fa.mcpCatalog as McpCatalogEntry[] | null) ?? [];
    if (catalog.some((e) => e.name === name)) return r({ error: "ya existe ese MCP" }, 400);
    if (!pkg && !url) return r({ error: "da un paquete npm (stdio) o una URL (http)" }, 400);
    if (secretName && !/^[A-Z_][A-Z0-9_]*$/.test(secretName)) return r({ error: "el secret debe ser MAYÚSCULAS_CON_GUION_BAJO" }, 400);
    const cenv = secretName ? { [envVar]: `$secret:${secretName}` } : undefined;
    const entry: McpCatalogEntry = url
      ? { name, label, transport: "http", url, ...(cenv ? { env: cenv } : {}), ...(secretName ? { requiredSecrets: [secretName] } : {}) }
      : { name, label, transport: "stdio", command: "npx", args: ["-y", pkg], ...(cenv ? { env: cenv } : {}), ...(secretName ? { requiredSecrets: [secretName] } : {}) };
    await db.fleetAgent.update({ where: { id: fa.id }, data: { mcpCatalog: [...catalog, entry] } });
    return r({ ok: true });
  }
  if (action === "remove-mcp") {
    const name = String(b?.name ?? "");
    if (CURATED_CAPABILITIES.some((e) => e.name === name)) return r({ error: "no se puede quitar una capacidad incluida" }, 400);
    const catalog = (fa.mcpCatalog as McpCatalogEntry[] | null) ?? [];
    const target = catalog.find((e) => e.name === name);
    if (!target) return r({ error: "no existe" }, 404);
    if (target.builtin) return r({ error: "no se puede quitar un MCP builtin" }, 400);
    const configs = cfgs(fa);
    for (const jid of Object.keys(configs)) {
      const list = configs[jid].mcpServers;
      if (list?.includes(name)) configs[jid] = { ...configs[jid], mcpServers: list.filter((n) => n !== name) };
    }
    await db.fleetAgent.update({ where: { id: fa.id }, data: { mcpCatalog: catalog.filter((e) => e.name !== name), groupConfigs: configs } });
    return r({ ok: true });
  }
  if (action === "toggle-skill") {
    const skillId = String(b?.skillId ?? "");
    const skills = fleetSkills(fa).map((s) => (s.id === skillId ? { ...s, enabled: !!b?.on } : s));
    await db.fleetAgent.update({ where: { id: fa.id }, data: { skills } });
    return r({ ok: true });
  }
  if (action === "delete-skill") {
    const skillId = String(b?.skillId ?? "");
    const skills = fleetSkills(fa).filter((s) => s.id !== skillId);
    await db.fleetAgent.update({ where: { id: fa.id }, data: { skills } });
    return r({ ok: true });
  }
  if (action === "add-skill") {
    // Crear skill desde fileIds YA subidos (por la app: Teams sube el SKILL.md + scripts
    // a Files y pasa los fileIds). files[0] = SKILL.md → parseamos su frontmatter para
    // name/description si no vienen en el body. Autenticado por fleetAgent.token (arriba).
    const files = Array.isArray(b?.files) ? (b.files as unknown[]).map((x) => String(x)).filter(Boolean) : [];
    if (!files.length) return r({ error: "files (fileIds) requerido" }, 400);
    let name = String(b?.name ?? "").trim();
    let description = String(b?.description ?? "").trim();
    if (!name || !description) {
      const md = await db.file.findUnique({ where: { id: files[0] }, select: { url: true, name: true } }).catch(() => null);
      if (md?.url) {
        const mdText = await fetch(md.url).then((r) => (r.ok ? r.text() : "")).catch(() => "");
        const fm = /^---\s*\n([\s\S]*?)\n---/.exec(mdText)?.[1] ?? "";
        const pick = (k: string) => new RegExp(`^${k}\\s*:\\s*(.+)$`, "m").exec(fm)?.[1]?.trim().replace(/^["']|["']$/g, "");
        name = name || pick("name") || (md.name ?? "skill").replace(/\.md$/i, "");
        description = description || pick("description") || "";
      }
    }
    const { randomUUID } = await import("node:crypto");
    const skill = { id: randomUUID().slice(0, 8), name: name || "Skill", description, files, enabled: true };
    const skills = [...fleetSkills(fa), skill];
    await db.fleetAgent.update({ where: { id: fa.id }, data: { skills } });
    return r({ ok: true, skillId: skill.id });
  }

  if (!groupId) return r({ error: "groupId required" }, 400);
  const configs = cfgs(fa);
  const cur = configs[groupId] ?? {};

  if (action === "set-cap-level") {
    const cap = String(b?.cap ?? "");
    const level = String(b?.level ?? "");
    if (!mergedCapabilities(fa).some((e) => e.name === cap && !e.builtin)) return r({ error: "unknown capability" }, 400);
    const set = new Set(cur.mcpServers ?? []);
    const levels = { ...(cur.capLevels ?? {}) };
    if (level === "off") { set.delete(cap); delete levels[cap]; }
    else { set.add(cap); levels[cap] = level; }
    configs[groupId] = { ...cur, mcpServers: [...set], capLevels: levels };
  } else if (action === "toggle-builtin") {
    const builtin = String(b?.builtin ?? "");
    if (!DEFAULT_MCP_CATALOG.some((e) => e.name === builtin)) return r({ error: "unknown builtin" }, 400);
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
    if (!tool) return r({ error: "tool required" }, 400);
    const set = new Set(cur.toolDeny ?? []);
    if (b?.on) set.delete(tool); else set.add(tool);
    configs[groupId] = { ...cur, toolDeny: [...set] };
  } else {
    return r({ error: "unknown action" }, 400);
  }

  await db.fleetAgent.update({ where: { id: fa.id }, data: { groupConfigs: configs } });
  return r({ ok: true });
}
