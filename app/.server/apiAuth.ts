import type { ApiKey, ApiKeyScope, FleetAgent, FleetTokenScope, User } from "@prisma/client";
import { getUserOrNull } from "./getters";
import { validateApiKey, hasScope } from "./iam";
import { db } from "./db";
import { can, SCOPES } from "./delegation";

export type AuthContext = {
  user: User;
  apiKey?: ApiKey;
  scopes: ApiKeyScope[];
  /**
   * When the authenticating API key is workspace-scoped, the workspace it is
   * bound to. Operations must confine every read/write to this workspace (a
   * scoped key can never see or touch resources outside it). Null/undefined =
   * account-wide key (legacy) with access to all of the owner's resources.
   */
  workspaceId?: string | null;
  /**
   * Per-request provider keys supplied by the caller (e.g. via MCP connector
   * URL query params or request headers). Not persisted — only valid for the
   * duration of the current request.
   */
  providerKeys?: {
    openai?: string;
  };
};

export async function authenticateRequest(
  request: Request
): Promise<AuthContext | null> {
  // 1. Try Bearer token (API key) — header or ?token= query param
  const authHeader = request.headers.get("Authorization");
  let raw: string | null = null;
  if (authHeader?.startsWith("Bearer ")) {
    raw = authHeader.slice(7);
  } else {
    const url = new URL(request.url);
    raw = url.searchParams.get("token");
  }
  if (raw) {
    // Try OAuth JWT first. If the token is not a valid OAuth JWT, silently
    // fall through to API-key validation so existing agents keep working.
    const { tryVerifyOAuthJwt } = await import("./oauth");
    const jwtUser = await tryVerifyOAuthJwt(raw);
    if (jwtUser) {
      return { user: jwtUser, scopes: ["READ", "WRITE", "DELETE"] };
    }

    const apiKey = await validateApiKey(raw);
    if (!apiKey) return null;
    const user = await db.user.findUnique({ where: { id: apiKey.userId } });
    if (!user) return null;
    return { user, apiKey, scopes: apiKey.scopes, workspaceId: apiKey.workspaceId };
  }

  // 2. Fallback to session cookie
  const user = await getUserOrNull(request);
  if (!user) return null;
  // Session users get all scopes on their own resources
  return { user, scopes: ["ADMIN"] };
}

export function requireScope(ctx: AuthContext, scope: ApiKeyScope): void {
  if (!hasScope(ctx.scopes, scope)) {
    throw new Response(JSON.stringify({ error: "Forbidden", requiredScope: scope }), {
      status: 403,
      headers: { "Content-Type": "application/json" },
    });
  }
}

/**
 * When the request is authenticated with a workspace-scoped key, assert the
 * resource being accessed belongs to that same workspace. Returns 404 (not 403)
 * on mismatch to avoid leaking existence — same convention as ownership checks.
 * No-op for account-wide keys / session users (ctx.workspaceId null).
 */
export function requireWorkspace(
  ctx: AuthContext,
  resourceWorkspaceId: string | null | undefined
): void {
  if (!ctx.workspaceId) return;
  if (resourceWorkspaceId !== ctx.workspaceId) {
    throw new Response(JSON.stringify({ error: "Not found" }), {
      status: 404,
      headers: { "Content-Type": "application/json" },
    });
  }
}

export function requireAuth(ctx: AuthContext | null): AuthContext {
  if (!ctx) {
    throw new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }
  return ctx;
}

/**
 * Auth para GESTIONAR la conexión de un FleetAgent (Baileys connect/groups). Acepta 3
 * credenciales, cualquiera vale:
 *   1. `fleetAgent.token` (Bearer o `?token=`) — credencial per-agente durable (reseller
 *      tipo Formmy). Mismo patrón que `capabilities.ts`.
 *   2. el DUEÑO (`ownerId === ctx.user.id`).
 *   3. un DELEGADO con scope `agents` (`can`, el "operar como" cross-cuenta).
 * Devuelve el FleetAgent o lanza 401/404. NO reasigna ownership.
 */
export async function authFleetAgentManage(request: Request, fleetAgentId: string) {
  const { fleetAgent } = await authFleetAgent(request, fleetAgentId, "MANAGE");
  return fleetAgent;
}

/**
 * Auth ÚNICA para toda la superficie de un FleetAgent.
 *
 * Reemplaza el patrón disperso `bearer === fleetAgent.token` que estaba copiado en 12
 * rutas y que hacía que UNA credencial sirviera para mandar mensajes, cambiar secretos
 * y borrar el agente. Aquí cada ruta declara el scope que necesita.
 *
 * Credenciales aceptadas, en orden:
 *   1. `FleetAgentToken` (flt_sk_ / flt_pk_) — con scope real.
 *   2. `fleetAgent.token` LEGACY — ADMIN implícito, sujeto a `legacyTokenMode`.
 *      Se conserva para no romper Formmy / denik / GTeams / Baileys.
 *   3. `wabaConfig.formmySecret` — ADMIN implícito, sólo si la ruta lo permite.
 *   4. Sesión del DUEÑO o de un delegado con scope `agents` — ADMIN.
 *
 * Regla dura de transporte: un `flt_sk_` NUNCA se acepta por query string (queda en
 * logs de acceso, Referer y proxies). Un `flt_pk_` sí, porque es de sólo-mensajería y
 * está acotado por `allowedOrigins`.
 */
export type FleetAuthKind = "fleetToken" | "legacyToken" | "formmySecret" | "session";

export type FleetAuthResult = {
  fleetAgent: FleetAgent;
  kind: FleetAuthKind;
  scopes: FleetTokenScope[];
  /** Presente sólo con fleetToken: id de la credencial (rate limit + revocación). */
  tokenId?: string;
  /** Presente sólo con fleetToken: ata el turno a una unidad de config (tenant). */
  cfgId?: string | null;
  /** Presente sólo con fleetToken: orígenes permitidos para CORS. */
  allowedOrigins?: string[];
  /** Presente cuando la credencial fue una sesión/API key de la cuenta. */
  ctx?: AuthContext;
};

const fleetForbidden = (required: FleetTokenScope) =>
  new Response(JSON.stringify({ error: "Forbidden", requiredScope: required }), {
    status: 403,
    headers: { "Content-Type": "application/json" },
  });

const fleetNotFound = () =>
  new Response(JSON.stringify({ error: "Not found" }), {
    status: 404,
    headers: { "Content-Type": "application/json" },
  });

export async function authFleetAgent(
  request: Request,
  fleetAgentId: string,
  required: FleetTokenScope,
  opts?: {
    /** Rutas WABA donde el secreto que ya tiene Formmy es credencial válida. */
    allowFormmySecret?: boolean;
  }
): Promise<FleetAuthResult> {
  const fleetAgent = await db.fleetAgent.findUnique({ where: { id: fleetAgentId } });
  if (!fleetAgent) throw fleetNotFound();

  const headerBearer =
    request.headers.get("Authorization")?.replace(/^Bearer\s+/i, "") || "";
  const queryToken = new URL(request.url).searchParams.get("token") || "";

  const {
    validateFleetToken,
    hasFleetScope,
    touchFleetToken,
    isPublishable,
    isFleetToken,
  } = await import("./core/fleetTokens");

  // (1) FleetAgentToken con scope.
  const candidate = headerBearer || queryToken;
  if (candidate && isFleetToken(candidate)) {
    // Un secreto por query string es un error de integración, no una credencial.
    if (!headerBearer && !isPublishable(candidate)) throw fleetForbidden(required);
    const row = await validateFleetToken(candidate);
    if (!row || row.fleetAgentId !== fleetAgent.id) throw fleetNotFound();
    if (!hasFleetScope(row.scopes, required)) throw fleetForbidden(required);
    touchFleetToken(row);
    return {
      fleetAgent,
      kind: "fleetToken",
      scopes: row.scopes,
      tokenId: row.id,
      cfgId: row.cfgId,
      allowedOrigins: row.allowedOrigins,
    };
  }

  // (2) Token legacy: ADMIN implícito. `deny` lo apaga por agente.
  if (candidate && candidate === fleetAgent.token) {
    if (fleetAgent.legacyTokenMode === "deny") throw fleetForbidden(required);
    if (fleetAgent.legacyTokenMode === "warn") {
      console.warn(
        `[fleet-auth] token legacy usado en ${fleetAgent.id} (${new URL(request.url).pathname}) — migrar a flt_sk_`
      );
    }
    return { fleetAgent, kind: "legacyToken", scopes: ["ADMIN"] };
  }

  // (3) formmySecret, sólo donde la ruta lo declara.
  if (opts?.allowFormmySecret && headerBearer) {
    const secret = (fleetAgent.wabaConfig as { formmySecret?: string } | null)?.formmySecret;
    if (secret && headerBearer === secret) {
      return { fleetAgent, kind: "formmySecret", scopes: ["ADMIN"] };
    }
  }

  // (4) Dueño o delegado con scope `agents`.
  const ctx = requireAuth(await authenticateRequest(request));
  if (fleetAgent.ownerId === ctx.user.id || (await can(ctx, fleetAgent.ownerId, SCOPES.AGENTS))) {
    return { fleetAgent, kind: "session", scopes: ["ADMIN"], ctx };
  }
  throw fleetNotFound();
}

export type AgentAuthResult =
  | { kind: "owner"; ctx: AuthContext; agent: AgentAuthInfo }
  | { kind: "embed"; ctx: AuthContext; agent: AgentAuthInfo };

export interface AgentAuthInfo {
  agentId: string;
  ownerId: string;
  sandboxId: string;
  agentUrl: string;
  embedToken: string;
  template: string;
  // VM lifecycle status ("running" | "suspended" | "building" | ...). Lets the
  // message endpoint wake a suspended embed agent before streaming.
  status: string;
  // Runtime metadata snapshot (Prisma defaults preserve back-compat).
  protocol: string;
  port: number;
  unit: string;
  messagePath: string;
  acpSessionId: string | null;
  acpTransportSessionId: string | null;
}

// resolveAgentAuth: dual-mode auth for /api/v2/agents/:id/* endpoints.
// - eb_sk_* / session: standard owner auth, must own the requested agent.
// - agt_*: embedToken — scope WRITE limited to operating THIS agent only.
//   The embed context is built from the agent owner so downstream code that
//   reads ctx.user keeps working, but the apiKey field is left undefined
//   (no DB key associated) and scopes are forced to ["WRITE"] (no DELETE,
//   no ADMIN — embeds cannot destroy or list).
export async function resolveAgentAuth(
  request: Request,
  agentId: string
): Promise<AgentAuthResult> {
  const authHeader = request.headers.get("Authorization");
  const raw = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : null;

  if (raw?.startsWith("agt_")) {
    const { findAgentByEmbedToken } = await import("./core/sandboxOperations");
    const agent = await findAgentByEmbedToken(raw);
    if (!agent || agent.agentId !== agentId) {
      throw new Response(JSON.stringify({ error: "Forbidden" }), {
        status: 403,
        headers: { "Content-Type": "application/json" },
      });
    }
    const owner = await db.user.findUnique({ where: { id: agent.ownerId } });
    if (!owner) {
      throw new Response(JSON.stringify({ error: "Owner not found" }), {
        status: 500,
        headers: { "Content-Type": "application/json" },
      });
    }
    return {
      kind: "embed",
      ctx: { user: owner, scopes: ["WRITE"] },
      agent: {
        agentId: agent.agentId,
        ownerId: agent.ownerId,
        sandboxId: agent.sandboxId,
        agentUrl: agent.agentUrl,
        embedToken: agent.embedToken,
        template: agent.template,
        status: agent.status,
        protocol: agent.protocol,
        port: agent.port,
        unit: agent.unit,
        messagePath: agent.messagePath,
        acpSessionId: agent.acpSessionId,
        acpTransportSessionId: agent.acpTransportSessionId,
      },
    };
  }

  // Owner mode (API key, OAuth JWT, or session). Owner OR delegate con scope
  // `agents` (operador cross-account) puede operar el agente.
  const ctx = requireAuth(await authenticateRequest(request));
  const row = await db.agent.findUnique({ where: { id: agentId } });
  if (
    !row ||
    !(row.ownerId === ctx.user.id || (await can(ctx, row.ownerId, SCOPES.AGENTS)))
  ) {
    throw new Response(JSON.stringify({ error: "Agent not found" }), {
      status: 404,
      headers: { "Content-Type": "application/json" },
    });
  }
  return {
    kind: "owner",
    ctx,
    agent: {
      agentId: row.id,
      ownerId: row.ownerId,
      sandboxId: row.sandboxId,
      agentUrl: row.agentUrl,
      embedToken: row.embedToken,
      template: row.template,
      status: row.status,
      protocol: row.protocol ?? "sse",
      port: row.port ?? 3000,
      unit: row.unit ?? "chat-runtime",
      messagePath: row.messagePath ?? "/message",
      acpSessionId: row.acpSessionId,
      acpTransportSessionId: row.acpTransportSessionId,
    },
  };
}
