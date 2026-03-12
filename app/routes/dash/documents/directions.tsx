import { useState, useEffect, useRef, useCallback } from "react";
import { useNavigate, Link, redirect } from "react-router";
import { BrutalButton } from "~/components/common/BrutalButton";
import { getUserOrRedirect } from "~/.server/getters";
import { db } from "~/.server/db";
import { data } from "react-router";
import { nanoid } from "nanoid";
import { playTone, warmAudio } from "~/hooks/useNotificationSound";
import type { Route } from "./+types/directions";

export const meta = () => [
  { title: "Elige un estilo — EasyBits" },
  { name: "robots", content: "noindex" },
];

export const loader = async ({ request }: Route.LoaderArgs) => {
  await getUserOrRedirect(request);
  return {};
};

export const action = async ({ request }: Route.ActionArgs) => {
  const user = await getUserOrRedirect(request);
  const formData = await request.formData();
  const name = String(formData.get("name") || "").trim();
  const prompt = String(formData.get("prompt") || "").trim();
  const sourceContent = String(formData.get("sourceContent") || "").trim();
  const logoDataUrl = String(formData.get("logoDataUrl") || "").trim();
  const pageCount = Math.min(20, Math.max(1, Number(formData.get("pageCount")) || 5));
  const directionRaw = String(formData.get("direction") || "");

  if (!name) {
    return data({ error: "El nombre es requerido" });
  }

  const previewHtml = String(formData.get("previewHtml") || "").trim();

  const metadata: Record<string, unknown> = {};
  if (sourceContent) metadata.sourceContent = sourceContent;
  if (logoDataUrl) metadata.logoUrl = logoDataUrl;

  // Parse and store the selected direction
  let direction: any = null;
  try {
    direction = JSON.parse(directionRaw);
    if (direction) {
      metadata.direction = direction;
      metadata.theme = "custom";
      metadata.customColors = {
        primary: direction.colors.primary,
        secondary: direction.colors.accent,
        accent: direction.colors.accent,
        surface: direction.colors.surface,
      };
    }
  } catch {}

  // If we have a cover preview, save it as the first section
  const sections = previewHtml
    ? [{ id: nanoid(), label: "Portada", html: previewHtml, order: 0 }]
    : [];

  const landing = await db.landing.create({
    data: {
      name,
      prompt: prompt || "Transforma este contenido en un documento profesional con diseño atractivo",
      sections: sections as any,
      version: 4,
      ownerId: user.id,
      metadata,
    },
  });

  return redirect(`/dash/documents/${landing.id}?generating=1&pages=${pageCount}`);
};

interface DesignDirection {
  name: string;
  tagline: string;
  headingFont: string;
  bodyFont: string;
  colors: {
    primary: string;
    accent: string;
    surface: string;
    surfaceAlt: string;
    text: string;
  };
  mood: string;
  layoutHint: string;
}

const TAILWIND_CDN = "https://cdn.tailwindcss.com";
const IFRAME_SHELL = `<!DOCTYPE html><html><head><script src="${TAILWIND_CDN}"></script><style>html,body{margin:0;padding:0;overflow:hidden;}body>section{width:8.5in!important;height:11in!important;}</style></head><body></body></html>`;

/** Iframe that initializes once and patches body.innerHTML on updates — no flicker */
function PreviewIframe({ html, title }: { html: string; title: string }) {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const readyRef = useRef(false);
  const pendingRef = useRef<string | null>(null);

  const initIframe = useCallback((el: HTMLIFrameElement | null) => {
    if (!el) return;
    (iframeRef as any).current = el;

    // Scale to fit parent
    const parent = el.parentElement;
    if (parent) {
      const ro = new ResizeObserver(([entry]) => {
        const scale = entry.contentRect.width / (8.5 * 96);
        el.style.setProperty("--thumb-scale", String(scale));
      });
      ro.observe(parent);
    }

    el.addEventListener("load", () => {
      readyRef.current = true;
      if (pendingRef.current !== null) {
        try { el.contentDocument!.body.innerHTML = pendingRef.current; } catch {}
        pendingRef.current = null;
      }
    }, { once: true });
  }, []);

  // Patch body on html changes — no iframe reload
  useEffect(() => {
    const el = iframeRef.current;
    if (!el) return;
    if (readyRef.current) {
      try { el.contentDocument!.body.innerHTML = html; } catch {}
    } else {
      pendingRef.current = html;
    }
  }, [html]);

  return (
    <iframe
      srcDoc={IFRAME_SHELL}
      ref={initIframe}
      className="absolute top-0 left-0 border-none pointer-events-none"
      title={title}
      style={{
        width: "8.5in",
        height: "11in",
        transform: "scale(var(--thumb-scale))",
        transformOrigin: "top left",
      }}
      tabIndex={-1}
    />
  );
}

export default function DocumentDirections() {
  const navigate = useNavigate();
  const [directions, setDirections] = useState<DesignDirection[]>([]);
  const [previews, setPreviews] = useState<(string | null)[]>([null, null, null, null]);
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isCreating, setIsCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [statusMsg, setStatusMsg] = useState("");
  const abortRef = useRef<AbortController | null>(null);
  const soundedRef = useRef<Set<number>>(new Set());
  const [regeneratingIndex, setRegeneratingIndex] = useState<number | null>(null);
  const directionsRef = useRef<DesignDirection[]>([]);
  const previewsRef = useRef<(string | null)[]>([null, null, null, null]);

  // Rotating status messages
  useEffect(() => {
    if (!isLoading) return;
    const msgs = [
      "Analizando tu brief...",
      "Explorando paletas de color...",
      "Eligiendo tipografías...",
      "Diseñando propuestas...",
      "Componiendo layouts...",
      "Refinando detalles visuales...",
      "Casi listo...",
      "Añadiendo un toque inesperado...",
      "Puliendo los últimos detalles...",
    ];
    let i = 0;
    setStatusMsg(msgs[0]);
    const id = setInterval(() => {
      i = Math.min(i + 1, msgs.length - 1);
      setStatusMsg(msgs[i]);
    }, 3000);
    return () => clearInterval(id);
  }, [isLoading]);

  // Read form data from sessionStorage
  const formDataRef = useRef<{
    name: string;
    prompt: string;
    sourceContent: string;
    logoDataUrl: string;
    pageCount: number;
    referenceDataUrl?: string;
  } | null>(null);

  useEffect(() => {
    const raw = sessionStorage.getItem("doc-new");
    if (!raw) {
      navigate("/dash/documents/new");
      return;
    }
    formDataRef.current = JSON.parse(raw);

    // Restore cached results if available
    const cached = sessionStorage.getItem("doc-directions-cache");
    if (cached) {
      try {
        const { directions: cachedDirs, previews: cachedPreviews } = JSON.parse(cached);
        if (cachedDirs?.length > 0) {
          directionsRef.current = cachedDirs;
          setDirections(cachedDirs);
          const hasPreviews = cachedPreviews?.some((p: string | null) => p);
          if (hasPreviews) {
            previewsRef.current = cachedPreviews;
            setPreviews(cachedPreviews);
          }
          setIsLoading(false);
          return;
        }
      } catch {}
    }

    warmAudio();
    fetchDirections();
    return () => abortRef.current?.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function fetchDirections() {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setIsLoading(true);
    setError(null);
    setDirections([]);
    setPreviews([null, null, null, null]);
    soundedRef.current.clear();
    setSelectedIndex(null);
    try { sessionStorage.removeItem("doc-directions-cache"); } catch {}

    try {
      const fd = formDataRef.current!;
      const res = await fetch("/api/v2/document-directions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prompt: fd.prompt || fd.name,
          sourceContent: fd.sourceContent || undefined,
          referenceImage: fd.referenceDataUrl || undefined,
        }),
        signal: controller.signal,
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || "Error al generar estilos");
      }

      const reader = res.body?.getReader();
      if (!reader) throw new Error("No stream");

      const decoder = new TextDecoder();
      let buf = "";
      let eventType = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });

        const lines = buf.split("\n");
        buf = lines.pop() || "";

        for (const line of lines) {
          if (line.startsWith("event: ")) {
            eventType = line.slice(7).trim();
          } else if (line.startsWith("data: ")) {
            try {
              const d = JSON.parse(line.slice(6));
              if (eventType === "directions") {
                directionsRef.current = d;
                setDirections(d);
              } else if (eventType === "preview") {
                if (d.complete && !soundedRef.current.has(d.index)) {
                  soundedRef.current.add(d.index);
                  playTone({ freq: 880 });
                }
                setPreviews((prev) => {
                  const next = [...prev];
                  next[d.index] = d.html || null;
                  previewsRef.current = next;
                  return next;
                });
              } else if (eventType === "done") {
                setIsLoading(false);
                // Cache results from refs (not nested setState)
                const cache = { directions: directionsRef.current, previews: previewsRef.current };
                try {
                  sessionStorage.setItem("doc-directions-cache", JSON.stringify(cache));
                } catch {
                  // Previews too large for sessionStorage — cache directions only
                  try {
                    sessionStorage.setItem("doc-directions-cache", JSON.stringify({ directions: directionsRef.current, previews: [null, null, null, null] }));
                  } catch {}
                }
              } else if (eventType === "error") {
                throw new Error(d.message);
              }
            } catch (e: any) {
              if (e.message && !e.message.includes("JSON")) throw e;
            }
          }
        }
      }
      setIsLoading(false);
    } catch (err: any) {
      if (err.name === "AbortError") return;
      setError(err.message);
      setIsLoading(false);
    }
  }

  async function regenerateDirection(index: number) {
    if (!formDataRef.current) return;
    setRegeneratingIndex(index);
    setPreviews((prev) => { const next = [...prev]; next[index] = null; return next; });
    soundedRef.current.delete(index);

    try {
      const fd = formDataRef.current;

      const res = await fetch("/api/v2/document-directions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          _action: "regenerate-direction",
          prompt: fd.prompt || fd.name,
          sourceContent: fd.sourceContent || undefined,
          index,
          referenceImage: fd.referenceDataUrl || undefined,
        }),
      });

      const reader = res.body?.getReader();
      if (!reader) throw new Error("No stream");

      const decoder = new TextDecoder();
      let buf = "";
      let eventType = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        const lines = buf.split("\n");
        buf = lines.pop() || "";
        for (const line of lines) {
          if (line.startsWith("event: ")) {
            eventType = line.slice(7).trim();
          } else if (line.startsWith("data: ")) {
            try {
              const d = JSON.parse(line.slice(6));
              if (eventType === "direction") {
                // Update the direction at this index
                setDirections((prev) => {
                  const next = [...prev];
                  next[d.index] = d.direction;
                  directionsRef.current = next;
                  return next;
                });
              } else if (eventType === "preview") {
                if (d.complete && !soundedRef.current.has(d.index)) {
                  soundedRef.current.add(d.index);
                  playTone({ freq: 880 });
                }
                setPreviews((prev) => { const next = [...prev]; next[d.index] = d.html || null; previewsRef.current = next; return next; });
              }
            } catch {}
          }
        }
      }
    } catch (err: any) {
      console.error("Regenerate direction failed:", err);
    } finally {
      setRegeneratingIndex(null);
    }
  }

  const handleSelect = useCallback(async () => {
    if (selectedIndex === null || !formDataRef.current || !directions[selectedIndex]) return;
    setIsCreating(true);

    try {
      const fd = formDataRef.current;
      const direction = directions[selectedIndex];

      // Create the Landing via a direct fetch to avoid needing a server action
      const res = await fetch("/api/v2/document-directions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ _action: "create", ...fd, direction }),
      });

      // Actually, let's create via the existing form pattern — POST to a simple endpoint
      // For simplicity, create the landing client-side by POSTing form data
      const formRes = await fetch("/dash/documents/directions", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          name: fd.name,
          prompt: fd.prompt,
          sourceContent: fd.sourceContent,
          logoDataUrl: fd.logoDataUrl,
          pageCount: String(fd.pageCount),
          direction: JSON.stringify(direction),
          previewHtml: previews[selectedIndex] || "",
        }),
        redirect: "follow",
      });

      if (formRes.redirected) {
        sessionStorage.removeItem("doc-new");
        window.location.href = formRes.url;
        return;
      }

      const result = await formRes.json().catch(() => ({}));
      if (result.error) throw new Error(result.error);
    } catch (err: any) {
      setError(err.message);
      setIsCreating(false);
    }
  }, [selectedIndex, directions]);

  return (
    <article className="fixed inset-0 left-20 pt-4 flex flex-col overflow-hidden">
      {/* Header */}
      <div className="flex items-center gap-3 px-8 py-2 shrink-0">
        <Link to="/dash/documents/new" className="text-sm font-bold hover:underline shrink-0">
          &larr; Volver
        </Link>
        <h1 className="text-2xl font-black tracking-tight uppercase shrink-0">
          Elige un estilo
        </h1>
        {isLoading && (
          <span className="flex items-center gap-2 text-sm text-gray-400 shrink-0">
            <span className="block w-4 h-4 border-2 border-gray-200 border-t-brand-500 rounded-full animate-spin" />
            {statusMsg}
          </span>
        )}
        <div className="flex-1" />
        <button
          type="button"
          onClick={() => { if (!confirm("¿Regenerar todas las direcciones?")) return; fetchDirections(); }}
          disabled={isLoading}
          className="text-sm font-bold text-gray-500 hover:text-black transition-colors disabled:opacity-40 shrink-0"
        >
          ↺ Regenerar todo
        </button>
        <BrutalButton
          isDisabled={selectedIndex === null || isCreating || isLoading}
          isLoading={isCreating}
          onClick={handleSelect}
          size="chip"
        >
          Crear documento
        </BrutalButton>
      </div>

      {error && (
        <div className="bg-red-50 border-2 border-red-200 rounded-xl px-4 py-2 mx-8 text-sm text-red-700 font-bold shrink-0">
          {error}
          <button onClick={fetchDirections} className="ml-3 underline">Reintentar</button>
        </div>
      )}

      {/* Cards grid — 2x2, each card is letter-ratio, centered in cell */}
      <div className="flex-1 min-h-0 grid grid-cols-2 grid-rows-2 gap-4 px-8 py-2">
        {[0, 1, 2, 3].map((i) => {
          const dir = directions[i];
          const preview = previews[i];
          const isSelected = selectedIndex === i;
          const isLeft = i % 2 === 0;

          return (
            <div key={i} className={`flex min-h-0 ${isLeft ? "justify-end" : "justify-start"}`}>
              <div className="relative rounded-xl bg-black h-full group/card" style={{ aspectRatio: "8.5 / 12" }}>
              <div
                onClick={() => !isLoading && setSelectedIndex(i)}
                className={`text-left rounded-xl border-2 overflow-hidden transition-all duration-200 w-full h-full flex flex-col cursor-pointer ${
                  isSelected
                    ? "border-brand-500 -translate-x-1 -translate-y-1"
                    : "border-black hover:-translate-x-1 hover:-translate-y-1 active:translate-x-0 active:translate-y-0"
                } bg-white`}
              >
                {/* Preview iframe */}
                <div className="relative flex-1 min-h-0 bg-gray-100 overflow-hidden">
                  {preview ? (
                    <PreviewIframe html={preview} title={dir?.name || `Direction ${i + 1}`} />
                  ) : (
                    <div className="absolute inset-0 flex items-center justify-center">
                      <div className="flex flex-col items-center gap-2">
                        <span className="block w-8 h-8 border-[3px] border-gray-200 border-t-brand-500 rounded-full animate-spin" />
                        <span className="text-xs text-gray-400">
                          {directions.length > 0 ? "Generando portada..." : "Generando estilos..."}
                        </span>
                      </div>
                    </div>
                  )}
                </div>

                {/* Direction info */}
                <div className="px-3 py-1.5 border-t-2 border-black shrink-0">
                  {dir ? (
                    <>
                      <div className="flex items-center gap-2">
                        <h3 className="font-black text-xs truncate flex-1">{dir.name}</h3>
                        {isSelected && (
                          <span className="text-[10px] font-bold bg-brand-100 text-brand-700 px-1.5 py-0.5 rounded-full shrink-0">
                            Seleccionado
                          </span>
                        )}
                        {dir && (
                          <button
                            type="button"
                            onPointerDown={(e) => { e.stopPropagation(); e.preventDefault(); regenerateDirection(i); }}
                            onClick={(e) => e.stopPropagation()}
                            disabled={regeneratingIndex === i}
                            className="text-xs font-bold text-black bg-white border-2 border-black rounded-lg px-2 py-1 translate-x-[2px] translate-y-[2px] hover:translate-x-0 hover:translate-y-0 hover:shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] active:translate-x-[2px] active:translate-y-[2px] active:shadow-none transition-all disabled:opacity-30 shrink-0"
                            title="Regenerar portada"
                          >
                            {regeneratingIndex === i ? (
                              <span className="flex items-center gap-1">
                                <span className="block w-3 h-3 border-2 border-gray-300 border-t-black rounded-full animate-spin" />
                                Regenerando
                              </span>
                            ) : "↺ Regenerar"}
                          </button>
                        )}
                      </div>
                      <div className="flex items-center gap-1.5 mt-1">
                        <div className="flex gap-0.5 shrink-0">
                          {Object.values(dir.colors).slice(0, 3).map((c, ci) => (
                            <span
                              key={ci}
                              className="w-3 h-3 rounded-full border border-gray-200"
                              style={{ backgroundColor: c }}
                            />
                          ))}
                        </div>
                        <span className="text-[10px] text-gray-400 truncate flex-1">
                          {dir.headingFont} + {dir.bodyFont}
                        </span>
                      </div>
                    </>
                  ) : (
                    <div className="space-y-1.5">
                      <div className="h-3 bg-gray-200 rounded w-1/2 animate-pulse" />
                      <div className="h-2.5 bg-gray-100 rounded w-3/4 animate-pulse" />
                    </div>
                  )}
                </div>
              </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Footer hint */}
      <p className="text-sm text-gray-400 text-center px-8 py-3 shrink-0">
        Podr&aacute;s editar colores, im&aacute;genes, textos y cada detalle despu&eacute;s.
      </p>
    </article>
  );
}
