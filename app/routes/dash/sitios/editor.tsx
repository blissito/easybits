import { useCallback, useEffect, useRef, useState } from "react";
import { Link, data, useFetcher, useLoaderData, useSearchParams } from "react-router";
import { Streamdown } from "streamdown";
import { getUserOrRedirect } from "~/.server/getters";
import type { AuthContext } from "~/.server/apiAuth";
import { attachNewestMachine, deleteSite, getSite, publishSite } from "~/.server/core/siteOperations";
import type { Route } from "./+types/editor";

export const meta = () => [{ title: "Sitio — EasyBits" }, { name: "robots", content: "noindex" }];

export const loader = async ({ request, params }: Route.LoaderArgs) => {
  const user = await getUserOrRedirect(request);
  const site = await getSite({ user, scopes: ["READ"] } as AuthContext, params.id!);
  return { site };
};

export const action = async ({ request, params }: Route.ActionArgs) => {
  const user = await getUserOrRedirect(request);
  const ctx = { user, scopes: ["READ", "WRITE", "DELETE"] } as AuthContext;
  const form = await request.formData();
  const intent = String(form.get("intent") || "");
  try {
    switch (intent) {
      case "attach":
        return data({ site: await attachNewestMachine(ctx, params.id!) });
      case "publish":
        return data({ launch: await publishSite(ctx, params.id!) });
      case "delete":
        await deleteSite(ctx, params.id!);
        return data({ deleted: true });
      default:
        return data({ error: "intent desconocido" }, { status: 400 });
    }
  } catch (e) {
    const message = e instanceof Response ? await e.text().catch(() => e.statusText) : e instanceof Error ? e.message : "error";
    return data({ error: message }, { status: 400 });
  }
};

type Msg = { role: "user" | "bot"; text: string; tools?: string[]; imageUrl?: string; quota?: boolean };
type Attached = { base64: string; ext: string; url: string; name: string };

// Tools del turno agrupadas y contraídas: "3 búsquedas · 2 acciones" en vez de una
// lista cruda de nombres internos (tool_search_tool_bm25, mcp_easybits_run_tool…).
function summarizeTools(tools: string[]) {
  const counts = new Map<string, number>();
  for (const t of tools) {
    const label = /search|discover/.test(t) ? "búsqueda" : /read|list|get/.test(t) ? "lectura" : "acción";
    counts.set(label, (counts.get(label) ?? 0) + 1);
  }
  return [...counts].map(([k, n]) => `${n} ${k}${n === 1 ? "" : k === "acción" ? "es" : "s"}`).join(" · ");
}

function fmtTokens(n: number) {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${Math.round(n / 1_000)}K`;
  return String(n);
}
type Selection = { id: string; tag: string } | null;

export default function SiteEditor() {
  const { site } = useLoaderData<typeof loader>();
  const [params, setParams] = useSearchParams();
  const fetcher = useFetcher<typeof action>();
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [selection, setSelection] = useState<Selection>(null);
  const [tokens, setTokens] = useState<{ remaining: number; limit: number } | null>(null);
  const [attached, setAttached] = useState<Attached | null>(null);
  // Móvil: una columna a la vez (chat | vista previa). En desktop van lado a lado.
  const [mobileTab, setMobileTab] = useState<"chat" | "preview">("chat");
  const [previewKey, setPreviewKey] = useState(0);
  const bodyRef = useRef<HTMLDivElement>(null);
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const checkout = params.get("checkout");

  // Historial persistido (FleetAgentMessage bajo site:<id>).
  useEffect(() => {
    fetch(`/api/v2/sites/${site.id}/chat`)
      .then((r) => (r.ok ? r.json() : { messages: [] }))
      .then((d: { messages?: Array<{ role: string; text: string }>; tokens?: { remaining: number; limit: number } }) => {
        if (d.tokens) setTokens(d.tokens);
        // No pisar un turno que ya arrancó (el primer prompt se manda antes de
        // que llegue el historial).
        setMsgs((cur) => (cur.length ? cur : (d.messages ?? []).map((m) => ({ role: m.role === "user" ? "user" : "bot", text: m.text }))));
      })
      .catch(() => {});
  }, [site.id]);

  useEffect(() => {
    bodyRef.current?.scrollTo({ top: bodyRef.current.scrollHeight });
  }, [msgs]);

  // Selección desde la vista previa (picker inyectado en /s/:slug?eb_edit=1).
  useEffect(() => {
    const onMsg = (e: MessageEvent) => {
      const d = e.data;
      if (d?.type === "eb-selected" && typeof d.id === "string") setSelection({ id: d.id, tag: String(d.tag || "div") });
      if (d?.type === "eb-deselected") setSelection(null);
    };
    window.addEventListener("message", onMsg);
    return () => window.removeEventListener("message", onMsg);
  }, []);

  // Imagen adjunta (mockup/referencia): drop, paste o botón. Solo png/jpg/webp, ≤5 MB.
  const attachFile = useCallback((file: File | null | undefined) => {
    if (!file) return;
    const ext = (file.type.split("/")[1] || "").replace("jpeg", "jpg");
    if (!/^(png|jpg|webp)$/.test(ext) || file.size > 5 * 1024 * 1024) return;
    const reader = new FileReader();
    reader.onload = () => {
      const url = String(reader.result);
      setAttached({ base64: url.split(",")[1] ?? "", ext, url, name: file.name });
    };
    reader.readAsDataURL(file);
  }, []);
  useEffect(() => {
    const onPaste = (e: ClipboardEvent) => {
      const f = Array.from(e.clipboardData?.files ?? []).find((x) => x.type.startsWith("image/"));
      if (f) { e.preventDefault(); attachFile(f); }
    };
    document.addEventListener("paste", onPaste);
    return () => document.removeEventListener("paste", onPaste);
  }, [attachFile]);

  const send = useCallback(
    async (text: string) => {
      text = text.trim();
      if ((!text && !attached) || busy) return;
      if (!text) text = "Usa esta imagen como referencia para el sitio.";
      setBusy(true);
      setInput("");
      const sel = selection;
      const img = attached;
      setSelection(null);
      setAttached(null);
      setMsgs((m) => [...m, { role: "user", text: sel ? `[${sel.id}] ${text}` : text, imageUrl: img?.url }, { role: "bot", text: "", tools: [] }]);
      const patch = (fn: (prev: Msg) => Msg) =>
        setMsgs((m) => {
          const last = m[m.length - 1];
          if (!last || last.role !== "bot") return m;
          return [...m.slice(0, -1), fn(last)];
        });
      try {
        const res = await fetch(`/api/v2/sites/${site.id}/chat`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ text, selection: sel, image: img ? { base64: img.base64, ext: img.ext } : undefined }),
        });
        if (res.status === 402) {
          setTokens((t) => (t ? { ...t, remaining: 0 } : { remaining: 0, limit: 0 }));
          patch((p) => ({ ...p, quota: true, text: "Se acabaron tus tokens LLM." }));
          return;
        }
        if (!res.ok || !res.body) {
          const err = await res.json().catch(() => null);
          patch((p) => ({ ...p, text: `⚠️ ${err?.message || `Error ${res.status}`}` }));
          return;
        }
        const reader = res.body.getReader();
        const dec = new TextDecoder();
        let buf = "";
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buf += dec.decode(value, { stream: true });
          let nl: number;
          while ((nl = buf.indexOf("\n\n")) !== -1) {
            const dl = buf.slice(0, nl).split("\n").find((l) => l.startsWith("data: "));
            buf = buf.slice(nl + 2);
            if (!dl) continue;
            try {
              const e = JSON.parse(dl.slice(6));
              if (e.type === "chunk") patch((p) => ({ ...p, text: p.text + e.value }));
              else if (e.type === "tool" && e.phase === "start") patch((p) => ({ ...p, tools: [...(p.tools ?? []), e.name] }));
              else if (e.type === "done") patch((p) => ({ ...p, text: e.value }));
              else if (e.type === "error") patch((p) => ({ ...p, text: `⚠️ ${e.message}` }));
              else if (e.type === "capacity") patch((p) => ({ ...p, text: `⏳ ${e.message} — reintenta en unos segundos.` }));
            } catch { /* evento malformado */ }
          }
        }
      } catch (err) {
        patch((p) => ({ ...p, text: `⚠️ ${err instanceof Error ? err.message : "error de red"}` }));
      } finally {
        setBusy(false);
        setPreviewKey((k) => k + 1);
        // Saldo fresco tras el turno (el proxy medido ya descontó).
        fetch(`/api/v2/sites/${site.id}/chat`).then((r) => (r.ok ? r.json() : null)).then((d) => d?.tokens && setTokens(d.tokens)).catch(() => {});
      }
    },
    [busy, selection, attached, site.id]
  );

  // Primer mensaje que llegó desde /new por la URL: se manda solo y se limpia.
  const firstPrompt = params.get("prompt");
  useEffect(() => {
    if (!firstPrompt) return;
    params.delete("prompt");
    setParams(params, { replace: true });
    void send(firstPrompt);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [firstPrompt]);

  const previewUrl = site.previewUrl ? `${site.previewUrl}${site.kind === "static" ? "?eb_edit=1" : ""}` : null;
  const launch = fetcher.data && "launch" in fetcher.data ? fetcher.data.launch : null;
  const actionError = fetcher.data && "error" in fetcher.data ? fetcher.data.error : null;

  return (
    <div className="fixed inset-0 md:pl-28 pt-16 flex bg-gray-50 overflow-hidden">
      {/* Chat */}
      <aside className={`${mobileTab === "chat" ? "flex" : "hidden"} md:flex w-full md:max-w-sm flex-col md:border-r-2 border-black bg-white min-w-0`}>
        <header className="px-4 py-3 border-b-2 border-black flex items-center gap-2">
          <Link to="/dash/sitios" className="text-gray-400 hover:text-black">←</Link>
          <div className="min-w-0 flex-1">
            <p className="font-bold truncate">{site.name}</p>
            <p className="text-[11px] text-gray-400">{site.kind === "webapp" ? "Web app" : "Sitio estático"}</p>
          </div>
          {tokens && (
            <Link to="/dash/packs" title="Tokens LLM disponibles en tu cuenta"
              className={`text-[10px] font-bold px-2 py-1 rounded-lg border-2 ${tokens.remaining > 0 ? "border-gray-200 text-gray-500" : "border-red-300 bg-red-50 text-red-600"}`}>
              {fmtTokens(tokens.remaining)} tokens
            </Link>
          )}
        </header>
        <div ref={bodyRef} className="flex-1 overflow-y-auto px-4 py-4 space-y-3">
          {msgs.length === 0 && (
            <p className="text-sm text-gray-400 text-center mt-10">Describe qué quieres y el agente lo construye.</p>
          )}
          {msgs.map((m, i) => (
            <div key={i} className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
              <div className={`max-w-[85%] px-3.5 py-2 rounded-2xl text-sm break-words ${m.role === "user" ? "bg-brand-500 text-white rounded-br-md whitespace-pre-wrap" : "bg-gray-50 border-2 border-gray-200 rounded-bl-md"}`}>
                {m.role === "bot" ? (
                  <>
                    {m.tools && m.tools.length > 0 && (
                      <details className="text-[10px] text-gray-400 mb-1">
                        <summary className="cursor-pointer select-none">⚙ {summarizeTools(m.tools)}</summary>
                        <p className="font-mono mt-1 break-all">{m.tools.join(" · ")}</p>
                      </details>
                    )}
                    {m.text ? <Streamdown>{m.text}</Streamdown> : <span className="text-gray-400">construyendo…</span>}
                    {m.quota && (
                      <div className="mt-2 flex gap-2">
                        <Link to="/dash/packs" className="px-3 py-1 rounded-lg bg-black text-white text-xs font-bold">Recargar</Link>
                        <Link to="/planes" className="px-3 py-1 rounded-lg border-2 border-black text-xs font-bold">Subir de plan</Link>
                      </div>
                    )}
                  </>
                ) : (
                  <>
                    {m.imageUrl && <img src={m.imageUrl} alt="" className="max-h-40 rounded-lg mb-2 border border-white/30" />}
                    {m.text}
                  </>
                )}
              </div>
            </div>
          ))}
        </div>
        {selection && (
          <div className="px-4 py-2 text-xs bg-amber-50 border-t-2 border-amber-300 flex items-center gap-2">
            <span className="font-mono">&lt;{selection.tag} #{selection.id}&gt;</span>
            <span className="text-gray-500">seleccionado</span>
            <button type="button" className="ml-auto text-gray-400 hover:text-black" onClick={() => setSelection(null)}>✕</button>
          </div>
        )}
        {attached && (
          <div className="px-4 py-2 text-xs bg-gray-50 border-t-2 border-gray-200 flex items-center gap-2">
            <img src={attached.url} alt="" className="h-10 w-10 object-cover rounded border border-gray-300" />
            <span className="truncate text-gray-600">{attached.name}</span>
            <button type="button" className="ml-auto text-gray-400 hover:text-black" onClick={() => setAttached(null)}>✕</button>
          </div>
        )}
        <form
          className="p-3 pb-16 md:pb-3 border-t-2 border-black flex gap-2"
          onSubmit={(e) => { e.preventDefault(); void send(input); }}
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => { e.preventDefault(); attachFile(e.dataTransfer.files?.[0]); }}
        >
          <label className="px-2 flex items-center border-2 border-black rounded-xl cursor-pointer text-gray-500 hover:text-black" title="Adjuntar imagen o mockup (o pega/arrastra)">
            🖼
            <input type="file" accept="image/png,image/jpeg,image/webp" className="hidden" onChange={(e) => { attachFile(e.target.files?.[0]); e.target.value = ""; }} />
          </label>
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder={attached ? "¿Qué hago con esta imagen?" : selection ? "¿Qué cambio en ese elemento?" : "Escribe un cambio… (arrastra un mockup)"}
            className="flex-1 px-4 py-2.5 border-2 border-black rounded-xl text-sm focus:outline-none"
          />
          <button type="submit" disabled={busy || (!input.trim() && !attached)} className="px-4 py-2 rounded-xl bg-black text-white text-sm font-bold disabled:opacity-40">
            {busy ? "…" : "Enviar"}
          </button>
        </form>
      </aside>

      {/* Preview */}
      <main className={`${mobileTab === "preview" ? "flex" : "hidden"} md:flex flex-1 flex-col min-w-0`}>
        <div className="px-4 py-2 border-b-2 border-black bg-white flex items-center gap-3 text-sm overflow-x-auto whitespace-nowrap">
          <span className="font-mono text-xs text-gray-500 truncate flex-1">{site.url ?? "sin publicar"}</span>
          {site.url && (
            <a href={site.url} target="_blank" rel="noreferrer" className="text-brand-500 font-bold">Abrir ↗</a>
          )}
          {site.kind === "webapp" && site.sandboxId && (
            <>
              <fetcher.Form method="post">
                <input type="hidden" name="intent" value="publish" />
                <button type="submit" disabled={fetcher.state !== "idle"} className="px-3 py-1.5 rounded-lg bg-brand-500 text-white font-bold disabled:opacity-40">
                  {fetcher.state !== "idle" ? "Publicando…" : "Publicar"}
                </button>
              </fetcher.Form>
              <Link to="/dash/hosting" className="text-gray-500 hover:text-black">Dominios y versiones</Link>
            </>
          )}
          {site.kind === "static" && <Link to="/dash/developer/domains" className="text-gray-500 hover:text-black">Dominio propio</Link>}
          <button type="button" onClick={() => setPreviewKey((k) => k + 1)} className="text-gray-500 hover:text-black" title="Recargar">⟳</button>
        </div>
        {launch && (
          <p className="px-4 py-2 text-xs bg-green-50 border-b-2 border-green-300">
            Publicado v{launch.version} → <a className="underline" href={launch.url} target="_blank" rel="noreferrer">{launch.url}</a>
          </p>
        )}
        {actionError && <p className="px-4 py-2 text-xs bg-red-50 border-b-2 border-red-300">{actionError}</p>}
        {site.kind === "webapp" && !site.sandboxId ? (
          <div className="flex-1 flex flex-col items-center justify-center gap-3 text-center px-6">
            <p className="font-bold">Falta la máquina de esta web app</p>
            <p className="text-sm text-gray-500 max-w-md">Se cobra aparte del plan. Completa el pago y vuelve aquí; la máquina se crea sola al confirmarse.</p>
            {checkout && (
              <a href={checkout} className="px-4 py-2 rounded-xl bg-black text-white font-bold">Pagar la máquina</a>
            )}
            <fetcher.Form method="post">
              <input type="hidden" name="intent" value="attach" />
              <button type="submit" className="text-sm underline text-gray-500">Ya pagué, vincular máquina</button>
            </fetcher.Form>
          </div>
        ) : previewUrl ? (
          <iframe key={previewKey} ref={iframeRef} src={previewUrl} title="Vista previa" className="flex-1 w-full bg-white pb-12 md:pb-0" />
        ) : (
          <div className="flex-1 flex items-center justify-center text-gray-400 text-sm">Sin vista previa todavía</div>
        )}
      </main>
      {/* Pestañas móvil */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 z-30 grid grid-cols-2 border-t-2 border-black bg-white">
        {(["chat", "preview"] as const).map((t) => (
          <button key={t} type="button" onClick={() => { setMobileTab(t); if (t === "preview") setPreviewKey((k) => k + 1); }}
            className={`py-3 text-sm font-bold ${mobileTab === t ? "bg-black text-white" : "text-gray-600"}`}>
            {t === "chat" ? "Chat" : "Vista previa"}
          </button>
        ))}
      </nav>
    </div>
  );
}
