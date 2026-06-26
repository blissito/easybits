import type { Route } from "./+types/pool.$poolId.waba.connect";
import { db } from "~/.server/db";
import { getUserOrRedirect } from "~/.server/getters";
import {
  generateChannelSecret,
  provisionFormmyWhatsApp,
} from "~/.server/integrations/whatsapp/formmyPartner";

// POST /api/v2/pool/:poolId/waba/connect
//
// Callback of the Embedded Signup popup. The browser captured
// `{ code, phoneNumberId, wabaId }` and posts it here. We orchestrate:
//   1. reuse the pool's existing channel secret (or mint one) — ONE secret per
//      pool, shared across all its WABA numbers, so /waba/message can validate
//      any inbound with a single pool.wabaConfig.formmySecret.
//   2. point Formmy at THIS pool's /waba endpoint via externalAgentUrl.
//   3. call Formmy (code→token + register WABA) → integrationId.
//   4. write pool.wabaConfig DIRECTLY (in-process, no self-HTTP) with the number's
//      identity defaults — the owner can rename/personalize it later from the card.

const BASE_URL = (process.env.BASE_URL || "https://www.easybits.cloud").replace(/\/$/, "");

type WabaOrg = {
  phoneNumberId?: string;
  phoneNumber?: string;
  name?: string;
  systemPrompt?: string;
  denikApiKey?: string;
};
type WabaConfig = { formmySecret?: string; orgs?: Record<string, WabaOrg> };

export async function action({ request, params }: Route.ActionArgs) {
  const user = await getUserOrRedirect(request);
  const poolId = params.poolId!;
  const pool = await db.pool.findUnique({ where: { id: poolId } });
  if (!pool || pool.ownerId !== user.id) {
    return Response.json({ error: "Not found" }, { status: 404 });
  }

  const body = (await request.json().catch(() => ({}))) as {
    code?: string;
    phoneNumberId?: string;
    wabaId?: string;
  };
  const { code, phoneNumberId, wabaId } = body;
  if (!code || !phoneNumberId || !wabaId) {
    return Response.json({ error: "Faltan code, phoneNumberId o wabaId" }, { status: 400 });
  }

  const current = (pool.wabaConfig as WabaConfig | null) ?? {};
  // One secret per pool — reuse if already set, so every number shares it.
  const channelSecret = current.formmySecret || generateChannelSecret();
  const externalAgentUrl = `${BASE_URL}/api/v2/pool/${poolId}/waba`;

  try {
    const { integrationId, phoneNumber } = await provisionFormmyWhatsApp({
      code,
      phoneNumberId,
      wabaId,
      email: user.email,
      externalAgentUrl,
      channelSecret,
    });

    const next: WabaConfig = {
      ...current,
      formmySecret: channelSecret,
      orgs: {
        ...(current.orgs ?? {}),
        [integrationId]: {
          ...(current.orgs?.[integrationId] ?? {}),
          phoneNumberId,
          ...(phoneNumber ? { phoneNumber, name: phoneNumber } : {}),
        },
      },
    };
    await db.pool.update({ where: { id: poolId }, data: { wabaConfig: next } });

    return Response.json({ ok: true, integrationId, phoneNumber });
  } catch (err) {
    console.error(`[waba/connect] pool ${poolId} provisioning failed:`, err);
    return Response.json(
      { error: "No se pudo conectar WhatsApp Business" },
      { status: 502 }
    );
  }
}

export async function loader() {
  return Response.json({ error: "Method not allowed" }, { status: 405 });
}
