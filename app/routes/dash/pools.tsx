import type { Route } from "./+types/pools";
import { useEffect, useState } from "react";
import { useFetcher, useRevalidator, data } from "react-router";
import QRCode from "qrcode";
import { getUserOrRedirect } from "~/.server/getters";
import { db } from "~/.server/db";
import { createPool } from "~/.server/core/poolOperations";
import { listSecrets, createSecret } from "~/.server/core/secretOperations";
import {
  connectPool,
  disconnectPool,
  listPoolGroups,
  isPoolLive,
  ensureRehydrated,
} from "~/.server/integrations/whatsapp/baileys.server";

const DEFAULT_OAUTH = "CLAUDE_CODE_OAUTH_TOKEN";

export async function loader({ request }: Route.LoaderArgs) {
  const user = await getUserOrRedirect(request);
  // Reconnect any pools that were live before an app restart (lazy, once).
  await ensureRehydrated();

  const secretNames = (await listSecrets(user.id)).map((s) => s.name);
  const rows = await db.pool.findMany({ where: { ownerId: user.id }, orderBy: { createdAt: "desc" } });
  const pools = await Promise.all(
    rows.map(async (p) => {
      const b = (p.baileys ?? {}) as { status?: string; qr?: string };
      const status = b.status ?? "disconnected";
      const live = isPoolLive(p.id);
      const qrDataUrl =
        status === "qr_pending" && b.qr ? await QRCode.toDataURL(b.qr).catch(() => null) : null;
      const groups = status === "connected" && live ? await listPoolGroups(p.id) : [];
      const [vms, conversations] = await Promise.all([
        db.agent.count({ where: { poolId: p.id, status: { in: ["running", "suspended", "building"] } } }),
        db.poolRoute.count({ where: { poolId: p.id } }),
      ]);
      return { id: p.id, name: p.name, status, live, qrDataUrl, groups, enabledCount: p.enabledGroups.length, vms, conversations };
    })
  );
  return { secretNames, pools };
}

export async function action({ request }: Route.ActionArgs) {
  const user = await getUserOrRedirect(request);
  const ctx = { user, scopes: ["ADMIN" as const] };
  const fd = await request.formData();
  const intent = String(fd.get("intent") || "");

  if (intent === "create") {
    const name = String(fd.get("name") || "").trim() || undefined;
    let oauthSecretName = String(fd.get("oauthSecretName") || "").trim();
    const newOauth = String(fd.get("newOauth") || "").trim();
    // Pasting a new token saves it to the vault under the given (or default) name.
    if (newOauth) {
      const secretName = String(fd.get("newOauthName") || "").trim() || DEFAULT_OAUTH;
      await createSecret(user.id, { name: secretName, value: newOauth });
      oauthSecretName = secretName;
    }
    if (!oauthSecretName) return data({ error: "Elige o pega un OAuth" }, { status: 400 });
    const pool = await createPool(ctx, { name, oauthSecretName });
    return data({ ok: true, poolId: pool.id });
  }

  const poolId = String(fd.get("poolId") || "");
  const pool = poolId ? await db.pool.findUnique({ where: { id: poolId } }) : null;
  if (!pool || pool.ownerId !== user.id) return data({ error: "not found" }, { status: 404 });

  if (intent === "connect") {
    await connectPool(poolId).catch((e) => console.error("connectPool failed", e));
    return data({ ok: true });
  }
  if (intent === "disconnect") {
    await disconnectPool(poolId);
    return data({ ok: true });
  }
  if (intent === "toggle-group") {
    const groupId = String(fd.get("groupId") || "");
    const on = String(fd.get("on") || "") === "1";
    const set = new Set(pool.enabledGroups);
    if (on) set.add(groupId);
    else set.delete(groupId);
    await db.pool.update({ where: { id: poolId }, data: { enabledGroups: [...set] } });
    return data({ ok: true });
  }
  return data({ error: "intent inválido" }, { status: 400 });
}

const STATUS = {
  connected: { label: "Conectado", dot: "bg-green-500" },
  qr_pending: { label: "Escanea el QR", dot: "bg-yellow-500" },
  connecting: { label: "Conectando…", dot: "bg-yellow-500 animate-pulse" },
  failed: { label: "Falló", dot: "bg-red-500" },
  disconnected: { label: "Desconectado", dot: "bg-gray-300" },
} as const;

function Spinner() {
  return <span className="inline-block w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin align-[-2px]" />;
}

export default function Pools({ loaderData }: Route.ComponentProps) {
  const { secretNames, pools } = loaderData;
  const fetcher = useFetcher();
  const rev = useRevalidator();
  const [name, setName] = useState("");
  const [oauthChoice, setOauthChoice] = useState(secretNames.includes(DEFAULT_OAUTH) ? DEFAULT_OAUTH : secretNames[0] ?? "__new__");
  const [newOauth, setNewOauth] = useState("");
  const hasSecrets = secretNames.length > 0;
  const pasteNew = oauthChoice === "__new__" || !hasSecrets;

  const busy = fetcher.state !== "idle";
  const bIntent = fetcher.formData?.get("intent") as string | undefined;
  const bPool = fetcher.formData?.get("poolId") as string | undefined;
  const isBusy = (intent: string, poolId?: string) => busy && bIntent === intent && (poolId === undefined || bPool === poolId);

  const polling = pools.some((p) => p.status === "qr_pending" || p.status === "connecting");
  useEffect(() => {
    if (!polling) return;
    const t = setInterval(() => rev.revalidate(), 2500);
    return () => clearInterval(t);
  }, [polling, rev]);

  return (
    <div className="max-w-2xl mx-auto p-6">
      <h1 className="text-2xl font-bold mb-1">Canales (Pool de WhatsApp)</h1>
      <p className="text-gray-500 mb-6">Conecta un WhatsApp y atiende sus grupos con agentes que se levantan bajo demanda.</p>

      {/* Nuevo canal */}
      <div className="border-2 border-black rounded-xl p-4 mb-8 animate-fade-in">
        <span className="font-bold block mb-3">Nuevo canal</span>
        <fetcher.Form method="post" className="flex flex-col gap-3">
          <input type="hidden" name="intent" value="create" />
          <input name="name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Atención a cliente"
            className="border-2 border-black rounded-lg px-3 py-2" />

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

          <button disabled={isBusy("create")} className="self-start bg-brand-500 text-white rounded-lg px-4 py-2 font-semibold disabled:opacity-60">
            {isBusy("create") ? <Spinner /> : "+ Crear canal"}
          </button>
        </fetcher.Form>
      </div>

      <div className="flex flex-col gap-4">
        {pools.length === 0 && <p className="text-gray-400">Aún no tienes canales.</p>}
        {pools.map((p) => {
          const st = STATUS[p.status as keyof typeof STATUS] ?? STATUS.disconnected;
          const stale = p.status === "connected" && !p.live;
          return (
            <div key={p.id} className="border-2 border-black rounded-xl p-4 animate-fade-in">
              <div className="flex items-center justify-between">
                <div className="font-bold">{p.name || "Sin nombre"}</div>
                <span className="flex items-center gap-2 text-sm font-semibold">
                  <span className={`w-2.5 h-2.5 rounded-full ${stale ? "bg-orange-400" : st.dot}`} />
                  {stale ? "Reconectando…" : st.label}
                </span>
              </div>

              {p.qrDataUrl && (
                <div className="mt-4 flex flex-col items-center">
                  <img src={p.qrDataUrl} alt="QR de WhatsApp" className="w-56 h-56" />
                  <p className="text-sm text-gray-500 mt-2">WhatsApp → Dispositivos vinculados → Vincular dispositivo</p>
                </div>
              )}

              {p.status === "connected" && p.live && (
                <div className="mt-4">
                  <div className="flex items-center justify-between mb-2">
                    <span className="font-semibold text-sm">Grupos que atiende</span>
                    <span className="text-xs text-gray-400">{p.vms} VM{p.vms !== 1 ? "s" : ""} · {p.conversations} conv.</span>
                  </div>
                  {p.groups.length === 0 && <p className="text-xs text-gray-400">No se ven grupos aún. Solo responde en los que actives.</p>}
                  <div className="flex flex-col gap-1.5">
                    {p.groups.map((g) => (
                      <label key={g.id} className="flex items-center gap-2 text-sm cursor-pointer">
                        <input type="checkbox" checked={g.enabled} disabled={isBusy("toggle-group", p.id)}
                          onChange={(e) => fetcher.submit({ intent: "toggle-group", poolId: p.id, groupId: g.id, on: e.target.checked ? "1" : "0" }, { method: "post" })} />
                        <span className={g.enabled ? "font-semibold" : ""}>{g.subject}</span>
                      </label>
                    ))}
                  </div>
                  {p.enabledCount === 0 && p.groups.length > 0 && (
                    <p className="text-xs text-amber-600 mt-2">⚠️ Sin grupos activos: el agente no responde a nadie (anti-spam).</p>
                  )}
                </div>
              )}

              <div className="mt-4 flex gap-2">
                {p.status !== "connecting" && p.status !== "qr_pending" && !(p.status === "connected" && p.live) && (
                  <button disabled={isBusy("connect", p.id)} onClick={() => fetcher.submit({ intent: "connect", poolId: p.id }, { method: "post" })}
                    className="border-2 border-black rounded-lg px-3 py-1.5 text-sm font-semibold disabled:opacity-60">
                    {isBusy("connect", p.id) ? <Spinner /> : "Conectar"}
                  </button>
                )}
                {(p.live || p.status === "connecting" || p.status === "qr_pending") && (
                  <button disabled={isBusy("disconnect", p.id)} onClick={() => fetcher.submit({ intent: "disconnect", poolId: p.id }, { method: "post" })}
                    className="border-2 border-black rounded-lg px-3 py-1.5 text-sm font-semibold disabled:opacity-60">
                    {isBusy("disconnect", p.id) ? <Spinner /> : "Desconectar"}
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
