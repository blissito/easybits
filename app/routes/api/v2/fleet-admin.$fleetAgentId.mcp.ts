import type { Route } from "./+types/fleet-admin.$fleetAgentId.mcp";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { z } from "zod";
import { db } from "~/.server/db";
import type { AuthContext } from "~/.server/apiAuth";
import { ok, fail } from "~/.server/mcp/responses";
import { mergedCapabilities, type GroupConfig } from "~/.server/core/fleetAgentOperations";

// Dedicated `admin` MCP server for FleetAgents — Streamable-HTTP. Injected per-turn
// ONLY on ADMIN turns (msg.admin) so the OWNER can administer the agent from their
// WABA admin conversation: list/configure WhatsApp Business numbers, edit each
// number's identity, and toggle its capabilities. Auth = the fleetAgent's bearer
// token (header or ?token=), same trust level as fleet-render.
//
// Mirrors fleet-render.$fleetAgentId.mcp.ts (the platform pattern for fleet-agent
// HTTP MCP surfaces). Tools are THIN wrappers over the same DB shapes the dashboard
// edits (wabaConfig.orgs + groupConfigs["waba:<int>"]).
//
// Designation of WHICH conversation is admin lives in the dashboard (session-authed),
// NOT here — letting an admin turn reassign admin rights would be a footgun.

// Per-number config inside FleetAgent.wabaConfig (subset; mirrors waba.message.ts).
type WabaOrg = { phoneNumberId?: string; phoneNumber?: string; name?: string; systemPrompt?: string; adminSender?: string; enabled?: boolean; mutedSenders?: string[] };
type WabaConfig = { formmySecret?: string; orgs?: Record<string, WabaOrg> };

const onlyDigits = (s: string) => s.replace(/\D/g, "");

async function ctxForOwner(ownerId: string): Promise<AuthContext | null> {
  const user = await db.user.findUnique({ where: { id: ownerId } });
  return user ? { user, scopes: ["READ", "WRITE", "DELETE"] } : null;
}

function buildAdminServer(fleetAgentId: string): McpServer {
  const server = new McpServer({ name: "easybits-admin", version: "1.0.0" });
  // ok()/fail() return structuredContent: unknown, which the SDK's stricter
  // CallToolResult type rejects; same `as any` dodge as fleet-render.
  const tool = (name: string, desc: string, shape: Record<string, unknown>, cb: (p: any) => Promise<unknown>) =>
    server.tool(name, desc, shape as any, cb as any);

  // Always read the FleetAgent FRESH so writes don't clobber concurrent changes.
  const load = () => db.fleetAgent.findUnique({ where: { id: fleetAgentId } });

  tool(
    "list_numbers",
    "Lista los números de WhatsApp Business (WABA) de este agente, con su identidad (nombre/instrucciones) y qué conversación está designada como admin.",
    {},
    async () => {
      const fa = await load();
      if (!fa) return fail("agente no encontrado");
      const orgs = ((fa.wabaConfig as WabaConfig | null) ?? {}).orgs ?? {};
      const numbers = Object.entries(orgs).map(([integrationId, o]) => ({
        integrationId,
        phoneNumber: o.phoneNumber ?? null,
        name: o.name ?? null,
        systemPrompt: o.systemPrompt ?? null,
        adminSender: o.adminSender ?? null,
        enabled: o.enabled !== false, // undefined = encendido (compat)
        mutedSenders: o.mutedSenders ?? [],
      }));
      return ok({ numbers });
    }
  );

  tool(
    "set_number_identity",
    "Edita la IDENTIDAD de un número WABA: nombre con el que se presenta e instrucciones propias (se suman a la persona del agente). Vacío = limpia ese campo.",
    {
      integrationId: z.string().describe("integrationId del número (de list_numbers)"),
      name: z.string().optional().describe("nombre del número (ej. 'Soporte Marca X')"),
      systemPrompt: z.string().optional().describe("instrucciones propias de este número"),
    },
    async (p) => {
      const fa = await load();
      if (!fa) return fail("agente no encontrado");
      const cfg = (fa.wabaConfig as WabaConfig | null) ?? {};
      const org = cfg.orgs?.[p.integrationId];
      if (!org) return fail("número no encontrado");
      const name = (p.name ?? "").trim();
      const systemPrompt = (p.systemPrompt ?? "").trim();
      const next: WabaConfig = {
        ...cfg,
        orgs: { ...cfg.orgs, [p.integrationId]: { ...org, name: name || undefined, systemPrompt: systemPrompt || undefined } },
      };
      await db.fleetAgent.update({ where: { id: fleetAgentId }, data: { wabaConfig: next } });
      return ok({ integrationId: p.integrationId, name: name || null, systemPrompt: systemPrompt || null });
    }
  );

  tool(
    "list_capabilities",
    "Lista el catálogo de capacidades (MCPs) del agente y, para un número WABA, cuáles tiene habilitadas. Los builtin (easybits/render) están siempre activos.",
    { integrationId: z.string().optional().describe("integrationId para ver el set habilitado de ese número") },
    async (p) => {
      const fa = await load();
      if (!fa) return fail("agente no encontrado");
      const catalog = mergedCapabilities(fa).map((e) => ({ name: e.name, label: e.label ?? e.name, builtin: Boolean(e.builtin) }));
      let enabled: string[] | null = null;
      if (p.integrationId) {
        const configs = (fa.groupConfigs as Record<string, GroupConfig> | null) ?? {};
        enabled = configs[`waba:${p.integrationId}`]?.mcpServers ?? [];
      }
      return ok({ capabilities: catalog, enabled });
    }
  );

  tool(
    "set_number_capabilities",
    "Reemplaza el set de capacidades CUSTOM habilitadas para un número WABA. Solo nombres no-builtin del catálogo (ver list_capabilities). Los builtin no se togglan aquí.",
    {
      integrationId: z.string().describe("integrationId del número"),
      capabilities: z.array(z.string()).describe("nombres de capacidades a habilitar (reemplaza el set actual)"),
    },
    async (p) => {
      const fa = await load();
      if (!fa) return fail("agente no encontrado");
      const orgs = ((fa.wabaConfig as WabaConfig | null) ?? {}).orgs ?? {};
      if (!orgs[p.integrationId]) return fail("número no encontrado");
      const requested = Array.isArray(p.capabilities) ? p.capabilities.filter((m: unknown) => typeof m === "string") : [];
      const toggleable = new Set(mergedCapabilities(fa).filter((e) => !e.builtin).map((e) => e.name));
      const unknown = requested.filter((m: string) => !toggleable.has(m));
      if (unknown.length) return fail(`capacidad no está en el catálogo o es builtin: ${unknown.join(", ")}`);
      const configs = (fa.groupConfigs as Record<string, GroupConfig> | null) ?? {};
      const key = `waba:${p.integrationId}`;
      const next = { ...configs, [key]: { ...(configs[key] ?? {}), mcpServers: requested } };
      await db.fleetAgent.update({ where: { id: fleetAgentId }, data: { groupConfigs: next } });
      return ok({ integrationId: p.integrationId, capabilities: requested });
    }
  );

  tool(
    "set_number_enabled",
    "Enciende o apaga un número WABA. Apagado = el agente NO responde a nadie en ese número (tú lo sigues administrando desde aquí). Útil para preparar un número antes de atender.",
    {
      integrationId: z.string().describe("integrationId del número"),
      enabled: z.boolean().describe("true = responde; false = silencioso"),
    },
    async (p) => {
      const fa = await load();
      if (!fa) return fail("agente no encontrado");
      const cfg = (fa.wabaConfig as WabaConfig | null) ?? {};
      const org = cfg.orgs?.[p.integrationId];
      if (!org) return fail("número no encontrado");
      const next: WabaConfig = { ...cfg, orgs: { ...cfg.orgs, [p.integrationId]: { ...org, enabled: p.enabled } } };
      await db.fleetAgent.update({ where: { id: fleetAgentId }, data: { wabaConfig: next } });
      return ok({ integrationId: p.integrationId, enabled: p.enabled });
    }
  );

  tool(
    "set_conversation_muted",
    "Silencia o reactiva una conversación específica (un cliente) de un número WABA. Silenciada = el agente no contesta a ESE contacto, aunque el número esté encendido. Úsalo para conversaciones que atiendes a mano.",
    {
      integrationId: z.string().describe("integrationId del número"),
      sender: z.string().describe("teléfono del contacto a silenciar/reactivar"),
      muted: z.boolean().describe("true = silenciar; false = reactivar"),
    },
    async (p) => {
      const fa = await load();
      if (!fa) return fail("agente no encontrado");
      const cfg = (fa.wabaConfig as WabaConfig | null) ?? {};
      const org = cfg.orgs?.[p.integrationId];
      if (!org) return fail("número no encontrado");
      const target = onlyDigits(p.sender);
      if (!target) return fail("teléfono inválido");
      const cur = new Set((org.mutedSenders ?? []).map(onlyDigits));
      if (p.muted) cur.add(target);
      else cur.delete(target);
      const mutedSenders = [...cur];
      const next: WabaConfig = { ...cfg, orgs: { ...cfg.orgs, [p.integrationId]: { ...org, mutedSenders } } };
      await db.fleetAgent.update({ where: { id: fleetAgentId }, data: { wabaConfig: next } });
      return ok({ integrationId: p.integrationId, sender: target, muted: p.muted, mutedSenders });
    }
  );

  return server;
}

async function handle(request: Request, fleetAgentId: string): Promise<Response> {
  const url = new URL(request.url);
  const bearer =
    request.headers.get("Authorization")?.replace(/^Bearer\s+/i, "") ||
    url.searchParams.get("token") ||
    "";
  const fleetAgent = await db.fleetAgent.findUnique({ where: { id: fleetAgentId } });
  if (!fleetAgent || !bearer || fleetAgent.token !== bearer) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }
  const ctx = await ctxForOwner(fleetAgent.ownerId);
  if (!ctx) return Response.json({ error: "owner not found" }, { status: 401 });

  const server = buildAdminServer(fleetAgentId);
  const transport = new WebStandardStreamableHTTPServerTransport({ sessionIdGenerator: undefined });
  await server.connect(transport);
  return transport.handleRequest(request, { authInfo: ctx as any });
}

export async function action({ request, params }: Route.ActionArgs) {
  return handle(request, params.fleetAgentId!);
}

export async function loader({ request, params }: Route.LoaderArgs) {
  return handle(request, params.fleetAgentId!);
}
