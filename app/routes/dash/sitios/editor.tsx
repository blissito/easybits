import { useCallback, useEffect, useRef, useState } from "react";
import { Link, data, redirect, useFetcher, useLoaderData, useRevalidator, useSearchParams } from "react-router";
import toast from "react-hot-toast";
import { resolveTier, sleepPrice } from "~/lib/hostingCatalog";
import { db } from "~/.server/db";
import { ChatComposer } from "~/components/sitios/ChatComposer";
import { BotMessage, UserMessage, applyTurnEvent, type Msg } from "~/components/sitios/ChatMessages";
import { DeleteSiteArt, GithubRepoArt } from "~/components/sitios/DialogArt";
import { Modal } from "~/components/common/Modal";
import { BrutalButton } from "~/components/common/BrutalButton";
import { ThemePicker } from "~/components/sitios/ThemePicker";
import { LuArrowDown, LuMousePointerClick, LuTrash2 } from "react-icons/lu";
import { getUserOrRedirect } from "~/.server/getters";
import type { AuthContext } from "~/.server/apiAuth";
import { attachNewestMachine, deleteSite, getSite, publishSite, reviveSite, siteAdminLoginUrl, siteEngineFor } from "~/.server/core/siteOperations";
import { githubAppEnabled } from "~/.server/core/githubApp";
import { siteRepo } from "~/.server/core/githubSiteOperations";
import type { Route } from "./+types/editor";

const GITHUB_NOTICE: Record<string, string> = {
  connected: "Listo: tu app ya vive en su repo de GitHub. «Publicar» sube cada cambio, y un push desde tu compu se despliega solo.",
  perm: "GitHub no dejó crear el repo: acepta los permisos nuevos de la App (Administration y Contents) y vuelve a intentar.",
  state: "La conexión con GitHub expiró. Vuelve a intentar.",
  error: "No se pudo conectar con GitHub. Vuelve a intentar.",
  off: "La conexión con GitHub no está disponible ahora.",
};

export const meta = () => [{ title: "Sitio — EasyBits" }, { name: "robots", content: "noindex" }];

export const loader = async ({ request, params }: Route.LoaderArgs) => {
  const user = await getUserOrRedirect(request);
  // Las integraciones (MailMask) sólo conocen el id del Website que publica el sitio: si el
  // id no es de un Site del usuario pero sí de su Website, se manda al editor de ese Site.
  const own = await db.site.findFirst({ where: { id: params.id!, ownerId: user.id }, select: { id: true } }).catch(() => null);
  if (!own) {
    const bySite = await db.site.findFirst({ where: { websiteId: params.id!, ownerId: user.id }, select: { id: true } }).catch(() => null);
    if (bySite) throw redirect(`/dash/sitios/${bySite.id}`);
    // Un Website publicado por otra vía (documentos, MCP) no tiene editor: su casa es la lista.
    const web = await db.website.findFirst({ where: { id: params.id!, ownerId: user.id }, select: { id: true } }).catch(() => null);
    if (web) throw redirect(`/dash/developer/websites?id=${encodeURIComponent(web.id)}`);
  }
  const site = await getSite({ user, scopes: ["READ"] } as AuthContext, params.id!);
  const gh = siteRepo(site.sandbox?.runspec);
  // Caja de trabajo (sin publicar): construir es gratis y al publicar se cobra lo que mide.
  const workTier = site.sandbox?.workBox ? resolveTier(site.sandbox.tier) : null;
  return {
    site,
    publishPrice: workTier ? sleepPrice(workTier) : null,
    engineLabel: siteEngineFor(site).label.replace(/^Ghosty · /, ""),
    github: { enabled: githubAppEnabled(), repo: gh?.fullName ?? null },
  };
};

// Sondear la vista previa no cambia nada: sin esto cada sondeo recargaría el loader.
export const shouldRevalidate = ({ formData, defaultShouldRevalidate }: { formData?: FormData; defaultShouldRevalidate: boolean }) =>
  formData?.get("intent") === "preview-status" ? false : defaultShouldRevalidate;

export const action = async ({ request, params }: Route.ActionArgs) => {
  const user = await getUserOrRedirect(request);
  const ctx = { user, scopes: ["READ", "WRITE", "DELETE"] } as AuthContext;
  const form = await request.formData();
  const intent = String(form.get("intent") || "");
  try {
    switch (intent) {
      case "attach":
        return data({ site: await attachNewestMachine(ctx, params.id!) });
      case "revive":
        // Archivada por inactividad (workBoxExpiry.ts): caja nueva desde la dorada con su código.
        return data({ revived: await reviveSite(ctx, params.id!) });
      case "publish":
        return data({ launch: await publishSite(ctx, params.id!) });
      case "admin-login":
        return data({ adminUrl: await siteAdminLoginUrl(ctx, params.id!) });
      case "delete": {
        // La lista confirma qué se borró y si la máquina dejó de cobrarse.
        const { name, kind, sandbox } = await getSite(ctx, params.id!);
        // Una caja de trabajo nunca se cobró: se borra con el sitio y no hay cobro que avisar.
        const released = kind === "webapp" && !sandbox?.workBox && form.get("releaseMachine") === "1";
        await deleteSite(ctx, params.id!, { releaseMachine: released });
        return redirect(`/dash/sitios?eliminado=${encodeURIComponent(name)}${released ? "&liberada=1" : ""}`);
      }
      case "preview-status": {
        // El servidor dev tarda lo que la instalación (20–80 s). Se pregunta desde aquí
        // porque el navegador no puede leer el status de otro origen.
        const site = await getSite(ctx, params.id!);
        if (!site.previewUrl?.startsWith("https://")) return data({ ready: false });
        const res = await fetch(site.previewUrl, { signal: AbortSignal.timeout(5000), redirect: "manual" }).catch(() => null);
        return data({ ready: !!res && res.status < 400 });
      }
      default:
        return data({ error: "intent desconocido" }, { status: 400 });
    }
  } catch (e) {
    // Los errores del core llegan como Response con {error, message}: se muestra el message, no el JSON crudo.
    const raw = e instanceof Response ? await e.text().catch(() => e.statusText) : e instanceof Error ? e.message : "error";
    let message = raw;
    try { message = JSON.parse(raw).message || raw; } catch {}
    return data({ error: message }, { status: 400 });
  }
};

type Attached = { base64: string; ext: string; url: string; name: string };

function fmtTokens(n: number) {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${Math.round(n / 1_000)}K`;
  return String(n);
}
type Selection = { id: string; tag: string } | null;

export default function SiteEditor() {
  const { site, engineLabel, github, publishPrice } = useLoaderData<typeof loader>();
  const revalidator = useRevalidator();
  const [params, setParams] = useSearchParams();
  const githubNotice = GITHUB_NOTICE[params.get("github") ?? ""] ?? null;
  const fetcher = useFetcher<typeof action>();
  // «Entrar como admin»: el servidor firma un enlace de un solo uso y la vista previa lo abre.
  const admin = useFetcher<typeof action>();
  useEffect(() => {
    const url = admin.data && "adminUrl" in admin.data ? admin.data.adminUrl : null;
    if (url && iframeRef.current) iframeRef.current.src = url;
    // Antes un fallo aquí no decía nada y el botón parecía no hacer nada.
    if (admin.data && "error" in admin.data) toast.error(`No pudimos entrar como admin: ${admin.data.error}`);
  }, [admin.data]);
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  // Turno que se cortó por un reinicio de la plataforma: se ofrece «Continuar».
  const [cutTurn, setCutTurn] = useState<string | null>(null);
  const sentRef = useRef(false);
  const [selection, setSelection] = useState<Selection>(null);
  // «Señalar»: con el modo apagado la vista previa se usa como la app real (clics, links).
  const [pointing, setPointing] = useState(true);
  const pointingRef = useRef(pointing);
  pointingRef.current = pointing;
  const [tokens, setTokens] = useState<{ remaining: number; limit: number } | null>(null);
  const [attached, setAttached] = useState<Attached | null>(null);
  // Móvil: una columna a la vez (chat | vista previa). En desktop van lado a lado.
  const [mobileTab, setMobileTab] = useState<"chat" | "preview">("chat");
  const [previewKey, setPreviewKey] = useState(0);
  // «Conectar a GitHub» crea un repo en la cuenta del dueño: se confirma antes y él elige la visibilidad.
  const [ghDialog, setGhDialog] = useState(false);
  const [ghPublic, setGhPublic] = useState(true);
  const [delDialog, setDelDialog] = useState(false);
  const [releaseMachine, setReleaseMachine] = useState(true);
  const [turnDone, setTurnDone] = useState(false);
  const bodyRef = useRef<HTMLDivElement>(null);
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const togglePointing = () => {
    const on = !pointing;
    setPointing(on);
    if (!on) setSelection(null);
    iframeRef.current?.contentWindow?.postMessage({ type: "eb-pointing", on }, "*");
  };
  // Sitio anterior a los temas: un turno del agente lo pasa a tokens (el botón «Tema» lo ofrece).
  const ADAPT_PROMPT =
    "Adapta el sitio a temas: crea el archivo/bloque de tema con los tokens indicados en tus instrucciones (si es web app, que el CSS principal lo importe) y reemplaza TODOS los colores literales (clases de color de Tailwind, hex, rgb) por las clases de los tokens que más se parezcan. No cambies textos ni estructura.";
  const clearSelection = () => {
    setSelection(null);
    iframeRef.current?.contentWindow?.postMessage({ type: "eb-deselect" }, "*");
  };
  const checkout = params.get("checkout");

  // En móvil el editor ocupa toda la pantalla: fuera el botón hamburguesa (estorbaba
  // sobre "Enviar"); el "←" del header ya lleva a la lista.
  useEffect(() => {
    document.body.classList.add("hide-mobile-menu");
    return () => document.body.classList.remove("hide-mobile-menu");
  }, []);

  // Historial persistido (FleetAgentMessage bajo site:<id>).
  useEffect(() => {
    fetch(`/api/v2/sites/${site.id}/chat`)
      .then((r) => (r.ok ? r.json() : { messages: [] }))
      .then((d: {
        messages?: Array<{ role: string; text: string }>;
        tokens?: { remaining: number; limit: number };
        activeTurn?: { turnId: string } | null;
        lastTurn?: { turnId: string; state: string } | null;
      }) => {
        if (d.tokens) setTokens(d.tokens);
        // No pisar un turno que ya arrancó (el primer prompt se manda antes de
        // que llegue el historial).
        // Si esta pestaña ya mandó algo (el primer prompt sale antes del historial), manda ella.
        if (sentRef.current) return;
        const hist: Msg[] = (d.messages ?? []).map((m) => ({ role: m.role === "user" ? "user" : "bot", text: m.text }));
        // Turno en curso (recargaste a media obra): su burbuja se llena con el snapshot.
        setMsgs(d.activeTurn ? [...hist, { role: "bot", text: "", tools: [] }] : hist);
        if (d.lastTurn?.state === "interrupted" && !d.activeTurn) setCutTurn(d.lastTurn.turnId);
        if (d.activeTurn) void attach();
      })
      .catch(() => {});
  }, [site.id]);

  // ── Scroll (como ghosty.studio): pegado al final mientras la respuesta crece, pero si
  // la persona sube (rueda, dedo o teclado) se suelta hasta que vuelva abajo; «↓» la regresa.
  const columnRef = useRef<HTMLDivElement>(null);
  const siguiendo = useRef(true);
  const toqueY = useRef<number | null>(null);
  const [abajo, setAbajo] = useState(true);
  const soltar = () => { siguiendo.current = false; };
  const medirAbajo = () => {
    const el = bodyRef.current;
    if (!el) return;
    // A menos de 80 px del final cuenta como estar al día.
    const alFinal = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
    setAbajo(alFinal);
    if (alFinal) siguiendo.current = true;
  };
  const irAbajo = () => {
    siguiendo.current = true;
    bodyRef.current?.scrollTo({ top: bodyRef.current.scrollHeight, behavior: "smooth" });
  };
  useEffect(() => {
    const sc = bodyRef.current;
    const col = columnRef.current;
    if (!sc || !col) return;
    // Instantáneo, no `smooth`: una animación a medias dispara onScroll lejos del final y
    // se leería como «la persona subió».
    const ro = new ResizeObserver(() => {
      if (siguiendo.current) sc.scrollTop = sc.scrollHeight;
      else medirAbajo();
    });
    ro.observe(col);
    ro.observe(sc);
    return () => ro.disconnect();
  }, []);

  // Selección desde la vista previa (picker inyectado en /s/:slug?eb_edit=1).
  useEffect(() => {
    const onMsg = (e: MessageEvent) => {
      const d = e.data;
      if (d?.type === "eb-selected" && typeof d.id === "string") setSelection({ id: d.id, tag: String(d.tag || "div") });
      if (d?.type === "eb-deselected") setSelection(null);
      if (d?.type === "eb-picker-ready") (e.source as Window | null)?.postMessage({ type: "eb-pointing", on: pointingRef.current }, "*");
    };
    window.addEventListener("message", onMsg);
    return () => window.removeEventListener("message", onMsg);
  }, []);

  // Imagen adjunta (mockup/referencia): soltarla en la columna del chat, pegarla o botón.
  // Se reduce aquí (máx. 2048 px, WebP): una captura Retina pesa >5 MB y antes se
  // rechazaba en silencio. Cualquier imagen que el navegador sepa abrir sirve.
  const attachFile = useCallback(async (file: File | null | undefined) => {
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      toast.error("Sólo se pueden adjuntar imágenes.");
      return;
    }
    try {
      const bmp = await createImageBitmap(file);
      const scale = Math.min(1, 2048 / Math.max(bmp.width, bmp.height));
      const canvas = document.createElement("canvas");
      canvas.width = Math.round(bmp.width * scale);
      canvas.height = Math.round(bmp.height * scale);
      canvas.getContext("2d")!.drawImage(bmp, 0, 0, canvas.width, canvas.height);
      bmp.close();
      const url = canvas.toDataURL("image/webp", 0.85);
      const webp = url.startsWith("data:image/webp");
      // Safari viejo no codifica WebP: cae a JPEG.
      const finalUrl = webp ? url : canvas.toDataURL("image/jpeg", 0.85);
      const base64 = finalUrl.split(",")[1] ?? "";
      if (base64.length > 7_000_000) {
        toast.error("La imagen es demasiado grande incluso reducida.");
        return;
      }
      setAttached({ base64, ext: webp ? "webp" : "jpg", url: finalUrl, name: file.name });
    } catch {
      toast.error("No pudimos abrir esa imagen. Prueba con PNG o JPG.");
    }
  }, []);
  // Soltar una imagen en cualquier parte de la columna del chat (no sólo en la caja de texto).
  const [dragging, setDragging] = useState(false);
  const dragDepth = useRef(0);
  const hasFiles = (e: React.DragEvent) => Array.from(e.dataTransfer?.types ?? []).includes("Files");
  const dropProps = {
    onDragEnter: (e: React.DragEvent) => {
      if (!hasFiles(e)) return;
      e.preventDefault();
      dragDepth.current++;
      setDragging(true);
    },
    onDragOver: (e: React.DragEvent) => {
      if (hasFiles(e)) e.preventDefault();
    },
    onDragLeave: () => {
      dragDepth.current = Math.max(0, dragDepth.current - 1);
      if (!dragDepth.current) setDragging(false);
    },
    onDrop: (e: React.DragEvent) => {
      if (!hasFiles(e)) return;
      e.preventDefault();
      dragDepth.current = 0;
      setDragging(false);
      void attachFile(Array.from(e.dataTransfer.files).find((f) => f.type.startsWith("image/")) ?? e.dataTransfer.files[0]);
    },
  };
  // Soltar fuera de la columna no debe abrir la imagen en la pestaña (se perdía el editor).
  useEffect(() => {
    const stop = (e: DragEvent) => {
      if (Array.from(e.dataTransfer?.types ?? []).includes("Files")) e.preventDefault();
    };
    window.addEventListener("dragover", stop);
    window.addEventListener("drop", stop);
    return () => {
      window.removeEventListener("dragover", stop);
      window.removeEventListener("drop", stop);
    };
  }, []);
  useEffect(() => {
    const onPaste = (e: ClipboardEvent) => {
      const f = Array.from(e.clipboardData?.files ?? []).find((x) => x.type.startsWith("image/"));
      if (f) { e.preventDefault(); void attachFile(f); }
    };
    document.addEventListener("paste", onPaste);
    return () => document.removeEventListener("paste", onPaste);
  }, [attachFile]);

  // Aplica un evento del turno a la burbuja del agente. true = el turno terminó.
  const patchLast = useCallback((fn: (prev: Msg) => Msg) =>
    setMsgs((m) => {
      const last = m[m.length - 1];
      if (!last || last.role !== "bot") return m;
      return [...m.slice(0, -1), fn(last)];
    }), []);
  const applyEvent = useCallback((e: { type: string; [k: string]: any }): boolean => {
    patchLast((p) => applyTurnEvent(p, e).msg);
    if (e.type === "interrupted") setCutTurn(e.turnId ?? null);
    return ["done", "error", "capacity", "interrupted", "idle"].includes(e.type);
  }, [patchLast]);

  /** Lee un SSE del turno. true = llegó el evento final; false = se cortó antes (deploy, red). */
  const consume = useCallback(async (res: Response): Promise<boolean> => {
    if (!res.body) return false;
    const reader = res.body.getReader();
    const dec = new TextDecoder();
    let buf = "";
    while (true) {
      const { done, value } = await reader.read();
      if (done) return false;
      buf += dec.decode(value, { stream: true });
      let nl: number;
      while ((nl = buf.indexOf("\n\n")) !== -1) {
        const dl = buf.slice(0, nl).split("\n").find((l) => l.startsWith("data: "));
        buf = buf.slice(nl + 2);
        if (!dl) continue;
        try {
          if (applyEvent(JSON.parse(dl.slice(6)))) return true;
        } catch { /* evento malformado */ }
      }
    }
  }, [applyEvent]);

  /** Re-engancharse al turno en curso (recarga, otra pestaña o un deploy que cortó el stream). */
  const attach = useCallback(async () => {
    setBusy(true);
    try {
      for (let i = 0; i < 40; i++) {
        const res = await fetch(`/api/v2/sites/${site.id}/chat?attach=1`).catch(() => null);
        if (res?.ok && (await consume(res).catch(() => false))) return;
        // Se cortó sin evento final: el servidor se está reiniciando. Reintentar.
        await new Promise((r) => setTimeout(r, 3000));
      }
      patchLast((p) => ({ ...p, text: [p.text, "⚠️ Perdimos la conexión con el agente. Recarga la página."].filter(Boolean).join("\n\n") }));
    } finally {
      setBusy(false);
      setTurnDone(true);
      setPreviewKey((k) => k + 1);
    }
  }, [site.id, consume, patchLast]);

  const send = useCallback(
    async (text: string, opts?: { continueTurnId?: string }) => {
      text = text.trim();
      if ((!text && !attached) || busy) return;
      sentRef.current = true;
      setCutTurn(null);
      if (!text) text = "Usa esta imagen como referencia para el sitio.";
      setBusy(true);
      setInput("");
      siguiendo.current = true;
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
        const body = JSON.stringify({
          text,
          selection: sel,
          image: img ? { base64: img.base64, ext: img.ext } : undefined,
          turnId: crypto.randomUUID(),
          continueTurnId: opts?.continueTurnId,
        });
        // 503 = esta instancia se está apagando por un deploy: reintentar (mismo turnId) cae en la nueva.
        let res = await fetch(`/api/v2/sites/${site.id}/chat`, { method: "POST", headers: { "Content-Type": "application/json" }, body });
        for (let i = 0; i < 10 && res.status === 503; i++) {
          await new Promise((r) => setTimeout(r, 3000));
          res = await fetch(`/api/v2/sites/${site.id}/chat`, { method: "POST", headers: { "Content-Type": "application/json" }, body });
        }
        if (res.status === 409) {
          // Ya hay un turno corriendo (otra pestaña): nos enganchamos a ése.
          patch((p) => ({ ...p, text: "" }));
          await attach();
          return;
        }
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
        // El turno vive en el servidor: si el stream se corta (deploy, red) nos re-enganchamos.
        const finished = await consume(res).catch(() => false);
        if (!finished) await attach();
      } catch (err) {
        patch((p) => ({ ...p, text: `⚠️ ${err instanceof Error ? err.message : "error de red"}` }));
      } finally {
        setBusy(false);
        setTurnDone(true);
        setPreviewKey((k) => k + 1);
        // Saldo fresco tras el turno (el proxy medido ya descontó).
        fetch(`/api/v2/sites/${site.id}/chat`).then((r) => (r.ok ? r.json() : null)).then((d) => d?.tokens && setTokens(d.tokens)).catch(() => {});
      }
    },
    [busy, selection, attached, site.id, consume, attach]
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

  // Static carga el picker desde /s/:slug; una webapp TanStack lo carga su __root
  // (starter). En Node libre el parámetro no hace nada.
  const previewUrl = site.previewUrl ? `${site.previewUrl}?eb_edit=1` : null;
  // Una web app en su caja de trabajo aún no tiene producción: «Abrir» lleva a la vista previa.
  const unpublished = site.kind === "webapp" && !!site.sandbox?.workBox;
  const openUrl = site.archivedAt ? null : site.url ?? (unpublished ? site.previewUrl : null);
  // Web app recién creada: mientras corre su PRIMER turno nada escucha todavía en el
  // puerto y el host contesta su error en JSON. No se monta el iframe hasta que el
  // turno termine (al terminar sube previewKey y carga la app ya arrancada).
  // Con starter la vista previa es el servidor dev: se muestra en cuanto responde (no
  // al terminar el turno) y de ahí en adelante cada cambio aparece solo.
  const live = site.kind === "webapp" && !!site.sandboxId && !!site.stack && !site.archivedAt;
  const status = useFetcher<{ ready: boolean }>();
  const [previewReady, setPreviewReady] = useState(false);
  useEffect(() => {
    if (!live || previewReady) return;
    const poll = () => status.submit({ intent: "preview-status" }, { method: "post" });
    poll();
    const t = setInterval(poll, 3000);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [live, previewReady]);
  useEffect(() => {
    if (status.data?.ready && !previewReady) {
      setPreviewReady(true);
      setPreviewKey((k) => k + 1);
    }
  }, [status.data, previewReady]);
  const firstBuild = live
    ? !previewReady
    : site.kind === "webapp" && busy && !turnDone && msgs.filter((m) => m.role === "user").length <= 1;
  const published = fetcher.data && "launch" in fetcher.data ? fetcher.data.launch : null;
  // Sin plan, la primera publicación regresa el checkout de la máquina: se va a pagar.
  const payUrl = published && "checkoutUrl" in published && published.checkoutUrl ? published.checkoutUrl : null;
  useEffect(() => {
    if (payUrl) window.location.href = payUrl;
  }, [payUrl]);
  const launch = published && "version" in published ? published : null;
  // De vuelta del pago (?publicar=1): el webhook promueve la caja en segundos. Se espera a
  // que deje de ser de trabajo y se publica solo, una vez.
  const paidReturn = params.get("publicar") === "1";
  const autoPublished = useRef(false);
  useEffect(() => {
    if (!paidReturn || autoPublished.current) return;
    if (!site.sandbox?.workBox) {
      autoPublished.current = true;
      setParams({}, { replace: true });
      fetcher.submit({ intent: "publish" }, { method: "post" });
      return;
    }
    const t = setTimeout(() => revalidator.revalidate(), 2000);
    return () => clearTimeout(t);
  }, [paidReturn, site.sandbox?.workBox, revalidator, fetcher, setParams]);
  const actionError = fetcher.data && "error" in fetcher.data ? fetcher.data.error : null;

  return (
    <div className="fixed inset-0 md:pl-28 pt-16 md:pt-0 flex bg-white overflow-hidden">
      <Modal isOpen={delDialog} onClose={() => setDelDialog(false)} title={`¿Eliminar «${site.name}»?`} className="min-h-0 min-w-0 w-auto max-w-md">
        <DeleteSiteArt />
        <fetcher.Form method="post" className="mt-4 text-sm text-gray-600">
          <input type="hidden" name="intent" value="delete" />
          {site.kind === "webapp" && site.sandboxId && site.sandbox?.workBox ? (
            <p>Se quita de tu lista de sitios y se borra la app que el agente estaba construyendo (aún no se publicaba, así que no se cobraba).</p>
          ) : site.kind === "webapp" && site.sandboxId ? (
            <>
              <p>Se quita de tu lista de sitios.</p>
              <label className={`mt-4 flex cursor-pointer items-start gap-3 rounded-xl border-2 p-3 ${releaseMachine ? "border-black" : "border-gray-200"}`}>
                <input type="checkbox" name="releaseMachine" value="1" checked={releaseMachine} onChange={(e) => setReleaseMachine(e.target.checked)} className="mt-1 rounded text-brand-500 focus:ring-brand-500" />
                <span>
                  <span className="font-bold text-black">Liberar también su máquina</span>
                  <span className="block">Deja de cobrarse y la app sale de línea. Guardamos un respaldo final antes de borrarla.</span>
                </span>
              </label>
              {!releaseMachine && <p className="mt-2 text-amber-700">La máquina sigue encendida y cobrándose; la encuentras en Hosting.</p>}
            </>
          ) : (
            <p>Se quita de tu lista de sitios. La página publicada sigue en su dirección hasta que la borres en Desarrollador › Sitios web.</p>
          )}
          {actionError && <p className="mt-3 text-red-600 break-words">{actionError}</p>}
          <div className="mt-6 flex justify-end gap-3">
            <BrutalButton mode="ghost" type="button" onClick={() => setDelDialog(false)}>Cancelar</BrutalButton>
            <BrutalButton mode="danger" type="submit" isDisabled={fetcher.state !== "idle"}>
              {fetcher.state !== "idle" && fetcher.formData?.get("intent") === "delete" ? "Eliminando…" : "Eliminar"}
            </BrutalButton>
          </div>
        </fetcher.Form>
      </Modal>
      <Modal isOpen={ghDialog} onClose={() => setGhDialog(false)} title="Conectar a GitHub" className="min-h-0 min-w-0 w-auto max-w-md">
        <GithubRepoArt />
        <p className="mt-4 text-sm text-gray-600">
          Se va a crear un repo nuevo en tu cuenta de GitHub con el código de «{site.name}». Después, cada «Publicar» sube los cambios y un push desde tu compu se despliega solo.
        </p>
        <fieldset className="mt-4 space-y-2 text-sm">
          <legend className="font-bold">¿Quién puede ver el código?</legend>
          {[
            { v: true, label: "Público", hint: "Cualquiera puede verlo en GitHub." },
            { v: false, label: "Privado", hint: "Sólo tú y quien invites." },
          ].map((o) => (
            <label key={o.label} className={`flex cursor-pointer items-start gap-3 rounded-xl border-2 p-3 ${ghPublic === o.v ? "border-black" : "border-gray-200"}`}>
              <input type="radio" name="gh-visibility" checked={ghPublic === o.v} onChange={() => setGhPublic(o.v)} className="mt-1 text-brand-500 focus:ring-brand-500" />
              <span>
                <span className="font-bold">{o.label}</span>
                <span className="block text-gray-500">{o.hint}</span>
              </span>
            </label>
          ))}
        </fieldset>
        <div className="mt-6 flex justify-end gap-3">
          <BrutalButton mode="ghost" type="button" onClick={() => setGhDialog(false)}>Cancelar</BrutalButton>
          {/* Navegación completa: es un ida y vuelta por GitHub. */}
          <BrutalButton type="button" onClick={() => { window.location.href = `/dash/hosting/github/connect?site=${site.id}&visibility=${ghPublic ? "public" : "private"}`; }}>
            Crear repo {ghPublic ? "público" : "privado"}
          </BrutalButton>
        </div>
      </Modal>
      {/* Chat */}
      <aside
        {...dropProps}
        className={`${mobileTab === "chat" ? "flex" : "hidden"} relative md:flex w-full md:max-w-sm flex-col md:border-r border-gray-200 bg-white min-w-0`}
      >
        {dragging && (
          <div className="pointer-events-none absolute inset-2 z-20 grid place-items-center rounded-2xl border-2 border-dashed border-brand-500 bg-brand-500/10 text-sm font-bold text-brand-500">
            Suelta la imagen aquí
          </div>
        )}
        <header className="px-4 py-3 border-b border-gray-200 flex items-center gap-2">
          <Link to="/dash/sitios" className="text-gray-400 hover:text-black">←</Link>
          <div className="min-w-0 flex-1">
            <p className="font-bold truncate">{site.name}</p>
            <p className="text-[11px] text-gray-400">{site.kind === "webapp" ? "Web app" : "Sitio estático"} · {engineLabel}</p>
          </div>
          {tokens && (
            <Link to="/dash/packs" title="Tokens LLM disponibles en tu cuenta"
              className={`text-[10px] font-bold px-2 py-1 rounded-lg border-2 ${tokens.remaining > 0 ? "border-gray-200 text-gray-500" : "border-red-300 bg-red-50 text-red-600"}`}>
              {fmtTokens(tokens.remaining)} tokens
            </Link>
          )}
        </header>
        <div className="relative flex min-h-0 flex-1 flex-col">
          <div
            ref={bodyRef}
            onScroll={medirAbajo}
            onWheel={(e) => { if (e.deltaY < 0) soltar(); }}
            onTouchStart={(e) => { toqueY.current = e.touches[0]?.clientY ?? null; }}
            onTouchMove={(e) => {
              const y = e.touches[0]?.clientY;
              if (toqueY.current != null && y != null && y > toqueY.current + 4) soltar();
            }}
            onKeyDown={(e) => { if (["ArrowUp", "PageUp", "Home"].includes(e.key)) soltar(); }}
            className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden"
          >
            <div ref={columnRef} className="flex flex-col gap-6 px-4 py-6">
              {msgs.length === 0 && (
                <p className="text-sm text-gray-400 text-center mt-10">Describe qué quieres y el agente lo construye.</p>
              )}
              {msgs.map((m, i) =>
                m.role === "user" ? (
                  <UserMessage key={i} msg={m} />
                ) : (
                  <BotMessage key={i} msg={m} live={busy && i === msgs.length - 1} />
                )
              )}
              {cutTurn && !busy && (
                <button
                  type="button"
                  onClick={() => void send("Continuar", { continueTurnId: cutTurn })}
                  className="self-start rounded-lg border-2 border-black bg-white px-3 py-1.5 text-sm font-bold shadow-[3px_3px_0_#000] transition hover:-translate-y-0.5"
                >
                  Continuar donde se quedó
                </button>
              )}
            </div>
          </div>
          {!abajo && (
            <button
              type="button"
              onClick={irAbajo}
              aria-label="Ir al último mensaje"
              className="absolute bottom-3 left-1/2 z-10 flex h-9 w-9 -translate-x-1/2 items-center justify-center rounded-full border-2 border-black bg-white text-black shadow-[3px_3px_0_#000] transition hover:-translate-y-0.5"
            >
              <LuArrowDown className="h-4 w-4" />
            </button>
          )}
        </div>
        {selection && (
          <div className="px-4 py-2 text-xs bg-amber-50 border-t-2 border-amber-300 flex items-center gap-2">
            <span className="font-mono">&lt;{selection.tag} #{selection.id}&gt;</span>
            <span className="text-gray-500">seleccionado</span>
            <button type="button" className="ml-auto text-gray-400 hover:text-black" onClick={clearSelection}>✕</button>
          </div>
        )}
        {attached && (
          <div className="px-4 py-2 text-xs bg-gray-50 border-t-2 border-gray-200 flex items-center gap-2">
            <img src={attached.url} alt="" className="h-10 w-10 object-cover rounded border border-gray-300" />
            <span className="truncate text-gray-600">{attached.name}</span>
            <button type="button" className="ml-auto text-gray-400 hover:text-black" onClick={() => setAttached(null)}>✕</button>
          </div>
        )}
        <ChatComposer
          value={input}
          onChange={setInput}
          onSend={() => void send(input)}
          onFile={attachFile}
          busy={busy}
          canSend={!!input.trim() || !!attached}
          placeholder={attached ? "¿Qué hago con esta imagen?" : selection ? "¿Qué cambio en ese elemento?" : "Escribe un cambio…"}
        />
      </aside>

      {/* Preview */}
      <main className={`${mobileTab === "preview" ? "flex" : "hidden"} md:flex flex-1 flex-col min-w-0`}>
        <div className="px-4 py-2 border-b border-gray-200 bg-white flex items-center gap-3 text-sm overflow-x-auto whitespace-nowrap">
          {/* Sin publicar, el puerto de producción (3000) no sirve nada: se abre la vista previa. */}
          {openUrl ? (
            <>
              <span className="font-mono text-xs text-gray-500 truncate flex-1">
                {unpublished && <span className="mr-2 rounded-full border border-gray-300 px-2 py-0.5 font-sans text-[10px] font-bold">sin publicar · vista previa</span>}
                {openUrl}
              </span>
              <a href={openUrl} target="_blank" rel="noreferrer" className="text-brand-500 font-bold">Abrir ↗</a>
            </>
          ) : (
            <span className="font-mono text-xs text-gray-500 truncate flex-1">sin publicar</span>
          )}
          {site.kind === "webapp" && site.sandboxId && (
            <>
              <fetcher.Form method="post">
                <input type="hidden" name="intent" value="publish" />
                <button
                  type="submit"
                  disabled={fetcher.state !== "idle" || paidReturn}
                  title={publishPrice ? `Construir es gratis. Al publicar, esta máquina empieza a cobrarse: $${publishPrice} MXN/mes, duerme cuando nadie entra.` : undefined}
                  className="px-3 py-1.5 rounded-lg bg-brand-500 text-white font-bold disabled:opacity-40"
                >
                  {fetcher.state !== "idle" || paidReturn ? "Publicando…" : publishPrice ? `Publicar · $${publishPrice}/mes` : "Publicar"}
                </button>
              </fetcher.Form>
              {github.repo ? (
                <a href={`https://github.com/${github.repo}`} target="_blank" rel="noreferrer" className="text-gray-500 hover:text-black font-mono text-xs">
                  {github.repo} ↗
                </a>
              ) : (
                github.enabled && (
                  <button type="button" onClick={() => setGhDialog(true)} className="text-gray-500 hover:text-black">
                    Conectar a GitHub
                  </button>
                )
              )}
              <Link to="/dash/hosting" className="text-gray-500 hover:text-black">Dominios y versiones</Link>
            </>
          )}
          {site.kind === "static" && <Link to="/dash/developer/domains" className="text-gray-500 hover:text-black">Dominio propio</Link>}
          <ThemePicker
            siteId={site.id}
            disabled={busy}
            onPreview={(colors) => iframeRef.current?.contentWindow?.postMessage({ type: "eb-theme", colors }, "*")}
            onAdapt={() => void send(ADAPT_PROMPT)}
          />
          <button
            type="button"
            onClick={togglePointing}
            aria-pressed={pointing}
            title={pointing ? "Señalar encendido: clic en la vista previa elige un elemento. Clic aquí para usar la app normal" : "Señalar apagado: la vista previa funciona como la app. Clic aquí para elegir elementos"}
            className={`flex items-center gap-1 px-2 py-1 rounded-lg border-2 ${pointing ? "border-brand-500 text-brand-500 bg-brand-500/10" : "border-gray-200 text-gray-500 hover:text-black"}`}
          >
            <LuMousePointerClick className="h-4 w-4" />
            <span className="text-xs font-bold">Señalar</span>
          </button>
          {site.hasAdmin && (
            <button
              type="button"
              disabled={admin.state !== "idle"}
              onClick={() => admin.submit({ intent: "admin-login" }, { method: "post" })}
              title="Entra a tu app como admin, sin contraseña"
              className="text-gray-500 hover:text-black disabled:opacity-40"
            >
              {admin.state !== "idle" ? "Entrando…" : "Entrar como admin"}
            </button>
          )}
          <button type="button" onClick={() => setPreviewKey((k) => k + 1)} className="text-gray-500 hover:text-black" title="Recargar">⟳</button>
          <button type="button" onClick={() => setDelDialog(true)} className="text-gray-500 hover:text-red-600" title="Eliminar sitio" aria-label="Eliminar sitio">
            <LuTrash2 className="h-4 w-4" />
          </button>
        </div>
        {launch && (
          <p className="px-4 py-2 text-xs bg-green-50 border-b-2 border-green-300">
            Publicado v{launch.version} → <a className="underline" href={launch.url} target="_blank" rel="noreferrer">{launch.url}</a>
            {(launch as { github?: string | null }).github &&
              ` · subido a ${(launch as { github?: string }).github}${(launch as { sha?: string | null }).sha ? ` (${(launch as { sha?: string }).sha})` : ""}`}
          </p>
        )}
        {githubNotice && <p className="px-4 py-2 text-xs bg-brand-500/10 border-b-2 border-brand-500/30">{githubNotice}</p>}
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
        ) : site.archivedAt ? (
          <div className="flex-1 flex flex-col items-center justify-center gap-3 text-center px-6 pb-12 md:pb-0">
            <p className="font-bold">Esta app se archivó por inactividad</p>
            <p className="text-sm text-gray-500 max-w-sm">
              Su código está guardado. Al reactivarla vuelve a su máquina en unos segundos, o mándale un mensaje al agente y se reactiva sola.
            </p>
            <fetcher.Form method="post">
              <input type="hidden" name="intent" value="revive" />
              <BrutalButton type="submit" isLoading={fetcher.state !== "idle"}>Reactivar</BrutalButton>
            </fetcher.Form>
          </div>
        ) : firstBuild ? (
          <div className="flex-1 flex flex-col items-center justify-center gap-2 text-center px-6 pb-12 md:pb-0">
            <span className="h-8 w-8 rounded-full border-4 border-gray-200 border-t-black animate-spin" />
            <p className="font-bold">{live ? "Preparando la vista previa…" : "Construyendo tu app…"}</p>
            <p className="text-sm text-gray-500 max-w-sm">
              {live
                ? "Se están instalando las dependencias. En cuanto arranque verás cada cambio del agente al momento."
                : "La vista previa aparece cuando el agente termine de escribir el código y arranque el servidor."}
            </p>
          </div>
        ) : previewUrl ? (
          <iframe key={previewKey} ref={iframeRef} src={previewUrl} title="Vista previa" className="flex-1 w-full bg-white pb-12 md:pb-0" />
        ) : (
          <div className="flex-1 flex items-center justify-center text-gray-400 text-sm">Sin vista previa todavía</div>
        )}
      </main>
      {/* Pestañas móvil */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 z-30 grid grid-cols-2 border-t border-gray-200 bg-white">
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
