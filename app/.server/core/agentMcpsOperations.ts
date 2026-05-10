import { db } from "../db";
import type { AuthContext } from "../apiAuth";
import { requireScope } from "../apiAuth";
import { openAgentMessageStream } from "./sandboxOperations";

const MCP_TEMPLATES = new Set(["openclaw"]);

export interface RegisterMcpBody {
  server: string;
  config: Record<string, unknown>;
}

export interface RegisterMcpResult {
  ok: true;
  server: string;
}

interface AgentRow {
  id: string;
  ownerId: string;
  sandboxId: string;
  template: string;
  embedToken: string;
  status: string;
  port: number | null;
}

async function loadAgentRow(ctx: AuthContext, agentId: string): Promise<AgentRow> {
  const row = await db.agent.findUnique({ where: { id: agentId } });
  if (!row || row.ownerId !== ctx.user.id) {
    throw new Error("agent not found");
  }
  if (!MCP_TEMPLATES.has(row.template)) {
    throw new Error(
      `MCP registration unavailable for template "${row.template}" — only openclaw exposes /mcps`
    );
  }
  if (row.status !== "running") {
    throw new Error(`agent is ${row.status}; cannot register MCP server`);
  }
  return row;
}

export async function registerAgentMcp(
  ctx: AuthContext,
  agentId: string,
  body: RegisterMcpBody
): Promise<RegisterMcpResult> {
  requireScope(ctx, "WRITE");

  if (typeof body.server !== "string" || !body.server.trim()) {
    throw new Error("server (string) required");
  }
  if (!/^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/.test(body.server)) {
    throw new Error(
      "server must be [A-Za-z0-9][A-Za-z0-9_-]{0,63} (URL-safe identifier)"
    );
  }
  if (!body.config || typeof body.config !== "object" || Array.isArray(body.config)) {
    throw new Error("config (object) required");
  }

  const agent = await loadAgentRow(ctx, agentId);
  const { stream } = await openAgentMessageStream(agent.sandboxId, agent.ownerId, {
    port: agent.port ?? 18789,
    path: "/mcps",
    method: "POST",
    headers: {
      Authorization: `Bearer ${agent.embedToken}`,
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    rawBody: { server: body.server, config: body.config },
  });
  // Drain — we trust the runtime's HTTP status (sandbox-host throws on !ok).
  const reader = stream.getReader();
  while (true) {
    const { done } = await reader.read();
    if (done) break;
  }
  return { ok: true, server: body.server };
}
