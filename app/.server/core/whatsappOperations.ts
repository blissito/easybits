import { db } from "../db";
import type { AuthContext } from "../apiAuth";
import { requireScope } from "../apiAuth";
import { openAgentMessageStream } from "./sandboxOperations";

// WhatsApp link state mirrored from the openclaw runtime gateway.
// Source of truth lives in the sandbox at :port/whatsapp/*; this is the
// last-known cache so the dash can render without a roundtrip.
export type WhatsappStatus =
  | "disconnected"
  | "qr_pending"
  | "pairing"
  | "connected";

export interface WhatsappState {
  status: WhatsappStatus;
  phoneNumber?: string;
  lastSyncAt?: string;
  linkedAt?: string;
}

export interface WhatsappStatusResponse extends WhatsappState {}

export interface WhatsappLinkBody {
  method: "qr" | "pairing";
  phoneNumber?: string;
}

export interface WhatsappLinkResponse {
  status: WhatsappStatus;
  qr?: string;
  code?: string;
  expiresAt?: string;
  phoneNumber?: string;
}

export interface WhatsappUnlinkResponse {
  ok: true;
  status: "disconnected";
}

const WHATSAPP_TEMPLATES = new Set(["openclaw"]);

interface AgentRow {
  id: string;
  ownerId: string;
  sandboxId: string;
  template: string;
  embedToken: string;
  status: string;
  port: number | null;
  whatsapp: unknown;
}

async function loadAgentRow(ctx: AuthContext, agentId: string): Promise<AgentRow> {
  const row = await db.agent.findUnique({ where: { id: agentId } });
  if (!row || row.ownerId !== ctx.user.id) {
    throw new Error("agent not found");
  }
  if (!WHATSAPP_TEMPLATES.has(row.template)) {
    throw new Error(
      `WhatsApp link unavailable for template "${row.template}" — only openclaw exposes the channel gateway`
    );
  }
  if (row.status !== "running") {
    throw new Error(`agent is ${row.status}; cannot reach WhatsApp gateway`);
  }
  return row;
}

// Proxy a single JSON-RPC call to the runtime gateway. We reuse
// openAgentMessageStream (the same primitive used for /v1/chat/completions)
// and collect the full response body — these endpoints are non-streaming.
async function callRuntimeJson<T>(
  agent: AgentRow,
  path: string,
  body: unknown
): Promise<T> {
  const { stream } = await openAgentMessageStream(agent.sandboxId, agent.ownerId, {
    port: agent.port ?? 18789,
    path,
    method: "POST",
    headers: {
      Authorization: `Bearer ${agent.embedToken}`,
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    rawBody: body,
  });
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  let raw = "";
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    raw += decoder.decode(value, { stream: true });
  }
  raw += decoder.decode();
  const trimmed = raw.trim();
  if (!trimmed) {
    throw new Error(`runtime ${path} returned empty body`);
  }
  try {
    return JSON.parse(trimmed) as T;
  } catch {
    throw new Error(
      `runtime ${path} returned non-JSON body: ${trimmed.slice(0, 200)}`
    );
  }
}

function mergeState(
  prev: unknown,
  next: Partial<WhatsappState>
): WhatsappState {
  const base: WhatsappState =
    prev && typeof prev === "object" ? (prev as WhatsappState) : { status: "disconnected" };
  const merged: WhatsappState = { ...base, ...next, lastSyncAt: new Date().toISOString() };
  if (next.status === "connected" && !base.linkedAt) {
    merged.linkedAt = merged.lastSyncAt;
  }
  if (next.status === "disconnected") {
    delete merged.phoneNumber;
    delete merged.linkedAt;
  }
  return merged;
}

async function persistState(agentId: string, state: WhatsappState): Promise<void> {
  await db.agent.update({
    where: { id: agentId },
    data: { whatsapp: state as unknown as object },
  });
}

export async function getWhatsappStatus(
  ctx: AuthContext,
  agentId: string
): Promise<WhatsappState> {
  requireScope(ctx, "READ");
  const agent = await loadAgentRow(ctx, agentId);
  const upstream = await callRuntimeJson<WhatsappStatusResponse>(
    agent,
    "/whatsapp/status",
    {}
  );
  const state = mergeState(agent.whatsapp, {
    status: upstream.status,
    phoneNumber: upstream.phoneNumber,
  });
  await persistState(agent.id, state);
  return state;
}

export async function linkWhatsapp(
  ctx: AuthContext,
  agentId: string,
  body: WhatsappLinkBody
): Promise<WhatsappLinkResponse> {
  requireScope(ctx, "WRITE");
  if (body.method !== "qr" && body.method !== "pairing") {
    throw new Error('method must be "qr" or "pairing"');
  }
  if (body.method === "pairing" && !body.phoneNumber) {
    throw new Error("phoneNumber is required when method is pairing");
  }
  const agent = await loadAgentRow(ctx, agentId);
  const upstream = await callRuntimeJson<WhatsappLinkResponse>(
    agent,
    "/whatsapp/link",
    body
  );
  await persistState(
    agent.id,
    mergeState(agent.whatsapp, {
      status: upstream.status,
      phoneNumber: upstream.phoneNumber,
    })
  );
  return upstream;
}

export async function unlinkWhatsapp(
  ctx: AuthContext,
  agentId: string
): Promise<WhatsappUnlinkResponse> {
  requireScope(ctx, "WRITE");
  const agent = await loadAgentRow(ctx, agentId);
  const upstream = await callRuntimeJson<WhatsappUnlinkResponse>(
    agent,
    "/whatsapp/unlink",
    {}
  );
  await persistState(agent.id, { status: "disconnected", lastSyncAt: new Date().toISOString() });
  return upstream;
}
