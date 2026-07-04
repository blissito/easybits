import type { Route } from "./+types/fleet-agents";
import { useEffect, useRef, useState, type CSSProperties } from "react";
import { useFetcher, useRevalidator, data } from "react-router";
import { motion, AnimatePresence } from "motion/react";
import QRCode from "qrcode";
import { Switch } from "~/components/forms/Switch";
import { FeltFilters } from "~/components/felt/FeltFilters";
import { PLANS, getUserPlan, getFleetBox, NEXT_PLAN } from "~/lib/plans";
import { getUserOrRedirect } from "~/.server/getters";
import { db } from "~/.server/db";
import { delegatedAccountIds, SCOPES } from "~/.server/delegation";
import { createFleetAgent, deleteFleetAgent, clearGroupSession, mergedCapabilities, CURATED_CAPABILITIES, DEFAULT_MCP_CATALOG, type McpCatalogEntry, type GroupConfig } from "~/.server/core/fleetAgentOperations";
import { FLEET_BUCKETS, toolsParamToBuckets, bucketsToToolsParam } from "~/.server/mcp/toolGroups";
import { getReservedCapacity } from "~/.server/core/sandboxReservations";
import { listSecrets, createSecret } from "~/.server/core/secretOperations";
import {
  connectFleetAgent,
  disconnectFleetAgent,
  listFleetAgentGroups,
  isFleetAgentLive,
  ensureRehydrated,
} from "~/.server/integrations/whatsapp/baileys.server";
import {
  setPausedUntilAtomic,
  setAdminSenderAtomic,
  setAllowedSenderAtomic,
  setResponseModeAtomic,
  requestWabaReply,
  normalizePhone,
} from "~/.server/integrations/whatsapp/waba.server";

const DEFAULT_OAUTH = "CLAUDE_CODE_OAUTH_TOKEN";

// Cerebros seleccionables al crear un agente. Client-safe (subconjunto curado de
// SANDBOX_TEMPLATES; el default es claude-worker). `value` = workerTemplate real.
// - claude-worker: LLM por OAuth Max del dueño (tarifa plana, off-meter).
// - ghosty-gc: cerebro propio (ghostycode, Rust) — LLM por el proxy MEDIDO de EasyBits.
const BRAINS: { value: string; label: string }[] = [
  { value: "claude-worker", label: "Ghosty (Claude)" },
  { value: "ghosty-gc", label: "Ghosty propio (ghostycode)" },
];
const DEFAULT_BRAIN = "claude-worker";

// The live HUD poll (routes/dash/fleet-agents.poll.tsx) reuses THIS loader on the server
// to return the EXACT same shape as JSON, so the page can poll it with a plain
// `fetch` instead of useRevalidator → a transient 5xx (e.g. the ~50s window while
// Fly replaces the single machine on deploy) no longer tears the page down into
// the root ErrorBoundary; the poll just self-heals. Kept as the standard `loader`
// export (not a custom one) so React Router strips its server-only imports from
// the client bundle.
export async function loader({ request }: Route.LoaderArgs) {
  const user = await getUserOrRedirect(request);
  // El HUD hace polling cada 2.5s contra /flota/poll (reusa este loader). En el
  // poll NO refrescamos la lista de grupos en vivo (groupFetchAllParticipating)
  // — eso es una IQ contra WhatsApp que, repetida cada 2.5s y traslapada, dispara
  // rate-overlimit y DEGRADA el socket (conexión "Conectando…" colgada). El poll
  // sirve grupos desde caché + seenGroups; solo la carga de página los refresca.
  const isPoll = new URL(request.url).pathname.endsWith("/poll");
  // Reconnect any pools that were live before an app restart (lazy, once).
  await ensureRehydrated();

  const secretNames = (await listSecrets(user.id)).map((s) => s.name);
  // ⚠️ `select` OBLIGATORIO: findMany SIN select sobre FleetAgent tarda ~4.4s por
  // fila (patología Prisma+Mongo, medido) vs ~100ms con proyección — el doc pesa
  // solo ~6KB, no es tamaño. Proyectar solo lo que usa el loader.
  const rows = await db.fleetAgent.findMany({
    where: { ownerId: user.id },
    orderBy: { createdAt: "desc" },
    select: {
      id: true, name: true, baileys: true, enabledGroups: true, groupConfigs: true,
      wabaConfig: true, mcpCatalog: true, maxWorkersPerVm: true, vmMemMb: true,
      mainGroupJid: true, hasOwnNumber: true, workerTemplate: true, persona: true,
      // token: bearer del surface web/Baileys — lo usa el drawer de prueba (message-stream).
      token: true,
    },
  });
  const pools = await Promise.all(
    rows.map(async (p) => {
      const b = (p.baileys ?? {}) as { status?: string; qr?: string; reason?: string; pairBlockedUntil?: string };
      const status = b.status ?? "disconnected";
      // Pairing throttle: WhatsApp blocked this number for too many attempts.
      const throttledUntil = b.pairBlockedUntil && new Date(b.pairBlockedUntil) > new Date() ? b.pairBlockedUntil : null;
      const live = isFleetAgentLive(p.id);
      // Show QR / pairing code by PRESENCE (they persist across transient status
      // changes via the merge in setStatus) — hide only once actually connected.
      const connectedNow = status === "connected";
      const qrDataUrl =
        !connectedNow && b.qr ? await QRCode.toDataURL(b.qr).catch(() => null) : null;
      const pairingCode = !connectedNow ? ((b as any).pairingCode as string | undefined) ?? null : null;
      // Merged list (live groupFetch ∪ discovered seenGroups) — shows groups with
      // activity even if metadata sync hasn't listed them yet.
      const rawGroups = await listFleetAgentGroups(p.id, { live: !isPoll });
      // Capabilities for the admin UI. builtins (easybits/wa) are always-on and
      // just listed. capabilities (curated ∪ custom) are togglable per group; each
      // carries whether its required vault secret(s) are present (NAMES only — the
      // values never leave the server). DEFAULT_MCP_CATALOG seeds the builtins.
      const secretsSet = new Set(secretNames);
      // Builtins (easybits/wa) are code-defined and always-on — list for display.
      const builtins = DEFAULT_MCP_CATALOG.map((e) => ({ name: e.name, label: e.label ?? e.name }));
      const capabilities = mergedCapabilities(p)
        .filter((e) => !e.builtin)
        .map((e) => ({
          name: e.name,
          label: e.label ?? e.name,
          description: e.description ?? null,
          requiredSecrets: e.requiredSecrets ?? [],
          secretsPresent: (e.requiredSecrets ?? []).every((n) => secretsSet.has(n)),
          // curated capabilities (code) can't be removed; custom (added by the
          // owner, stored in mcpCatalog) can.
          custom: !CURATED_CAPABILITIES.some((c) => c.name === e.name),
        }));
      const gconf = (p.groupConfigs as Record<string, GroupConfig> | null) ?? {};
      const groups = rawGroups.map((g: { id: string; subject: string; enabled: boolean }) => ({
        ...g,
        mcps: gconf[g.id]?.mcpServers ?? [],
        disabledBuiltins: gconf[g.id]?.disabledBuiltins ?? [],
        // Buckets per-grupo (null = hereda el default del agente; computado server-side
        // porque toolsParamToBuckets vive en .server).
        toolBuckets: gconf[g.id]?.toolGroup ? [...toolsParamToBuckets(gconf[g.id]!.toolGroup!)] : null,
      }));
      // WABA numbers (Meta WhatsApp Business). Each integration is its OWN config
      // unit `waba:<integrationId>` — same shape as a group so the Capacidades
      // modal reuses it. Identity (name/systemPrompt) is per number.
      const wabaOrgs = ((p.wabaConfig as { orgs?: Record<string, { phoneNumberId?: string; phoneNumber?: string; name?: string; systemPrompt?: string; admin?: boolean; enabled?: boolean; responseMode?: "off" | "all" | "only"; mutedSenders?: string[]; allowedSenders?: string[] }> } | null) ?? {}).orgs ?? {};
      const wabaNumbers = Object.entries(wabaOrgs).map(([integrationId, o]) => {
        const id = `waba:${integrationId}`;
        // Modo efectivo: responseMode si existe; si no, se deriva de enabled (compat).
        const mode: "off" | "all" | "only" = o.responseMode ?? (o.enabled === false ? "off" : "all");
        return {
          id,
          integrationId,
          subject: o.name || o.phoneNumber || o.phoneNumberId || integrationId,
          name: o.name ?? "",
          systemPrompt: o.systemPrompt ?? "",
          phoneNumber: o.phoneNumber ?? "",
          mode,
          allowedCount: (o.allowedSenders ?? []).length,
          mcps: gconf[id]?.mcpServers ?? [],
          disabledBuiltins: gconf[id]?.disabledBuiltins ?? [],
          toolBuckets: gconf[id]?.toolGroup ? [...toolsParamToBuckets(gconf[id]!.toolGroup!)] : null,
        };
      });
      // Per-VM capacity boxes: each worker VM + how many conversations (slots) it
      // holds vs maxWorkersPerVm. Drives the "cajitas encendidas" capacity view.
      const workers = await db.agent.findMany({
        where: { fleetAgentId: p.id, status: { in: ["running", "suspended", "building"] } },
        select: { id: true, status: true, sandboxId: true },
      });
      // Todos los agentes de flota se dibujan como fantasmita; el COLOR = tipo de agente:
      // claude-worker = coral Anthropic, ghostycode/deepseek = morado Ghosty, cualquier
      // otro = gris.
      const ghosty = true;
      const mascotColor =
        p.workerTemplate === "claude-worker"
          ? "#D97757"
          : p.workerTemplate === "ghosty-gc"
            ? "#9870ED"
            : "#9CA3AF";
      const machines = await Promise.all(
        workers.map(async (w) => ({
          id: w.id,
          sandboxId: w.sandboxId,
          status: w.status,
          ghosty,
          mascotColor,
          slots: await db.fleetAgentRoute.count({ where: { agentId: w.id } }),
        }))
      );
      const conversations = await db.fleetAgentRoute.count({ where: { fleetAgentId: p.id } });
      // Perfil de herramientas activo del agente: vive en persona.env.EASYBITS_TOOL_GROUP.
      // Vacío/ausente = sin restricción (catálogo completo). La UI lo edita por buckets.
      const toolGroup =
        ((p.persona as { env?: Record<string, string> } | null)?.env?.EASYBITS_TOOL_GROUP) ?? "";
      const activeBuckets = [...toolsParamToBuckets(toolGroup)];
      return {
        id: p.id, name: p.name, token: p.token, status, live, qrDataUrl, pairingCode, groups,
        wabaNumbers,
        enabledCount: p.enabledGroups.length, machines, vms: machines.length,
        conversations, maxWorkersPerVm: p.maxWorkersPerVm, vmMemMb: p.vmMemMb,
        throttledUntil, connReason: b.reason ?? null, mainGroupJid: p.mainGroupJid,
        hasOwnNumber: p.hasOwnNumber, builtins, capabilities,
        // restricted = perfil activo (lean). activeBuckets = qué capacidades tiene.
        restricted: toolGroup.startsWith("scripting"), activeBuckets,
        // Conectores (MCPs custom) ON por default del agente — clave reservada "*".
        defaultMcps: (gconf["*"]?.mcpServers) ?? [],
      };
    })
  );
  // Capacity is per ACCOUNT (one fleet, any number of channels) — aggregate every
  // channel's worker VMs into a single general view instead of per-card cajitas.
  const machines = pools.flatMap((p) => p.machines);
  // Account capacity = the plan's concurrent-sandbox budget. A fleetAgent worker VM IS
  // a sandbox, so "Mega = 3 máquinas" maps 1:1. Each VM holds maxWorkersPerVm
  // agents (workers), so agent capacity = maxMachines × maxWorkersPerVm.
  const plan = getUserPlan(user);
  const planCfg = PLANS[plan];
  // Tamaño de caja DERIVADO DEL PLAN (fuente única). Si ya hay fleetAgent, su config
  // real manda; si no, caemos al tamaño del plan (no a un fallback "byte" fijo).
  const box = getFleetBox(plan);
  const maxWorkersPerVm = pools[0]?.maxWorkersPerVm ?? box.agentsPerBox;
  // Reserved capacity bought in /dash/packs raises the budget on top of the
  // plan: +1 machine slot and +`agents` agent slots per active reservation.
  const reserved = await getReservedCapacity(user.id);
  // TODAS las sandboxes del owner en el host se muestran en el HUD, categorizadas:
  // las de SISTEMA (llamadas livekit / voz kokoro) en azul, y cualquier otra
  // (custom: code-interpreter, etc.) en gris con su template. Dedup contra los
  // worker del fleetAgent (ya están en `machines`). Consistente con el gate de budget.
  const { listSandboxes } = await import("~/.server/core/sandboxOperations");
  const SYSTEM_TEMPLATES: Record<string, string> = { "livekit-svc": "llamadas", "voice-svc": "voz", "render-svc": "render" };
  const workerSandboxIds = new Set(machines.map((m) => m.sandboxId).filter(Boolean) as string[]);
  // El listing del host es la VERDAD de qué VMs están vivas: una VM suspendida se
  // OMITE de la lista (el host la snapshotea y la saca). Capturamos si el host
  // respondió para no marcar todo suspendido ante un error transitorio.
  let hostVms: any[] = [];
  let hostReachable = false;
  try { hostVms = (await listSandboxes({ user, scopes: ["READ"] } as any)) as any[]; hostReachable = true; }
  catch { hostVms = []; }
  // Reconcilia las cajitas contra la realidad: un worker aún marcado "running" cuya
  // VM el host ya no lista fue suspendido fuera de banda (idle-suspend del host, o un
  // reaper que suspendió en el host pero murió antes del write a DB en un deploy). Su
  // fila Agent sigue existiendo (destroy la BORRA) → running+ausente ⇒ suspended.
  // Persistimos para que el HUD, el ruteo (ensureRunning hace resume en "suspended")
  // y el resume coincidan; si no, un mensaje iría a una VM pausada y fallaría.
  if (hostReachable) {
    const liveIds = new Set(
      (hostVms as any[]).filter((v) => v.status === "running" || v.status === "starting").map((v) => v.sandboxId)
    );
    const drifted = machines.filter((m) => m.status === "running" && m.sandboxId && !liveIds.has(m.sandboxId));
    if (drifted.length) {
      await db.agent.updateMany({ where: { id: { in: drifted.map((m) => m.id) } }, data: { status: "suspended" } }).catch(() => {});
      for (const m of drifted) m.status = "suspended";
    }
  }
  const extraMachines = (hostVms as any[])
    .filter((v) => !workerSandboxIds.has(v.sandboxId) && (v.status === "running" || v.status === "starting"))
    .map((v) =>
      SYSTEM_TEMPLATES[v.template]
        ? { id: v.sandboxId, status: v.status as string, kind: "system" as const, label: SYSTEM_TEMPLATES[v.template] }
        : { id: v.sandboxId, status: v.status as string, kind: "custom" as const, label: v.template as string }
    );
  const capacity = {
    machines,
    extraMachines,
    vms: machines.length + extraMachines.length,
    maxMachines: planCfg.concurrentSandboxes + reserved.machines,
    plan,
    planName: planCfg.name,
    nextPlan: NEXT_PLAN[plan] ?? null,
    maxWorkersPerVm,
    vmMemMb: pools[0]?.vmMemMb ?? box.vmMemMb,
    // vCPU por sandbox — misma regla que spawnVm (≤512MB → 1, si no 2).
    vcpus: (pools[0]?.vmMemMb ?? box.vmMemMb) <= 512 ? 1 : 2,
    reservedMachines: reserved.machines,
    // Agents running RIGHT NOW = sum of workers inside active VMs (coherent with
    // "VMs contain agents"); idle/detached routes don't count until re-spawned.
    agentsActive: machines.reduce((s, m) => s + m.slots, 0),
    // LINEAL y uniforme: cada sandbox DISPONIBLE PARA AGENTES corre maxWorkersPerVm.
    // Los sandboxes ocupados por sistema (llamadas/voz) o custom NO están libres
    // para agentes → se descuentan del budget. Ej: 5 sandboxes − 3 llamadas = 2
    // libres × 4 = 8 agentes máx. agentsMax = total sandboxes × agentes-por-sandbox. Sin densidades
    // mixtas por tier — un add-on = +1 sandbox del MISMO tamaño.
    agentsMax: Math.max(0, planCfg.concurrentSandboxes + reserved.machines - extraMachines.length) * maxWorkersPerVm,
  };
  // Flotas compartidas conmigo (delegación scope `agents`) — lista read-only,
  // separada del HUD de capacidad (que es por cuenta propia). Sólo visibilidad.
  const delegatedIds = await delegatedAccountIds(
    { user, scopes: ["READ"] } as any,
    SCOPES.AGENTS
  );
  let sharedPools: Array<{ id: string; name: string | null; status: string; ownerEmail: string | null }> = [];
  if (delegatedIds.length) {
    const [sharedRows, owners] = await Promise.all([
      db.fleetAgent.findMany({ where: { ownerId: { in: delegatedIds } }, orderBy: { createdAt: "desc" } }),
      db.user.findMany({ where: { id: { in: delegatedIds } }, select: { id: true, email: true } }),
    ]);
    const emailById = new Map(owners.map((u) => [u.id, u.email]));
    sharedPools = sharedRows.map((p) => ({
      id: p.id,
      name: p.name,
      status: ((p.baileys ?? {}) as { status?: string }).status ?? "disconnected",
      ownerEmail: emailById.get(p.ownerId) ?? null,
    }));
  }
  return { secretNames, pools, capacity, sharedPools, buckets: FLEET_BUCKETS };
}

// Puente a Formmy (fuente única de la coexistencia): pausa/reactiva una conversación
// vía /coexistence/control, autenticado con el forward secret que EasyBits ya tiene.
// www: el apex formmy.app falla TLS desde Fly → usar www.
async function formmyCoexistence(
  formmySecret: string,
  integrationId: string,
  sender: string,
  mode: "resume" | "permanent" | "30min" | "2h"
): Promise<{ ok: boolean; error?: string }> {
  const base = (process.env.FORMMY_BASE_URL || "https://www.formmy.app").replace(/\/$/, "");
  const digits = sender.replace(/@.*$/, "").replace(/\D/g, "");
  // Formmy resuelve la conversación POR TELÉFONO; en coexistencia MX puede tenerla
  // guardada como 521… o 52…. EasyBits ya normaliza a 52 → probamos AMBAS variantes
  // (52 y 521) para que el resume/pausa SIEMPRE resuelva. Era la causa del "reactivar
  // no aplica": mandábamos 52 y Formmy la tenía en 521 → no la encontraba → 502.
  const variants = new Set<string>([digits]);
  if (digits.startsWith("521")) variants.add("52" + digits.slice(3));
  else if (digits.startsWith("52")) variants.add("521" + digits.slice(2));
  let lastErr = "";
  for (const phone of variants) {
    try {
      const res = await fetch(`${base}/api/v1/integrations/whatsapp/coexistence/control`, {
        method: "POST",
        headers: { Authorization: `Bearer ${formmySecret}`, "Content-Type": "application/json" },
        body: JSON.stringify({ integration_id: integrationId, phone_number: phone, mode }),
      });
      if (res.ok) return { ok: true };
      const detail = await res.text().catch(() => "");
      lastErr = `Formmy ${res.status}`;
      console.error(`[waba] coexistence/control ${mode} phone=${phone} failed ${res.status}: ${detail.slice(0, 160)}`);
    } catch (e) {
      lastErr = "no se pudo contactar Formmy";
      console.error("[waba] coexistence/control threw:", e instanceof Error ? e.message : e);
    }
  }
  return { ok: false, error: lastErr || "Formmy no resolvió la conversación" };
}

export async function action({ request }: Route.ActionArgs) {
  const user = await getUserOrRedirect(request);
  const ctx = { user, scopes: ["ADMIN" as const] };
  const fd = await request.formData();
  const intent = String(fd.get("intent") || "");

  if (intent === "create") {
    const name = String(fd.get("name") || "").trim() || undefined;
    const workerTemplate = String(fd.get("workerTemplate") || "").trim() || undefined;
    const llm = String(fd.get("llm") || "").trim() || undefined; // ghosty-gc: "deepseek" | "easybits"
    let oauthSecretName = String(fd.get("oauthSecretName") || "").trim();
    const newOauth = String(fd.get("newOauth") || "").trim();
    // Pasting a new token saves it to the vault under the given (or default) name.
    if (newOauth) {
      const secretName = String(fd.get("newOauthName") || "").trim() || DEFAULT_OAUTH;
      await createSecret(user.id, { name: secretName, value: newOauth });
      oauthSecretName = secretName;
    }
    // Claude-based brains need a Claude Max OAuth; DeepSeek brains (rust-ghosty)
    // run on DEEPSEEK_API_KEY (injected at spawn) and don't require one.
    const needsOauth = !workerTemplate || workerTemplate === "claude-worker";
    if (needsOauth && !oauthSecretName) return data({ error: "Elige o pega un OAuth" }, { status: 400 });
    const fleetAgent = await createFleetAgent(ctx, { name, oauthSecretName: oauthSecretName || undefined, workerTemplate, llm });
    return data({ ok: true, fleetAgentId: fleetAgent.id });
  }

  const fleetAgentId = String(fd.get("fleetAgentId") || "");
  const fleetAgent = fleetAgentId ? await db.fleetAgent.findUnique({ where: { id: fleetAgentId } }) : null;
  if (!fleetAgent || fleetAgent.ownerId !== user.id) return data({ error: "not found" }, { status: 404 });

  if (intent === "connect") {
    const cur = (fleetAgent.baileys as Record<string, any> | null) ?? {};
    // Respect the pairing throttle: if Meta blocked us, don't even start — every
    // attempt deepens it. The UI already hides the buttons, this guards the race.
    if (cur.pairBlockedUntil && new Date(cur.pairBlockedUntil) > new Date()) {
      return data({ error: "throttled", until: cur.pairBlockedUntil }, { status: 429 });
    }
    // Non-blocking: flip status to "connecting" so the UI starts polling, then
    // fire connectFleetAgent in the background. Awaiting it could hang the action on
    // the WhatsApp version fetch / socket setup → spinner stuck forever.
    const phone = String(fd.get("phone") || "").trim() || undefined; // pairing-code method if set
    // PRESERVE the throttle-guard counters (drop only transient artifacts) — a
    // raw replace here would reset pairFails on every click and defeat the guard.
    const { qr, pairingCode, reason, until, ...keep } = cur;
    await db.fleetAgent.update({ where: { id: fleetAgentId }, data: { baileys: { ...keep, status: "connecting", at: new Date().toISOString() } } });
    void connectFleetAgent(fleetAgentId, { pairingPhone: phone }).catch((e) => console.error("connectFleetAgent failed", e));
    return data({ ok: true });
  }
  if (intent === "disconnect") {
    await disconnectFleetAgent(fleetAgentId);
    return data({ ok: true });
  }
  if (intent === "delete") {
    await disconnectFleetAgent(fleetAgentId).catch(() => {});
    await deleteFleetAgent(ctx, fleetAgentId);
    return data({ ok: true, deleted: true });
  }
  if (intent === "rename") {
    const name = String(fd.get("name") || "").trim();
    await db.fleetAgent.update({ where: { id: fleetAgentId }, data: { name: name || null } });
    return data({ ok: true });
  }
  if (intent === "set-profile") {
    // Perfil de herramientas del agente. Se guarda en persona.env.EASYBITS_TOOL_GROUP
    // (= "scripting,<buckets>"), que el worker lee al spawn → tools/list lean +
    // run_tool acotado a esos buckets. restricted="0" → quita la restricción
    // (catálogo completo). Aplica al PRÓXIMO spawn (VM nueva); los workers vivos
    // siguen hasta reciclarse.
    const restricted = String(fd.get("restricted") || "1") === "1";
    const buckets = String(fd.get("buckets") || "").split(",").map((s) => s.trim()).filter(Boolean);
    const persona = ((fleetAgent.persona ?? {}) as { env?: Record<string, string> });
    const env = { ...(persona.env ?? {}) };
    if (restricted) env.EASYBITS_TOOL_GROUP = bucketsToToolsParam(buckets);
    else delete env.EASYBITS_TOOL_GROUP;
    // Conectores (MCPs custom) ON por default del agente → groupConfigs["*"].mcpServers.
    // resolveGroupMcpServers cae a este default cuando un grupo no tiene override.
    const mcps = String(fd.get("mcps") || "").split(",").map((s) => s.trim()).filter(Boolean);
    const gc = ((fleetAgent.groupConfigs ?? {}) as Record<string, GroupConfig>);
    const nextGc = { ...gc, "*": { ...(gc["*"] ?? {}), mcpServers: mcps } };
    await db.fleetAgent.update({
      where: { id: fleetAgentId },
      data: { persona: { ...persona, env }, groupConfigs: nextGc },
    });
    return data({ ok: true });
  }
  if (intent === "toggle-group") {
    const groupId = String(fd.get("groupId") || "");
    const on = String(fd.get("on") || "") === "1";
    const set = new Set(fleetAgent.enabledGroups);
    if (on) set.add(groupId);
    else set.delete(groupId);
    const next: { enabledGroups: string[]; mainGroupJid?: null } = { enabledGroups: [...set] };
    // Un grupo apagado no puede seguir siendo el main (perdería el privilegio de
    // admin sin estar atendido) → lo limpiamos al desactivarlo.
    if (!on && fleetAgent.mainGroupJid === groupId) next.mainGroupJid = null;
    await db.fleetAgent.update({ where: { id: fleetAgentId }, data: next });
    return data({ ok: true });
  }
  if (intent === "set-main") {
    // Marca/desmarca el grupo MAIN (admin) del agente. Solo un grupo activo puede
    // serlo; re-tocarlo lo desmarca. El gate cross-grupo lo lee pools.wa-action.
    const groupId = String(fd.get("groupId") || "");
    const mainNext = fleetAgent.mainGroupJid === groupId ? null : groupId || null;
    if (mainNext && !fleetAgent.enabledGroups.includes(mainNext)) {
      return data({ error: "el grupo main debe estar activo" }, { status: 400 });
    }
    await db.fleetAgent.update({ where: { id: fleetAgentId }, data: { mainGroupJid: mainNext } });
    return data({ ok: true });
  }
  if (intent === "set-secret") {
    // Provide a capability's credential — stored in the owner's secrets vault
    // (AES-256-GCM), referenced by name as $secret:NAME. Never stored in the fleetAgent.
    const name = String(fd.get("name") || "").trim();
    const value = String(fd.get("value") || "").trim();
    if (!value) return data({ error: "valor requerido" }, { status: 400 });
    try {
      await createSecret(user.id, { name, value }); // validates [A-Z_][A-Z0-9_]*
    } catch (e) {
      return data({ error: e instanceof Error ? e.message : "no se pudo guardar" }, { status: 400 });
    }
    return data({ ok: true });
  }
  if (intent === "toggle-group-mcp") {
    // Enable/disable a capability (curated ∪ custom) for one group.
    const groupId = String(fd.get("groupId") || "");
    const name = String(fd.get("mcp") || "");
    const on = String(fd.get("on") || "") === "1";
    if (!mergedCapabilities(fleetAgent).some((e) => e.name === name && !e.builtin)) {
      return data({ error: "esa capacidad no existe" }, { status: 400 });
    }
    const configs = { ...((fleetAgent.groupConfigs as Record<string, GroupConfig> | null) ?? {}) };
    const cur = configs[groupId] ?? {};
    const set = new Set(cur.mcpServers ?? []);
    if (on) set.add(name);
    else set.delete(name);
    configs[groupId] = { ...cur, mcpServers: [...set] };
    await db.fleetAgent.update({ where: { id: fleetAgentId }, data: { groupConfigs: configs } });
    return data({ ok: true });
  }
  if (intent === "toggle-group-builtin") {
    // Turn a BUILTIN (easybits/wa) on/off for one group. `on=0` adds it to
    // disabledBuiltins → the worker removes it from the merged MCP set that turn.
    const groupId = String(fd.get("groupId") || "");
    const name = String(fd.get("builtin") || "");
    const on = String(fd.get("on") || "") === "1";
    if (!DEFAULT_MCP_CATALOG.some((e) => e.name === name)) {
      return data({ error: "ese builtin no existe" }, { status: 400 });
    }
    const configs = { ...((fleetAgent.groupConfigs as Record<string, GroupConfig> | null) ?? {}) };
    const cur = configs[groupId] ?? {};
    const set = new Set(cur.disabledBuiltins ?? []);
    if (on) set.delete(name); // on = NOT disabled
    else set.add(name);
    configs[groupId] = { ...cur, disabledBuiltins: [...set] };
    await db.fleetAgent.update({ where: { id: fleetAgentId }, data: { groupConfigs: configs } });
    return data({ ok: true });
  }
  if (intent === "set-group-toolgroup") {
    // Buckets de EasyBits POR-NÚMERO/grupo (capacidades finas). Se guarda en
    // groupConfigs[groupId].toolGroup; el worker lo aplica per-turno (?tools=),
    // sobreescribiendo el default del agente (persona.env). inherit=1 → limpia
    // (vuelve a heredar del agente). El worker debe estar rebuildeado (OVH).
    const groupId = String(fd.get("groupId") || "");
    const inherit = String(fd.get("inherit") || "") === "1";
    const bucketList = String(fd.get("buckets") || "").split(",").map((s) => s.trim()).filter(Boolean);
    const configs = { ...((fleetAgent.groupConfigs as Record<string, GroupConfig> | null) ?? {}) };
    const cur = configs[groupId] ?? {};
    // Los buckets SON la superficie de easybits → tocar buckets ENCIENDE el MCP
    // easybits (quita "easybits" de disabledBuiltins). Antes el conector easybits
    // separado en OFF lo apagaba y dejaba los buckets inertes ("no usa easybits").
    const disabled = (cur.disabledBuiltins ?? []).filter((n) => n !== "easybits");
    configs[groupId] = { ...cur, toolGroup: inherit ? undefined : bucketsToToolsParam(bucketList), disabledBuiltins: disabled };
    await db.fleetAgent.update({ where: { id: fleetAgentId }, data: { groupConfigs: configs } });
    return data({ ok: true });
  }
  if (intent === "add-mcp") {
    // Register a CUSTOM (advanced) MCP in the agent's catalog. stdio (npx) or http.
    // Optionally declares a required secret → env var references it as $secret:NAME.
    const name = String(fd.get("name") || "").trim().toLowerCase().replace(/[^a-z0-9_-]/g, "");
    const label = String(fd.get("label") || "").trim() || name;
    const pkg = String(fd.get("pkg") || "").trim(); // stdio npm package
    const url = String(fd.get("url") || "").trim(); // http endpoint
    const secretName = String(fd.get("requiredSecret") || "").trim(); // e.g. FOO_API_KEY
    const envVar = String(fd.get("envVar") || "").trim() || secretName; // env var the MCP reads
    if (!name) return data({ error: "nombre requerido" }, { status: 400 });
    if (CURATED_CAPABILITIES.some((e) => e.name === name)) return data({ error: "ese nombre es una capacidad incluida" }, { status: 400 });
    const catalog = (fleetAgent.mcpCatalog as McpCatalogEntry[] | null) ?? [];
    if (catalog.some((e) => e.name === name)) return data({ error: "ya existe ese MCP" }, { status: 400 });
    if (!pkg && !url) return data({ error: "da un paquete npm (stdio) o una URL (http)" }, { status: 400 });
    if (secretName && !/^[A-Z_][A-Z0-9_]*$/.test(secretName)) return data({ error: "el secret debe ser MAYÚSCULAS_CON_GUION_BAJO" }, { status: 400 });
    const env = secretName ? { [envVar]: `$secret:${secretName}` } : undefined;
    const entry: McpCatalogEntry = url
      ? { name, label, transport: "http", url, ...(env ? { env } : {}), ...(secretName ? { requiredSecrets: [secretName] } : {}) }
      : { name, label, transport: "stdio", command: "npx", args: ["-y", pkg], ...(env ? { env } : {}), ...(secretName ? { requiredSecrets: [secretName] } : {}) };
    await db.fleetAgent.update({ where: { id: fleetAgentId }, data: { mcpCatalog: [...catalog, entry] } });
    return data({ ok: true });
  }
  if (intent === "remove-mcp") {
    const name = String(fd.get("name") || "");
    if (CURATED_CAPABILITIES.some((e) => e.name === name)) return data({ error: "no se puede quitar una capacidad incluida" }, { status: 400 });
    const catalog = (fleetAgent.mcpCatalog as McpCatalogEntry[] | null) ?? [];
    const target = catalog.find((e) => e.name === name);
    if (!target) return data({ error: "no existe" }, { status: 404 });
    if (target.builtin) return data({ error: "no se puede quitar un MCP builtin" }, { status: 400 });
    // Drop it from every group's selection too, so no stale reference lingers.
    const configs = { ...((fleetAgent.groupConfigs as Record<string, GroupConfig> | null) ?? {}) };
    for (const jid of Object.keys(configs)) {
      const list = configs[jid].mcpServers;
      if (list?.includes(name)) configs[jid] = { ...configs[jid], mcpServers: list.filter((n) => n !== name) };
    }
    await db.fleetAgent.update({
      where: { id: fleetAgentId },
      data: { mcpCatalog: catalog.filter((e) => e.name !== name), groupConfigs: configs },
    });
    return data({ ok: true });
  }
  if (intent === "toggle-own-number") {
    // Línea dedicada vs número compartido. true = el bot detecta sus ecos por
    // fromMe y NO antepone "assistantName:"; false = número compartido (antepone
    // el nombre + permite autoprueba del dueño). Lo lee baileys fresco por ráfaga.
    const on = String(fd.get("on") || "") === "1";
    await db.fleetAgent.update({ where: { id: fleetAgentId }, data: { hasOwnNumber: on } });
    return data({ ok: true });
  }
  if (intent === "set-waba-identity") {
    // Per-NUMBER identity: name (display) + systemPrompt (appended as layer 3 for
    // that integration's turns). Merges into wabaConfig.orgs[integrationId].
    const integrationId = String(fd.get("integrationId") || "");
    const name = String(fd.get("name") || "").trim();
    const systemPrompt = String(fd.get("systemPrompt") || "").trim();
    const cfg = (fleetAgent.wabaConfig as { formmySecret?: string; orgs?: Record<string, any> } | null) ?? {};
    const org = cfg.orgs?.[integrationId];
    if (!org) return data({ error: "número no encontrado" }, { status: 404 });
    const next = {
      ...cfg,
      orgs: { ...cfg.orgs, [integrationId]: { ...org, name: name || undefined, systemPrompt: systemPrompt || undefined } },
    };
    await db.fleetAgent.update({ where: { id: fleetAgentId }, data: { wabaConfig: next } });
    return data({ ok: true });
  }
  if (intent === "waba-set-admin") {
    // Admin POR CONVERSACIÓN: marca/desmarca un sender como admin de este número
    // (sus turnos inyectan mcp__admin__* e ignoran gate/pausa). Reemplaza al ★ Main
    // / self-chat (muerto en WABA). Escritura atómica (anti-clobber).
    const integrationId = String(fd.get("integrationId") || "");
    const sender = String(fd.get("sender") || "").replace(/\D/g, "").replace(/^521/, "52");
    const on = String(fd.get("on") || "") === "1";
    if (!sender) return data({ error: "sender requerido" }, { status: 400 });
    const cfg = (fleetAgent.wabaConfig as { orgs?: Record<string, any> } | null) ?? {};
    if (!cfg.orgs?.[integrationId]) return data({ error: "número no encontrado" }, { status: 404 });
    await setAdminSenderAtomic(fleetAgentId, integrationId, sender, on);
    return data({ ok: true });
  }
  if (intent === "set-waba-mode") {
    // Modo de respuesta del número: off | all | only. (Turnos admin ignoran el gate.)
    const integrationId = String(fd.get("integrationId") || "");
    const mode = String(fd.get("mode") || "");
    if (!["off", "all", "only"].includes(mode)) return data({ error: "modo inválido" }, { status: 400 });
    const cfg = (fleetAgent.wabaConfig as { orgs?: Record<string, any> } | null) ?? {};
    if (!cfg.orgs?.[integrationId]) return data({ error: "número no encontrado" }, { status: 404 });
    // Atómico (anti-clobber): un RMW del blob se pisaba con otras escrituras y el
    // modo "se revertía" a Activo. $set solo toca responseMode.
    await setResponseModeAtomic(fleetAgentId, integrationId, mode as "off" | "all" | "only");
    return data({ ok: true });
  }
  if (intent === "toggle-waba-sender") {
    // Allowlist del modo "only": agrega/quita un sender a allowedSenders (atómico).
    const integrationId = String(fd.get("integrationId") || "");
    const sender = String(fd.get("sender") || "").replace(/\D/g, "").replace(/^521/, "52");
    const on = String(fd.get("on") || "") === "1";
    if (!sender) return data({ error: "sender requerido" }, { status: 400 });
    const cfg = (fleetAgent.wabaConfig as { orgs?: Record<string, any> } | null) ?? {};
    if (!cfg.orgs?.[integrationId]) return data({ error: "número no encontrado" }, { status: 404 });
    await setAllowedSenderAtomic(fleetAgentId, integrationId, sender, on);
    return data({ ok: true });
  }
  if (intent === "waba-pause" || intent === "waba-resume") {
    // Pausa/reactiva el agente en una conversación → delega en Formmy (fuente única
    // de la coexistencia) y sincroniza el cache local (atómico, anti-clobber): sin
    // esto el reload del Inbox trae el paused_until viejo y el cambio "se revierte".
    const integrationId = String(fd.get("integrationId") || "");
    const sender = String(fd.get("sender") || "");
    const np = sender.replace(/\D/g, "").replace(/^521/, "52");
    const cfg = (fleetAgent.wabaConfig as { formmySecret?: string; orgs?: Record<string, any> } | null) ?? {};
    const org = cfg.orgs?.[integrationId];
    if (!cfg.formmySecret || !org) return data({ error: "número no encontrado" }, { status: 404 });
    const pause = intent === "waba-pause";
    // Nivel de pausa (como Formmy): permanent (∞) | 30min | 2h. Resume = reactivar.
    const duration = String(fd.get("duration") || "permanent");
    const mode: "resume" | "permanent" | "30min" | "2h" = !pause
      ? "resume"
      : duration === "30min" ? "30min" : duration === "2h" ? "2h" : "permanent";
    const r = await formmyCoexistence(cfg.formmySecret, integrationId, sender, mode);
    if (!r.ok && pause) return data({ error: r.error }, { status: 502 }); // pausa best-effort solo al reactivar
    // Cache local de pausa para el Inbox: timestamp futuro según el nivel.
    const until =
      !pause ? null
      : mode === "30min" ? new Date(Date.now() + 30 * 60_000).toISOString()
      : mode === "2h" ? new Date(Date.now() + 2 * 60 * 60_000).toISOString()
      : "9999-12-31T00:00:00.000Z";
    await setPausedUntilAtomic(fleetAgentId, integrationId, np, until);
    return data({ ok: true });
  }
  if (intent === "waba-request-reply") {
    // "Solicitar respuesta": reactiva la conversación y hace que el agente conteste
    // los mensajes pendientes, con una directiva OPCIONAL del operador (one-shot).
    const integrationId = String(fd.get("integrationId") || "");
    const sender = String(fd.get("sender") || "");
    const directive = String(fd.get("directive") || "").trim() || undefined;
    const cfg = (fleetAgent.wabaConfig as { formmySecret?: string; orgs?: Record<string, any> } | null) ?? {};
    const org = cfg.orgs?.[integrationId];
    if (!cfg.formmySecret || !org) return data({ error: "número no encontrado" }, { status: 404 });
    // FIRE-AND-FORGET: el turno (LLM + posible imagen) tarda decenas de segundos.
    // Awaitarlo dejaba la fila "busy" (verde atenuado) todo ese rato. Corre detached
    // (como el webhook) y ACK al instante; la respuesta cae en WhatsApp al terminar.
    void requestWabaReply({
      fleetAgentId,
      ownerId: fleetAgent.ownerId,
      formmySecret: cfg.formmySecret,
      integrationId,
      sender,
      org,
      directive,
      resume: (secret, intId, snd) => formmyCoexistence(secret, intId, snd, "resume"),
    }).catch((e) => console.error(`[waba] request-reply ${fleetAgentId} failed:`, e instanceof Error ? e.message : e));
    return data({ ok: true });
  }
  if (intent === "waba-clear") {
    // Limpia el contexto del agente para ESTA conversación (drop de memoria + rota
    // sessionUuid). groupId = el mismo que arma runWabaTurn (normalizado por contacto).
    const integrationId = String(fd.get("integrationId") || "");
    const sender = String(fd.get("sender") || "");
    if (!fleetAgent) return data({ error: "agente no encontrado" }, { status: 404 });
    const np = normalizePhone(sender);
    if (!integrationId || !np) return data({ error: "conversación no encontrada" }, { status: 400 });
    const msg = await clearGroupSession(ctx, fleetAgent, `waba:${integrationId}:${np}`);
    return data({ ok: true, message: msg });
  }
  return data({ error: "intent inválido" }, { status: 400 });
}

const STATUS = {
  connected: { label: "Conectado", dot: "bg-green-500" },
  qr_pending: { label: "Escanea el QR", dot: "bg-yellow-500" },
  pairing: { label: "Teclea el código", dot: "bg-yellow-500" },
  connecting: { label: "Conectando…", dot: "bg-yellow-500 animate-pulse" },
  failed: { label: "Falló", dot: "bg-red-500" },
  disconnected: { label: "Desconectado", dot: "bg-gray-300" },
} as const;

function Spinner() {
  return <span className="inline-block w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin align-[-2px]" />;
}

type Capacity = {
  machines: { id: string; status: string; slots: number; ghosty?: boolean; mascotColor?: string }[];
  extraMachines: { id: string; status: string; kind: "system" | "custom"; label: string }[];
  vms: number; maxMachines: number; plan: string; planName: string;
  nextPlan: string | null; maxWorkersPerVm: number; vmMemMb: number; vcpus: number;
  reservedMachines: number; agentsActive: number; agentsMax: number;
};

// Per-Ghosty blink timing, deterministic (NO Math.random → no SSR/hydration
// mismatch) from a stable seed (box id + slot index). Returns BOTH a phase offset
// AND a slightly different period: the offset desyncs on first paint, but SMIL
// clamps a negative `begin` when the <animate> is inserted dynamically (e.g. when a
// box WAKES suspended→running) → all would restart in unison. Distinct periods make
// them DRIFT apart regardless of start, so they never re-sync. Periods are mutually
// incommensurate-ish (4.3–5.8s) so the unison never recurs.
function blinkTiming(seed: string): { offset: number; period: number } {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  return { offset: (h % 500) / 100, period: 4.3 + ((h >>> 4) % 150) / 100 }; // 0–4.99s, 4.30–5.79s
}

// Ghosty — la mascota de la marca (fantasma morado + lentes), el agente INSIGNIA
// que el fleetAgent ofrece por default. Inline SVG (no hay asset suelto del fantasma;
// /logo-purple.svg es solo los ojitos). Parpadea sutil para sentirse vivo.
function GhostyMascot({ className = "", blink = true, sleeping = false, offset = 0, period = 5, color = "#9870ED" }: { className?: string; blink?: boolean; sleeping?: boolean; offset?: number; period?: number; color?: string }) {
  // begin negativo = arranca desfasado; period distinto = derivan y NUNCA vuelven a
  // unísono (cubre el caso de despertar simultáneo, donde el begin negativo se clampa).
  const Blink = blink && !sleeping ? (
    <animate attributeName="ry" values="11;11;1.5;1.5;11;11" dur={`${period}s`} begin={`-${offset}s`} repeatCount="indefinite" keyTimes="0;0.88;0.91;0.965;0.99;1" />
  ) : null;
  return (
    <svg viewBox="0 0 84 96" className={className} fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden>
      {/* cuerpo + blush afelpados: el contorno pasa por #feltEdge (fibras de fieltro).
          Los lentes/ojos quedan FUERA del filtro para que se lean nítidos. */}
      <g filter="url(#feltEdge)">
        {/* SOLO el color del cuerpo cambia por tipo de cerebro; el resto (lentes, blush,
            parpadeo, dormido) es el fantasma original, intacto. */}
        <path d="M11 80 L11 41 C11 21 23 5 42 5 C61 5 73 21 73 41 L73 80 Q65.25 88 57.5 80 Q49.75 88 42 80 Q34.25 88 26.5 80 Q18.75 88 11 80 Z" fill={color} />
        <ellipse cx="23" cy="50" rx="5" ry="3" fill="#B79BF2" />
        <ellipse cx="61" cy="50" rx="5" ry="3" fill="#B79BF2" />
      </g>
      {/* patas de los lentes */}
      <path d="M16 37 L4 33" stroke="#EAE7F4" strokeWidth="4" strokeLinecap="round" />
      <path d="M68 37 L80 33" stroke="#EAE7F4" strokeWidth="4" strokeLinecap="round" />
      {/* puente */}
      <path d="M37 36 Q42 32 47 36" stroke="#EAE7F4" strokeWidth="4" strokeLinecap="round" fill="none" />
      {sleeping ? (
        <>
          {/* dormido — ojitos cerrados (arcos hacia abajo) */}
          <path d="M22 41 Q29 47 36 41" stroke="#1C1726" strokeWidth="3.5" strokeLinecap="round" fill="none" />
          <path d="M48 41 Q55 47 62 41" stroke="#1C1726" strokeWidth="3.5" strokeLinecap="round" fill="none" />
        </>
      ) : (
        <>
          {/* lentes oscuros (ojitos despiertos) — parpadean */}
          <ellipse cx="29" cy="41" rx="8" ry="11" fill="#1C1726">{Blink}</ellipse>
          <ellipse cx="55" cy="41" rx="8" ry="11" fill="#1C1726">{Blink}</ellipse>
        </>
      )}
      {/* marcos */}
      <circle cx="29" cy="40" r="13.5" stroke="#EAE7F4" strokeWidth="4" />
      <circle cx="55" cy="40" r="13.5" stroke="#EAE7F4" strokeWidth="4" />
    </svg>
  );
}

// One sandbox = a CONTAINER box; the agents (workers) inside it are the ojitos.
// Color climbs with occupancy: empty→gray, healthy→green, full→amber (no room);
// building pulses violet; an unspawned slot is a dashed "mount" ready on demand.
function VmBox({ id, status, slots, max, ghosty, mascotColor, addon, kind, sysLabel }: { id: string; status: string | null; slots: number; max: number; ghosty?: boolean; mascotColor?: string; addon?: boolean; kind?: "system" | "custom"; sysLabel?: string }) {
  const system = kind === "system";
  const custom = kind === "custom";
  const extra = system || custom;
  const full = slots >= max;
  // Tonos de FIELTRO por estado (mismo gradiente de salud que antes, en lana). La
  // textura/borde/sombra los pone la clase `.felt`; aquí sólo el relleno + el hilo.
  // OJO: NO cambiar la semántica — verde lleno = "a tope y bien", no advertencia.
  const [fill, stitch] =
    system ? ["#bcd3ea", "#5a86b0"]
    : custom ? ["#cfd4dc", "#8a95a6"]
    : status === "building" ? ["#d7c9ef", "#9b86d6"]
    // Libre (sin add-on): fieltro GRIS — "espacio por llenar" neutro que contrasta
    // sobre el tapete claro sin competir con el verde (activo) ni el índigo (dormida).
    : status == null ? (addon ? ["#e7dcf6", "#9870ED"] : ["#c4c2cc", "rgba(70,66,86,0.45)"])
    // Dormida (suspended): congelada, capacidad casi-libre → índigo apagado.
    : status === "suspended" ? ["#c8c6e6", "#a6a3d6"]
    : full ? ["#a9c79b", "#6f9a63"]
    : slots > 0 ? ["#cfe0bf", "#9bbf8f"]
    : ["#dcd2bb", "rgba(60,42,16,0.3)"];
  const feltStyle = { "--felt-fill": fill, "--felt-stitch": stitch } as CSSProperties;
  const label = extra ? (sysLabel ?? (system ? "llamadas" : "sandbox")) : status == null ? (addon ? "add-on" : "libre") : status === "building" ? "booteando" : `${slots}/${max} agentes`;
  // Despertar: cuando una caja pasa de suspended → running (un mensaje la resucitó),
  // el ghosty se despereza (stretch pop) y el "Zzz" se va flotando. Detectamos la
  // transición con un ref al status anterior; el poll de 2.5s la dispara en vivo.
  const prevStatus = useRef(status);
  const [waking, setWaking] = useState(false);
  useEffect(() => {
    if (prevStatus.current === "suspended" && status === "running") {
      setWaking(true);
      const t = setTimeout(() => setWaking(false), 800);
      prevStatus.current = status;
      return () => clearTimeout(t);
    }
    prevStatus.current = status;
  }, [status]);
  // El grid de capacidad es POSICIONAL y de tamaño fijo (maxMachines + 1): cada
  // celda vive en una posición estable keyada por índice, así que un free que
  // bootea a máquina NO cambia de key → sin pop de entrada/salida ni reflow. La
  // caja solo cambia su relleno/contenido EN SU LUGAR. Sin `layout`, sin SPAWN.
  return (
    <motion.div
      whileHover={{ scale: 1.04, y: -2 }}
      transition={{ type: "spring", stiffness: 500, damping: 30 }}
      className="w-full aspect-square"
    >
      {/* El transform del hover va en ESTE wrapper, NO en el .felt: border-radius +
          overflow:hidden deja de recortar cuando el MISMO elemento tiene un filter
          (#feltRough) Y un transform → en hover asomaban las esquinas cuadradas del
          fill (el "segundo bg"). Aquí el felt nunca se transforma; el padre solo
          escala su raster YA redondeado, así que las esquinas quedan limpias. */}
      <div
        title={extra ? `Sandbox de ${system ? "llamadas/voz" : "sistema"} — no atiende agentes` : status == null ? "Sandbox disponible — se levanta bajo demanda" : status === "suspended" ? `Dormida — congelada, 0 CPU/RAM, resume en <1s. Solo ocupa disco; se destruye a los 45 min sin actividad. ${slots}/${max} conversaciones en memoria` : `Sandbox ${status} · ${slots}/${max} agentes`}
        style={feltStyle}
        className={`w-full h-full felt flex flex-col items-center justify-center gap-3 cursor-default ${status === "building" ? "animate-pulse" : ""}`}
      >
      {system ? (
        sysLabel === "render" ? (
          // Render (PDF/PNG): hoja con líneas de texto, NO teléfono.
          <svg className="w-12 h-12 text-blue-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
            <polyline points="14 2 14 8 20 8" />
            <line x1="16" y1="13" x2="8" y2="13" /><line x1="16" y1="17" x2="8" y2="17" /><line x1="10" y1="9" x2="8" y2="9" />
          </svg>
        ) : (
          // Llamadas / voz: teléfono.
          <svg className="w-12 h-12 text-blue-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.13.96.36 1.9.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.91.34 1.85.57 2.81.7A2 2 0 0 1 22 16.92z" />
          </svg>
        )
      ) : custom ? (
        <svg className="w-12 h-12 text-slate-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" />
          <path d="m3.3 7 8.7 5 8.7-5" /><path d="M12 22V12" />
        </svg>
      ) : (
        <div className="relative grid grid-cols-2 gap-2.5 place-items-center">
          <AnimatePresence>
            {status === "suspended" && slots > 0 && (
              <motion.span key="zzz"
                initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -12, scale: 1.4 }} transition={{ duration: 0.45 }}
                className="pointer-events-none absolute -top-3 -right-2 font-jersey text-sm leading-none text-indigo-400 select-none -rotate-6">Zzz</motion.span>
            )}
          </AnimatePresence>
          {/* AnimatePresence sobre los slots: al DESALOJAR (LRU — la conversación
              dormida más vieja reciclada para hacerle lugar a otra al topar la flota)
              el fantasma se ARRANCA (encoge + sube + gira leve, como sacado con el
              hilo) y el hueco de fieltro cosido se ASIENTA en su lugar; uno nuevo
              entra cosiéndose. initial=false → no animan en el primer render. */}
          <AnimatePresence initial={false} mode="popLayout">
          {Array.from({ length: max }).map((_, j) =>
            j < slots ? (
              <motion.div key={`a${j}`}
                initial={{ scale: 0.3, opacity: 0 }}
                animate={waking ? { scale: [1, 0.9, 1.12, 1], y: [0, 1, -3, 0], opacity: status === "suspended" ? 0.5 : 1 } : { scale: 1, y: 0, opacity: status === "suspended" ? 0.5 : 1 }}
                exit={{ scale: 0.2, opacity: 0, y: -16, rotate: -10, transition: { duration: 0.35, ease: "easeIn" } }}
                transition={waking ? { duration: 0.7, ease: "easeOut", times: [0, 0.3, 0.6, 1], delay: j * 0.06 } : { duration: 0.3 }}
                className="w-10 h-10 flex items-center justify-center">
                {ghosty ? (() => { const t = blinkTiming(`${id}:${j}`); return <GhostyMascot className="w-8 h-10" sleeping={status === "suspended"} offset={t.offset} period={t.period} color={mascotColor} />; })() : <img src="/logo-purple.svg" alt="" className={`w-10 h-10 ${status === "suspended" ? "grayscale" : ""}`} />}
              </motion.div>
            ) : (
              <motion.span key={`e${j}`}
                initial={{ scale: 0.5, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                transition={{ duration: 0.3, delay: 0.12, ease: "backOut" }}
                className="w-6 h-6 felt-empty" />
            )
          )}
          </AnimatePresence>
        </div>
      )}
      <span className={`font-jersey text-base leading-none truncate max-w-full px-2 ${system ? "text-blue-700 font-bold" : custom ? "text-slate-600 font-bold" : addon && status == null ? "text-brand-600 font-bold" : status == null ? "text-[#55525f] font-bold" : "text-[#4a3f2c] font-bold"}`}>{label}</span>
      </div>
    </motion.div>
  );
}

function CapacityHud({ capacity }: { capacity: Capacity }) {
  // Aplanamos máquinas + extras a una lista ordenada y la rellenamos a un número
  // FIJO de celdas (al menos maxMachines). Cada celda lleva su posición `p`; las
  // posiciones sobrantes quedan `item: undefined` (slot libre). El número de celdas
  // sólo cambia si cambia el plan/add-ons, no en cada poll → contenedor estable.
  const ordered: ({ kind: "machine"; m: Capacity["machines"][number] } | { kind: "extra"; s: Capacity["extraMachines"][number] })[] = [
    ...capacity.machines.map((m) => ({ kind: "machine" as const, m })),
    ...capacity.extraMachines.map((s) => ({ kind: "extra" as const, s })),
  ];
  const totalCells = Math.max(capacity.maxMachines, ordered.length);
  const capacityCells = Array.from({ length: totalCells }, (_, p) => ({ p, item: ordered[p] }));
  return (
    <div className="felt-mat border-2 border-black rounded-xl p-4 animate-fade-in overflow-hidden" style={{ background: "#f7f4ed" }}>
      {/* filtros del kit de fieltro — montados UNA vez para todo el HUD */}
      <FeltFilters />
      <div className="relative flex flex-wrap items-center justify-between gap-x-3 gap-y-1 mb-3">
        <div className="flex items-center gap-2">
          <span className="font-jersey text-3xl leading-none tracking-wide text-[#2a2335]">CAPACIDAD</span>
          <motion.span whileHover={{ scale: 1.08, rotate: -2 }}
            className="font-jersey text-lg leading-none px-2 py-1 bg-brand-500 text-white border-2 border-black rounded-md cursor-default">
            {capacity.planName.toUpperCase()}
          </motion.span>
        </div>
        <span className="font-jersey text-xl leading-none text-gray-500">
          <span className="text-[#2a2335]">{capacity.agentsActive}/{capacity.agentsMax} AGENTES</span> · {capacity.vms}/{capacity.maxMachines} sandboxes
        </span>
      </div>

      {/* Grid POSICIONAL de tamaño fijo: maxMachines celdas + el botón "MÁS".
          Cada celda se keya por su índice de posición (`cell-N`), NO por el id de
          la VM. Así, cuando un free bootea a máquina o una máquina se duerme/muere,
          la celda sólo cambia su contenido EN SU MISMA POSICIÓN — el contenedor no
          muta, las filas se conservan y no hay reflow ni pop en cada poll de 2.5s. */}
      <div className="relative grid grid-cols-2 sm:grid-cols-4 gap-3">
        {capacityCells.map((cell) => {
          const isAddon = cell.p >= capacity.maxMachines - capacity.reservedMachines;
          if (!cell.item) {
            // Celda vacía → slot libre disponible (se levanta bajo demanda).
            return <VmBox key={`cell-${cell.p}`} id={`free-${cell.p}`} status={null} slots={0} max={capacity.maxWorkersPerVm} addon={isAddon} />;
          }
          if (cell.item.kind === "machine") {
            const m = cell.item.m;
            return <VmBox key={`cell-${cell.p}`} id={m.id} status={m.status} slots={m.slots} max={capacity.maxWorkersPerVm} ghosty={m.ghosty} mascotColor={m.mascotColor} addon={isAddon} />;
          }
          const s = cell.item.s;
          return <VmBox key={`cell-${cell.p}`} id={s.id} status={s.status} slots={0} max={capacity.maxWorkersPerVm} kind={s.kind} sysLabel={s.label} />;
        })}
        {/* Añadir capacidad — sube de plan para más sandboxes */}
        <motion.a key="add" href="/dash/packs?tab=sandboxes" title="Añadir capacidad"
          whileHover={{ scale: 1.08, rotate: 2 }} whileTap={{ scale: 0.95 }}
          className="w-full aspect-square rounded-[24px] border-[3px] border-dashed border-[rgba(60,42,16,0.25)] bg-black/[0.02] text-[#8d7f6a] flex flex-col items-center justify-center gap-0.5 transition-colors hover:border-brand-500 hover:text-brand-600">
          <span className="text-2xl leading-none">+</span>
          <span className="font-jersey text-[12px] leading-none">MÁS</span>
        </motion.a>
      </div>

      <p className="relative text-xs text-gray-500 mt-2">
        {capacity.maxMachines} sandbox{capacity.maxMachines !== 1 ? "es" : ""}
        {capacity.reservedMachines > 0
          ? ` (${capacity.maxMachines - capacity.reservedMachines} ${capacity.planName} + ${capacity.reservedMachines} add-on${capacity.reservedMachines !== 1 ? "s" : ""})`
          : ` · plan ${capacity.planName}`}
        {` · ${(capacity.vmMemMb / 1024).toFixed(capacity.vmMemMb % 1024 ? 1 : 0)}GB · ${capacity.vcpus} vCPU · ${capacity.maxWorkersPerVm} agentes c/u. `}
        {capacity.nextPlan
          ? <a href="/planes" className="font-semibold text-brand-500 hover:underline">Sube a {capacity.nextPlan} ↗</a>
          : <a href="/dash/packs?tab=sandboxes" className="font-semibold text-brand-500 hover:underline">Añade capacidad ↗</a>}
      </p>
    </div>
  );
}

type WabaConv = { sender: string; name: string; lastText: string; lastRole: string; lastAt: string; count: number; allowed: boolean; admin: boolean; paused: boolean; permanent: boolean; until: string | null };

// Cuenta regresiva de una pausa temporizada (coexistencia con ventana). Tick cada
// 30s; null/permanente → no muestra nada.
function PauseCountdown({ until }: { until: string | null }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!until) return;
    const t = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(t);
  }, [until]);
  if (!until) return null;
  const ms = Date.parse(until) - now;
  if (!(ms > 0)) return null;
  const min = Math.ceil(ms / 60_000);
  const label = min >= 60 ? `${Math.floor(min / 60)}h ${min % 60}m` : `${min} min`;
  return <span className="ml-1 text-[10px] font-normal text-amber-500">· {label}</span>;
}

// Una fila del Inbox = una conversación, con SU PROPIO fetcher: así pausar/activar
// varias en ráfaga NO se cancelan entre sí (la causa del bug "solo queda la última").
// El override optimista da feedback instantáneo; al terminar, el padre recarga.
function ConvRow({
  c,
  mode,
  fleetAgentId,
  integrationId,
  onChanged,
}: {
  c: WabaConv;
  mode: "off" | "all" | "only";
  fleetAgentId: string;
  integrationId: string;
  onChanged: () => void;
}) {
  const act = useFetcher<{ ok?: boolean; error?: string }>();
  const [ov, setOv] = useState<{ allowed?: boolean; paused?: boolean; admin?: boolean }>({});
  const [asking, setAsking] = useState(false);
  const [pauseOpen, setPauseOpen] = useState(false); // selector de nivel de pausa
  const [clearOpen, setClearOpen] = useState(false); // confirm de "Limpiar contexto"
  const [directive, setDirective] = useState("");
  // En éxito recarga (verdad del server); en error revierte el optimismo (vuelve a
  // c.allowed/c.admin) y deja el mensaje visible para que el operador sepa qué pasó.
  useEffect(() => {
    if (act.state === "idle" && act.data) {
      if (act.data.error) setOv({}); else onChanged();
    }
  }, [act.data, act.state]);

  const allowed = ov.allowed ?? c.allowed;
  const paused = ov.paused ?? c.paused;
  const admin = ov.admin ?? c.admin;
  // Estado de carga (sin optimismo): mientras la acción está en vuelo + recarga,
  // el botón muestra spinner y se desactiva.
  const busy = act.state !== "idle";
  const busyIntent = act.formData?.get("intent") as string | undefined;
  const submit = (fields: Record<string, string>) =>
    act.submit({ fleetAgentId, integrationId, sender: c.sender, ...fields }, { method: "post" });

  // Pausa/reactiva SIN optimismo (a pedido del user): refleja la verdad del server
  // tras el reload, en vez de mostrar verde y revertir si el resume no aplicó.
  const pause = (duration: "permanent" | "30min" | "2h" = "permanent") => { setPauseOpen(false); submit({ intent: "waba-pause", duration }); };
  const resume = () => submit({ intent: "waba-resume" });
  const setAllow = (on: boolean) => { setOv((o) => ({ ...o, allowed: on })); submit({ intent: "toggle-waba-sender", on: on ? "1" : "0" }); };
  const setAdmin = (on: boolean) => { setOv((o) => ({ ...o, admin: on })); submit({ intent: "waba-set-admin", on: on ? "1" : "0" }); };
  const sendRequest = () => {
    submit({ intent: "waba-request-reply", directive });
    setAsking(false);
    setDirective("");
  };
  const clearSession = () => { setClearOpen(false); submit({ intent: "waba-clear" }); };

  return (
    <div className="py-2.5">
      <div className="flex items-center gap-3">
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold truncate">
            {/* Admin POR CONVERSACIÓN: ★ marca a este contacto como admin del número. */}
            <button type="button" onClick={() => setAdmin(!admin)}
              title={admin ? "Es admin de este número (administra el agente). Clic para quitar" : "Marcar como admin (podrá administrar el agente)"}
              className={`mr-1 text-sm leading-none align-middle ${admin ? "text-brand-500" : "text-gray-300 hover:text-gray-500"}`}>
              {admin ? "★" : "☆"}
            </button>
            {c.name || `+${c.sender}`}
            {c.name && <span className="ml-1.5 text-[10px] font-normal text-gray-400">+{c.sender}</span>}
            {admin && <span className="ml-1.5 text-[10px] font-semibold text-brand-600">admin</span>}
            {paused && <span className="ml-2 text-[10px] font-semibold text-amber-600">⏸ {c.permanent ? "pausado" : "en pausa"}<PauseCountdown until={c.until} /></span>}
          </p>
          <p className="text-[11px] text-gray-400 truncate">{paused ? "El agente no responde aquí (lo atiendes tú)" : `${c.lastRole === "agent" ? "↩︎ " : ""}${c.lastText}`}</p>
        </div>
        {/* "Solicitar respuesta" SIEMPRE disponible (cualquier estado/modo, salvo
            Apagado) — si está pausada, el envío reactiva primero. Junto a la acción
            de estado: Pausar↔Reactivar (all/coexistencia), Activar↔Desactivar (only). */}
        <div className="flex items-center gap-1.5 shrink-0">
          {/* Limpiar contexto de ESTA conversación (destructivo → confirm de 2 pasos). */}
          {clearOpen ? (
            <span className="flex items-center gap-1 text-[11px]">
              <span className="text-gray-400">¿Limpiar?</span>
              <button type="button" onClick={clearSession} disabled={busy} className="font-semibold text-red-600 hover:text-red-700 disabled:opacity-50">Sí</button>
              <button type="button" onClick={() => setClearOpen(false)} className="font-semibold text-gray-400 hover:text-gray-600">No</button>
            </span>
          ) : (
            <button type="button" onClick={() => setClearOpen(true)} disabled={busy}
              title="Limpiar el contexto del agente en esta conversación (borra memoria, empieza de cero)"
              className="text-[11px] text-gray-300 hover:text-gray-500 disabled:opacity-50">
              {busy && busyIntent === "waba-clear" ? <Spinner /> : "🧹"}
            </button>
          )}
          {mode !== "off" && (
            <button type="button" onClick={() => setAsking((v) => !v)}
              className="text-[11px] font-semibold px-2.5 py-1 rounded-full border-2 border-brand-200 text-brand-600 hover:border-brand-500 transition-colors">
              Solicitar respuesta
            </button>
          )}
          {paused ? (
            <>
              {/* Escalar una pausa TEMPORIZADA a permanente SIN reactivar primero
                  (el server ya acepta re-pausar). Oculto si ya es permanente. */}
              {!c.permanent && (
                <button type="button" onClick={() => pause("permanent")} disabled={busy}
                  title="Hacer la pausa permanente (que no se reactive sola)"
                  className="text-[11px] font-semibold px-2.5 py-1 rounded-full border-2 border-amber-200 text-amber-700 hover:border-amber-500 transition-colors disabled:opacity-50">
                  {busy && busyIntent === "waba-pause" ? <Spinner /> : "∞"}
                </button>
              )}
              <button type="button" onClick={resume} disabled={busy}
                className="text-[11px] font-semibold px-2.5 py-1 rounded-full border-2 border-amber-300 text-amber-700 hover:border-amber-500 transition-colors disabled:opacity-50">
                {busy && busyIntent === "waba-resume" ? <Spinner /> : "Reactivar"}
              </button>
            </>
          ) : mode === "off" ? (
            <span className="text-[11px] text-gray-300">—</span>
          ) : mode === "only" ? (
            allowed ? (
              <button type="button" onClick={() => setAllow(false)} disabled={busy}
                className="text-[11px] font-semibold px-2.5 py-1 rounded-full border-2 border-green-200 text-green-600 hover:border-red-300 hover:text-red-500 transition-colors disabled:opacity-50">
                {busy && busyIntent === "toggle-waba-sender" ? <Spinner /> : "Desactivar"}
              </button>
            ) : (
              <button type="button" onClick={() => setAllow(true)} disabled={busy}
                className="text-[11px] font-semibold px-2.5 py-1 rounded-full border-2 border-gray-200 text-gray-400 hover:border-brand-500 hover:text-brand-500 transition-colors disabled:opacity-50">
                {busy && busyIntent === "toggle-waba-sender" ? <Spinner /> : "Activar"}
              </button>
            )
          ) : busy && busyIntent === "waba-pause" ? (
            <span className="px-2.5 py-1"><Spinner /></span>
          ) : pauseOpen ? (
            // Nivel de pausa (como Formmy): 30 min / 2 h / permanente (∞).
            <span className="flex items-center gap-1">
              <button type="button" onClick={() => pause("30min")} className="text-[11px] font-semibold px-2 py-1 rounded-full border-2 border-amber-200 text-amber-700 hover:border-amber-400">30 min</button>
              <button type="button" onClick={() => pause("2h")} className="text-[11px] font-semibold px-2 py-1 rounded-full border-2 border-amber-200 text-amber-700 hover:border-amber-400">2 h</button>
              <button type="button" onClick={() => pause("permanent")} title="Pausa permanente" className="text-[11px] font-semibold px-2 py-1 rounded-full border-2 border-amber-300 text-amber-700 hover:border-amber-500">∞</button>
            </span>
          ) : (
            <button type="button" onClick={() => setPauseOpen(true)} disabled={busy}
              className="text-[11px] font-semibold px-2.5 py-1 rounded-full border-2 border-green-200 text-green-600 hover:border-amber-400 hover:text-amber-600 transition-colors disabled:opacity-50">
              {"Pausar agente"}
            </button>
          )}
        </div>
      </div>
      {/* "Solicitar respuesta" → opcional: directiva del operador en 3ª persona
          (one-shot, no persistente). Vacío = el agente solo contesta lo pendiente. */}
      {asking && (
        <div className="mt-2 flex flex-col gap-2">
          <textarea value={directive} onChange={(e) => setDirective(e.target.value)} rows={2}
            placeholder='Opcional: dile cómo responder (ej. "dile que estaría chido ver una peli del espacio"). Vacío = solo contesta lo pendiente.'
            className="w-full border-2 border-gray-200 rounded-lg px-2.5 py-1.5 text-xs focus:border-brand-500 outline-none resize-none" />
          <div className="flex items-center gap-2 justify-end">
            <button type="button" onClick={() => { setAsking(false); setDirective(""); }}
              className="text-[11px] font-semibold text-gray-400 hover:text-gray-700">Cancelar</button>
            <button type="button" onClick={sendRequest} disabled={busy}
              className="text-[11px] font-semibold px-3 py-1 rounded-full bg-brand-500 text-white hover:bg-brand-600 transition-colors disabled:opacity-50">
              {busy && busyIntent === "waba-request-reply" ? <Spinner /> : "Enviar respuesta"}
            </button>
          </div>
        </div>
      )}
      {act.state === "idle" && act.data?.error && (
        <p className="mt-1.5 text-[11px] text-red-600">⚠️ {act.data.error}</p>
      )}
    </div>
  );
}

// Inbox de un número WABA: ve quién le escribe al agente y elige a quién responde.
// Misma potencia que un inbox/handoff (respond.io/Chatwoot) pero en un solo modal:
// arriba el MODO (Apagado / Activo-excepto / Solo), abajo las conversaciones con su
// toggle. La coexistencia (cuando tú respondes desde tu cel) ya pausa al agente.
// La búsqueda es SERVER-side (escala a miles de conversaciones).
function WabaInboxModal({
  modal,
  onClose,
}: {
  modal: { fleetAgentId: string; integrationId: string; subject: string; mode: "off" | "all" | "only" };
  onClose: () => void;
}) {
  const conv = useFetcher<{ conversations: WabaConv[] }>();
  const modeAct = useFetcher<{ ok?: boolean; error?: string }>();
  const [mode, setMode] = useState(modal.mode);
  const [q, setQ] = useState("");
  // Cerrar con ESC.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);
  const baseUrl = `/api/v2/fleet-agents/${modal.fleetAgentId}/waba-inbox?integrationId=${encodeURIComponent(modal.integrationId)}`;
  const reloadInbox = () => conv.load(q ? `${baseUrl}&q=${encodeURIComponent(q)}` : baseUrl);
  // Carga al abrir + búsqueda server-side (debounced). Reacciona a q.
  useEffect(() => {
    const t = setTimeout(() => conv.load(q ? `${baseUrl}&q=${encodeURIComponent(q)}` : baseUrl), 250);
    return () => clearTimeout(t);
  }, [q, baseUrl]);
  // Cambio de modo (su propio fetcher) → recarga al confirmar; en error revierte el
  // segmentado al modo previo del server y deja el mensaje visible.
  useEffect(() => {
    if (modeAct.state === "idle" && modeAct.data) {
      if (modeAct.data.error) setMode(modal.mode); else reloadInbox();
    }
  }, [modeAct.data, modeAct.state]);

  const setModeNow = (m: "off" | "all" | "only") => {
    setMode(m);
    modeAct.submit({ intent: "set-waba-mode", fleetAgentId: modal.fleetAgentId, integrationId: modal.integrationId, mode: m }, { method: "post" });
  };

  const conversations = conv.data?.conversations ?? [];
  const loading = conv.state === "loading" && !conv.data;
  const MODES: Array<{ key: "off" | "all" | "only"; label: string; hint: string }> = [
    { key: "off", label: "Apagado", hint: "No responde a nadie" },
    { key: "all", label: "Activo", hint: "Responde a todos, excepto los pausados" },
    { key: "only", label: "Solo a…", hint: "Responde solo a los que actives" },
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div className="bg-white border-2 border-black rounded-2xl w-full max-w-md max-h-[85vh] overflow-y-auto p-5" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-1">
          <h3 className="font-semibold text-lg">Conversaciones</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-black text-xl leading-none">✕</button>
        </div>
        <p className="text-sm text-gray-500 mb-4 truncate">{modal.subject}</p>

        {/* MODO — segmentado de 3 estados */}
        <div className="grid grid-cols-3 gap-1 p-1 bg-gray-100 rounded-xl mb-1">
          {MODES.map((m) => (
            <button key={m.key} type="button" onClick={() => setModeNow(m.key)}
              className={`text-xs font-semibold py-1.5 rounded-lg transition-colors ${mode === m.key ? "bg-white shadow-sm text-black" : "text-gray-500 hover:text-gray-800"}`}>
              {m.label}
            </button>
          ))}
        </div>
        <p className="text-[11px] text-gray-400 mb-4">{MODES.find((m) => m.key === mode)?.hint}</p>
        {modeAct.state === "idle" && modeAct.data?.error && (
          <p className="text-[11px] text-red-600 mb-4">⚠️ No se pudo cambiar el modo: {modeAct.data.error}</p>
        )}

        {/* Buscador SERVER-side por nombre o dígitos (escala a miles). */}
        <input value={q} onChange={(e) => setQ(e.target.value)}
          placeholder="Buscar por nombre o número"
          className="w-full mb-3 border-2 border-gray-200 rounded-lg px-2.5 py-1.5 text-sm focus:border-brand-500 outline-none" />

        {/* CONVERSACIONES */}
        {loading ? (
          <div className="flex flex-col gap-2 py-2">
            {[0, 1, 2].map((i) => <div key={i} className="h-9 bg-gray-100 rounded-lg animate-pulse" />)}
          </div>
        ) : conversations.length === 0 ? (
          <p className="text-xs text-gray-400 py-4 text-center">{q ? `Sin resultados para “${q}”.` : "Nadie le ha escrito a este número todavía."}</p>
        ) : (
          <div className="flex flex-col divide-y divide-gray-100">
            {conversations.map((c) => (
              <ConvRow key={c.sender} c={c} mode={mode} fleetAgentId={modal.fleetAgentId} integrationId={modal.integrationId} onChanged={reloadInbox} />
            ))}
          </div>
        )}

        <p className="mt-4 pt-3 border-t border-gray-100 text-[11px] text-gray-400">
          La coexistencia siempre está activa: si respondes desde tu teléfono, el agente se pausa solo en esa conversación. Aquí lo reactivas, le pides que responda, o marcas quién es admin.
        </p>
      </div>
    </div>
  );
}

// Drawer de prueba: chatea con un fleet agent SIN canales conectados. POSTea a
// /api/v2/fleet-agents/:id/message-stream (Bearer = token del agente) y stremea la
// respuesta token-por-token. El primer mensaje levanta el VM del cerebro (~segundos).
// Portado del AgentLivePreview de ghosty-studio, autocontenido (texto plano, sin deps).
function TestChatDrawer({
  agent,
  onClose,
}: {
  agent: { id: string; name: string | null; token: string };
  onClose: () => void;
}) {
  const [msgs, setMsgs] = useState<Array<{ role: "user" | "bot"; text: string }>>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [loadingHistory, setLoadingHistory] = useState(true);
  const bodyRef = useRef<HTMLDivElement>(null);
  // groupId ESTABLE por agente (no aleatorio) → la conversación persiste server-side
  // en FleetAgentMessage (igual que los canales) y el cerebro la resume por sessionUuid.
  const groupId = `web-test-${agent.id}`;

  // Carga el historial persistido al abrir → no se pierde el hilo al cerrar/reabrir.
  useEffect(() => {
    let alive = true;
    fetch(`/api/v2/fleet-agents/${agent.id}/message-stream?groupId=${encodeURIComponent(groupId)}`, {
      headers: { Authorization: `Bearer ${agent.token}` },
    })
      .then((r) => (r.ok ? r.json() : { messages: [] }))
      .then((d: { messages?: Array<{ role: string; text: string }> }) => {
        if (alive && Array.isArray(d.messages) && d.messages.length) {
          setMsgs(d.messages.map((m) => ({ role: m.role === "user" ? "user" : "bot", text: m.text })));
        }
      })
      .catch(() => {})
      .finally(() => { if (alive) setLoadingHistory(false); });
    return () => { alive = false; };
  }, [agent.id, agent.token, groupId]);

  useEffect(() => {
    bodyRef.current?.scrollTo({ top: bodyRef.current.scrollHeight });
  }, [msgs]);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  async function send() {
    const text = input.trim();
    if (!text || busy) return;
    setBusy(true);
    setInput("");
    setMsgs((m) => [...m, { role: "user", text }, { role: "bot", text: "" }]);
    const setLastBot = (fn: (prev: string) => string) =>
      setMsgs((m) => {
        const n = [...m];
        n[n.length - 1] = { role: "bot", text: fn(n[n.length - 1].text) };
        return n;
      });
    try {
      const res = await fetch(`/api/v2/fleet-agents/${agent.id}/message-stream`, {
        method: "POST",
        headers: { Authorization: `Bearer ${agent.token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ groupId, sender: "web-test", text }),
      });
      if (!res.ok || !res.body) {
        const errText = await res.text().catch(() => "");
        setLastBot(() => `⚠️ Error ${res.status}${errText ? ` — ${errText.slice(0, 140)}` : ""}`);
        return;
      }
      const reader = res.body.getReader();
      const dec = new TextDecoder();
      let buf = "";
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += dec.decode(value, { stream: true });
        let nl: number;
        while ((nl = buf.indexOf("\n\n")) !== -1) {
          const dl = buf.slice(0, nl).split("\n").find((l) => l.startsWith("data: "));
          buf = buf.slice(nl + 2);
          if (!dl) continue;
          try {
            const e = JSON.parse(dl.slice(6));
            if (e.type === "chunk" && typeof e.value === "string") setLastBot((p) => p + e.value);
            // done trae la respuesta autoritativa completa → reemplaza (por si hubo re-emisión).
            else if (e.type === "done" && typeof e.value === "string") setLastBot(() => e.value);
            else if (e.type === "error") setLastBot(() => `⚠️ ${e.message || "error"}`);
          } catch {
            /* ignore malformed event */
          }
        }
      }
    } catch (err) {
      setLastBot(() => `⚠️ ${err instanceof Error ? err.message : "error de red"}`);
    } finally {
      setBusy(false);
    }
  }

  return (
    // Padre orquesta open/exit con variants → AnimatePresence espera la salida
    // (backdrop fade + panel slide) antes de desmontar. Sin props animables propias.
    <motion.div
      className="fixed inset-0 z-50 flex justify-end"
      role="dialog"
      aria-modal="true"
      initial="closed"
      animate="open"
      exit="closed"
    >
      <motion.div
        className="absolute inset-0 bg-black/40"
        onClick={onClose}
        variants={{ open: { opacity: 1 }, closed: { opacity: 0 } }}
        transition={{ duration: 0.25, ease: "easeOut" }}
      />
      <motion.div
        className="relative w-full max-w-md h-full bg-white shadow-2xl flex flex-col"
        variants={{ open: { x: 0 }, closed: { x: "100%" } }}
        transition={{ type: "tween", ease: [0.22, 1, 0.36, 1], duration: 0.34 }}
      >
        <header className="flex items-center gap-2 px-4 py-3 border-b-2 border-black">
          <div className="w-8 h-8 rounded-full bg-brand-500 flex items-center justify-center text-white text-sm">🤖</div>
          <div className="min-w-0 flex-1">
            <p className="font-bold truncate">{agent.name || "Agente"}</p>
            <p className="text-[11px] text-gray-400">prueba en vivo · sin canales</p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-black text-xl leading-none">✕</button>
        </header>
        <div ref={bodyRef} className="flex-1 overflow-y-auto px-4 py-4 space-y-3 bg-gray-50">
          {loadingHistory ? (
            // Skeleton mientras carga el historial persistido (FleetAgentMessage).
            <div className="space-y-3 animate-pulse" aria-label="Cargando conversación">
              {[["left", "w-2/3"], ["right", "w-1/2"], ["left", "w-3/4"], ["right", "w-1/3"]].map(
                ([side, w], i) => (
                  <div key={i} className={`flex ${side === "right" ? "justify-end" : "justify-start"}`}>
                    <div className={`h-9 ${w} rounded-2xl ${side === "right" ? "bg-brand-500/20 rounded-br-md" : "bg-gray-200 rounded-bl-md"}`} />
                  </div>
                ),
              )}
            </div>
          ) : msgs.length === 0 ? (
            <p className="h-full flex items-center justify-center text-sm text-gray-400 text-center">
              Escribe para probar tu agente.
              <br />
              El primer mensaje levanta el cerebro (~unos segundos).
            </p>
          ) : (
            msgs.map((m, i) => (
              <div key={i} className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
                <div
                  className={`max-w-[80%] px-3.5 py-2 rounded-2xl text-sm whitespace-pre-wrap break-words ${
                    m.role === "user"
                      ? "bg-brand-500 text-white rounded-br-md"
                      : "bg-white border-2 border-gray-200 text-gray-900 rounded-bl-md"
                  }`}
                >
                  {m.text || (m.role === "bot" ? <span className="text-gray-400">escribiendo…</span> : "")}
                </div>
              </div>
            ))
          )}
        </div>
        <form className="p-3 border-t-2 border-black flex gap-2" onSubmit={(e) => { e.preventDefault(); send(); }}>
          <input value={input} onChange={(e) => setInput(e.target.value)} placeholder="Escribe un mensaje…"
            className="flex-1 px-4 py-2.5 border-2 border-black rounded-xl text-sm focus:outline-none" />
          <button type="submit" disabled={busy || !input.trim()}
            className="px-4 py-2.5 bg-brand-500 text-white rounded-xl text-sm font-semibold disabled:opacity-40 disabled:cursor-not-allowed">
            {busy ? "…" : "Enviar"}
          </button>
        </form>
      </motion.div>
    </motion.div>
  );
}

export default function Pools({ loaderData }: Route.ComponentProps) {
  // HUD en estado local para que el poll de 2.5s lo actualice SIN useRevalidator
  // (que propaga un 5xx transitorio al ErrorBoundary y deja la página muerta).
  // Sembrado de loaderData; re-sincronizado cuando el loader revalida (acción/nav).
  const [hud, setHud] = useState(loaderData);
  useEffect(() => setHud(loaderData), [loaderData]);
  const { secretNames, pools, capacity, sharedPools, buckets } = hud;
  const fetcher = useFetcher();
  const rev = useRevalidator();
  const [showForm, setShowForm] = useState(false);
  const [name, setName] = useState("");
  const [oauthChoice, setOauthChoice] = useState(secretNames.includes(DEFAULT_OAUTH) ? DEFAULT_OAUTH : secretNames[0] ?? "__new__");
  const [brain, setBrain] = useState(DEFAULT_BRAIN);
  const [llm, setLlm] = useState("deepseek");
  const [newOauth, setNewOauth] = useState("");
  const hasSecrets = secretNames.length > 0;
  const pasteNew = oauthChoice === "__new__" || !hasSecrets;

  const busy = fetcher.state !== "idle";
  const bIntent = fetcher.formData?.get("intent") as string | undefined;
  const bPool = fetcher.formData?.get("fleetAgentId") as string | undefined;
  const isBusy = (intent: string, fleetAgentId?: string) => busy && bIntent === intent && (fleetAgentId === undefined || bPool === fleetAgentId);

  const polling = pools.some(
    (p) =>
      p.status === "qr_pending" || p.status === "pairing" || p.status === "connecting" ||
      p.status === "connected" || // live: ver VMs aparecer/apagarse sin refrescar
      (p.machines?.length ?? 0) > 0
  );
  const [phones, setPhones] = useState<Record<string, string>>({});
  const [showAllGroups, setShowAllGroups] = useState<Record<string, boolean>>({});
  // Which group's capabilities modal is open: { fleetAgentId, groupId } | null.
  const [capModal, setCapModal] = useState<{ fleetAgentId: string; groupId: string } | null>(null);
  // Inbox WABA: ver conversaciones de un número + elegir a quién responde.
  const [inboxModal, setInboxModal] = useState<{ fleetAgentId: string; integrationId: string; subject: string; mode: "off" | "all" | "only" } | null>(null);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [showIdentity, setShowIdentity] = useState(false);
  // Abierto/cerrado por agente — PERSISTIDO en localStorage para que recuerde el
  // estado entre recargas. Client-only (carga en useEffect, no en el initializer)
  // para no romper la hidratación SSR.
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  // Agente abierto en el drawer de prueba (chat instantáneo sin canales).
  const [chatAgent, setChatAgent] = useState<{ id: string; name: string | null; token: string } | null>(null);
  useEffect(() => {
    try {
      const s = localStorage.getItem("flota:expanded");
      if (s) setExpanded(JSON.parse(s));
    } catch {}
  }, []);
  const toggleExpanded = (id: string, open: boolean) =>
    setExpanded((s) => {
      const next = { ...s, [id]: open };
      try { localStorage.setItem("flota:expanded", JSON.stringify(next)); } catch {}
      return next;
    });
  const [editingName, setEditingName] = useState<string | null>(null);
  const [draftName, setDraftName] = useState("");
  const [optimisticNames, setOptimisticNames] = useState<Record<string, string>>({});
  const [wabaConnecting, setWabaConnecting] = useState<string | null>(null);
  const [wabaError, setWabaError] = useState<string | null>(null);
  // Tabs por canal (baileys/waba/…) + ⚙ ajustes del canal abierto, por fleetAgent.
  const [activeChannel, setActiveChannel] = useState<Record<string, string>>({});
  const [chSettings, setChSettings] = useState<Record<string, boolean>>({});
  // Connect a WhatsApp Business number: ask our server for Formmy's signed popup
  // URL, open it, and wait for the popup to postMessage { code, phoneNumberId,
  // wabaId } back. We forward that to /waba/connect (which provisions via Formmy
  // and writes wabaConfig), then revalidate so the new number shows in the card.
  const connectWaba = async (fleetAgentId: string) => {
    setWabaConnecting(fleetAgentId);
    // Abrir la ventana SÍNCRONO dentro del gesto del clic. Si esperamos al
    // `await fetch`, el navegador bloquea window.open como popup no iniciado por
    // el usuario (era el "Business no abre nada"). Abrimos about:blank ya, y
    // luego la navegamos a la URL firmada de Formmy cuando llega.
    const popup = window.open("about:blank", "waba-connect", "width=600,height=760");
    try {
      const res = await fetch(`/api/v2/fleet-agents/${fleetAgentId}/waba/connect/start`, { method: "POST" });
      const { popupUrl, error } = await res.json();
      if (!popupUrl) throw new Error(error || "no popup");
      if (popup) popup.location.href = popupUrl;
      else window.open(popupUrl, "waba-connect", "width=600,height=760");
      const onMsg = async (e: MessageEvent) => {
        if (!/(^|\.)formmy\.app$/.test(new URL(e.origin).hostname)) return;
        const d = e.data as { type?: string; error?: string; code?: string; phoneNumberId?: string; wabaId?: string };
        if (d?.type === "formmy-waba-error") {
          window.removeEventListener("message", onMsg);
          try { popup?.close(); } catch {}
          setWabaConnecting(null);
          setWabaError(`Meta rechazó la conexión: ${d.error || "error desconocido"}`);
          return;
        }
        // Coexistencia (mismo número que ya usa la app de WhatsApp) NO devuelve
        // `code`, solo wabaId + phoneNumberId — igual que el contrato de Formmy.
        // Exigir `code` aquí descartaba el mensaje en silencio (el bug original).
        if (!d?.phoneNumberId || !d?.wabaId) return;
        window.removeEventListener("message", onMsg);
        try { popup?.close(); } catch {}
        // NO tragar el fallo: si provision revienta, el usuario debe enterarse
        // (antes un .catch(()=>{}) dejaba "todo ok" falso con nada guardado).
        const r = await fetch(`/api/v2/fleet-agents/${fleetAgentId}/waba/connect`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(d),
        }).catch(() => null);
        setWabaConnecting(null);
        if (!r || !r.ok) {
          const msg = r ? ((await r.json().catch(() => ({}))).error ?? `HTTP ${r.status}`) : "sin conexión";
          setWabaError(`No se pudo guardar la conexión: ${msg}`);
          return;
        }
        setWabaError(null);
        rev.revalidate();
      };
      window.addEventListener("message", onMsg);
    } catch (e) {
      console.error("[waba connect] failed", e);
      setWabaConnecting(null);
    }
  };
  // Poll del HUD vía fetch crudo: un fallo transitorio (ventana de ~50s mientras
  // Fly reemplaza la única máquina en un deploy) se traga y reintenta al próximo
  // tick — la página NO se desmonta al ErrorBoundary como con rev.revalidate().
  useEffect(() => {
    if (!polling) return;
    let alive = true;
    const tick = async () => {
      try {
        const res = await fetch("/dash/flota/poll", { headers: { Accept: "application/json" } });
        if (!res.ok) return; // 5xx en deploy/restart → salta este tick, reintenta
        const next = await res.json();
        if (alive) setHud(next);
      } catch { /* blip de red mientras se reemplaza la máquina → ignora, se autocura */ }
    };
    const t = setInterval(tick, 2500);
    return () => { alive = false; clearInterval(t); };
  }, [polling]);
  // Modal de capacidades: cerrar con ESC + bloquear el scroll del body mientras
  // está abierto. Cleanup restaura el overflow previo y quita el listener.
  useEffect(() => {
    if (!capModal) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setCapModal(null); };
    document.addEventListener("keydown", onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [capModal]);

  return (
    <div className="max-w-7xl mx-auto p-6">
      <div className="flex items-center gap-2 mb-1">
        <h1 className="text-2xl font-bold">Tu flota de agentes</h1>
        <span className="group relative inline-flex">
          <button type="button" aria-label="¿Qué es la flota?"
            className="w-5 h-5 rounded-full border-2 border-black text-xs font-bold flex items-center justify-center text-gray-600 hover:bg-black hover:text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500">
            ?
          </button>
          <span className="pointer-events-none group-hover:pointer-events-auto group-focus-within:pointer-events-auto absolute left-0 top-7 z-10 w-64 opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 transition-opacity border-2 border-black rounded-xl bg-white p-3 text-sm text-gray-600 shadow-[2px_2px_0_0_#000]">
            Agentes Ghosty que atienden tus grupos de WhatsApp. Conecta por QR y elige los grupos.{" "}
            <a href="/docs#flota" target="_blank" rel="noopener noreferrer" className="text-brand-500 font-semibold underline">Ver documentación →</a>
          </span>
        </span>
      </div>
      <p className="text-gray-500 mb-6">Crea un agente, conéctalo a WhatsApp y atiende tus grupos. Se levanta bajo demanda.</p>

      {/* Layout: IZQUIERDA el HUD (mayoría, 2/3, sticky); DERECHA la lista de
          agentes apilada en una columna (1/3). En mobile se apila todo. */}
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-4 items-start">

      {/* IZQUIERDA — HUD estilo videojuego. Las VMs son CONTENEDORES; dentro viven
          los agentes (ojitos de la marca); color por ocupación. Ocupa 3/5 y queda
          sticky al hacer scroll de la lista de agentes. */}
      <div className="lg:col-span-3 lg:self-start lg:sticky lg:top-6">
        <CapacityHud capacity={capacity} />
      </div>

      {/* DERECHA — columna de agentes (2/5): Nuevo agente + las cards apiladas. */}
      <div className="lg:col-span-2 flex flex-col gap-4">

      {/* Nuevo agente — colapsada: solo Ghosty + descripción + botón sutil. El form
          se abre bajo demanda (lo trabajamos a fondo después). */}
      <div className="border-2 border-black rounded-xl p-4 animate-fade-in bg-white">
        <div className="flex items-center gap-3">
          <div className="shrink-0 w-16 h-16 rounded-xl bg-brand-500/10 border-2 border-black flex items-center justify-center">
            <GhostyMascot className="w-10 h-12" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-bold text-lg leading-none">Ghosty</span>
              <a href="https://formmy.app/ghosty" target="_blank" rel="noopener noreferrer"
                className="text-xs font-semibold text-brand-500 bg-brand-500/10 px-2 py-0.5 rounded-full hover:bg-brand-500/20 transition-colors whitespace-nowrap">
                Powered by Formmy ↗
              </a>
            </div>
            <p className="text-xs text-gray-500 leading-snug mt-1">Tu agente de WhatsApp. Atiende grupos, crea documentos y sube archivos — se levanta bajo demanda.</p>
          </div>
          {!showForm && (
            <button type="button" onClick={() => setShowForm(true)}
              className="shrink-0 text-sm font-semibold text-brand-500 border-2 border-brand-500/30 rounded-lg px-3 py-2 hover:bg-brand-500/5 transition-colors">
              + Crear
            </button>
          )}
        </div>
        {!showForm ? null : (
        <fetcher.Form method="post" className="flex flex-col gap-3 mt-4">
          <input type="hidden" name="intent" value="create" />
          <input name="name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Atención a cliente"
            className="border-2 border-black rounded-lg px-3 py-2" />

          <label className="text-sm font-semibold">Cerebro</label>
          <select name="workerTemplate" value={brain} onChange={(e) => setBrain(e.target.value)}
            className="border-2 border-black rounded-lg px-3 py-2 bg-white">
            {BRAINS.map((b) => <option key={b.value} value={b.value}>{b.label}</option>)}
          </select>

          {/* ghostycode corre con la key que elijas: DeepSeek (tu key, off-meter) o el
              proxy medido de EasyBits. Requiere el secret correspondiente en Secretos. */}
          {brain === "ghosty-gc" && (
            <>
              <label className="text-sm font-semibold">Motor del LLM</label>
              <select name="llm" value={llm} onChange={(e) => setLlm(e.target.value)}
                className="border-2 border-black rounded-lg px-3 py-2 bg-white">
                <option value="deepseek">DeepSeek — tu propia key (off-meter). Necesita el secret DEEPSEEK_API_KEY.</option>
                <option value="easybits">EasyBits — medido, se cobra a tu plan.</option>
              </select>
            </>
          )}

          {/* OAuth de Claude solo aplica a cerebros Claude; los DeepSeek corren con DEEPSEEK_API_KEY. */}
          {brain === "claude-worker" && (
            <>
              <label className="text-sm font-semibold">OAuth de Claude (cuenta Max)</label>
              {hasSecrets && (
                <select name="oauthSecretName" value={oauthChoice} onChange={(e) => setOauthChoice(e.target.value)}
                  className="border-2 border-black rounded-lg px-3 py-2 bg-white">
                  {secretNames.map((n) => <option key={n} value={n}>{n}</option>)}
                  <option value="__new__">➕ Pegar nuevo…</option>
                </select>
              )}
              {pasteNew && (
                <div className="flex flex-col gap-2">
                  <input name="newOauth" value={newOauth} onChange={(e) => setNewOauth(e.target.value)} type="password"
                    placeholder="sk-ant-oat..." className="border-2 border-black rounded-lg px-3 py-2 font-mono text-sm" />
                  <input name="newOauthName" defaultValue={DEFAULT_OAUTH}
                    className="border-2 border-black rounded-lg px-3 py-2 font-mono text-xs text-gray-500"
                    title="Nombre del secreto en el vault" />
                  <span className="text-xs text-gray-400">Se guarda cifrado en Secretos.</span>
                </div>
              )}
            </>
          )}

          <div className="flex items-center gap-3">
            <button disabled={isBusy("create")} className="self-start bg-brand-500 text-white rounded-lg px-4 py-2 font-semibold disabled:opacity-60">
              {isBusy("create") ? <Spinner /> : "+ Crear Agente"}
            </button>
            <button type="button" onClick={() => setShowForm(false)} className="text-sm text-gray-400 hover:text-gray-600">Cancelar</button>
          </div>
        </fetcher.Form>
        )}
      </div>

      {pools.length === 0 && <p className="text-gray-400 text-sm">Aún no tienes agentes.</p>}
        {pools.map((p) => {
          const st = STATUS[p.status as keyof typeof STATUS] ?? STATUS.disconnected;
          const stale = p.status === "connected" && !p.live;
          // Se desvinculó (logout de WhatsApp) y NO está en throttle → estado
          // recuperable: el surface auto-regenera un QR. No es un "Falló" rojo.
          const relinking = !p.throttledUntil && (p.connReason === "relink" || (p.status === "failed" && p.connReason === "logged_out"));
          // Forzar abierto durante flujos de conexión (QR/pairing/relink) para no esconder el código.
          const inFlow = p.status === "connecting" || p.status === "qr_pending" || p.status === "pairing" || relinking || !!p.qrDataUrl || !!p.pairingCode;
          const isOpen = (expanded[p.id] ?? false) || inFlow;
          // Optimistic name: muestra el valor recién escrito hasta que el loader se ponga al día.
          const displayName = (optimisticNames[p.id] ?? p.name) || "";
          return (
            <div key={p.id} className="border-2 border-black rounded-xl p-4 animate-fade-in">
              <div className="w-full flex items-center justify-between gap-2">
                <div className="flex items-center gap-2 min-w-0 flex-1">
                  <button type="button" onClick={() => !inFlow && toggleExpanded(p.id, !isOpen)}
                    className={`shrink-0 ${inFlow ? "cursor-default" : ""}`} aria-label={isOpen ? "Contraer" : "Expandir"}>
                    <svg className={`w-4 h-4 text-gray-400 transition-transform ${isOpen ? "rotate-90" : ""} ${inFlow ? "opacity-0" : ""}`}
                      viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M7.21 14.77a.75.75 0 0 1 .02-1.06L11.168 10 7.23 6.29a.75.75 0 1 1 1.04-1.08l4.5 4.25a.75.75 0 0 1 0 1.08l-4.5 4.25a.75.75 0 0 1-1.06-.02Z" clipRule="evenodd" /></svg>
                  </button>
                  {editingName === p.id ? (
                    <input autoFocus value={draftName} onChange={(e) => setDraftName(e.target.value)}
                      onBlur={() => { const v = draftName.trim(); if (v !== displayName) { setOptimisticNames((s) => ({ ...s, [p.id]: v })); fetcher.submit({ intent: "rename", fleetAgentId: p.id, name: v }, { method: "post" }); } setEditingName(null); }}
                      onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); if (e.key === "Escape") setEditingName(null); }}
                      placeholder="Sin nombre"
                      className="font-bold border-b-2 border-brand-500 bg-transparent outline-none min-w-0 flex-1 px-0.5" />
                  ) : (
                    <button type="button" title="Clic para renombrar"
                      onClick={() => { setEditingName(p.id); setDraftName(displayName); }}
                      className="font-bold truncate text-left hover:underline decoration-dotted underline-offset-4">
                      {displayName || "Sin nombre"}
                    </button>
                  )}
                </div>
                <button type="button" onClick={() => setChatAgent({ id: p.id, name: p.name, token: p.token })}
                  title="Probar el agente en un chat, sin conectar canales"
                  className="shrink-0 text-xs font-semibold px-2.5 py-1 rounded-full border-2 border-brand-500/40 text-brand-600 hover:bg-brand-500/5">
                  💬 Probar
                </button>
                <span className="flex items-center gap-2 text-sm font-semibold shrink-0">
                  {/* Estado AGREGADO del agente, no de un canal: está "Activo" si
                      PUEDE recibir por cualquier vía (Baileys vivo o WABA con números).
                      El estado granular por canal (QR, Falló) vive en su pestaña. Así
                      un fallo de Baileys no contradice un WABA conectado en el header. */}
                  {(() => {
                    const baileysUp = p.status === "connected" && p.live;
                    const wabaUp = p.wabaNumbers.length > 0;
                    if (baileysUp || wabaUp) return (<><span className="w-2.5 h-2.5 rounded-full bg-green-500" />Activo</>);
                    if (stale) return (<><span className="w-2.5 h-2.5 rounded-full bg-orange-400" />Reconectando…</>);
                    if (relinking) return (<><span className="w-2.5 h-2.5 rounded-full bg-orange-400 animate-pulse" />Se desvinculó, generando QR…</>);
                    return (<><span className={`w-2.5 h-2.5 rounded-full ${st.dot}`} />{st.label}</>);
                  })()}
                </span>
              </div>

              {/* Default del agente (solo lectura) — qué heredan los números/grupos
                  nuevos. La edición fina ahora vive en "Capacidades" POR NÚMERO. */}
              {(() => {
                const total = (p.restricted ? p.activeBuckets.length : 0) + p.defaultMcps.length;
                return (
                  <div className="mt-2 flex items-center gap-2 text-xs">
                    <span className="text-gray-400">Default:</span>
                    <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full border-2 border-gray-200 font-semibold text-gray-600"
                      title="Lo que heredan los números/grupos nuevos. Edita por número en Capacidades.">
                      {p.restricted
                        ? `${total} capacidad${total === 1 ? "" : "es"}`
                        : p.defaultMcps.length
                          ? `Completo + ${p.defaultMcps.length} conector${p.defaultMcps.length === 1 ? "" : "es"}`
                          : "Sin restricción"}
                    </span>
                  </div>
                );
              })()}

              {isOpen && (() => {
                // Cada canal es un MÓDULO uniforme { kind, label, dot, count }. Los
                // grupos son los destinos del canal Baileys; los números, los de WABA.
                // Añadir Slack/Web = un descriptor más aquí, cero UI a medida.
                // Tab por defecto: respeta la elección del usuario; si no hay,
                // abre en el canal EN USO. Si Baileys no está conectado (ni en flujo
                // de conexión) pero WABA tiene números → arranca en WABA, para no
                // caer siempre en una tab de un canal en desuso.
                const baileysIdle = !inFlow && p.status !== "connected" && !p.live;
                const defaultCh = baileysIdle && p.wabaNumbers.length > 0 ? "waba" : "baileys";
                const activeCh = inFlow ? "baileys" : (activeChannel[p.id] ?? defaultCh);
                const settingsOpen = chSettings[p.id] ?? false;
                // Solo cuando el surface está vivo de verdad tiene sentido ver/configurar
                // grupos: desconectado/relinking → la sesión Baileys no existe, así que
                // los toggles no harían nada hasta reconectar. Los ocultamos para no
                // ofrecer config inerte (los enabledGroups persisten igual en la DB).
                const liveConnected = p.status === "connected" && p.live;
                const channels = [
                  { kind: "baileys", label: "Personal y grupos (QR)", dot: (stale || relinking) ? "bg-orange-400" : st.dot, count: p.conversations },
                  { kind: "waba", label: "WhatsApp Business API", dot: p.wabaNumbers.length ? "bg-green-500" : "bg-gray-300", count: p.wabaNumbers.length },
                ];
                return (<>
                {/* Tabs por canal */}
                <div className="mt-4 flex items-center gap-1 border-b-2 border-gray-100">
                  {channels.map((c) => { const on = activeCh === c.kind; return (
                    <button key={c.kind} type="button" onClick={() => setActiveChannel((s) => ({ ...s, [p.id]: c.kind }))}
                      className={`flex items-center gap-1.5 px-3 py-2 text-sm font-semibold border-b-2 -mb-0.5 transition-colors ${on ? "border-brand-500 text-brand-600" : "border-transparent text-gray-400 hover:text-gray-700"}`}>
                      <span className={`w-2 h-2 rounded-full ${c.dot}`} /><span>{c.label}</span>
                      {c.count > 0 && <span className="text-[10px] leading-none bg-gray-100 text-gray-600 rounded-full px-1.5 py-0.5">{c.count}</span>}
                    </button> ); })}
                  <button type="button" disabled title="Más canales (Slack, Web…) próximamente"
                    className="ml-auto px-2.5 py-1 text-lg leading-none text-gray-300 cursor-default">+</button>
                </div>

                {/* ── Canal WhatsApp (Baileys) ──────────────────────────── */}
                {activeCh === "baileys" && (<div className="mt-3">
                  {p.qrDataUrl && (
                    <div className="mb-4 flex flex-col items-center">
                      <img src={p.qrDataUrl} alt="QR de WhatsApp" className="w-56 h-56" />
                      <p className="text-sm text-gray-500 mt-2">WhatsApp → Dispositivos vinculados → Vincular dispositivo</p>
                    </div>
                  )}
                  {p.pairingCode && (
                    <div className="mb-4 flex flex-col items-center">
                      <div className="text-3xl font-mono font-bold tracking-widest border-2 border-black rounded-lg px-4 py-3">{p.pairingCode}</div>
                      <p className="text-sm text-gray-500 mt-2 text-center">WhatsApp → Dispositivos vinculados → Vincular con número de teléfono → teclea este código</p>
                    </div>
                  )}

                  {liveConnected ? (
                    <div>
                      <div className="flex items-center justify-between mb-2">
                        <span className="font-semibold text-sm">Grupos que atiende</span>
                        <span className="text-xs text-gray-400">{p.conversations} conv.</span>
                      </div>
                      {p.groups.length === 0 && <p className="text-xs text-gray-400">No se ven grupos aún. Solo responde en los que actives.</p>}
                      {(() => {
                        const active = p.groups.filter((g) => g.enabled);
                        const others = p.groups.filter((g) => !g.enabled);
                        const open = showAllGroups[p.id] ?? false;
                        const GroupRow = (g: { id: string; subject: string; enabled: boolean; mcps: string[] }) => {
                          const isMain = p.mainGroupJid === g.id;
                          const capCount = p.builtins.length + g.mcps.length;
                          return (
                          <motion.div key={g.id} layout="position" className="flex items-center justify-between gap-2"
                            initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -4 }}
                            transition={{ type: "spring", stiffness: 500, damping: 34 }}>
                            <Switch value={g.enabled} label={g.subject}
                              className={`text-sm items-center flex-1 min-w-0 ${g.enabled ? "font-semibold" : "text-gray-600"}`}
                              onChange={(on) => fetcher.submit({ intent: "toggle-group", fleetAgentId: p.id, groupId: g.id, on: on ? "1" : "0" }, { method: "post" })} />
                            {g.enabled && (
                              <div className="flex items-center gap-2 shrink-0">
                                <button type="button" title="Capacidades y conexión de este grupo"
                                  onClick={() => setCapModal({ fleetAgentId: p.id, groupId: g.id })}
                                  className="flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1.5 rounded-lg border-2 border-gray-200 text-gray-600 hover:border-brand-500 hover:text-brand-500 transition-colors">
                                  <span className="text-sm leading-none">⚡</span><span>Capacidades</span>
                                  <span className="text-[10px] leading-none bg-gray-100 text-gray-600 rounded-full px-1.5 py-0.5">{capCount}</span>
                                </button>
                                <button type="button"
                                  title={isMain ? "Grupo main (admin) — clic para quitar" : "Marcar como grupo main (admin)"}
                                  onClick={() => fetcher.submit({ intent: "set-main", fleetAgentId: p.id, groupId: g.id }, { method: "post" })}
                                  className={`flex items-center gap-1 text-xs font-semibold px-2.5 py-1.5 rounded-lg border-2 transition-colors ${isMain ? "border-brand-500 bg-brand-500 text-white" : "border-gray-200 text-gray-400 hover:border-gray-400 hover:text-gray-700"}`}>
                                  <span className="text-sm leading-none">{isMain ? "★" : "☆"}</span><span>Main</span>
                                </button>
                              </div>
                            )}
                          </motion.div>
                          );
                        };
                        return (
                          <div className="flex flex-col gap-1.5">
                            <AnimatePresence mode="popLayout" initial={false}>
                              {active.map(GroupRow)}
                              {open && others.map(GroupRow)}
                            </AnimatePresence>
                            {others.length > 0 && (
                              <button type="button" onClick={() => setShowAllGroups((s) => ({ ...s, [p.id]: !open }))}
                                className="self-start text-xs text-brand-500 font-semibold mt-1 hover:underline">
                                {open ? "Ocultar grupos no activos" : `+ ${others.length} grupo${others.length !== 1 ? "s" : ""} no activo${others.length !== 1 ? "s" : ""}`}
                              </button>
                            )}
                          </div>
                        );
                      })()}
                      {p.enabledCount === 0 && p.groups.length > 0 && (
                        <p className="text-xs text-amber-600 mt-2">⚠️ Sin grupos activos: el agente no responde a nadie (anti-spam).</p>
                      )}
                    </div>
                  ) : (!p.qrDataUrl && !p.pairingCode && (
                    <p className="text-xs text-gray-400 mt-1">
                      {relinking || stale
                        ? "Reconectando… los grupos vuelven a aparecer al vincularse."
                        : "Conecta WhatsApp para ver y configurar los grupos que atiende."}
                    </p>
                  ))}

                  {p.throttledUntil ? (
                    <p className="mt-3 text-xs text-amber-700 bg-amber-50 border-2 border-amber-300 rounded-lg px-3 py-2">
                      ⏳ WhatsApp bloqueó este número por demasiados intentos de vinculación.
                      No reintentes (cada intento extiende el bloqueo). Reintenta después de las{" "}
                      <b>{new Date(p.throttledUntil).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</b>.
                    </p>
                  ) : p.connReason === "invalid_number" ? (
                    <p className="mt-3 text-xs text-amber-700">
                      ⚠️ Número inválido. Usa formato internacional sin signos (México: <b>52</b> + 10 dígitos, o <b>521</b> si es cuenta vieja).
                    </p>
                  ) : relinking ? (
                    <p className="mt-3 text-xs text-amber-700">
                      🔄 WhatsApp cerró la sesión. Estamos regenerando el QR — escanéalo de nuevo para reconectar.
                    </p>
                  ) : null}

                  {/* Conectar (canal desconectado) */}
                  {!p.throttledUntil && p.status !== "connecting" && p.status !== "qr_pending" && p.status !== "pairing" && !(p.status === "connected" && p.live) && (
                    <div className="mt-3 flex flex-wrap gap-2 items-center">
                      <button disabled={isBusy("connect", p.id)} onClick={() => fetcher.submit({ intent: "connect", fleetAgentId: p.id }, { method: "post" })}
                        className="border-2 border-black rounded-lg px-3 py-1.5 text-sm font-semibold disabled:opacity-60">
                        {isBusy("connect", p.id) ? <Spinner /> : "Conectar con QR"}
                      </button>
                      <span className="text-xs text-gray-400">o</span>
                      <input value={phones[p.id] ?? ""} onChange={(e) => setPhones((s) => ({ ...s, [p.id]: e.target.value }))}
                        placeholder="52155..." className="border-2 border-black rounded-lg px-2 py-1.5 text-sm w-32 font-mono" />
                      <button disabled={isBusy("connect", p.id) || !(phones[p.id] ?? "").trim()}
                        onClick={() => fetcher.submit({ intent: "connect", fleetAgentId: p.id, phone: phones[p.id] }, { method: "post" })}
                        className="border-2 border-black rounded-lg px-3 py-1.5 text-sm font-semibold disabled:opacity-40">
                        Vincular con número
                      </button>
                    </div>
                  )}

                  {/* ⚙ Ajustes del canal — número dedicado + desconectar */}
                  <div className="mt-4 border-t border-gray-100 pt-3">
                    <button type="button" onClick={() => setChSettings((s) => ({ ...s, [p.id]: !settingsOpen }))}
                      className="text-xs font-semibold text-gray-500 hover:text-gray-800 flex items-center gap-1">
                      <span className={`transition-transform ${settingsOpen ? "rotate-90" : ""}`}>›</span> Ajustes del canal
                    </button>
                    {settingsOpen && (
                      <div className="mt-2">
                        <Switch value={p.hasOwnNumber} label="Número dedicado"
                          className="text-sm items-center font-semibold"
                          onChange={(on) => fetcher.submit({ intent: "toggle-own-number", fleetAgentId: p.id, on: on ? "1" : "0" }, { method: "post" })} />
                        <p className="text-xs text-gray-400 mt-1">Sin prefijo de nombre en las respuestas. Apágalo si compartes el número con una persona.</p>
                        {(p.live || p.status === "connecting" || p.status === "qr_pending" || p.status === "pairing") && (
                          <button disabled={isBusy("disconnect", p.id)} onClick={() => fetcher.submit({ intent: "disconnect", fleetAgentId: p.id }, { method: "post" })}
                            className="mt-3 border-2 border-black rounded-lg px-3 py-1.5 text-sm font-semibold disabled:opacity-60">
                            {isBusy("disconnect", p.id) ? <Spinner /> : "Desconectar"}
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                </div>)}

                {/* ── Canal WhatsApp Business (WABA) ─────────────────────── */}
                {activeCh === "waba" && (<div className="mt-3">
                  {p.wabaNumbers.length > 0 ? (
                    <div className="flex flex-col gap-2">
                      {p.wabaNumbers.map((w) => (
                        <div key={w.id} className="flex items-center justify-between gap-2">
                          <div className="min-w-0 flex items-center gap-2">
                            <span className={`text-sm font-semibold truncate ${w.mode === "off" ? "text-gray-400" : ""}`}>{w.subject}</span>
                            {/* Pill de estado → abre Conversaciones (ver quién escribe + a quién responder). */}
                            {(() => {
                              const pill =
                                w.mode === "off" ? { dot: "bg-gray-300", text: "text-gray-500", border: "border-gray-200", label: "Apagado" }
                                : w.mode === "only" ? { dot: "bg-brand-500", text: "text-brand-600", border: "border-brand-200", label: `Solo${w.allowedCount ? ` · ${w.allowedCount}` : ""}` }
                                : { dot: "bg-green-500", text: "text-green-600", border: "border-green-200", label: "Activo" };
                              return (
                                <button type="button" title="Conversaciones — ver quién escribe y a quién responde"
                                  onClick={() => setInboxModal({ fleetAgentId: p.id, integrationId: w.integrationId, subject: w.subject, mode: w.mode })}
                                  className={`shrink-0 inline-flex items-center gap-1.5 text-[11px] font-semibold px-2 py-1 rounded-full border-2 ${pill.border} ${pill.text} hover:border-current transition-colors`}>
                                  <span className={`w-1.5 h-1.5 rounded-full ${pill.dot}`} />{pill.label}
                                </button>
                              );
                            })()}
                          </div>
                          <div className="flex items-center gap-2 shrink-0">
                            <button type="button" title="Capacidades e identidad de este número"
                              onClick={() => setCapModal({ fleetAgentId: p.id, groupId: w.id })}
                              className="flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1.5 rounded-lg border-2 border-gray-200 text-gray-600 hover:border-brand-500 hover:text-brand-500 transition-colors">
                              <span className="text-sm leading-none">⚡</span><span>Capacidades</span>
                              <span className="text-[10px] leading-none bg-gray-100 text-gray-600 rounded-full px-1.5 py-0.5">{p.builtins.length + w.mcps.length}</span>
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-xs text-gray-400">Conecta un número de WhatsApp Business para atenderlo con este agente.</p>
                  )}
                  {/* Conectar = primario solo cuando NO hay número; si ya hay,
                      la acción es "agregar otro" (un número conectado no se "conecta"). */}
                  <button type="button" disabled={wabaConnecting === p.id} onClick={() => { setWabaError(null); connectWaba(p.id); }}
                    className="mt-2 inline-flex items-center gap-1.5 text-xs font-semibold text-brand-500 hover:underline disabled:opacity-50">
                    {wabaConnecting === p.id
                      ? <><Spinner /> Conectando…</>
                      : p.wabaNumbers.length > 0 ? "+ Agregar otro número" : "+ Conectar WhatsApp Business"}
                  </button>
                  {wabaError && <p className="mt-2 text-xs text-red-600">⚠️ {wabaError}</p>}
                </div>)}

                {/* Footer del agente — Borrar es DESTRUCTIVO e irreversible: lo
                    dejamos discreto (no un botón rojo prominente) para que no se
                    dispare por accidente. Mantiene el confirm reforzado. */}
                <div className="mt-4 pt-3 border-t border-gray-100 flex justify-end">
                  <button disabled={isBusy("delete", p.id)}
                    onClick={() => { if (confirm(`¿Borrar el agente "${displayName || "Sin nombre"}"? Se destruyen sus sandboxes y datos. Esta acción NO se puede deshacer.`)) fetcher.submit({ intent: "delete", fleetAgentId: p.id }, { method: "post" }); }}
                    className="text-xs text-gray-400 hover:text-red-600 transition-colors disabled:opacity-60">
                    {isBusy("delete", p.id) ? "Borrando…" : "Borrar agente"}
                  </button>
                </div>
                </>);
              })()}
            </div>
          );
        })}
      </div>
      </div>

      {sharedPools.length > 0 && (
        <div className="mt-8">
          <h3 className="text-sm font-semibold text-gray-500 mb-2">
            Compartidas conmigo
          </h3>
          <div className="grid gap-2">
            {sharedPools.map((p) => {
              const st = STATUS[p.status as keyof typeof STATUS] ?? STATUS.disconnected;
              return (
                <div
                  key={p.id}
                  className="border-2 border-black rounded-xl p-3 flex items-center justify-between gap-2 bg-gray-50"
                >
                  <div className="min-w-0">
                    <p className="font-medium truncate">{p.name || "Agente"}</p>
                    <p className="text-xs text-gray-500 truncate">
                      Compartido por {p.ownerEmail ?? "—"}
                    </p>
                  </div>
                  <span className="text-xs flex items-center gap-1.5 text-gray-600">
                    <span className={`w-2 h-2 rounded-full ${st.dot}`} />
                    {st.label}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {inboxModal && <WabaInboxModal key={inboxModal.integrationId} modal={inboxModal} onClose={() => setInboxModal(null)} />}

      {capModal && (() => {
        const cp = pools.find((x) => x.id === capModal.fleetAgentId);
        // The cap target is a Baileys group OR a WABA number — both share {id,
        // subject, mcps}, so the modal reuses the same body. WABA targets also
        // carry integrationId/name/systemPrompt → an extra Identity section.
        // The cap target is a Baileys group OR a WABA number — both share {id,
        // subject, mcps}, so the modal reuses the same body. A WABA hit also
        // carries integrationId/name/systemPrompt → an extra Identity section.
        const cgWaba = cp?.wabaNumbers.find((x) => x.id === capModal.groupId);
        const cg = cp?.groups.find((x) => x.id === capModal.groupId) ?? cgWaba;
        if (!cp || !cg) return null;
        const waba = cgWaba ?? null;
        return (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={() => setCapModal(null)}>
            <div className="bg-white border-2 border-black rounded-2xl w-full max-w-md max-h-[85vh] overflow-y-auto p-5" onClick={(e) => e.stopPropagation()}>
              <div className="flex items-center justify-between mb-1">
                <h3 className="font-semibold text-lg">Capacidades</h3>
                <button onClick={() => setCapModal(null)} className="text-gray-400 hover:text-black text-xl leading-none">✕</button>
              </div>
              <p className="text-sm text-gray-500 mb-4 truncate">en <b>{cg.subject}</b></p>

              {/* Identidad — solo números WABA. Cada número tiene su propia persona
                  (nombre + instrucciones) que se appendea a la del fleetAgent.
                  Colapsada por default: una línea con el nombre actual → se expande
                  para editar, así no empuja las Capacidades hacia abajo. */}
              {waba && (
                <div className="mb-4">
                  <button type="button" onClick={() => setShowIdentity((s) => !s)}
                    className="w-full flex items-center justify-between gap-2 text-left group">
                    <span className="min-w-0 truncate">
                      <span className="text-[11px] font-semibold text-gray-400 uppercase tracking-wide">Identidad</span>
                      <span className="text-sm font-semibold ml-2">{waba.name?.trim() || "Sin nombre"}</span>
                    </span>
                    <span className="text-xs font-semibold text-brand-500 shrink-0 group-hover:underline">{showIdentity ? "Cerrar" : "Editar"}</span>
                  </button>
                  {showIdentity && (
                    <fetcher.Form key={waba.integrationId} method="post" className="mt-2 flex flex-col gap-2">
                      <input type="hidden" name="intent" value="set-waba-identity" />
                      <input type="hidden" name="fleetAgentId" value={cp.id} />
                      <input type="hidden" name="integrationId" value={waba.integrationId} />
                      <input name="name" defaultValue={waba.name} placeholder="Nombre (ej. Soporte Marca X)"
                        className="border-2 border-gray-300 rounded-lg px-2 py-1 text-sm" />
                      <textarea name="systemPrompt" defaultValue={waba.systemPrompt} rows={2}
                        placeholder="Instrucciones propias de este número (se suman a la persona del fleetAgent)"
                        className="border-2 border-gray-300 rounded-lg px-2 py-1 text-sm resize-y" />
                      <button type="submit" className="self-end border-2 border-black rounded-lg px-3 py-1 text-xs font-semibold">Guardar identidad</button>
                    </fetcher.Form>
                  )}
                </div>
              )}


              {/* Herramientas EasyBits — buckets POR NÚMERO. Refleja la verdad del
                  server (SIN optimismo: el optimismo mostraba el cambio y el poll/
                  reload lo revertía) → spinner mientras guarda, luego el estado real. */}
              {(() => {
                const bucketsBusy = fetcher.state !== "idle" && fetcher.formData?.get("intent") === "set-group-toolgroup" && fetcher.formData?.get("groupId") === cg.id;
                // Estado real: lo guardado para este número; si nunca se personalizó,
                // arranca del default del agente (semilla, ya editable aquí mismo).
                const effective = new Set<string>(cg.toolBuckets ?? cp.activeBuckets);
                const toggle = (key: string, on: boolean) => {
                  if (bucketsBusy) return;
                  const next = new Set(effective);
                  if (on) next.add(key); else next.delete(key);
                  fetcher.submit({ intent: "set-group-toolgroup", fleetAgentId: cp.id, groupId: cg.id, buckets: [...next].join(","), inherit: "0" }, { method: "post" });
                };
                return (
                  <div className="mb-4">
                    <div className="flex items-center justify-between">
                      <span className="text-[11px] font-semibold text-gray-400 uppercase tracking-wide">Herramientas EasyBits</span>
                      {bucketsBusy && <Spinner />}
                    </div>
                    <div className={`mt-1 flex flex-col gap-2 ${bucketsBusy ? "opacity-50 pointer-events-none" : ""}`}>
                      {buckets.map((b) => (
                        <div key={b.key} className="border-2 border-gray-100 rounded-xl px-3 py-2 flex items-center justify-between gap-2">
                          <span className="text-sm font-semibold min-w-0 truncate flex items-center gap-1.5">
                            {b.label}
                            {b.admin && <span className="text-[10px] px-1 rounded bg-amber-100 text-amber-700 border border-amber-300">admin</span>}
                          </span>
                          <Switch value={effective.has(b.key)} className="text-sm items-center shrink-0" onChange={(on) => toggle(b.key, on)} />
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })()}

              {/* Capacidades — builtins (easybits/wa, togglables por grupo) + curadas ∪
                  custom. Apagar easybits fuerza al agente a usar las cajas de la flota. */}
              <div className="mb-4">
                <span className="text-[11px] font-semibold text-gray-400 uppercase tracking-wide">Conectores</span>
                <div className="mt-1 flex flex-col gap-2">
                    {/* `wa` envía por Baileys (QR) → no aplica a un número WABA;
                        ocúltalo cuando el target es WABA para no ofrecer canal inerte. */}
                    {/* easybits NO se muestra como conector: su superficie son los buckets
                        de arriba (mostrarlo como toggle separado contradecía los buckets).
                        wa (Baileys) no aplica a un número WABA. */}
                    {cp.builtins.filter((b) => b.name !== "easybits" && !(waba && b.name === "wa")).map((b) => (
                      <div key={b.name} className="border-2 border-gray-100 rounded-xl px-3 py-2 flex items-center justify-between gap-2">
                        <p className="text-sm font-semibold min-w-0 truncate">{b.label}</p>
                        <Switch value={!cg.disabledBuiltins.includes(b.name)}
                          className="text-sm items-center shrink-0"
                          onChange={(on) => fetcher.submit({ intent: "toggle-group-builtin", fleetAgentId: cp.id, groupId: cg.id, builtin: b.name, on: on ? "1" : "0" }, { method: "post" })} />
                      </div>
                    ))}
                    {cp.capabilities.map((m) => (
                      <div key={m.name} className="border-2 border-gray-100 rounded-xl px-3 py-2">
                        <div className="flex items-center justify-between gap-2">
                          <div className="min-w-0">
                            <p className="text-sm font-semibold flex items-center gap-1.5">
                              {m.label}
                              {m.custom && (
                                <button type="button" title="Quitar capacidad"
                                  onClick={() => fetcher.submit({ intent: "remove-mcp", fleetAgentId: cp.id, name: m.name }, { method: "post" })}
                                  className="text-[10px] text-red-400 hover:text-red-600 font-normal">quitar</button>
                              )}
                            </p>
                            {m.description && <p className="text-[11px] text-gray-400">{m.description}</p>}
                          </div>
                          {m.secretsPresent ? (
                            <Switch value={cg.mcps.includes(m.name)}
                              className="text-sm items-center shrink-0"
                              onChange={(on) => fetcher.submit({ intent: "toggle-group-mcp", fleetAgentId: cp.id, groupId: cg.id, mcp: m.name, on: on ? "1" : "0" }, { method: "post" })} />
                          ) : (
                            <span className="text-[10px] font-semibold text-amber-600 shrink-0 whitespace-nowrap">Falta configurar</span>
                          )}
                        </div>
                        {!m.secretsPresent && (
                          <fetcher.Form method="post" className="mt-2 flex items-center gap-2"
                            onSubmit={(e) => { const f = e.currentTarget; requestAnimationFrame(() => f.reset()); }}>
                            <input type="hidden" name="intent" value="set-secret" />
                            <input type="hidden" name="fleetAgentId" value={cp.id} />
                            <input type="hidden" name="name" value={m.requiredSecrets[0] ?? ""} />
                            <input type="password" name="value" required autoComplete="off"
                              placeholder={`Pega tu ${m.requiredSecrets[0] ?? "key"}`}
                              className="flex-1 min-w-0 border-2 border-gray-300 rounded-lg px-2 py-1 text-sm font-mono" />
                            <button type="submit" className="shrink-0 border-2 border-black rounded-lg px-2.5 py-1 text-xs font-semibold">Guardar</button>
                          </fetcher.Form>
                        )}
                      </div>
                    ))}
                </div>
              </div>

              {/* Avanzado — agregar un MCP custom (npm o URL), declarando su secret */}
              <div className="border-t border-gray-100 pt-3">
                <button type="button" onClick={() => setShowAdvanced((s) => !s)}
                  className="text-xs font-semibold text-brand-500 hover:underline">
                  {showAdvanced ? "− Ocultar avanzado" : "+ Agregar capacidad (avanzado)"}
                </button>
                {showAdvanced && (
                  <fetcher.Form method="post" className="mt-2 flex flex-col gap-2"
                    onSubmit={(e) => { const f = e.currentTarget; requestAnimationFrame(() => f.reset()); }}>
                    <input type="hidden" name="intent" value="add-mcp" />
                    <input type="hidden" name="fleetAgentId" value={cp.id} />
                    <input name="name" placeholder="nombre (ej. kommo)" required className="border-2 border-gray-300 rounded-lg px-2 py-1.5 text-sm font-mono" />
                    <input name="pkg" placeholder="paquete npm (ej. @foo/mcp)" className="border-2 border-gray-300 rounded-lg px-2 py-1.5 text-sm font-mono" />
                    <input name="url" placeholder="o URL http del MCP" className="border-2 border-gray-300 rounded-lg px-2 py-1.5 text-sm font-mono" />
                    <div className="flex gap-2">
                      <input name="requiredSecret" placeholder="secret (FOO_API_KEY)" className="flex-1 min-w-0 border-2 border-gray-300 rounded-lg px-2 py-1.5 text-sm font-mono" />
                      <input name="envVar" placeholder="env var (API_TOKEN)" className="flex-1 min-w-0 border-2 border-gray-300 rounded-lg px-2 py-1.5 text-sm font-mono" />
                    </div>
                    <button type="submit" className="self-start border-2 border-black rounded-lg px-3 py-1.5 text-sm font-semibold">+ Agregar</button>
                  </fetcher.Form>
                )}
              </div>
            </div>
          </div>
        );
      })()}
      <AnimatePresence>
        {chatAgent && (
          <TestChatDrawer key="test-chat-drawer" agent={chatAgent} onClose={() => setChatAgent(null)} />
        )}
      </AnimatePresence>
    </div>
  );
}
