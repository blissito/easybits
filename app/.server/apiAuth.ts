import type { ApiKey, ApiKeyScope, User } from "@prisma/client";
import { getUserOrNull } from "./getters";
import { validateApiKey, hasScope } from "./iam";
import { db } from "./db";
import { can, SCOPES } from "./delegation";

export type AuthContext = {
  user: User;
  apiKey?: ApiKey;
  scopes: ApiKeyScope[];
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
    return { user, apiKey, scopes: apiKey.scopes };
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

export function requireAuth(ctx: AuthContext | null): AuthContext {
  if (!ctx) {
    throw new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }
  return ctx;
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
