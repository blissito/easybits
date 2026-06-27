import type { Route } from "./+types/fleet-agents.$fleetAgentId.waba.message";
import { db } from "~/.server/db";
import { routeMessage } from "~/.server/core/fleetAgentOperations";

// POST /api/v2/fleet-agents/:fleetAgentId/waba/message
//
// The WABA channel inbound. Formmy owns the Meta WhatsApp Business number and is
// the gateway: it receives the Meta webhook and FORWARDS each inbound message
// here using its "droplet protocol", then expects us to POST the reply back to
// Formmy's /send endpoint. So WABA becomes another entry into the SAME fleetAgent
// fleet that Baileys uses — both end in routeMessage().
//
// Fire-and-forget: Formmy doesn't await the reply (it ignores this response
// body), and Meta penalizes slow webhooks, so we ACK 200 immediately and do the
// LLM turn + send-back in a DETACHED task (mirrors whatsapp-webhook.ts, which
// does `void handleIncomingText(...)` then returns 200).
//
// Auth = fleetAgent.wabaConfig.formmySecret (the shared secret Formmy presents AND the
// one we present back). NOT fleetAgent.token — that bearer belongs to the Baileys
// surface / web channel.
const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Authorization, Content-Type",
};

// www: el apex formmy.app falla TLS desde Fly (mismo motivo que formmy.server.ts en Denik).
const FORMMY_BASE_URL = (process.env.FORMMY_BASE_URL || "https://www.formmy.app").replace(/\/$/, "");

// Per-integration (per Meta number) config. phoneNumberId is the only field the
// gateway strictly needs; name/systemPrompt give each number its OWN identity
// (injected as appendSystemPrompt, layer 3). denikApiKey is OPTIONAL — the
// reseller (denik) path; native pools scope capabilities via groupConfigs.
type WabaOrg = {
  phoneNumberId?: string;
  phoneNumber?: string;
  name?: string;
  systemPrompt?: string;
  denikApiKey?: string;
};
type WabaConfig = {
  formmySecret?: string;
  orgs?: Record<string, WabaOrg>;
};

// Formmy droplet protocol (the inbound forward body).
type DropletInbound = {
  jid?: string;
  sender?: string;
  sender_name?: string;
  content?: string;
  message_id?: string;
  integration_id?: string;
  is_from_me?: boolean;
  manual_mode?: boolean;
  media?: unknown;
};

export async function loader({ request }: Route.LoaderArgs) {
  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS });
  return Response.json({ error: "Method not allowed" }, { status: 405, headers: CORS });
}

export async function action({ request, params }: Route.ActionArgs) {
  const fleetAgentId = params.fleetAgentId!;
  const bearer = request.headers.get("Authorization")?.replace(/^Bearer\s+/i, "") ?? "";
  const fleetAgent = await db.fleetAgent.findUnique({ where: { id: fleetAgentId } });
  const waba = (fleetAgent?.wabaConfig as WabaConfig | null) ?? null;
  const formmySecret = waba?.formmySecret ?? "";
  if (!fleetAgent || !bearer || !formmySecret || formmySecret !== bearer) {
    return Response.json({ error: "Unauthorized" }, { status: 401, headers: CORS });
  }

  const body = (await request.json().catch(() => ({}))) as DropletInbound;
  const integrationId = typeof body.integration_id === "string" ? body.integration_id : "";
  const sender = typeof body.sender === "string" ? body.sender : "";
  const content = typeof body.content === "string" ? body.content : "";

  // ACK immediately. Anything that means "nothing to answer" still returns 200 —
  // Formmy ignores the body, and a non-200 just makes it (or Meta) retry.
  //  - is_from_me: our own echo, never answer.
  //  - manual_mode: the owner is handling this conversation by hand. We do NOT
  //    call the LLM (no double-reply). Formmy still forwards every message so its
  //    own pause/transcript state stays complete; the no-LLM choice is OURS here.
  if (
    integrationId &&
    sender &&
    content.trim() &&
    !body.is_from_me &&
    !body.manual_mode
  ) {
    void handleWabaInbound(fleetAgentId, waba!, { integrationId, sender, content });
  }

  return Response.json({ ok: true }, { status: 200, headers: CORS });
}

// Detached task: run the fleetAgent turn, then POST the reply back to Formmy's /send.
// Never throws (it runs unawaited) — every failure is logged and swallowed.
async function handleWabaInbound(
  fleetAgentId: string,
  waba: WabaConfig,
  msg: { integrationId: string; sender: string; content: string }
): Promise<void> {
  try {
    const org = waba.orgs?.[msg.integrationId];
    // groupId is OPAQUE to routeMessage; scope it per (integration, sender) so the
    // sticky route + .jsonl transcript stay per-conversation (1:1 memory per
    // customer), parallel to Baileys' `jid`. configGroupId is per-NUMBER
    // (waba:<integrationId>) so capabilities + key resolve once per Meta number,
    // not per sender. Identity per number = org.systemPrompt as appendSystemPrompt.
    const reply = await routeMessage(
      fleetAgentId,
      {
        groupId: `waba:${msg.integrationId}:${msg.sender}`,
        configGroupId: `waba:${msg.integrationId}`,
        sender: msg.sender,
        text: msg.content,
        appendSystemPrompt: org?.systemPrompt,
        denikApiKey: org?.denikApiKey,
      },
      { skipRateLimit: false }
    );
    if (!reply) return;
    await sendReplyToFormmy(waba.formmySecret ?? "", msg.integrationId, msg.sender, reply);
  } catch (e) {
    console.error(`[waba] fleetAgent ${fleetAgentId} inbound failed:`, e instanceof Error ? e.message : e);
  }
}

// POST the agent's reply back to Formmy, which relays it to Meta. phone_number is
// the sender's digits (strip any @suffix jid and a leading +).
async function sendReplyToFormmy(
  formmySecret: string,
  integrationId: string,
  sender: string,
  reply: string
): Promise<void> {
  const phone = sender.replace(/@.*$/, "").replace(/^\+/, "");
  try {
    const res = await fetch(`${FORMMY_BASE_URL}/api/v1/integrations/whatsapp/send`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${formmySecret}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        phone_number: phone,
        integration_id: integrationId,
        type: "text",
        text: reply,
      }),
    });
    if (!res.ok) {
      const detail = await res.text().catch(() => "");
      console.error(`[waba] send-back to Formmy failed ${res.status}: ${detail.slice(0, 200)}`);
    }
  } catch (e) {
    console.error("[waba] send-back to Formmy threw:", e instanceof Error ? e.message : e);
  }
}
