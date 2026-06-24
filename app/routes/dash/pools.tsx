import type { Route } from "./+types/pools";
import { useEffect, useState } from "react";
import { useFetcher, useRevalidator, data } from "react-router";
import QRCode from "qrcode";
import { getUserOrRedirect } from "~/.server/getters";
import { db } from "~/.server/db";
import { createPool } from "~/.server/core/poolOperations";
import { connectPool, disconnectPool } from "~/.server/integrations/whatsapp/baileys.server";

// Minimal dashboard for WhatsApp Pools ("Líneas"): create a pool with the owner's
// Claude OAuth, connect Baileys (QR pairing), see status. POC surface.
export async function loader({ request }: Route.LoaderArgs) {
  const user = await getUserOrRedirect(request);
  const pools = await db.pool.findMany({
    where: { ownerId: user.id },
    orderBy: { createdAt: "desc" },
  });
  // Render any pending QR to a data URL so the client can show it directly.
  const withQr = await Promise.all(
    pools.map(async (p) => {
      const b = (p.baileys ?? {}) as { status?: string; qr?: string };
      let qrDataUrl: string | null = null;
      if (b.status === "qr_pending" && b.qr) {
        qrDataUrl = await QRCode.toDataURL(b.qr).catch(() => null);
      }
      return {
        id: p.id,
        name: p.name,
        token: p.token,
        workerTemplate: p.workerTemplate,
        status: b.status ?? "disconnected",
        qrDataUrl,
      };
    })
  );
  return { pools: withQr };
}

export async function action({ request }: Route.ActionArgs) {
  const user = await getUserOrRedirect(request);
  const ctx = { user, scopes: ["ADMIN" as const] };
  const fd = await request.formData();
  const intent = String(fd.get("intent") || "");

  if (intent === "create") {
    const name = String(fd.get("name") || "").trim() || undefined;
    const oauth = String(fd.get("oauth") || "").trim();
    const persona = oauth ? { env: { CLAUDE_CODE_OAUTH_TOKEN: oauth } } : undefined;
    const pool = await createPool(ctx, { name, persona });
    return data({ ok: true, poolId: pool.id });
  }
  const poolId = String(fd.get("poolId") || "");
  const pool = poolId ? await db.pool.findUnique({ where: { id: poolId } }) : null;
  if (!pool || pool.ownerId !== user.id) return data({ error: "not found" }, { status: 404 });

  if (intent === "connect") {
    // connectPool reflects its own status (connecting/qr_pending/failed) in
    // Pool.baileys; never let a connect error 500 the action — the UI polls state.
    await connectPool(poolId).catch((e) => console.error("connectPool failed", e));
    return data({ ok: true });
  }
  if (intent === "disconnect") {
    await disconnectPool(poolId);
    return data({ ok: true });
  }
  return data({ error: "intent inválido" }, { status: 400 });
}

const STATUS_LABEL: Record<string, string> = {
  connected: "Conectada",
  qr_pending: "Escanea el QR",
  connecting: "Conectando…",
  failed: "Falló",
  disconnected: "Desconectada",
};

export default function Pools({ loaderData }: Route.ComponentProps) {
  const { pools } = loaderData;
  const fetcher = useFetcher();
  const rev = useRevalidator();
  const [name, setName] = useState("");
  const [oauth, setOauth] = useState("");

  // What's currently submitting (to show per-button spinners).
  const busy = fetcher.state !== "idle";
  const busyIntent = fetcher.formData?.get("intent") as string | undefined;
  const busyPoolId = fetcher.formData?.get("poolId") as string | undefined;
  const isBusy = (intent: string, poolId?: string) =>
    busy && busyIntent === intent && (poolId === undefined || busyPoolId === poolId);

  // Poll while any pool is pairing/connecting so the QR + status refresh.
  const polling = pools.some((p) => p.status === "qr_pending" || p.status === "connecting");
  useEffect(() => {
    if (!polling) return;
    const t = setInterval(() => rev.revalidate(), 2500);
    return () => clearInterval(t);
  }, [polling, rev]);

  return (
    <div className="max-w-3xl mx-auto p-6">
      <h1 className="text-2xl font-bold mb-1">Líneas (Pool de WhatsApp)</h1>
      <p className="text-gray-500 mb-6">
        Cada línea conecta un WhatsApp y atiende sus grupos con agentes que se levantan bajo demanda.
      </p>

      <fetcher.Form method="post" className="border-2 border-black rounded-xl p-4 mb-8 flex flex-col gap-3">
        <input type="hidden" name="intent" value="create" />
        <label className="text-sm font-semibold">Nombre</label>
        <input
          name="name" value={name} onChange={(e) => setName(e.target.value)}
          placeholder="Atención a cliente" className="border-2 border-black rounded-lg px-3 py-2"
        />
        <label className="text-sm font-semibold">Tu OAuth de Claude (cuenta Max)</label>
        <input
          name="oauth" value={oauth} onChange={(e) => setOauth(e.target.value)}
          placeholder="sk-ant-oat..." className="border-2 border-black rounded-lg px-3 py-2 font-mono text-sm"
        />
        <button className="self-start bg-brand-500 text-white rounded-lg px-4 py-2 font-semibold">
          + Crear línea
        </button>
      </fetcher.Form>

      <div className="flex flex-col gap-4">
        {pools.length === 0 && <p className="text-gray-400">Aún no tienes líneas.</p>}
        {pools.map((p) => (
          <div key={p.id} className="border-2 border-black rounded-xl p-4">
            <div className="flex items-center justify-between">
              <div>
                <div className="font-bold">{p.name || "Sin nombre"}</div>
                <div className="text-sm text-gray-500">{p.workerTemplate}</div>
              </div>
              <span className="text-sm font-semibold px-2 py-1 rounded-lg bg-gray-100">
                {STATUS_LABEL[p.status] ?? p.status}
              </span>
            </div>

            {p.qrDataUrl && (
              <div className="mt-4 flex flex-col items-center">
                <img src={p.qrDataUrl} alt="QR de WhatsApp" className="w-56 h-56" />
                <p className="text-sm text-gray-500 mt-2">
                  WhatsApp → Dispositivos vinculados → Vincular dispositivo
                </p>
              </div>
            )}

            <div className="mt-4 flex gap-2">
              {p.status !== "connected" && (
                <button
                  onClick={() => fetcher.submit({ intent: "connect", poolId: p.id }, { method: "post" })}
                  className="border-2 border-black rounded-lg px-3 py-1.5 text-sm font-semibold"
                >
                  Conectar
                </button>
              )}
              {(p.status === "connected" || p.status === "connecting" || p.status === "qr_pending") && (
                <button
                  onClick={() => fetcher.submit({ intent: "disconnect", poolId: p.id }, { method: "post" })}
                  className="border-2 border-black rounded-lg px-3 py-1.5 text-sm font-semibold"
                >
                  Desconectar
                </button>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
