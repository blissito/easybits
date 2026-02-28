import { useState, useEffect, useRef } from "react";
import {
  useLoaderData,
  useFetcher,
  useSearchParams,
  useNavigate,
  Link,
} from "react-router";
import { BrutalButton } from "~/components/common/BrutalButton";
import { getUserOrRedirect } from "~/.server/getters";
import { db } from "~/.server/db";
import { buildRevealHtml, SCENE_EFFECT_IDS, type Slide } from "~/lib/buildRevealHtml";
import { Copy } from "~/components/common/Copy";
import type { Route } from "./+types/editor";

export const meta = () => [
  { title: "Editor — EasyBits" },
  { name: "robots", content: "noindex" },
];

export const loader = async ({ request, params }: Route.LoaderArgs) => {
  const user = await getUserOrRedirect(request);
  const presentation = await db.presentation.findUnique({
    where: { id: params.id },
  });
  if (!presentation || presentation.ownerId !== user.id) {
    throw new Response("Not found", { status: 404 });
  }

  let websiteUrl: string | null = null;
  if (presentation.websiteId) {
    const website = await db.website.findUnique({
      where: { id: presentation.websiteId },
    });
    const proto = process.env.NODE_ENV === "production" ? "https" : "http";
    if (website) websiteUrl = `${proto}://${website.slug}.easybits.cloud`;
  }

  return { presentation, websiteUrl };
};

export const action = async ({ request, params }: Route.ActionArgs) => {
  const user = await getUserOrRedirect(request);
  const presentation = await db.presentation.findUnique({
    where: { id: params.id },
  });
  if (!presentation || presentation.ownerId !== user.id) {
    return { error: "No encontrado" };
  }

  const formData = await request.formData();
  const intent = formData.get("intent");

  if (intent === "update-slides") {
    const slides = JSON.parse(String(formData.get("slides") || "[]"));
    await db.presentation.update({
      where: { id: params.id },
      data: { slides },
    });
    return { ok: true };
  }

  if (intent === "update-theme") {
    const theme = String(formData.get("theme"));
    await db.presentation.update({
      where: { id: params.id },
      data: { theme },
    });
    return { ok: true };
  }

  if (intent === "delete") {
    // Unpublish first if needed
    if (presentation.websiteId) {
      const { unpublishPresentation } = await import(
        "~/.server/core/presentationOperations"
      );
      const ctx = {
        user,
        scopes: ["READ", "WRITE", "DELETE", "ADMIN"] as any,
        source: "cookie" as const,
      };
      await unpublishPresentation(ctx, params.id!);
    }
    await db.presentation.delete({ where: { id: params.id } });
    return { ok: true, deleted: true };
  }

  if (intent === "unpublish") {
    const { unpublishPresentation } = await import(
      "~/.server/core/presentationOperations"
    );
    const ctx = {
      user,
      scopes: ["READ", "WRITE", "DELETE", "ADMIN"] as any,
      source: "cookie" as const,
    };
    await unpublishPresentation(ctx, params.id!);
    return { ok: true, unpublished: true };
  }

  return { error: "Intent no válido" };
};

function SlideThumbnail({
  slide,
  theme,
  idx,
}: {
  slide: Slide;
  theme: string;
  idx: number;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(0);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => {
      setScale(entry.contentRect.width / 960);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const srcDoc = buildRevealHtml([{ ...slide, order: 0 }], theme);

  return (
    <div
      ref={containerRef}
      className="aspect-video overflow-hidden rounded-t-[10px] bg-gray-900 relative"
    >
      {scale > 0 && (
        <iframe
          srcDoc={srcDoc}
          sandbox="allow-scripts allow-same-origin"
          className="pointer-events-none border-0 absolute top-0 left-0"
          title={`Slide ${idx + 1}`}
          style={{
            width: 960,
            height: 540,
            transformOrigin: "top left",
            transform: `scale(${scale})`,
          }}
        />
      )}
    </div>
  );
}

const THEMES = [
  "black",
  "white",
  "league",
  "beige",
  "sky",
  "night",
  "serif",
  "simple",
  "solarized",
  "moon",
  "dracula",
];

export default function PresentationEditor() {
  const { presentation, websiteUrl } = useLoaderData<typeof loader>();
  const [searchParams] = useSearchParams();
  const isGenerating = searchParams.get("generating") === "1";
  const slideCount = Number(searchParams.get("slideCount") || 8);

  const [slides, setSlides] = useState<Slide[]>(
    (presentation.slides as unknown as Slide[]) || []
  );
  const [outline, setOutline] = useState<
    { title: string; bullets: string[]; imageQuery: string; type?: "2d" | "3d" }[] | null
  >(null);
  const [theme, setTheme] = useState(presentation.theme);
  const [editingIdx, setEditingIdx] = useState<number | null>(null);
  const [editHtml, setEditHtml] = useState("");
  const [editJson, setEditJson] = useState("");
  const [generating, setGenerating] = useState(false);
  const [generatingSlides, setGeneratingSlides] = useState(false);
  const [deployUrl, setDeployUrl] = useState<string | null>(websiteUrl);
  const [deploying, setDeploying] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dragIdx, setDragIdx] = useState<number | null>(null);
  const [variantIdx, setVariantIdx] = useState<number | null>(null);
  const [variantInstruction, setVariantInstruction] = useState("");
  const [variantHtml, setVariantHtml] = useState<string | null>(null);
  const [generatingVariant, setGeneratingVariant] = useState(false);
  const [selectedSlideIdx, setSelectedSlideIdx] = useState<number | null>(null);
  const previewIframeRef = useRef<HTMLIFrameElement>(null);
  const [addSlideOpen, setAddSlideOpen] = useState(false);
  const [addSlidePrompt, setAddSlidePrompt] = useState("");
  const [addSlideProposals, setAddSlideProposals] = useState<Slide[] | null>(null);
  const [generatingAddSlide, setGeneratingAddSlide] = useState(false);

  const navigate = useNavigate();
  const saveFetcher = useFetcher();
  const themeFetcher = useFetcher();
  const unpublishFetcher = useFetcher();
  const deleteFetcher = useFetcher();
  const [unpublishing, setUnpublishing] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [exportMenuOpen, setExportMenuOpen] = useState(false);
  const exportRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (unpublishFetcher.data && (unpublishFetcher.data as any).unpublished) {
      setDeployUrl(null);
      setUnpublishing(false);
    }
  }, [unpublishFetcher.data]);

  useEffect(() => {
    if (deleteFetcher.data && (deleteFetcher.data as any).deleted) {
      navigate("/dash/presentations");
    }
  }, [deleteFetcher.data, navigate]);

  useEffect(() => {
    if (!exportMenuOpen) return;
    const handler = (e: MouseEvent) => {
      if (exportRef.current && !exportRef.current.contains(e.target as Node)) {
        setExportMenuOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [exportMenuOpen]);

  // Close modals on ESC
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      if (addSlideOpen) {
        setAddSlideOpen(false);
        setAddSlidePrompt("");
        setAddSlideProposals(null);
      } else if (variantIdx !== null) {
        setVariantIdx(null);
        setVariantHtml(null);
        setVariantInstruction("");
      } else if (editingIdx !== null) {
        setEditingIdx(null);
      }
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [addSlideOpen, variantIdx, editingIdx]);

  // Navigate preview iframe to selected slide
  useEffect(() => {
    if (selectedSlideIdx === null) return;
    const iframe = previewIframeRef.current;
    if (!iframe?.contentWindow) return;

    // Send immediately (Reveal may already be ready)
    iframe.contentWindow.postMessage(
      { type: "goToSlide", index: selectedSlideIdx }, "*"
    );

    // Also listen for revealReady in case iframe is still loading
    function onReady(e: MessageEvent) {
      if (e.data?.type === "revealReady") {
        iframe!.contentWindow?.postMessage(
          { type: "goToSlide", index: selectedSlideIdx }, "*"
        );
      }
    }
    window.addEventListener("message", onReady);
    return () => window.removeEventListener("message", onReady);
  }, [selectedSlideIdx, slides.length]);

  // Step 1: Generate outline on mount
  useEffect(() => {
    if (!isGenerating || slides.length > 0) return;
    generateOutline();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  async function generateOutline() {
    setGenerating(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/v2/presentations/${presentation.id}/outline`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ slideCount }),
        }
      );
      const data = await res
        .json()
        .catch(() => ({ error: "Respuesta inválida del servidor" }));
      if (!res.ok) {
        throw new Error(data.error || "Error generando outline");
      }
      setOutline(data.outline);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setGenerating(false);
    }
  }

  // Step 2: Generate slides from confirmed outline
  async function generateSlidesFromOutline() {
    if (!outline) return;
    setGeneratingSlides(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/v2/presentations/${presentation.id}/generate`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ outline }),
        }
      );
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Error generando slides");
      }
      const data = await res.json();
      const newSlides: Slide[] = data.slides;
      setSlides(newSlides);
      setOutline(null);
      // Auto-save
      saveFetcher.submit(
        { intent: "update-slides", slides: JSON.stringify(newSlides) },
        { method: "post" }
      );
    } catch (err: any) {
      setError(err.message);
    } finally {
      setGeneratingSlides(false);
    }
  }

  function saveSlides(updated: Slide[]) {
    setSlides(updated);
    saveFetcher.submit(
      { intent: "update-slides", slides: JSON.stringify(updated) },
      { method: "post" }
    );
  }

  function handleEditSave() {
    if (editingIdx === null) return;
    const slide = slides[editingIdx];
    if (slide.type === "3d") {
      try {
        const parsed = JSON.parse(editJson);
        const updated = slides.map((s, i) =>
          i === editingIdx
            ? {
                ...s,
                sceneEffect: parsed.sceneEffect ?? s.sceneEffect,
                sceneObjects: parsed.sceneObjects ?? s.sceneObjects,
                title: parsed.title ?? s.title,
                subtitle: parsed.subtitle ?? s.subtitle,
                backgroundColor: parsed.backgroundColor ?? s.backgroundColor,
              }
            : s
        );
        saveSlides(updated);
        setEditingIdx(null);
      } catch {
        setError("JSON inválido");
      }
    } else {
      const updated = slides.map((s, i) =>
        i === editingIdx ? { ...s, html: editHtml } : s
      );
      saveSlides(updated);
      setEditingIdx(null);
    }
  }

  function handleDelete(idx: number) {
    const updated = slides
      .filter((_, i) => i !== idx)
      .map((s, i) => ({ ...s, order: i }));
    saveSlides(updated);
    // Adjust selected slide index after deletion
    if (selectedSlideIdx !== null) {
      if (idx === selectedSlideIdx) {
        // Deleted the selected slide: select previous, or first, or null
        setSelectedSlideIdx(updated.length === 0 ? null : Math.min(idx, updated.length - 1));
      } else if (idx < selectedSlideIdx) {
        // Deleted a slide before the selected one: shift index down
        setSelectedSlideIdx(selectedSlideIdx - 1);
      }
    }
  }

  function handleThemeChange(newTheme: string) {
    setTheme(newTheme);
    themeFetcher.submit(
      { intent: "update-theme", theme: newTheme },
      { method: "post" }
    );
  }

  // Drag and drop
  function handleDragStart(idx: number) {
    setDragIdx(idx);
  }
  function handleDragOver(e: React.DragEvent) {
    e.preventDefault();
  }
  function handleDrop(idx: number) {
    if (dragIdx === null || dragIdx === idx) return;
    const updated = [...slides];
    const [moved] = updated.splice(dragIdx, 1);
    updated.splice(idx, 0, moved);
    saveSlides(updated.map((s, i) => ({ ...s, order: i })));
    setDragIdx(null);
  }

  async function handleVariant(idx: number) {
    setGeneratingVariant(true);
    setVariantHtml(null);
    setVariantIdx(idx);
    try {
      const res = await fetch(
        `/api/v2/presentations/${presentation.id}/variant`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            slideIndex: idx,
            instruction: variantInstruction || undefined,
          }),
        }
      );
      const data = await res.json();
      if (!res.ok)
        throw new Error(data.error || "Error generando variante");
      setVariantHtml(data.html);
    } catch (err: any) {
      setError(err.message);
      setVariantIdx(null);
    } finally {
      setGeneratingVariant(false);
    }
  }

  function acceptVariant() {
    if (variantIdx === null || !variantHtml) return;
    const updated = slides.map((s, i) =>
      i === variantIdx ? { ...s, html: variantHtml } : s
    );
    saveSlides(updated);
    setVariantIdx(null);
    setVariantHtml(null);
    setVariantInstruction("");
  }

  function discardVariant() {
    setVariantIdx(null);
    setVariantHtml(null);
    setVariantInstruction("");
  }

  async function handleDeploy() {
    setDeploying(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/v2/presentations/${presentation.id}/deploy`,
        { method: "POST" }
      );
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Error en deploy");
      }
      const data = await res.json();
      setDeployUrl(data.url);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setDeploying(false);
    }
  }

  async function handleAddSlideGenerate() {
    if (!addSlidePrompt.trim()) return;
    setGeneratingAddSlide(true);
    setAddSlideProposals(null);
    try {
      const res = await fetch(
        `/api/v2/presentations/${presentation.id}/add-slide`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ prompt: addSlidePrompt }),
        }
      );
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Error generando propuestas");
      setAddSlideProposals(data.proposals);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setGeneratingAddSlide(false);
    }
  }

  function handleAddSlideSelect(proposal: Slide) {
    const newSlide = { ...proposal, id: proposal.id, order: slides.length };
    const updated = [...slides, newSlide];
    saveSlides(updated);
    setSelectedSlideIdx(slides.length);
    setAddSlideOpen(false);
    setAddSlidePrompt("");
    setAddSlideProposals(null);
  }

  function handleAddBlankSlide() {
    const blank: Slide = {
      id: `blank-${Date.now()}`,
      order: slides.length,
      type: "2d",
      html: '<div class="centered"><h2>Nueva diapositiva</h2><p>Edita el contenido</p></div>',
    };
    const updated = [...slides, blank];
    saveSlides(updated);
    setSelectedSlideIdx(slides.length);
    setAddSlideOpen(false);
    setAddSlidePrompt("");
    setAddSlideProposals(null);
  }

  const previewHtml =
    slides.length > 0 ? buildRevealHtml(slides, theme) : "";

  return (
    <article className="pt-20 px-4 pb-4 md:pl-36 w-full h-screen flex flex-col overflow-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-3 flex-wrap gap-3 shrink-0">
        <div className="flex items-center gap-3">
          <Link
            to="/dash/presentations"
            className="text-sm font-bold hover:underline"
          >
            &larr; Volver
          </Link>
          <h1 className="text-2xl font-black tracking-tight">
            {presentation.name}
          </h1>
        </div>
        <div className="flex items-center gap-3">
          {deployUrl && (
            <div className="inline-flex w-fit items-center gap-2 px-3 py-1.5 bg-lime border-2 border-black rounded-xl text-xs shadow-[3px_3px_0px_0px_rgba(0,0,0,1)]">
              <span className="font-bold">Live:</span>
              <a
                href={deployUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="underline truncate max-w-[200px]"
              >
                {deployUrl}
              </a>
              <Copy text={deployUrl} mode="ghost" className="static p-0" />
              <button
                onClick={() => {
                  setUnpublishing(true);
                  unpublishFetcher.submit(
                    { intent: "unpublish" },
                    { method: "post" }
                  );
                }}
                disabled={unpublishing}
                className="px-2 py-0.5 text-xs font-bold text-red-600 border-2 border-red-400 rounded-lg hover:bg-red-50 transition-colors disabled:opacity-50"
              >
                {unpublishing ? "..." : "Despublicar"}
              </button>
            </div>
          )}
          <select
            value={theme}
            onChange={(e) => handleThemeChange(e.target.value)}
            className="px-3 py-1.5 border-2 border-black rounded-xl text-sm font-bold shadow-[3px_3px_0px_0px_rgba(0,0,0,1)] bg-white"
          >
            {THEMES.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
          <div ref={exportRef} className="relative">
            <button
              onClick={() => setExportMenuOpen((v) => !v)}
              className="px-4 py-2 border-2 border-black rounded-xl text-sm font-bold shadow-[3px_3px_0px_0px_rgba(0,0,0,1)] bg-white hover:translate-x-[1px] hover:translate-y-[1px] hover:shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] transition-all"
            >
              Exportar ▾
            </button>
            {exportMenuOpen && (
              <div className="absolute right-0 top-full mt-2 w-64 border-2 border-black rounded-xl bg-white shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] z-50 overflow-hidden">
                {[
                  { label: "PDF", desc: "Documento portátil" },
                  { label: "PPTX", desc: "PowerPoint" },
                  { label: "HTML", desc: "Archivo standalone" },
                  { label: "PNG", desc: "Imágenes por slide" },
                  { label: "Markdown", desc: "Texto plano" },
                  { label: "Video MP4", desc: "Grabación animada" },
                ].map((fmt, i) => (
                  <div
                    key={fmt.label}
                    className={`flex items-center justify-between px-4 py-2.5 opacity-50 cursor-not-allowed ${i > 0 ? "border-t-2 border-black" : ""}`}
                  >
                    <div>
                      <div className="font-bold text-sm">{fmt.label}</div>
                      <div className="text-xs text-gray-600">{fmt.desc}</div>
                    </div>
                    <span className="text-[10px] font-bold bg-gray-200 text-gray-500 px-2 py-0.5 rounded-full">
                      Próximamente
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
          <BrutalButton
            onClick={handleDeploy}
            isLoading={deploying}
            isDisabled={deploying || slides.length === 0}
          >
            Publicar
          </BrutalButton>
          <button
            onClick={() => {
              if (!confirm("¿Eliminar esta presentación? Esta acción no se puede deshacer.")) return;
              setDeleting(true);
              deleteFetcher.submit(
                { intent: "delete" },
                { method: "post" }
              );
            }}
            disabled={deleting}
            className="p-2 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-xl border-2 border-transparent hover:border-red-300 transition-all disabled:opacity-50"
            title="Eliminar presentación"
          >
            {deleting ? (
              <svg className="w-5 h-5 animate-spin" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
            ) : (
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="m14.74 9-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 0 1-2.244 2.077H8.084a2.25 2.25 0 0 1-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 0 0-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 0 1 3.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 0 0-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 0 0-7.5 0" />
              </svg>
            )}
          </button>
        </div>
      </div>

      {error && (
        <div className="mb-4 px-3 py-2 bg-red-100 border-2 border-red-500 rounded-xl text-sm text-red-700">
          {error}
        </div>
      )}

      {/* Outline review step */}
      {outline && (
        <div className="mb-6 border-2 border-black rounded-xl p-6 bg-white shadow-[4px_4px_0px_0px_rgba(0,0,0,1)]">
          <h2 className="text-lg font-bold mb-4">
            Outline generado — revisa antes de generar slides
          </h2>
          <div className="space-y-3 mb-6">
            {outline.map((slide, i) => (
              <div key={i} className="border border-gray-200 rounded-lg p-3">
                <div className="flex items-center gap-2 mb-2">
                  <input
                    value={slide.title}
                    onChange={(e) => {
                      const updated = [...outline];
                      updated[i] = { ...updated[i], title: e.target.value };
                      setOutline(updated);
                    }}
                    className="font-bold text-sm flex-1 border-b border-gray-200 pb-1 focus:outline-none"
                  />
                  {/* Type toggle pill */}
                  <div className="flex border-2 border-black rounded-full overflow-hidden text-[10px] font-bold shrink-0">
                    <button
                      onClick={() => {
                        const updated = [...outline];
                        updated[i] = { ...updated[i], type: "2d" };
                        setOutline(updated);
                      }}
                      className={`px-2 py-0.5 transition-colors ${
                        (slide.type || "2d") === "2d"
                          ? "bg-black text-white"
                          : "bg-white text-black hover:bg-gray-100"
                      }`}
                    >
                      2D
                    </button>
                    <button
                      onClick={() => {
                        const updated = [...outline];
                        updated[i] = { ...updated[i], type: "3d" };
                        setOutline(updated);
                      }}
                      className={`px-2 py-0.5 transition-colors ${
                        slide.type === "3d"
                          ? "bg-black text-white"
                          : "bg-white text-black hover:bg-gray-100"
                      }`}
                    >
                      3D
                    </button>
                  </div>
                </div>
                <ul className="text-xs text-gray-600 space-y-1">
                  {slide.bullets.map((b, j) => (
                    <li key={j} className="flex items-start gap-1">
                      <span className="text-gray-400">•</span>
                      <input
                        value={b}
                        onChange={(e) => {
                          const updated = [...outline];
                          const bullets = [...updated[i].bullets];
                          bullets[j] = e.target.value;
                          updated[i] = { ...updated[i], bullets };
                          setOutline(updated);
                        }}
                        className="flex-1 focus:outline-none"
                      />
                    </li>
                  ))}
                </ul>
                <div className="flex items-center gap-1 mt-2">
                  <span className="text-[10px] text-gray-400">img:</span>
                  <input
                    value={slide.imageQuery || ""}
                    onChange={(e) => {
                      const updated = [...outline];
                      updated[i] = {
                        ...updated[i],
                        imageQuery: e.target.value,
                      };
                      setOutline(updated);
                    }}
                    placeholder="english keywords for photo..."
                    className="flex-1 text-[10px] text-gray-500 focus:outline-none border-b border-dashed border-gray-200"
                  />
                </div>
              </div>
            ))}
          </div>
          <div className="flex gap-3">
            <BrutalButton
              onClick={generateSlidesFromOutline}
              isLoading={generatingSlides}
              isDisabled={generatingSlides}
            >
              Generar slides
            </BrutalButton>
            <BrutalButton
              onClick={generateOutline}
              isLoading={generating}
              isDisabled={generating}
              mode="ghost"
            >
              Regenerar outline
            </BrutalButton>
          </div>
        </div>
      )}

      {/* Generating spinner */}
      {generating && !outline && (
        <div className="flex items-center justify-center py-20">
          <div className="text-center space-y-3">
            <div className="w-8 h-8 border-4 border-black border-t-transparent rounded-full animate-spin mx-auto" />
            <p className="font-bold">Generando outline...</p>
          </div>
        </div>
      )}

      {/* Editor: slides panel + preview */}
      {slides.length > 0 && !outline && (
        <div className="flex gap-4 flex-col lg:flex-row flex-1 min-h-0">
          {/* Slides panel */}
          <div
            className="lg:w-[35%] lg:h-full grid grid-cols-3 gap-2 pr-2 content-start overflow-y-auto"
          >
            {slides
              .sort((a, b) => a.order - b.order)
              .map((slide, idx) => (
                <div
                  key={slide.id}
                  draggable
                  onDragStart={() => handleDragStart(idx)}
                  onDragOver={(e) => handleDragOver(e)}
                  onDrop={() => handleDrop(idx)}
                  onClick={() => setSelectedSlideIdx(idx)}
                  className={`border-2 rounded-xl bg-white shadow-[3px_3px_0px_0px_rgba(0,0,0,1)] cursor-grab active:cursor-grabbing transition-all hover:translate-x-[1px] hover:translate-y-[1px] hover:shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] ${
                    dragIdx === idx ? "opacity-50" : ""
                  } ${selectedSlideIdx === idx ? "border-brand-500 ring-2 ring-brand-500" : "border-black"} ${editingIdx === idx ? "ring-2 ring-brand-500" : ""}`}
                >
                  {/* Iframe thumbnail */}
                  <SlideThumbnail slide={slide} theme={theme} idx={idx} />

                  {/* Action bar */}
                  <div className="flex items-center gap-1 px-2 py-1 border-t-2 border-black">
                    <span className="font-bold text-[11px]">{idx + 1}.</span>
                    {slide.type === "3d" && (
                      <>
                        <span className="px-1.5 py-0.5 text-[9px] font-bold rounded-full bg-purple-100 text-purple-700 border border-purple-200">
                          3D
                        </span>
                        <select
                          value={slide.sceneEffect?.effect || "particleField"}
                          onChange={(e) => {
                            e.stopPropagation();
                            const updated = slides.map((s, i) =>
                              i === idx
                                ? {
                                    ...s,
                                    sceneEffect: {
                                      ...s.sceneEffect,
                                      effect: e.target.value,
                                    },
                                    sceneObjects: undefined,
                                  }
                                : s
                            );
                            saveSlides(updated);
                          }}
                          className="text-[9px] font-bold border border-purple-200 rounded-full px-1.5 py-0.5 bg-purple-50 text-purple-700"
                          onClick={(e) => e.stopPropagation()}
                        >
                          {SCENE_EFFECT_IDS.map((id) => (
                            <option key={id} value={id}>{id}</option>
                          ))}
                        </select>
                      </>
                    )}
                    <div className="flex-1" />
                    {slide.type !== "3d" && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setVariantIdx(idx);
                          setVariantHtml(null);
                          setVariantInstruction("");
                        }}
                        className="px-1.5 py-0.5 text-[9px] font-bold rounded-full bg-brand-100 text-brand-600 border border-brand-200 hover:bg-brand-200 transition-colors"
                        title="Generar variante"
                      >
                        ✦
                      </button>
                    )}
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        if (editingIdx === idx) {
                          setEditingIdx(null);
                        } else {
                          setEditingIdx(idx);
                          if (slide.type === "3d") {
                            const jsonData: Record<string, unknown> = {
                              title: slide.title,
                              subtitle: slide.subtitle,
                              backgroundColor: slide.backgroundColor,
                            };
                            if (slide.sceneEffect) {
                              jsonData.sceneEffect = slide.sceneEffect;
                            } else if (slide.sceneObjects) {
                              jsonData.sceneObjects = slide.sceneObjects;
                            }
                            setEditJson(
                              JSON.stringify(jsonData, null, 2)
                            );
                          } else {
                            setEditHtml(slide.html || "");
                          }
                        }
                      }}
                      className="px-1.5 py-0.5 text-[9px] font-bold rounded-full bg-gray-100 text-gray-600 border border-gray-200 hover:bg-gray-200 transition-colors"
                      title={slide.type === "3d" ? "Editar JSON" : "Editar HTML"}
                    >
                      ✎
                    </button>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleDelete(idx);
                      }}
                      className="px-1.5 py-0.5 text-[9px] font-bold rounded-full bg-red-50 text-red-600 border border-red-200 hover:bg-red-100 transition-colors"
                      title="Eliminar"
                    >
                      ✕
                    </button>
                  </div>

                </div>
              ))}
            {/* Add slide button */}
            <button
              onClick={() => setAddSlideOpen(true)}
              disabled={generatingAddSlide}
              className={`aspect-video border-2 border-dashed rounded-xl flex items-center justify-center transition-colors group ${generatingAddSlide ? "border-gray-200 bg-gray-50 cursor-not-allowed" : "border-gray-300 hover:border-black hover:bg-gray-50"}`}
              title="Añadir diapositiva"
            >
              {generatingAddSlide ? (
                <svg className="animate-spin h-6 w-6 text-gray-400" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
              ) : (
                <span className="text-3xl font-bold text-gray-300 group-hover:text-black transition-colors">
                  +
                </span>
              )}
            </button>
          </div>

          {/* Preview */}
          <div className="lg:w-[65%] lg:h-full border-2 border-black rounded-xl overflow-hidden shadow-[4px_4px_0px_0px_rgba(0,0,0,1)]">
            <iframe
              key={slides.map(s => s.id).join(",")}
              ref={previewIframeRef}
              srcDoc={previewHtml}
              sandbox="allow-scripts allow-same-origin"
              className="w-full h-full"
              title="Preview"
            />
          </div>
        </div>
      )}

      {/* Variant panel */}
      {variantIdx !== null && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white border-2 border-black rounded-xl shadow-[6px_6px_0px_0px_rgba(0,0,0,1)] p-6 max-w-2xl w-full max-h-[80vh] overflow-y-auto">
            <h3 className="font-bold text-lg mb-3">
              Variante — Slide {variantIdx + 1}
            </h3>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                handleVariant(variantIdx);
              }}
              className="flex gap-2 mb-4"
            >
              <input
                value={variantInstruction}
                onChange={(e) => setVariantInstruction(e.target.value)}
                placeholder="Instruccion opcional (ej: 'mas visual', 'agrega stats')..."
                className="flex-1 px-3 py-2 border-2 border-black rounded-xl text-sm"
              />
              <BrutalButton
                type="submit"
                isLoading={generatingVariant}
                isDisabled={generatingVariant}
              >
                Generar
              </BrutalButton>
            </form>
            {variantHtml && (
              <>
                <iframe
                  srcDoc={buildRevealHtml(
                    [{ id: "preview", html: variantHtml, order: 0 }],
                    theme
                  )}
                  sandbox="allow-scripts allow-same-origin"
                  className="w-full h-64 border-2 border-gray-200 rounded-lg mb-4"
                  title="Variant preview"
                />
                <div className="flex gap-3">
                  <BrutalButton onClick={acceptVariant}>
                    Usar esta
                  </BrutalButton>
                  <BrutalButton onClick={discardVariant} mode="ghost">
                    Descartar
                  </BrutalButton>
                </div>
              </>
            )}
            {!variantHtml && !generatingVariant && (
              <button
                onClick={discardVariant}
                className="text-sm text-gray-500 hover:underline"
              >
                Cerrar
              </button>
            )}
          </div>
        </div>
      )}

      {/* Edit HTML/JSON Modal */}
      {editingIdx !== null && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white border-2 border-black rounded-xl shadow-[6px_6px_0px_0px_rgba(0,0,0,1)] p-6 max-w-5xl w-full h-[92vh] flex flex-col">
            <div className="flex items-center justify-between mb-4 shrink-0">
              <div>
                <h3 className="font-bold text-lg">
                  {slides[editingIdx]?.type === "3d"
                    ? `Editar JSON — Slide ${editingIdx + 1}`
                    : `Editar HTML — Slide ${editingIdx + 1}`}
                </h3>
                <p className="text-xs text-gray-400 mt-0.5">
                  {slides[editingIdx]?.type === "3d"
                    ? "JSON — sceneEffect, sceneObjects, title, subtitle, backgroundColor"
                    : "HTML — se renderiza dentro de una <section> de reveal.js"}
                </p>
              </div>
              <button
                onClick={() => setEditingIdx(null)}
                className="text-gray-400 hover:text-black text-xl font-bold"
              >
                &times;
              </button>
            </div>
            <div className="flex gap-4 flex-1 min-h-0">
              {/* Editor */}
              <div className="w-1/2 flex flex-col min-h-0">
                <textarea
                  value={slides[editingIdx]?.type === "3d" ? editJson : editHtml}
                  onChange={(e) =>
                    slides[editingIdx]?.type === "3d"
                      ? setEditJson(e.target.value)
                      : setEditHtml(e.target.value)
                  }
                  className="flex-1 w-full font-mono text-sm p-3 border-2 border-black rounded-xl resize-none"
                  spellCheck={false}
                />
              </div>
              {/* Live preview */}
              <div className="w-1/2 flex flex-col min-h-0">
                <div className="flex-1 border-2 border-black rounded-xl overflow-hidden bg-gray-900">
                  <iframe
                    srcDoc={(() => {
                      const slide = slides[editingIdx];
                      if (!slide) return "";
                      if (slide.type === "3d") {
                        try {
                          const parsed = JSON.parse(editJson);
                          return buildRevealHtml(
                            [{
                              ...slide,
                              order: 0,
                              sceneEffect: parsed.sceneEffect ?? slide.sceneEffect,
                              sceneObjects: parsed.sceneObjects ?? slide.sceneObjects,
                              title: parsed.title ?? slide.title,
                              subtitle: parsed.subtitle ?? slide.subtitle,
                              backgroundColor: parsed.backgroundColor ?? slide.backgroundColor,
                            }],
                            theme
                          );
                        } catch {
                          return buildRevealHtml([{ ...slide, order: 0 }], theme);
                        }
                      }
                      return buildRevealHtml(
                        [{ ...slide, order: 0, html: editHtml }],
                        theme
                      );
                    })()}
                    sandbox="allow-scripts allow-same-origin"
                    className="w-full h-full"
                    title="Edit preview"
                  />
                </div>
              </div>
            </div>
            <div className="flex gap-3 mt-4 shrink-0">
              <BrutalButton onClick={handleEditSave}>Guardar</BrutalButton>
              <BrutalButton onClick={() => setEditingIdx(null)} mode="ghost">
                Cancelar
              </BrutalButton>
            </div>
          </div>
        </div>
      )}

      {/* Add Slide Modal */}
      {addSlideOpen && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white border-2 border-black rounded-xl shadow-[6px_6px_0px_0px_rgba(0,0,0,1)] p-6 max-w-3xl w-full max-h-[85vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-bold text-lg">Añadir diapositiva</h3>
              <button
                onClick={() => {
                  setAddSlideOpen(false);
                  setAddSlidePrompt("");
                  setAddSlideProposals(null);
                }}
                className="text-gray-400 hover:text-black text-xl font-bold"
              >
                &times;
              </button>
            </div>

            <form
              onSubmit={(e) => {
                e.preventDefault();
                handleAddSlideGenerate();
              }}
              className="flex gap-2 mb-4"
            >
              <input
                value={addSlidePrompt}
                onChange={(e) => setAddSlidePrompt(e.target.value)}
                placeholder="¿De qué trata? (ej: estadísticas del mercado, equipo, roadmap...)"
                className="flex-1 px-3 py-2 border-2 border-black rounded-xl text-sm"
                autoFocus
              />
              <BrutalButton
                type="submit"
                isLoading={generatingAddSlide}
                isDisabled={generatingAddSlide || !addSlidePrompt.trim()}
              >
                Generar
              </BrutalButton>
            </form>

            {/* Proposals grid */}
            {addSlideProposals && (
              <div className="space-y-4">
                <p className="text-sm text-gray-500 font-bold">
                  Elige una propuesta:
                </p>
                <div className="grid grid-cols-3 gap-3">
                  {addSlideProposals.map((proposal, i) => (
                    <button
                      key={proposal.id}
                      onClick={() => handleAddSlideSelect(proposal)}
                      className="border-2 border-gray-200 rounded-xl overflow-hidden hover:border-black hover:shadow-[3px_3px_0px_0px_rgba(0,0,0,1)] transition-all text-left group"
                    >
                      <SlideThumbnail
                        slide={proposal}
                        theme={theme}
                        idx={i}
                      />
                      <div className="px-2 py-1.5 border-t border-gray-200 flex items-center gap-1.5">
                        <span className="text-[10px] font-bold text-gray-500 group-hover:text-black">
                          {proposal.type === "3d" ? "Variante 3D" : `Variante ${i + 1}`}
                        </span>
                        {proposal.type === "3d" && (
                          <span className="px-1.5 py-0.5 text-[9px] font-bold rounded-full bg-purple-100 text-purple-700 border border-purple-200">
                            3D
                          </span>
                        )}
                      </div>
                    </button>
                  ))}
                </div>
                <div className="flex gap-3">
                  <BrutalButton
                    onClick={handleAddSlideGenerate}
                    isLoading={generatingAddSlide}
                    isDisabled={generatingAddSlide}
                    mode="ghost"
                  >
                    Regenerar
                  </BrutalButton>
                  <button
                    onClick={handleAddBlankSlide}
                    className="px-3 py-1.5 text-sm font-bold text-gray-500 hover:text-black hover:underline"
                  >
                    Vacío
                  </button>
                </div>
              </div>
            )}

            {/* Loading state */}
            {generatingAddSlide && !addSlideProposals && (
              <div className="flex items-center justify-center py-12">
                <div className="text-center space-y-3">
                  <div className="w-8 h-8 border-4 border-black border-t-transparent rounded-full animate-spin mx-auto" />
                  <p className="text-sm font-bold text-gray-500">
                    Generando 3 propuestas...
                  </p>
                </div>
              </div>
            )}

            {/* Initial state hint */}
            {!addSlideProposals && !generatingAddSlide && (
              <div className="text-center py-8 text-gray-400 text-sm">
                <p>Describe el contenido y la AI generará 3 propuestas</p>
                <p className="text-xs mt-1">2 variantes 2D + 1 variante 3D</p>
                <button
                  onClick={handleAddBlankSlide}
                  className="mt-4 px-4 py-2 text-sm font-bold text-black border-2 border-black rounded-xl hover:bg-gray-100 transition-colors shadow-[3px_3px_0px_0px_rgba(0,0,0,1)] hover:translate-x-[1px] hover:translate-y-[1px] hover:shadow-[2px_2px_0px_0px_rgba(0,0,0,1)]"
                >
                  + Añadir vacía
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Empty state */}
      {slides.length === 0 && !generating && !outline && (
        <div className="text-center py-20 space-y-4">
          <p className="text-gray-500">Sin slides aún</p>
          <BrutalButton onClick={generateOutline}>
            Generar con AI
          </BrutalButton>
        </div>
      )}
    </article>
  );
}
