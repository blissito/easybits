import { useEffect, useState } from "react";
import { useFetcher } from "react-router";
import { LuLoader, LuQrCode, LuHash, LuUnlink, LuCircleCheck, LuUsers } from "react-icons/lu";

// WhatsApp pairing panel for a flagship-agent machine (ghostyclaw). Polls the
// status loader (GET /dash/hosting/wa/:id) every few seconds and renders the
// QR (rasterized server-side → <img>) or pairing code; lets the operator link
// by QR or 8-digit code, or unlink. Mirrors ghosty-studio's pairing UX.
export function WaPanel({ sandboxId }: { sandboxId: string }) {
  const poll = useFetcher<any>();
  const act = useFetcher<any>();
  const base = `/dash/hosting/wa/${encodeURIComponent(sandboxId)}`;
  const [phone, setPhone] = useState("");
  const [groupName, setGroupName] = useState("");

  // Poll status every 4s while the panel is mounted.
  useEffect(() => {
    poll.load(base);
    const t = setInterval(() => poll.load(base), 4000);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sandboxId]);

  const s: any = poll.data ?? {};
  const state: string = s.state ?? "connecting";
  const busy = act.state !== "idle";
  const actErr = act.data?.error as string | undefined;
  const code: string | undefined = s.code ?? s.pairingCode;

  const link = (method: "qr" | "pairing-code") =>
    act.submit({ intent: "link", method, phone }, { method: "post", action: base });
  const unlink = () => act.submit({ intent: "unlink" }, { method: "post", action: base });

  return (
    <div className="mt-2 border-2 border-black rounded-xl bg-white p-3 text-sm">
      <div className="flex items-center gap-2 mb-2">
        <span className="font-black uppercase tracking-wider text-xs text-iron">WhatsApp</span>
        {state === "connecting" && <span className="text-iron flex items-center gap-1"><LuLoader size={12} className="animate-spin" /> conectando…</span>}
        {state === "linked" && <span className="text-green-600 font-bold flex items-center gap-1"><LuCircleCheck size={14} /> vinculado{s.phone ? ` · ${s.phone}` : ""}</span>}
        {(state === "qr" || state === "pairing_code") && <span className="text-brand-500 font-bold">esperando vínculo…</span>}
      </div>

      {s.error && <p className="text-xs text-brand-red mb-2">{String(s.error)}</p>}
      {actErr && <p className="text-xs text-brand-red mb-2">{actErr}</p>}

      {state === "qr" && s.qrDataUrl && (
        <div className="flex flex-col items-center gap-1 mb-2">
          <img src={s.qrDataUrl} alt="QR de vinculación" width={220} height={220} className="border-2 border-black rounded-lg" />
          <p className="text-[11px] text-iron">WhatsApp → Dispositivos vinculados → Vincular dispositivo</p>
        </div>
      )}

      {state === "pairing_code" && code && (
        <div className="mb-2">
          <p className="text-[11px] text-iron mb-1">Ingresa este código en WhatsApp → Vincular con número:</p>
          <p className="font-mono text-2xl font-black tracking-widest">{code}</p>
        </div>
      )}

      {state !== "linked" && (
        <div className="flex flex-wrap items-center gap-2">
          <button type="button" disabled={busy} onClick={() => link("qr")}
            className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg border-2 border-black bg-white hover:bg-brand-100 text-xs font-bold disabled:opacity-50 transition-all">
            <LuQrCode size={14} /> QR
          </button>
          <input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="52..." inputMode="numeric"
            className="w-28 px-2 py-1.5 rounded-lg border-2 border-black text-xs font-mono" />
          <button type="button" disabled={busy || !phone.trim()} onClick={() => link("pairing-code")}
            className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg border-2 border-black bg-white hover:bg-brand-100 text-xs font-bold disabled:opacity-50 transition-all">
            <LuHash size={14} /> Código
          </button>
          {busy && <LuLoader size={14} className="animate-spin text-brand-500" />}
        </div>
      )}

      {state === "linked" && (
        <div className="flex flex-col gap-3">
          {/* Main (admin) group: show its invite QR if it exists, else offer to create it. */}
          {s.mainGroupQrDataUrl ? (
            <div className="flex flex-col items-center gap-1">
              <span className="text-[11px] font-bold text-iron">Grupo main{s.mainGroup?.name ? `: ${s.mainGroup.name}` : ""}</span>
              <img src={s.mainGroupQrDataUrl} alt="Invitación al grupo main" width={180} height={180} className="border-2 border-black rounded-lg" />
              {s.mainGroup?.inviteUrl && (
                <a href={s.mainGroup.inviteUrl} target="_blank" rel="noopener noreferrer" className="text-[11px] underline text-brand-500 break-all">{s.mainGroup.inviteUrl}</a>
              )}
            </div>
          ) : (
            <div className="flex flex-wrap items-center gap-2">
              <input value={groupName} onChange={(e) => setGroupName(e.target.value)} placeholder="Nombre del grupo main"
                className="flex-1 min-w-[140px] px-2 py-1.5 rounded-lg border-2 border-black text-xs" />
              <button type="button" disabled={busy || !groupName.trim()}
                onClick={() => act.submit({ intent: "create-group", name: groupName }, { method: "post", action: base })}
                className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg border-2 border-black bg-brand-500 text-white text-xs font-bold disabled:opacity-50 transition-all">
                <LuUsers size={14} /> Crear grupo main
              </button>
            </div>
          )}
          <button type="button" disabled={busy} onClick={unlink}
            className="self-start flex items-center gap-1 px-2.5 py-1.5 rounded-lg border-2 border-black bg-white hover:bg-red-50 text-brand-red text-xs font-bold disabled:opacity-50 transition-all">
            <LuUnlink size={14} /> Desvincular
          </button>
        </div>
      )}
    </div>
  );
}
