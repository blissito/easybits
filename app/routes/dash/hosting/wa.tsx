import QRCode from "qrcode";
import { data } from "react-router";
import type { Route } from "./+types/wa";
import { getUserOrRedirect } from "~/.server/getters";
import type { AuthContext } from "~/.server/apiAuth";
import { sandboxAdmin } from "~/.server/core/sandboxOperations";

// WhatsApp pairing for a flagship-agent MACHINE (ghostyclaw), from the EasyBits
// dashboard — the Sandbox-surface twin of ghosty-studio's pairing flow. All box
// calls go through `sandboxAdmin` (/admin/whatsapp/*), gated to agent templates
// + authorized by ownership/delegation. The status QR is rasterized server-side
// so the panel paints it with a plain <img> (no QR lib in the client bundle).
//
// Routes:  GET  /dash/hosting/wa/:id           → status (polled by the panel)
//          POST /dash/hosting/wa/:id           → intent=link|unlink

type WaStatus = {
  state: "qr" | "pairing_code" | "linked" | "connecting" | string;
  qr?: string;
  code?: string;
  pairingCode?: string;
  phone?: string;
  error?: string | null;
  [k: string]: unknown;
};

async function statusPayload(ctx: AuthContext, sandboxId: string) {
  const status = (await sandboxAdmin(ctx, sandboxId, {
    method: "GET",
    path: "/admin/whatsapp/status",
  })) as WaStatus;
  if (status?.state === "qr" && status.qr) {
    const qrDataUrl = await QRCode.toDataURL(status.qr, { margin: 1, width: 320 }).catch(
      () => undefined
    );
    return { ...status, qrDataUrl };
  }
  return status;
}

export const loader = async ({ request, params }: Route.LoaderArgs) => {
  const user = await getUserOrRedirect(request);
  const ctx = { user, scopes: ["ADMIN"] } as AuthContext;
  try {
    return data(await statusPayload(ctx, params.id));
  } catch (e) {
    // Box may be starting / runtime not ready — don't break the panel.
    if (e instanceof Response) {
      const body = await e.json().catch(() => ({ error: "error" }));
      return data({ state: "connecting", error: body.message ?? body.error ?? "no disponible" });
    }
    return data({ state: "connecting", error: e instanceof Error ? e.message : String(e) });
  }
};

export const action = async ({ request, params }: Route.ActionArgs) => {
  const user = await getUserOrRedirect(request);
  const ctx = { user, scopes: ["ADMIN"] } as AuthContext;
  const fd = await request.formData();
  const intent = String(fd.get("intent") || "");
  try {
    if (intent === "unlink") {
      await sandboxAdmin(ctx, params.id, { method: "POST", path: "/admin/whatsapp/unlink", body: {} });
      return data({ ok: true, state: "connecting" });
    }
    if (intent === "link") {
      const method = fd.get("method") === "pairing-code" ? "pairing-code" : "qr";
      const phone = String(fd.get("phone") ?? "").trim();
      await sandboxAdmin(ctx, params.id, {
        method: "POST",
        path: "/admin/whatsapp/link",
        body: { method, phone },
      });
      return data(await statusPayload(ctx, params.id));
    }
    return data({ error: "intent inválido" }, { status: 400 });
  } catch (e) {
    if (e instanceof Response) {
      const body = await e.json().catch(() => ({ message: "Error" }));
      return data({ error: body.message ?? body.error ?? "Error" }, { status: e.status });
    }
    return data({ error: e instanceof Error ? e.message : String(e) }, { status: 502 });
  }
};
