import { useState, useEffect, useCallback, useRef, lazy, Suspense } from "react";
import {
  useLoaderData,
  useFetcher,
  useNavigate,
  Link,
} from "react-router";
import { BrutalButton } from "~/components/common/BrutalButton";
import { Copy } from "~/components/common/Copy";
import { getUserOrRedirect } from "~/.server/getters";
import { db } from "~/.server/db";
import type { GrapesEditorHandle } from "~/components/landings4/GrapesEditor";
import { grapesToSections } from "~/lib/landing4/grapesToSections";
import { sectionsToHtml } from "~/lib/landing4/sectionsToGrapes";
import { PRESENTATION_BLOCKS } from "~/components/presentations/blocks";
import type { Section3 } from "~/lib/landing3/types";
import type { Slide } from "~/lib/buildRevealHtml";
import type { Route } from "./+types/editor";

const GrapesEditor = lazy(() => import("~/components/landings4/GrapesEditor"));

export const meta = () => [
  { title: "Editor Presentacion — EasyBits" },
  { name: "robots", content: "noindex" },
];

// ─── Strip legacy reveal.js artifacts ────────────────
function stripLegacy(html: string): string {
  return html
    .replace(/<script[^>]*reveal[^>]*>[\s\S]*?<\/script>/gi, "")
    .replace(/<script[^>]*reveal[^>]*\/>/gi, "")
    .replace(/<link[^>]*reveal[^>]*\/?\s*>/gi, "")
    .replace(/<style[^>]*reveal[^>]*>[\s\S]*?<\/style>/gi, "")
    .replace(/^(<section\b[^>]*?)\s+style="[^"]*"/i, "$1");
}

// ─── Conversions: slides <-> sections ────────────────
function slidesToSections(slides: Slide[]): Section3[] {
  return slides
    .sort((a, b) => a.order - b.order)
    .map((s) => {
      let html = stripLegacy(s.html || "");

      if (html.trim().startsWith("<section") && html.includes("data-section-id")) {
        return { id: s.id, order: s.order, html, label: `Slide ${s.order + 1}` };
      }

      html = html.trim();
      const sectionMatch = html.match(/^<section[^>]*>([\s\S]*)<\/section>$/i);
      if (sectionMatch) html = sectionMatch[1];
      const divMatch = html.match(/^<div\s+style="[^"]*">([\s\S]*)<\/div>$/i);
      if (divMatch) html = divMatch[1];

      if (!html.trim()) {
        html = `<p class="text-on-surface-muted text-center">Slide vacio</p>`;
      }

      return {
        id: s.id,
        order: s.order,
        html: `<section data-section-id="${s.id}" class="flex flex-col items-center justify-center p-12">${html}</section>`,
        label: `Slide ${s.order + 1}`,
      };
    });
}

function sectionsToSlides(sections: Section3[]): Slide[] {
  return sections
    .filter((s) => s.id !== "__grapes_css__")
    .map((s) => ({
      id: s.id,
      order: s.order,
      type: "2d" as const,
      html: s.html,
    }));
}

// ─── Loader ──────────────────────────────────────────
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
    if (website) {
      websiteUrl = `${proto}://${website.slug}.easybits.cloud`;
    }
  }

  return { presentation, websiteUrl };
};

// ─── Action ──────────────────────────────────────────
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
    const customColorsRaw = formData.get("customColors");
    const customColors = customColorsRaw ? JSON.parse(String(customColorsRaw)) : undefined;
    await db.presentation.update({
      where: { id: params.id },
      data: {
        theme,
        ...(customColors && { customColors }),
      },
    });
    return { ok: true };
  }

  if (intent === "deploy") {
    const { deployPresentation } = await import(
      "~/.server/core/presentationOperations"
    );
    const ctx = {
      user,
      scopes: ["READ", "WRITE", "DELETE", "ADMIN"] as any,
      source: "cookie" as const,
    };
    const result = await deployPresentation(ctx, params.id!);
    return { ok: true, deployUrl: result.url };
  }

  if (intent === "delete") {
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

  return { error: "Intent no valido" };
};

// ─── Canvas CSS for 16:9 slides ─────────────────────
const slideCanvasCss = `
  body {
    padding: 24px !important;
    background: #1a1a2e !important;
    display: flex !important;
    flex-direction: column !important;
    align-items: center !important;
    gap: 24px !important;
    font-family: system-ui, -apple-system, sans-serif !important;
  }
  section, [data-section-id] {
    width: 960px !important;
    min-height: 540px !important;
    max-height: 540px !important;
    overflow: hidden !important;
    background: var(--color-surface, #1e1b4b) !important;
    box-shadow: 0 4px 24px rgba(0,0,0,0.5) !important;
    border-radius: 8px !important;
    box-sizing: border-box !important;
  }
`;

// ─── Slide Thumbnail ─────────────────────────────────
function SlideThumbnail({ section, idx, onClick, isSelected }: {
  section: Section3;
  idx: number;
  onClick: () => void;
  isSelected: boolean;
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

  const srcDoc = `<!DOCTYPE html><html><head>
<script src="https://cdn.tailwindcss.com"><\/script>
<style>
:root{--color-primary:#6366f1;--color-primary-light:#818cf8;--color-secondary:#ec4899;--color-accent:#06b6d4;--color-surface:#1e1b4b;--color-surface-alt:#312e81;--color-on-primary:#fff;--color-on-secondary:#fff;--color-on-surface:#f1f5f9;--color-on-surface-muted:#94a3b8}
*{margin:0;padding:0;box-sizing:border-box}body{font-family:system-ui,sans-serif;overflow:hidden}
section{width:960px;height:540px;overflow:hidden}
</style></head><body>${section.html}</body></html>`;

  return (
    <button
      onClick={onClick}
      className={`w-full text-left group ${isSelected ? "ring-2 ring-brand-500 rounded-lg" : ""}`}
    >
      <div
        ref={containerRef}
        className="aspect-video overflow-hidden rounded-lg bg-gray-900 relative"
      >
        {scale > 0 && (
          <iframe
            srcDoc={srcDoc}
            sandbox="allow-scripts"
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
      <div className="text-xs text-gray-400 mt-1 px-1 truncate">
        {section.label || `Slide ${idx + 1}`}
      </div>
    </button>
  );
}

// ─── Main Editor Component ───────────────────────────
export default function PresentationEditor() {
  const { presentation, websiteUrl } = useLoaderData<typeof loader>();
  const navigate = useNavigate();

  const initialSlides = (presentation.slides as unknown as Slide[]) || [];
  const [sections, setSections] = useState<Section3[]>(() =>
    slidesToSections(initialSlides)
  );
  const [selectedIdx, setSelectedIdx] = useState<number | null>(null);
  const lastSectionCount = useRef(sections.length);
  const isSavingLocked = useRef(false);

  const [deployUrl, setDeployUrl] = useState<string | null>(websiteUrl);
  const [deploying, setDeploying] = useState(false);

  const editorRef = useRef<GrapesEditorHandle>(null);
  const saveFetcher = useFetcher();
  const actionFetcher = useFetcher();

  // Theme
  const [currentTheme, setCurrentTheme] = useState(presentation.theme || "minimal");
  const [currentCustomColors, setCurrentCustomColors] = useState<Record<string, string> | undefined>(
    (presentation.customColors as Record<string, string>) || undefined
  );

  // Handle action responses
  useEffect(() => {
    const data = actionFetcher.data as any;
    if (!data) return;
    if (data.deleted) navigate("/dash/presentations");
    if (data.unpublished) setDeployUrl(null);
    if (data.deployUrl) { setDeployUrl(data.deployUrl); setDeploying(false); }
  }, [actionFetcher.data, navigate]);

  // Debounced save
  const saveDebounce = useRef<ReturnType<typeof setTimeout>>(undefined);
  const saveSections = useCallback((secs: Section3[]) => {
    if (saveDebounce.current) clearTimeout(saveDebounce.current);
    saveDebounce.current = setTimeout(() => {
      const slides = sectionsToSlides(secs);
      saveFetcher.submit(
        { intent: "update-slides", slides: JSON.stringify(slides) },
        { method: "post" }
      );
    }, 400);
  }, []);

  // GrapesJS onChange
  const handleEditorChange = useCallback((html: string) => {
    if (isSavingLocked.current) return;
    if (!html || !html.trim()) return;
    const stripped = html.replace(/<style[\s\S]*?<\/style>/gi, "").trim();
    if (!stripped) return;

    const newSections = grapesToSections(html);
    const contentSections = newSections.filter((s) => s.id !== "__grapes_css__");

    if (contentSections.length === 0 && lastSectionCount.current > 0) return;
    if (lastSectionCount.current > 2 && contentSections.length < lastSectionCount.current * 0.5) return;
    lastSectionCount.current = contentSections.length;

    setSections(newSections);
    saveSections(newSections);
  }, [saveSections]);

  // Theme change
  const themeDebounce = useRef<ReturnType<typeof setTimeout>>(undefined);
  const handleThemeChange = useCallback((themeId: string, customColors?: Record<string, string>) => {
    setCurrentTheme(themeId);
    setCurrentCustomColors(customColors);
    if (themeDebounce.current) clearTimeout(themeDebounce.current);
    themeDebounce.current = setTimeout(() => {
      const data: Record<string, string> = { intent: "update-theme", theme: themeId };
      if (customColors) data.customColors = JSON.stringify(customColors);
      saveFetcher.submit(data, { method: "post" });
    }, 300);
  }, []);

  // Deploy
  const handleDeploy = () => {
    setDeploying(true);
    actionFetcher.submit({ intent: "deploy" }, { method: "post" });
  };

  // ESC handler
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        // future modals
      }
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, []);

  const contentSections = sections.filter((s) => s.id !== "__grapes_css__").sort((a, b) => a.order - b.order);

  return (
    <div className="h-[calc(100vh-64px)] flex flex-col">
      {/* Top bar */}
      <div className="flex items-center justify-between px-4 py-2 border-b-2 border-black bg-white shrink-0">
        <div className="flex items-center gap-3">
          <Link to="/dash/presentations" className="text-sm font-bold hover:underline">
            &larr; Presentaciones
          </Link>
          <span className="text-sm text-gray-400">/</span>
          <span className="text-sm font-bold truncate max-w-[200px]">
            {presentation.name}
          </span>
        </div>

        <div className="flex items-center gap-2">
          {deployUrl && (
            <div className="relative flex items-center gap-1">
              <a href={deployUrl} target="_blank" rel="noreferrer" className="text-xs text-brand-600 font-bold hover:underline truncate max-w-[180px]">
                {deployUrl.replace("https://", "")}
              </a>
              <Copy text={deployUrl} />
            </div>
          )}

          <BrutalButton
            onClick={handleDeploy}
            disabled={deploying || contentSections.length === 0}
            className="text-xs"
          >
            {deploying ? "Publicando..." : deployUrl ? "Re-publicar" : "Publicar"}
          </BrutalButton>

          {deployUrl && (
            <button
              onClick={() => actionFetcher.submit({ intent: "unpublish" }, { method: "post" })}
              className="text-xs text-red-500 font-bold hover:underline"
            >
              Despublicar
            </button>
          )}

          <button
            onClick={() => {
              if (window.confirm("Eliminar esta presentacion?")) {
                actionFetcher.submit({ intent: "delete" }, { method: "post" });
              }
            }}
            className="text-xs text-red-500 font-bold hover:underline ml-2"
          >
            Eliminar
          </button>
        </div>
      </div>

      {/* Main area: sidebar + editor */}
      <div className="flex flex-1 min-h-0">
        {/* Slide list sidebar */}
        <div className="w-48 shrink-0 border-r-2 border-black bg-gray-50 overflow-y-auto p-3 flex flex-col gap-3">
          {contentSections.map((s, i) => (
            <SlideThumbnail
              key={s.id}
              section={s}
              idx={i}
              isSelected={selectedIdx === i}
              onClick={() => {
                setSelectedIdx(i);
                editorRef.current?.scrollToSection(s.id);
              }}
            />
          ))}
          <button
            onClick={() => {
              const newId = `slide-${Date.now()}`;
              const newSection: Section3 = {
                id: newId,
                order: contentSections.length,
                html: `<section data-section-id="${newId}" class="flex flex-col items-center justify-center bg-surface p-16"><h2 class="text-4xl font-bold text-on-surface">Nueva slide</h2><p class="text-xl text-on-surface-muted mt-4">Edita el contenido</p></section>`,
                label: `Slide ${contentSections.length + 1}`,
              };
              const updated = [...sections, newSection];
              setSections(updated);
              saveSections(updated);
              setTimeout(() => {
                editorRef.current?.setHtml(sectionsToHtml(updated));
                editorRef.current?.scrollToSection(newId);
              }, 100);
            }}
            className="w-full py-3 border-2 border-dashed border-gray-300 rounded-lg text-gray-400 hover:border-brand-500 hover:text-brand-600 font-bold text-sm transition"
          >
            + Slide
          </button>
        </div>

        {/* GrapesJS editor — takes remaining space */}
        <div className="flex-1 min-w-0 h-full">
          {contentSections.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-24 h-full bg-gray-900">
              <p className="text-gray-500 text-sm mb-4">Sin slides</p>
              <BrutalButton
                onClick={() => {
                  const newId = `slide-${Date.now()}`;
                  const newSection: Section3 = {
                    id: newId,
                    order: 0,
                    html: `<section data-section-id="${newId}" class="flex flex-col items-center justify-center bg-surface p-16"><h1 class="text-6xl font-black text-on-surface">Tu Titulo</h1><p class="text-2xl text-on-surface-muted mt-4">Subtitulo</p></section>`,
                    label: "Slide 1",
                  };
                  setSections([newSection]);
                  saveSections([newSection]);
                }}
              >
                Crear primera slide
              </BrutalButton>
            </div>
          ) : (
            <Suspense fallback={<div className="flex items-center justify-center h-full w-full bg-gray-900 text-gray-400">Cargando editor...</div>}>
              <GrapesEditor
                ref={editorRef}
                initialHtml={sectionsToHtml(sections)}
                theme={currentTheme}
                customColors={currentCustomColors}
                canvasStyles={slideCanvasCss}
                devices={false}
                panelSide="right"
                blocks={PRESENTATION_BLOCKS}
                onChange={handleEditorChange}
                onThemeChange={handleThemeChange}
              />
            </Suspense>
          )}
        </div>
      </div>
    </div>
  );
}
