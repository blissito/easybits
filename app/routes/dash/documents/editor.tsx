import React, { useState, useEffect, useCallback, useRef, useMemo, lazy, Suspense } from "react";
import {
  useLoaderData,
  useFetcher,
  useSearchParams,
  useNavigate,
  Link,
} from "react-router";
import { BrutalButton } from "~/components/common/BrutalButton";
import { Copy } from "~/components/common/Copy";
import { getUserOrRedirect } from "~/.server/getters";
import { db } from "~/.server/db";
import { PageList, type Section3WithVersions } from "~/components/documents/PageList";
import { CodeEditor } from "~/components/landings3/CodeEditor";
import type { Section3 } from "~/lib/landing3/types";
import type { GrapesEditorHandle, AiAction } from "~/components/landings4/GrapesEditor";
import { grapesToSections } from "~/lib/landing4/grapesToSections";
import { sectionsToHtml } from "~/lib/landing4/sectionsToGrapes";
import { buildSingleThemeCss, buildCustomTheme } from "@easybits.cloud/html-tailwind-generator";
import { parseFiles, combineContent } from "~/lib/documents/parseFiles";
import { playTone, warmAudio } from "~/hooks/useNotificationSound";
import { normalizePlan } from "~/lib/plans";
import { checkAiGenerationLimit } from "~/.server/aiGenerationLimit";
import toast from "react-hot-toast";
import { ConfirmDialog } from "~/components/common/ConfirmDialog";
import type { Route } from "./+types/editor";

const GrapesEditor = lazy(() => import("~/components/landings4/GrapesEditor"));

export interface StreamingPreviewHandle {
  scrollToSection(id: string): void;
}

/** Lightweight iframe preview used during streaming generation (no GrapesJS overhead).
 * The iframe shell is created once; only the body innerHTML is patched on updates. */
const StreamingPreview = React.forwardRef<StreamingPreviewHandle, { sections: Section3[]; themeCssData?: { css: string; tailwindConfig: string } }>(({ sections, themeCssData }, ref) => {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const prevCountRef = useRef(0);
  const contentSections = sections.filter((s) => s.id !== "__grapes_css__");

  React.useImperativeHandle(ref, () => ({
    scrollToSection(id: string) {
      const doc = iframeRef.current?.contentDocument;
      if (!doc) return;
      const el = doc.querySelector(`[data-id="${id}"]`);
      el?.scrollIntoView({ behavior: "smooth", block: "start" });
    },
  }));

  // Build the initial shell only once
  const shellDoc = useMemo(() => {
    return `<!DOCTYPE html><html lang="es"><head>
<meta charset="UTF-8">
<script src="https://cdn.tailwindcss.com"><\/script>
${themeCssData ? `<script>tailwind.config = ${themeCssData.tailwindConfig}<\/script>` : ""}
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800;900&display=swap" rel="stylesheet">
<style>
* { box-sizing: border-box; margin: 0; padding: 0; }
body { font-family: 'Inter', sans-serif; background: #e5e7eb; display: flex; flex-direction: column; align-items: center; gap: 24px; padding: 24px 0; }
${themeCssData?.css || ""}
.page-section { width: 8.5in; height: 11in; background: white; box-shadow: 0 2px 8px rgba(0,0,0,0.15); overflow: hidden; }
.page-section > section { height: 11in; overflow: hidden; }
@keyframes fade-in { from { opacity: 0; transform: translateY(12px); } to { opacity: 1; transform: translateY(0); } }
.page-section { animation: fade-in 0.4s ease-out; }
</style></head><body></body></html>`;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Patch iframe body incrementally instead of recreating srcDoc
  useEffect(() => {
    const iframe = iframeRef.current;
    if (!iframe) return;
    const doc = iframe.contentDocument;
    if (!doc?.body) return;

    const sorted = [...contentSections].sort((a, b) => a.order - b.order);
    const existing = doc.body.querySelectorAll(".page-section");

    // Update existing page divs in-place, append new ones
    sorted.forEach((s, i) => {
      const html = `<div class="page-section" data-id="${s.id}">${s.html}</div>`;
      if (i < existing.length) {
        const el = existing[i];
        if (el.getAttribute("data-id") !== s.id || el.innerHTML !== s.html) {
          el.outerHTML = html;
        }
      } else {
        doc.body.insertAdjacentHTML("beforeend", html);
      }
    });

    // Remove extra pages if sections were removed
    const nowExisting = doc.body.querySelectorAll(".page-section");
    for (let i = sorted.length; i < nowExisting.length; i++) {
      nowExisting[i].remove();
    }

    // Auto-scroll when new sections arrive
    if (contentSections.length > prevCountRef.current) {
      try { iframe.contentWindow?.scrollTo({ top: 999999, behavior: "smooth" }); } catch {}
    }
    prevCountRef.current = contentSections.length;
  }, [contentSections]);

  return (
    <iframe
      ref={iframeRef}
      srcDoc={shellDoc}
      className="w-full h-full border-none"
      title="Streaming preview"
    />
  );
});

/** Show brutalist toast with CTA when generation limit is hit */
function showLimitToast(message: string, upgradeUrl: string) {
  toast.custom(
    (t) => (
      <div
        className={`${t.visible ? "animate-enter" : "animate-leave"} flex items-center gap-3 bg-white border-2 border-black rounded-xl px-4 py-3 shadow-[4px_4px_0_0_rgba(0,0,0,1)]`}
      >
        <span className="text-sm font-bold text-red-700">{message}</span>
        <a
          href={upgradeUrl}
          className="shrink-0 text-sm font-bold text-brand-600 underline hover:text-brand-800"
          onClick={() => toast.dismiss(t.id)}
        >
          Comprar más →
        </a>
      </div>
    ),
    { duration: 6000 }
  );
}

/** Resize image to max dimension, return data URL */
function resizeImageToDataUrl(file: File, maxDim: number): Promise<string> {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        let { width, height } = img;
        if (width <= maxDim && height <= maxDim && file.size < 1024 * 1024) {
          resolve(reader.result as string);
          return;
        }
        const scale = Math.min(maxDim / width, maxDim / height, 1);
        width = Math.round(width * scale);
        height = Math.round(height * scale);
        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;
        canvas.getContext("2d")!.drawImage(img, 0, 0, width, height);
        resolve(canvas.toDataURL("image/jpeg", 0.8));
      };
      img.src = reader.result as string;
    };
    reader.readAsDataURL(file);
  });
}

function errorToast(msg: string) {
  toast.error(msg, {
    style: { border: "2px solid #000", padding: "16px", color: "#000", fontWeight: 600 },
    duration: 5000,
  });
}

export const meta = () => [
  { title: "Editor Documento — EasyBits" },
  { name: "robots", content: "noindex" },
];

export const loader = async ({ request, params }: Route.LoaderArgs) => {
  const user = await getUserOrRedirect(request);
  const landing = await db.landing.findUnique({ where: { id: params.id } });
  if (!landing || landing.ownerId !== user.id || landing.version !== 4) {
    throw new Response("Not found", { status: 404 });
  }

  let websiteUrl: string | null = null;
  if (landing.websiteId) {
    const website = await db.website.findUnique({
      where: { id: landing.websiteId },
    });
    if (website) {
      const proto = process.env.NODE_ENV === "production" ? "https" : "http";
      websiteUrl = `${proto}://${website.slug}.easybits.cloud`;
    }
  }

  const meta = (landing.metadata as Record<string, unknown>) || {};
  const sourceContent = meta.sourceContent as string | undefined;
  const logoUrl = meta.logoUrl as string | undefined;
  const direction = meta.direction as Record<string, unknown> | undefined;
  // AI generation usage
  const userMeta = (user.metadata as Record<string, unknown>) || {};
  const userPlan = normalizePlan(userMeta.plan as string);
  const genLimit = await checkAiGenerationLimit(user.id, userPlan);
  const aiGenUsed = genLimit.used;
  const aiGenLimit = genLimit.limit;
  const aiGenBonus = genLimit.bonus;

  const sectionVersions = (landing.sectionVersions as Record<string, { html: string; timestamp: number }[]>) || {};

  const brandKits = await db.brandKit.findMany({
    where: { ownerId: user.id },
    orderBy: { createdAt: "desc" },
  });

  return { landing, websiteUrl, sourceContent, logoUrl, direction, aiGenUsed, aiGenLimit, aiGenBonus, userPlan, sectionVersions, brandKits };
};

async function withRetry<T>(fn: () => Promise<T>, retries = 5): Promise<T> {
  for (let i = 0; i < retries; i++) {
    try {
      return await fn();
    } catch (err: any) {
      if (err?.code === "P2034" && i < retries - 1) {
        await new Promise((r) => setTimeout(r, 50 * 2 ** i + Math.random() * 100));
        continue;
      }
      throw err;
    }
  }
  throw new Error("Unreachable");
}

export const action = async ({ request, params }: Route.ActionArgs) => {
  const user = await getUserOrRedirect(request);
  const landing = await db.landing.findUnique({ where: { id: params.id } });
  if (!landing || landing.ownerId !== user.id || landing.version !== 4) {
    return { error: "No encontrado" };
  }

  const formData = await request.formData();
  const intent = formData.get("intent");

  if (intent === "update-sections") {
    const sections = JSON.parse(String(formData.get("sections") || "[]"));
    const sectionVersionsRaw = formData.get("sectionVersions");
    const data: Record<string, unknown> = { sections };
    if (sectionVersionsRaw) {
      data.sectionVersions = JSON.parse(String(sectionVersionsRaw));
    }
    await withRetry(() =>
      db.landing.update({
        where: { id: params.id },
        data,
      })
    );
    return { ok: true };
  }

  if (intent === "update-theme") {
    const newTheme = String(formData.get("theme") || "minimal");
    const customColorsRaw = formData.get("customColors");
    const customColors = customColorsRaw ? JSON.parse(String(customColorsRaw)) : undefined;
    const brandKitId = formData.get("brandKitId") || undefined;
    await withRetry(async () => {
      const fresh = await db.landing.findUnique({ where: { id: params.id } });
      const existing = (fresh?.metadata as Record<string, unknown>) || {};
      const meta: Record<string, unknown> = { ...existing, theme: newTheme };
      if (customColors) {
        meta.customColors = customColors;
      } else if (newTheme !== "custom") {
        delete meta.customColors;
      }
      if (brandKitId) {
        meta.brandKitId = brandKitId;
      }
      await db.landing.update({
        where: { id: params.id },
        data: { metadata: meta as any },
      });
    });
    return { ok: true };
  }

  const ctx = { user, scopes: ["ADMIN" as const] };

  if (intent === "deploy") {
    try {
      const { deployLanding } = await import(
        "~/.server/core/landingOperations"
      );
      const result = await deployLanding(ctx as any, params.id);
      return result;
    } catch (err: any) {
      console.error("Deploy error:", err);
      const msg =
        err instanceof Response
          ? (await err.json().catch(() => ({}))).error || "Error al publicar"
          : err?.message || "Error al publicar";
      return { error: msg };
    }
  }

  if (intent === "unpublish") {
    const { unpublishLanding } = await import(
      "~/.server/core/landingOperations"
    );
    await unpublishLanding(ctx as any, params.id);
    return { unpublished: true };
  }

  if (intent === "delete") {
    if (landing.websiteId) {
      const { unpublishLanding } = await import(
        "~/.server/core/landingOperations"
      );
      await unpublishLanding(ctx as any, params.id);
    }
    await db.landing.delete({ where: { id: params.id } });
    return { redirect: "/dash/documents" };
  }

  if (intent === "save-brand-kit") {
    const kitName = String(formData.get("kitName") || "").trim();
    if (!kitName) return { error: "Nombre requerido" };
    const { extractFromDocument } = await import(
      "~/.server/core/brandKitOperations"
    );
    await extractFromDocument(params.id, user.id, kitName);
    return { brandKitSaved: true };
  }

  return { error: "Intent desconocido" };
};

export default function DocumentEditor() {
  const {
    landing, websiteUrl, sourceContent, logoUrl, direction,
    aiGenUsed: initialAiGenUsed, aiGenLimit, aiGenBonus, userPlan,
    sectionVersions: savedVersions, brandKits,
  } = useLoaderData<typeof loader>();
  const [aiGenUsed, setAiGenUsed] = useState(initialAiGenUsed);
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const saveFetcher = useFetcher();
  const deployFetcher = useFetcher<{
    url?: string;
    pdfUrl?: string;
    redirect?: string;
    unpublished?: boolean;
  }>();
  const [activeIntent, setActiveIntent] = useState<string | null>(null);
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; sectionIds: string[] } | null>(null);

  const [selectedSectionIds, setSelectedSectionIds] = useState<string[]>([]);

  const [sections, _setSections] = useState<Section3[]>(() => {
    const raw = landing.sections;
    const base = Array.isArray(raw) ? (raw as unknown as Section3[]) : [];
    // Hydrate versions from DB
    if (savedVersions && typeof savedVersions === "object") {
      return base.map((s) => {
        const v = (savedVersions as Record<string, any>)[s.id];
        return v ? { ...s, versions: v } : s;
      });
    }
    return base;
  });
  const sectionsRef = useRef(sections);
  const setSections = useCallback((updater: Section3[] | ((prev: Section3[]) => Section3[])) => {
    _setSections((prev) => {
      const next = typeof updater === "function" ? updater(prev) : updater;
      sectionsRef.current = next;
      return next;
    });
  }, []);

  const [isGenerating, setIsGenerating] = useState(
    searchParams.get("generating") === "1"
  );
  const [liveUrl, setLiveUrl] = useState(websiteUrl);
  const [livePdfUrl, setLivePdfUrl] = useState<string | undefined>();
  const [overflowOpen, setOverflowOpen] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [showMobilePages, setShowMobilePages] = useState(false);
  const overflowRef = useRef<HTMLDivElement>(null);

  const abortRef = useRef<AbortController | null>(null);

  const editorRef = useRef<GrapesEditorHandle>(null);
  const streamingRef = useRef<StreamingPreviewHandle>(null);
  const [refiningSections, setRefiningSections] = useState<Set<string>>(new Set());
  const [variantLoadingId, setVariantLoadingId] = useState<string | null>(null);
  const [regenTargetId, setRegenTargetId] = useState<string | null>(null);
  const [insertAtIndex, setInsertAtIndex] = useState<number | null>(null);

  // Add page prompt modal
  const [showAddPrompt, setShowAddPrompt] = useState(false);
  const [addPrompt, setAddPrompt] = useState("");
  const [isAddingSection, setIsAddingSection] = useState(false);
  const addPageAbortRef = useRef<AbortController | null>(null);

  // Track when we last saved locally — ignore SSE echoes of our own saves
  const lastLocalSaveAt = useRef(0);

  // SSE live reload — watch for MCP/API updates
  useEffect(() => {
    if (isGenerating) return;
    const source = new EventSource(`/api/v2/document-watch?id=${landing.id}`);
    source.addEventListener("doc-update", (e) => {
      // Ignore SSE updates that are echoes of our own saves (within 5s window)
      if (Date.now() - lastLocalSaveAt.current < 5_000) return;
      const data = JSON.parse(e.data);
      const serverSections: Section3[] = data.sections || [];
      setSections((prev) => {
        return serverSections.map((s) => {
          const local = prev.find((ls) => ls.id === s.id);
          if (local && local.html === s.html) return local;
          return { ...s, versions: (local as any)?.versions || [] };
        });
      });
      // Sync GrapesJS canvas with external changes
      syncToGrapes(serverSections);
    });
    return () => source.close();
  }, [landing.id, isGenerating, setSections]);

  // Helper: sync sections state to GrapesJS canvas
  const syncToGrapes = useCallback((secs: Section3[]) => {
    editorRef.current?.setHtml(sectionsToHtml(secs));
  }, []);

  // Document-specific CSS for GrapesJS canvas iframe
  const documentCanvasCss = `
    body { padding: 24px; background: #374151; display: flex; flex-direction: column; align-items: center; gap: 24px; }
    section, [data-section-id] { width: 8.5in; min-height: 11in; max-height: 11in; overflow: hidden; background: white; box-shadow: 0 2px 8px rgba(0,0,0,0.15); border-radius: 4px; padding: 0.75in; box-sizing: border-box; }
  `;

  // Zoom
  const ZOOM_LEVELS = [25, 50, 75, 100, 125, 150];
  const [zoomPct, setZoomPct] = useState(100);
  const zoomIn = useCallback(() => setZoomPct((z) => {
    const idx = ZOOM_LEVELS.indexOf(z);
    const next = idx >= 0 ? ZOOM_LEVELS[Math.min(idx + 1, ZOOM_LEVELS.length - 1)] : z;
    editorRef.current?.setZoom(next);
    return next;
  }), []);
  const zoomOut = useCallback(() => setZoomPct((z) => {
    const idx = ZOOM_LEVELS.indexOf(z);
    const next = idx >= 0 ? ZOOM_LEVELS[Math.max(idx - 1, 0)] : z;
    editorRef.current?.setZoom(next);
    return next;
  }), []);
  const zoomFit = useCallback(() => {
    setZoomPct(75);
    editorRef.current?.setZoom(75);
  }, []);

  // Cmd/Ctrl + scroll to zoom
  useEffect(() => {
    function handleWheel(e: WheelEvent) {
      if (!(e.metaKey || e.ctrlKey)) return;
      e.preventDefault();
      if (e.deltaY < 0) zoomIn();
      else zoomOut();
    }
    window.addEventListener("wheel", handleWheel, { passive: false });
    return () => window.removeEventListener("wheel", handleWheel);
  }, [zoomIn, zoomOut]);

  const [addFiles, setAddFiles] = useState<File[]>([]);
  const [addRefImage, setAddRefImage] = useState<string | null>(null);
  const [addParsedContent, setAddParsedContent] = useState("");
  const [isParsingAdd, setIsParsingAdd] = useState(false);
  const addFileRef = useRef<HTMLInputElement>(null);
  const addImageRef = useRef<HTMLInputElement>(null);

  // Theme — matches landings v4 pattern
  const landingMeta = (landing.metadata as Record<string, unknown>) || {};
  const [currentTheme, setCurrentTheme] = useState((landingMeta.theme as string) || "minimal");
  const [currentCustomColors, setCurrentCustomColors] = useState<Record<string, string> | undefined>(
    (landingMeta.customColors as Record<string, string>) || undefined
  );

  const themeDebounce = useRef<ReturnType<typeof setTimeout>>(undefined);
  const handleThemeChange = useCallback((themeId: string, customColors?: Record<string, string>, brandKitId?: string) => {
    setCurrentTheme(themeId);
    setCurrentCustomColors(customColors);
    if (themeDebounce.current) clearTimeout(themeDebounce.current);
    themeDebounce.current = setTimeout(() => {
      const data: Record<string, string> = { intent: "update-theme", theme: themeId };
      if (customColors) data.customColors = JSON.stringify(customColors);
      if (brandKitId) data.brandKitId = brandKitId;
      saveFetcher.submit(data, { method: "post" });
    }, 300);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // For PDF export
  const themeCssData = useMemo(() => {
    if (currentTheme === "custom" && currentCustomColors) {
      const t = buildCustomTheme(currentCustomColors as any);
      const css = `:root {\n${Object.entries(t.colors).map(([k, v]) => `  --color-${k}: ${v};`).join("\n")}\n}`;
      const { tailwindConfig } = buildSingleThemeCss("minimal");
      return { css, tailwindConfig };
    }
    return buildSingleThemeCss(currentTheme);
  }, [currentTheme, currentCustomColors]);



  // Regenerate prompt bar
  const [regenInput, setRegenInput] = useState("");

  // Code view
  const [codeViewSectionId, setCodeViewSectionId] = useState<string | null>(
    null
  );
  const [codeValue, setCodeValue] = useState("");
  const [codeScrollTarget, setCodeScrollTarget] = useState<
    string | undefined
  >();

  useEffect(() => {
    if (deployFetcher.state === "idle") setActiveIntent(null);
    if (deployFetcher.data?.redirect) navigate(deployFetcher.data.redirect);
    if (deployFetcher.data?.url) {
      setLiveUrl(deployFetcher.data.url);
      setLivePdfUrl(deployFetcher.data.pdfUrl);
    }
    if (deployFetcher.data?.unpublished) { setLiveUrl(null); setLivePdfUrl(undefined); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [deployFetcher.state, deployFetcher.data, navigate]);

  // Auto-generate on mount (only when navigating from /new with ?generating=1)
  useEffect(() => {
    warmAudio();
    if (!isGenerating) return;
    // Remove ?generating=1 from URL so refreshes don't re-trigger
    const url = new URL(window.location.href);
    if (url.searchParams.has("generating")) {
      url.searchParams.delete("generating");
      window.history.replaceState({}, "", url.pathname + url.search);
    }
    if (sections.length > 0) {
      // Cover preview exists — generate remaining pages only
      generateSections(undefined, true);
    } else {
      generateSections();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Close overflow on outside click
  useEffect(() => {
    if (!overflowOpen) return;
    function handleClick(e: MouseEvent) {
      if (
        overflowRef.current &&
        !overflowRef.current.contains(e.target as Node)
      ) {
        setOverflowOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [overflowOpen]);

  // ESC to close things
  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        if (pendingAiAction) { setPendingAiAction(null); setAiRefinePrompt(""); }
        else if (contextMenu) setContextMenu(null);
        else if (codeViewSectionId) setCodeViewSectionId(null);
        else if (showAddPrompt) { setShowAddPrompt(false); setRegenTargetId(null); setInsertAtIndex(null); }
        else if (overflowOpen) setOverflowOpen(false);
      }
    }
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [contextMenu, overflowOpen, codeViewSectionId, showAddPrompt]);

  function stopGeneration() {
    abortRef.current?.abort();
    setIsGenerating(false);
  }

  async function generateSections(extraInstructions?: string, skipCover?: boolean) {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setIsGenerating(true);
    const existingSections = skipCover ? [...sections] : [];
    if (!skipCover) setSections([]);
    const accumulated: Section3[] = [...existingSections];

    try {
      // Check limit client-side
      if (aiGenLimit !== null && aiGenUsed >= aiGenLimit && aiGenBonus <= 0) {
        showLimitToast(
          `Has usado todas tus ${aiGenLimit} generaciones de este mes.`,
          "/dash/packs"
        );
        setIsGenerating(false);
        return;
      }

      const res = await fetch("/api/v2/document-generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          landingId: landing.id,
          prompt: landing.prompt,
          sourceContent,
          logoUrl,
          pageCount: Number(searchParams.get("pages")) || undefined,
          ...(extraInstructions ? { extraInstructions } : {}),
          ...(direction ? { direction } : {}),
          ...(skipCover ? { skipCover: true } : {}),
          ...(() => {
            try {
              const stored = sessionStorage.getItem("doc-new");
              if (!stored) return {};
              const parsed = JSON.parse(stored);
              const result: Record<string, unknown> = {};
              if (parsed.referenceDataUrl) result.referenceImage = parsed.referenceDataUrl;
              if (Array.isArray(parsed.referencePages) && parsed.referencePages.length > 0) result.referencePages = parsed.referencePages;
              return result;
            } catch { return {}; }
          })(),
        }),
        signal: controller.signal,
      });
      if (!res.ok) {
        const errBody = await res.json().catch(() => ({}));
        if (errBody.upgradeUrl) {
          showLimitToast(errBody.error, errBody.upgradeUrl);
          return;
        }
        throw new Error(errBody.error || "Error al generar documento");
      }
      setAiGenUsed((c: number) => c + 1);

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
              if (eventType === "outline") {
                // Pre-create placeholder sections from outline
                const placeholders = (d.pages as any[]).map((p: any, i: number) => ({
                  id: `__building_${p.pageNumber - 1}__`,
                  order: skipCover ? accumulated.length + i : i,
                  html: `<section class="w-[8.5in] min-h-[11in] relative overflow-hidden bg-gray-50 flex items-center justify-center"><div class="text-center animate-pulse"><div class="w-10 h-10 mx-auto mb-3 rounded-full bg-gray-200"></div><div class="text-sm font-semibold text-gray-400">${p.label}</div><div class="text-xs text-gray-300 mt-1">Generando...</div></div></section>`,
                  label: p.label,
                }));
                accumulated.push(...placeholders);
                setSections([...accumulated]);
              } else if (eventType === "section-building") {
                // Update specific placeholder by order (interleaved for parallel)
                const buildId = `__building_${d.order}__`;
                const idx = accumulated.findIndex((s) => s.id === buildId);
                if (idx !== -1) {
                  accumulated[idx] = { ...accumulated[idx], html: d.html };
                } else {
                  // Fallback: try legacy single-building pattern
                  const legacyIdx = accumulated.findIndex((s) => s.id === "__building__");
                  if (legacyIdx !== -1) {
                    accumulated[legacyIdx] = { ...accumulated[legacyIdx], html: d.html };
                  } else {
                    accumulated.push({ id: buildId, order: d.order, html: d.html, label: "..." });
                  }
                }
                setSections([...accumulated]);
              } else if (eventType === "section") {
                // Replace placeholder in-place (no flicker)
                const buildId = `__building_${d.order}__`;
                const idx = accumulated.findIndex((s) => s.id === buildId);
                if (idx !== -1) {
                  accumulated[idx] = d;
                } else {
                  const existIdx = accumulated.findIndex((s) => s.id === d.id);
                  if (existIdx !== -1) {
                    accumulated[existIdx] = d;
                  } else {
                    accumulated.push(d);
                  }
                }
                setSections([...accumulated]);
              } else if (eventType === "section-update") {
                const idx = accumulated.findIndex((s) => s.id === d.id);
                if (idx !== -1) accumulated[idx] = { ...accumulated[idx], html: d.html };
                setSections([...accumulated]);
              } else if (eventType === "done") {
                playTone();
              } else if (eventType === "error") {
                errorToast(d.message || "Error en la generación");
              }
            } catch {
              /* skip */
            }
          }
        }
      }

      setSections([...accumulated]);
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") return;
      console.error("Generation error:", err);
      errorToast((err as Error).message || "Error al generar documento");
      if (accumulated.length > 0) {
        setSections([...accumulated]);
      }
    } finally {
      if (abortRef.current === controller) setIsGenerating(false);
    }
  }

  const saveTimeoutRef = useRef<ReturnType<typeof setTimeout>>(undefined);
  const saveSections = useCallback((s: Section3[]) => {
    clearTimeout(saveTimeoutRef.current);
    saveTimeoutRef.current = setTimeout(() => {
      // Separate versions from sections for DB persistence
      const clean = s.map(({ versions, ...rest }: any) => rest);
      const versionMap: Record<string, { html: string; timestamp: number }[]> = {};
      for (const sec of s as any[]) {
        if (sec.versions?.length) {
          versionMap[sec.id] = sec.versions.slice(-10);
        }
      }
      lastLocalSaveAt.current = Date.now();
      saveFetcher.submit(
        {
          intent: "update-sections",
          sections: JSON.stringify(clean),
          sectionVersions: JSON.stringify(versionMap),
        },
        { method: "post" }
      );
    }, 300);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);


  const handleSectionsChange = useCallback(
    (newSections: Section3[]) => {
      setSections(newSections);
      saveSections(newSections);
      syncToGrapes(newSections);
    },
    [saveSections, setSections, syncToGrapes]
  );

  // GrapesJS editor change handler — sync sections from HTML
  const isSavingLocked = useRef(false);
  const lastSectionCount = useRef(sections.length);
  const handleEditorChange = useCallback((html: string) => {
    if (isSavingLocked.current) return;
    if (!html || !html.trim()) return;
    const stripped = html.replace(/<style[\s\S]*?<\/style>/gi, "").trim();
    if (!stripped) return;

    const newSections = grapesToSections(html);
    const contentSections = newSections.filter((s) => s.id !== "__grapes_css__");
    // Wipe protection
    if (contentSections.length === 0 && lastSectionCount.current > 0) return;
    if (lastSectionCount.current > 2 && contentSections.length < lastSectionCount.current * 0.5) return;
    lastSectionCount.current = contentSections.length;

    setSections(newSections);
    saveSections(newSections);
  }, [setSections, saveSections]);

  // AI action from GrapesEditor toolbar — show modal first
  const [pendingAiAction, setPendingAiAction] = useState<AiAction | null>(null);
  const [aiRefinePrompt, setAiRefinePrompt] = useState("");
  const handleAiAction = useCallback((action: AiAction) => {
    if (action.type === "refine-element") {
      setPendingAiAction(action);
      setAiRefinePrompt("");
    }
  }, []);

  async function handleRefineFromGrapes(action: AiAction, instruction: string) {
    const ed = editorRef.current?.getEditor();
    if (!ed) return;

    const targetId = action.isSection
      ? action.sectionComponentId || action.componentId
      : action.componentId;
    const targetHtml = action.isSection
      ? action.sectionHtml || action.html
      : action.html;
    const fullHtmlBefore = ed.getHtml();

    isSavingLocked.current = true;
    setRefiningSections((prev) => new Set(prev).add(targetId));

    const abortController = new AbortController();
    refineAbortMap.current.set(targetId, abortController);

    // Add shimmer to the target component
    function findById(parent: any, id: string): any {
      if (parent.getId() === id) return parent;
      for (const child of parent.components().models || []) {
        const found = findById(child, id);
        if (found) return found;
      }
      return null;
    }
    const targetComp = findById(ed.DomComponents.getWrapper(), targetId);
    if (targetComp) targetComp.addClass("easybits-refining");

    try {
      const res = await fetch("/api/v2/document-refine", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        signal: abortController.signal,
        body: JSON.stringify({
          landingId: landing.id,
          sectionId: targetId,
          instruction,
          currentHtml: targetHtml,
          skipDbUpdate: true,
          allSections: sections.map((s) => ({ id: s.id, label: s.label, html: s.html })),
          ...(direction && { direction }),
        }),
      });

      if (!res.ok) {
        const errBody = await res.json().catch(() => ({}));
        if (errBody.upgradeUrl) { showLimitToast(errBody.error, errBody.upgradeUrl); return; }
        throw new Error(errBody.error || "Error al refinar página");
      }
      setAiGenUsed((c: number) => c + 1);

      const reader = res.body!.getReader();
      const decoder = new TextDecoder();
      let buf = "";
      let event = "";
      let latestNewHtml = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        const lines = buf.split("\n");
        buf = lines.pop() || "";
        for (const line of lines) {
          if (line.startsWith("event: ")) {
            event = line.slice(7).trim();
          } else if (line.startsWith("data: ")) {
            try {
              const d = JSON.parse(line.slice(6));
              if (event === "error") throw new Error(d.message || "Error en generación");
              if ((event === "chunk" || event === "done") && d.html) {
                latestNewHtml = d.html;
              }
            } catch {}
          }
        }
      }

      // Clean markdown fences and apply via string replacement
      if (latestNewHtml) {
        latestNewHtml = latestNewHtml
          .replace(/^```html?\s*/i, "")
          .replace(/```\s*$/, "")
          .trim();
        const updatedFull = fullHtmlBefore.replace(targetHtml, latestNewHtml);
        ed.setComponents(updatedFull);

        // Scroll to refined element
        requestAnimationFrame(() => {
          try {
            const wrapper = ed.DomComponents.getWrapper();
            if (wrapper) {
              const updated = findById(wrapper, targetId);
              if (updated) {
                const el = updated.getEl();
                if (el) el.scrollIntoView({ behavior: "smooth", block: "center" });
              }
            }
          } catch {}
        });

        // Save
        const finalHtml = editorRef.current?.getHtml() || "";
        const newSections = grapesToSections(finalHtml);
        saveFetcher.submit(
          { intent: "update-sections", sections: JSON.stringify(newSections) },
          { method: "post" },
        );
      }

      playTone();
    } catch (err) {
      if ((err as Error).name === "AbortError") return;
      console.error("Refine error:", err);
      errorToast((err as Error).message || "Error al refinar página");
    } finally {
      refineAbortMap.current.delete(targetId);
      // Remove shimmer
      try {
        const wrapper = ed.DomComponents.getWrapper();
        if (wrapper) {
          const comp = findById(wrapper, targetId);
          if (comp) comp.removeClass("easybits-refining");
        }
      } catch {}
      setRefiningSections((prev) => { const next = new Set(prev); next.delete(targetId); return next; });
      isSavingLocked.current = false;
    }
  }

  const refineAbortMap = useRef<Map<string, AbortController>>(new Map());
  const variantAbortRef = useRef<AbortController | null>(null);

  function stopVariant() {
    variantAbortRef.current?.abort();
    variantAbortRef.current = null;
    setVariantLoadingId(null);
  }

  async function handleGenerateVariant(sectionId: string, instruction?: string, referenceImage?: string) {
    const section = sections.find((s) => s.id === sectionId);
    if (!section) return;

    // Auto-detect image-only pages: extract data URL and use as referenceImage for vision
    let effectiveRef = referenceImage;
    let effectiveInstruction = instruction;
    const imgMatch = section.html.match(/<img\s[^>]*src="(data:image\/[^"]+)"/);
    if (imgMatch && !referenceImage) {
      // Check if this is an image-only page (no other meaningful content)
      const stripped = section.html.replace(/<section[^>]*>/, "").replace(/<\/section>/, "").trim();
      if (stripped.startsWith("<img ") && stripped.endsWith(">")) {
        effectiveRef = imgMatch[1];
        effectiveInstruction = instruction || "Reproduce this design as a professional HTML document page. Match the layout, colors, typography and content from the reference image exactly.";
      }
    }

    // Abort any in-flight variant generation before starting a new one
    if (variantAbortRef.current) {
      variantAbortRef.current.abort();
      variantAbortRef.current = null;
    }
    setVariantLoadingId(sectionId);
    const abortController = new AbortController();
    variantAbortRef.current = abortController;
    try {
      // Exit any version preview before generating
      // Exit any version preview before generating
      const currentHtml = section.html;

      // Snapshot current version (using true html, not navigated-to html)
      setSections((prev) =>
        prev.map((s) => {
          if (s.id !== sectionId) return s;
          const sv = s as Section3WithVersions;
          const versions = [...(sv.versions || []), { html: currentHtml, timestamp: Date.now() }].slice(-10);
          return { ...s, html: currentHtml, versions } as any;
        })
      );

      const res = await fetch("/api/v2/document-refine", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: abortController.signal,
        body: JSON.stringify({
          landingId: landing.id,
          sectionId,
          instruction: effectiveInstruction || "VARIANT_MODE",
          currentHtml,
          ...(effectiveRef ? { referenceImage: effectiveRef } : {}),
          ...(direction && { direction }),
          allSections: sections.map((s) => ({ id: s.id, label: s.label, html: s.html })),
        }),
      });
      if (!res.ok) {
        const errBody = await res.json().catch(() => ({}));
        if (errBody.upgradeUrl) {
          showLimitToast(errBody.error, errBody.upgradeUrl);
          return;
        }
        throw new Error(errBody.error || "Error al generar variante");
      }
      setAiGenUsed((c: number) => c + 1);

      const reader = res.body!.getReader();
      const decoder = new TextDecoder();
      let buf = "";
      let event = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        const lines = buf.split("\n");
        buf = lines.pop() || "";
        for (const line of lines) {
          if (line.startsWith("event: ")) event = line.slice(7);
          else if (line.startsWith("data: ")) {
            try {
              const d = JSON.parse(line.slice(6));
              if (event === "error") throw new Error(d.message || "Error en generación");
              if ((event === "chunk" || event === "done") && d.html) {
                setSections((prev) =>
                  prev.map((s) =>
                    s.id === sectionId ? { ...s, html: d.html } : s
                  )
                );
              }
            } catch {}
          }
        }
      }
      playTone();
      syncToGrapes(sectionsRef.current);
      saveSections(sectionsRef.current);
    } catch (err) {
      if ((err as Error).name === "AbortError") return; // User cancelled — keep last chunk
      console.error("Variant error:", err);
      errorToast((err as Error).message || "Error al generar variante");
      // Rollback the premature version snapshot since no new HTML was generated
      setSections((prev) =>
        prev.map((s) => {
          if (s.id !== sectionId) return s;
          const sv = s as Section3WithVersions;
          if (!sv.versions?.length) return s;
          return { ...s, versions: sv.versions.slice(0, -1) } as any;
        })
      );
    } finally {
      variantAbortRef.current = null;
      setVariantLoadingId(null);
    }
  }

  function handleReorder(fromIndex: number, toIndex: number) {
    const grapesCss = sections.filter(s => s.id === "__grapes_css__");
    const pages = sections.filter(s => s.id !== "__grapes_css__").sort((a, b) => a.order - b.order);
    const [moved] = pages.splice(fromIndex, 1);
    pages.splice(toIndex, 0, moved);
    const reordered = pages.map((s, i) => ({ ...s, order: i }));
    handleSectionsChange([...grapesCss, ...reordered]);
  }


  async function handleAddPage() {
    if (isAddingSection) return;

    // Blank page: no prompt, no parsed content, no ref image
    if (!addPrompt.trim() && !addParsedContent && !addRefImage) {
      const newId = Math.random().toString(36).slice(2, 10);
      const targetIdx = insertAtIndex;
      setInsertAtIndex(null);
      setShowAddPrompt(false);
      setAddPrompt("");
      setSections((prev) => {
        const grapesCss = prev.filter(s => s.id === "__grapes_css__");
        const pages = prev.filter(s => s.id !== "__grapes_css__").sort((a, b) => a.order - b.order);
        const pos = targetIdx !== null ? targetIdx : pages.length;
        pages.splice(pos, 0, {
          id: newId,
          order: pos,
          html: '<section class="w-full min-h-[11in] bg-surface p-12"></section>',
          label: `Página ${pos + 1}`,
        });
        const reordered = pages.map((s, i) => ({ ...s, order: i }));
        return [...grapesCss, ...reordered];
      });
      // Sync and save
      requestAnimationFrame(() => {
        syncToGrapes(sectionsRef.current);
        saveSections(sectionsRef.current);
      });
      return;
    }

    setIsAddingSection(true);
    const savedPrompt = addPrompt.trim();
    const savedParsedContent = addParsedContent;
    const savedRefImage = addRefImage;
    const newId = Math.random().toString(36).slice(2, 10);
    addPageAbortRef.current?.abort();
    const controller = new AbortController();
    addPageAbortRef.current = controller;
    try {
      const instruction = [
        savedPrompt ? `Create new pages: ${savedPrompt}` : "Create new pages from this content",
        savedParsedContent ? `\n\nSource content:\n${savedParsedContent.substring(0, 15000)}` : "",
      ].join("");

      const res = await fetch("/api/v2/document-refine", {
        signal: controller.signal,
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          landingId: landing.id,
          sectionId: "__new__",
          instruction,
          currentHtml: "<section></section>",
          allSections: sections.map((s) => ({ id: s.id, label: s.label, html: s.html })),
          ...(savedRefImage && { referenceImage: savedRefImage }),
          ...(direction && { direction }),
        }),
      });
      if (!res.ok) {
        const errBody = await res.json().catch(() => ({}));
        if (errBody.upgradeUrl) {
          showLimitToast(errBody.error, errBody.upgradeUrl);
          return;
        }
        throw new Error(errBody.error || "Error al agregar página");
      }

      // Close modal after fetch succeeds — user sees loading, then pages stream in
      setShowAddPrompt(false);
      setAddPrompt("");
      setAddFiles([]);
      setAddRefImage(null);
      setAddParsedContent("");

      const targetIdx = insertAtIndex;
      setInsertAtIndex(null);
      setSections((prev) => {
        const grapesCss = prev.filter(s => s.id === "__grapes_css__");
        const pages = prev.filter(s => s.id !== "__grapes_css__").sort((a, b) => a.order - b.order);
        const pos = targetIdx !== null ? targetIdx : pages.length;
        pages.splice(pos, 0, {
          id: newId,
          order: pos,
          html: "<section></section>",
          label: `Página ${pos + 1}`,
        });
        return [...grapesCss, ...pages.map((s, i) => ({ ...s, order: i }))];
      });

      const reader = res.body!.getReader();
      const decoder = new TextDecoder();
      let buf = "";
      let event = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        const lines = buf.split("\n");
        buf = lines.pop() || "";
        for (const line of lines) {
          if (line.startsWith("event: ")) event = line.slice(7);
          else if (line.startsWith("data: ")) {
            try {
              const d = JSON.parse(line.slice(6));
              if (event === "error") throw new Error(d.message || "Error en generación");
              if ((event === "chunk" || event === "done") && d.html) {
                if (event === "done" && d.sections && d.sections.length > 1) {
                  // Multiple pages returned — replace placeholder with all pages
                  let lastNewId = "";
                  setSections((prev) => {
                    const grapesCss = prev.filter(s => s.id === "__grapes_css__");
                    const without = prev.filter((s) => s.id !== newId && s.id !== "__grapes_css__");
                    const pages = [...without].sort((a, b) => a.order - b.order);
                    // Find where the placeholder was to insert at that position
                    const placeholderOrder = prev.find((s) => s.id === newId)?.order ?? pages.length;
                    const newSections = d.sections.map((html: string, i: number) => ({
                      id: Math.random().toString(36).slice(2, 10),
                      order: placeholderOrder + i,
                      html,
                      label: `Página ${placeholderOrder + i + 1}`,
                    }));
                    lastNewId = newSections[newSections.length - 1].id;
                    pages.splice(placeholderOrder, 0, ...newSections);
                    const updated = pages.map((s, i) => ({ ...s, order: i }));
                    saveSections([...grapesCss, ...updated]);
                    return [...grapesCss, ...updated];
                  });
                  playTone();
                  setSelectedSectionIds([lastNewId]);
                } else {
                  setSections((prev) =>
                    prev.map((s) => (s.id === newId ? { ...s, html: d.html } : s))
                  );
                  if (event === "done") {
                    setSections((prev) => {
                      const updated = prev.map((s) =>
                        s.id === newId ? { ...s, html: d.html } : s
                      );
                      saveSections(updated);
                      return updated;
                    });
                    playTone();
                    setSelectedSectionIds([newId]);
                  }
                }
              }
            } catch (parseErr) {
              console.error("Add page stream parse error:", parseErr);
            }
          }
        }
      }

    } catch (err) {
      if ((err as Error).name === "AbortError") return; // User cancelled — keep partial content
      console.error("Add page error:", err);
      errorToast((err as Error).message || "Error al agregar página");
      // Remove the empty placeholder page on error
      setSections((prev) => prev.filter((s) => s.id !== newId));
    } finally {
      setIsAddingSection(false);
    }
  }

  async function handleDropImage(afterIndex: number, file: File) {
    const dataUrl = await resizeImageToDataUrl(file, 1024);
    const newId = Math.random().toString(36).slice(2, 10);
    const grapesCss = sections.filter(s => s.id === "__grapes_css__");
    const pages = sections.filter(s => s.id !== "__grapes_css__").sort((a, b) => a.order - b.order);
    pages.splice(afterIndex, 0, {
      id: newId,
      order: afterIndex,
      html: `<section style="width:8.5in;min-height:11in;display:flex;align-items:center;justify-content:center;background:#fff"><img src="${dataUrl}" style="max-width:100%;max-height:100%;object-fit:contain"></section>`,
      label: "Imagen",
    });
    const updated = pages.map((s, i) => ({ ...s, order: i }));
    handleSectionsChange([...grapesCss, ...updated]);
  }

  function handleOpenCode(sectionId: string) {
    const section = sections.find((s) => s.id === sectionId);
    if (!section) return;
    if (codeViewSectionId === sectionId) {
      setCodeScrollTarget(undefined);
    } else {
      setCodeScrollTarget(undefined);
      setCodeViewSectionId(sectionId);
    }
    setCodeValue(section.html);
  }

  function handleExportPdf(filterSectionIds?: string[]) {
    // Build full HTML with Paged.js and open in new window for window.print()
    const base = (filterSectionIds ? sections.filter(s => filterSectionIds.includes(s.id)) : sections)
      .filter(s => s.id !== "__grapes_css__" && s.label !== "__css__");
    const sorted = [...base].sort((a, b) => a.order - b.order);

    // Extract GrapesJS CSS to include in print styles
    const grapesCssSection = sections.find(s => s.id === "__grapes_css__");
    let grapesCss = "";
    if (grapesCssSection) {
      const match = grapesCssSection.html.match(/<style[^>]*>([\s\S]*?)<\/style>/i);
      grapesCss = match?.[1] || "";
    }

    const sectionsHtml = sorted
      .map((s) => `<div class="page-section">${s.html}</div>`)
      .join("\n");

    const html = `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <title>${landing.name}</title>
  <script src="https://cdn.tailwindcss.com"><\/script>
  ${themeCssData ? `<script>tailwind.config = ${themeCssData.tailwindConfig}<\/script>` : ""}
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800;900&display=swap" rel="stylesheet">
  <style>
    @page { size: letter; margin: 0; }
    ${themeCssData?.css || ""}
    ${grapesCss}
    body { font-family: 'Inter', sans-serif; margin: 0; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    .page-section {
      width: 8.5in;
      min-height: 11in;
      height: 11in;
      overflow: hidden;
      position: relative;
      page-break-after: always;
      break-after: page;
      page-break-inside: avoid;
      break-inside: avoid;
      box-sizing: border-box;
    }
    .page-section:last-child { page-break-after: auto; break-after: auto; }
    @media print {
      .page-section { page-break-after: always !important; break-after: page !important; }
      .page-section:last-child { page-break-after: auto !important; break-after: auto !important; }
    }
  </style>
</head>
<body>
${sectionsHtml}
<script>
  // Tailwind CDN injects a <style> into <head> when done processing.
  // Watch for it, then wait for all images, then print.
  (function() {
    var printed = false;
    function doPrint() {
      if (printed) return;
      printed = true;
      // Wait for all images to load before printing
      var imgs = Array.from(document.images);
      var pending = imgs.filter(function(img) { return !img.complete; });
      if (pending.length === 0) { window.print(); return; }
      var loaded = 0;
      function check() { if (++loaded >= pending.length) window.print(); }
      pending.forEach(function(img) {
        img.addEventListener('load', check);
        img.addEventListener('error', check);
      });
      // Safety: don't wait more than 5s for images
      setTimeout(function() { window.print(); }, 5000);
    }

    // MutationObserver on <head>: Tailwind CDN adds/updates a <style> tag
    var observer = new MutationObserver(function(mutations) {
      for (var i = 0; i < mutations.length; i++) {
        var nodes = mutations[i].addedNodes;
        for (var j = 0; j < nodes.length; j++) {
          if (nodes[j].tagName === 'STYLE') {
            // Tailwind style injected — debounce briefly then print
            observer.disconnect();
            setTimeout(doPrint, 300);
            return;
          }
        }
      }
    });
    observer.observe(document.head, { childList: true });

    // Fallback: if Tailwind CDN already ran or never fires, print after 4s
    setTimeout(function() { observer.disconnect(); doPrint(); }, 4000);
  })();
<\/script>
</body>
</html>`;

    const blob = new Blob([html], { type: "text/html" });
    const url = URL.createObjectURL(blob);
    window.open(url, "_blank");
  }

  function handleDeployDocument() {
    if (sections.length === 0) return;
    setActiveIntent("deploy");
    deployFetcher.submit({ intent: "deploy" }, { method: "post" });
  }

  function renderPageList({ isMobile }: { isMobile: boolean }) {
    return (
      <PageList
        sections={sections}
        selectedSectionIds={selectedSectionIds}
        onSelect={(id, multi) => {
          setSelectedSectionIds((prev) =>
            multi
              ? prev.includes(id)
                ? prev.filter((x) => x !== id)
                : [...prev, id]
              : [id]
          );
          if (isGenerating) {
            streamingRef.current?.scrollToSection(id);
          } else {
            editorRef.current?.scrollToSection(id);
          }
          if (isMobile) setShowMobilePages(false);
        }}
        onContextMenu={(sectionIds, position) => {
          setSelectedSectionIds(sectionIds);
          setContextMenu({ ...position, sectionIds });
        }}
        onOpenCode={(id) => handleOpenCode(id)}
        onReorder={handleReorder}
        onDelete={(id) => {
          const updated = sections
            .filter((s) => s.id !== id)
            .map((s, i) => ({ ...s, order: i }));
          handleSectionsChange(updated);
        }}
        onRename={(id, label) => {
          const updated = sections.map((s) =>
            s.id === id ? { ...s, label } : s
          );
          handleSectionsChange(updated);
        }}
        onAdd={() => { setInsertAtIndex(null); setRegenTargetId(null); setShowAddPrompt(true); }}
        onInsertAt={(afterIdx) => { setInsertAtIndex(afterIdx); setRegenTargetId(null); setShowAddPrompt(true); }}
        onDropImage={handleDropImage}
        theme={currentTheme}
        onThemeChange={(t: string) => handleThemeChange(t)}
        customColors={currentCustomColors ?? undefined}
        onCustomColorChange={(partial: any) => handleThemeChange("custom", { ...currentCustomColors, ...partial })}
        themeCssData={themeCssData}
        onGenerateVariant={handleGenerateVariant}
        onStopVariant={stopVariant}
        loadingVariantId={variantLoadingId}
        refiningIds={refiningSections}
        onRestoreVersion={(sectionId, oldHtml) => {
          const updated = sections.map((s) => {
            if (s.id !== sectionId) return s;
            const sv = s as Section3WithVersions;
            const versions = [...(sv.versions || []), { html: s.html, timestamp: Date.now() }].slice(-10);
            return { ...s, html: oldHtml, versions } as any;
          });
          handleSectionsChange(updated);
        }}
        onNavigateVersion={(sectionId, html) => {
          // Preview version in GrapesJS without changing state
          const ed = editorRef.current?.getEditor();
          if (!ed) return;
          isSavingLocked.current = true;
          const allHtml = sections.map((s) =>
            s.id === sectionId ? { ...s, html } : s
          );
          ed.setComponents(sectionsToHtml(allHtml));
          editorRef.current?.scrollToSection(sectionId);
        }}
        onExitPreview={(sectionId) => {
          // Restore current section HTML
          isSavingLocked.current = false;
          syncToGrapes(sections);
        }}
        onRegenerate={(sectionId) => {
          if (isMobile) setShowMobilePages(false);
          setRegenTargetId(sectionId);
          setShowAddPrompt(true);
        }}
        brandKits={brandKits as any}
        onSaveBrandKit={(name) => {
          const fd = new FormData();
          fd.set("intent", "save-brand-kit");
          fd.set("kitName", name);
          saveFetcher.submit(fd, { method: "POST" });
          toast.success("Brand Kit guardado");
        }}
        onApplyBrandKit={(kit) => {
          handleThemeChange("custom", kit.colors as Record<string, string>);
        }}
      />
    );
  }

  return (
    <article className="pt-14 pb-0 md:pl-28 w-full h-screen flex flex-col overflow-hidden">
      {/* Top bar */}
      <div className="flex items-center justify-between gap-2 sm:gap-4 px-2 sm:px-4 py-2 shrink-0 border-b border-gray-200 bg-white">
        <div className="flex items-center gap-2 sm:gap-3 min-w-0">
          <Link
            to="/dash/documents"
            className="text-sm font-bold hover:underline shrink-0"
          >
            &larr;
          </Link>
          <h1 className="text-sm sm:text-lg font-black truncate">
            {landing.name}
          </h1>
          {liveUrl && (
            <span className="hidden sm:flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
              <a
                href={liveUrl}
                target="_blank"
                rel="noreferrer"
                className="text-xs text-brand-600 hover:underline truncate max-w-[120px] sm:max-w-[200px]"
              >
                {liveUrl.replace(/^https?:\/\//, "")}
              </a>
              <Copy
                text={liveUrl}
                mode="ghost"
                className="relative static p-0"
              />
              {livePdfUrl && (
                <a
                  href={livePdfUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="text-xs text-brand-600 hover:underline font-semibold"
                  title="Descargar PDF"
                >
                  PDF
                </a>
              )}
            </span>
          )}
          {aiGenLimit !== null && (() => {
            const monthlyRemaining = Math.max(0, aiGenLimit - aiGenUsed);
            const totalRemaining = monthlyRemaining + aiGenBonus;
            const color = totalRemaining <= 0 ? "text-red-500" : totalRemaining <= 2 ? "text-yellow-600" : "text-gray-400";
            return (
              <span className={`hidden sm:inline text-xs font-bold ${color}`}>
                {totalRemaining} generaciones restantes
              </span>
            );
          })()}
        </div>

        <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
          <BrutalButton
            size="chip"
            mode="ghost"
            onClick={() => handleExportPdf()}
            isDisabled={sections.length === 0}
          >
            Exportar PDF
          </BrutalButton>
          <span className="hidden sm:inline-flex">
            <BrutalButton
              size="chip"
              onClick={handleDeployDocument}
              isLoading={activeIntent === "deploy"}
              isDisabled={sections.length === 0 || activeIntent !== null}
            >
              {liveUrl ? "Actualizar" : "Publicar"}
            </BrutalButton>
          </span>

          <div ref={overflowRef} className="relative">
            <button
              onClick={() => setOverflowOpen((p) => !p)}
              className="flex items-center justify-center w-8 h-8 rounded-lg border-2 border-black bg-white font-black text-sm hover:bg-gray-50 transition-colors"
              title="Mas acciones"
            >
              &middot;&middot;&middot;
            </button>
            {overflowOpen && (
              <div className="absolute right-0 top-full mt-1 w-48 bg-white border-2 border-black rounded-xl shadow-[4px_4px_0_#000] z-50 py-1 overflow-hidden">
                <button
                  onClick={() => { setOverflowOpen(false); handleDeployDocument(); }}
                  disabled={sections.length === 0 || activeIntent !== null}
                  className="sm:hidden w-full text-left px-4 py-2 text-sm font-bold text-brand-600 hover:bg-brand-50 disabled:opacity-50"
                >
                  {activeIntent === "deploy" ? "Publicando..." : liveUrl ? "Actualizar" : "Publicar"}
                </button>
                {liveUrl && (
                  <button
                    onClick={() => {
                      setOverflowOpen(false);
                      setActiveIntent("unpublish");
                      deployFetcher.submit(
                        { intent: "unpublish" },
                        { method: "post" }
                      );
                    }}
                    disabled={activeIntent !== null}
                    className="w-full text-left px-4 py-2 text-sm font-bold hover:bg-gray-50 disabled:opacity-50"
                  >
                    Despublicar
                  </button>
                )}
                <div className="border-t border-gray-200 my-1" />
                <button
                  onClick={() => {
                    setOverflowOpen(false);
                    setShowDeleteConfirm(true);
                  }}
                  disabled={activeIntent !== null}
                  className="w-full text-left px-4 py-2 text-sm font-bold text-red-600 hover:bg-red-50 disabled:opacity-50"
                >
                  Eliminar
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Limit banner */}
      {aiGenLimit !== null && aiGenUsed >= aiGenLimit && aiGenBonus <= 0 && (
        <div className="flex items-center justify-between px-4 py-2 bg-red-50 border-b-2 border-red-200 shrink-0">
          <span className="text-sm font-bold text-red-700">
            Agotaste tus generaciones de este mes.
          </span>
          <Link
            to="/dash/packs"
            className="text-sm font-bold text-red-700 underline hover:text-red-900"
          >
            Comprar más →
          </Link>
        </div>
      )}


      {/* Mobile PageList toggle — outside overflow-hidden to avoid stacking context issues */}
      {!codeViewSectionId && !showMobilePages && (
        <button
          type="button"
          onClick={() => setShowMobilePages(true)}
          className="md:hidden fixed bottom-20 left-4 z-[60] w-12 h-12 bg-white border-2 border-black rounded-xl shadow-[3px_3px_0_#000] flex items-center justify-center text-lg font-black hover:bg-gray-50 active:translate-x-[1px] active:translate-y-[1px] active:shadow-[1px_1px_0_#000] transition-all"
          title="Páginas"
        >
          ☰
        </button>
      )}

      {/* Main content */}
      <div className="flex flex-1 overflow-hidden relative">

        {/* Mobile PageList drawer */}
        {showMobilePages && !codeViewSectionId && (
          <>
            <div className="md:hidden fixed inset-0 bg-black/30 z-40" onClick={() => setShowMobilePages(false)} />
            <div className="md:hidden fixed inset-y-0 left-0 z-40 w-56 bg-white shadow-xl border-r-2 border-black">
              {renderPageList({ isMobile: true })}
            </div>
          </>
        )}

        {/* Section list sidebar (desktop) */}
        {!codeViewSectionId && (
          <div className="hidden md:flex">
            {renderPageList({ isMobile: false })}
          </div>
        )}

        {/* Context menu */}
        {contextMenu && (
          <>
            <div className="fixed inset-0 z-40" onClick={() => setContextMenu(null)} onContextMenu={(e) => { e.preventDefault(); setContextMenu(null); }} />
            <div
              onContextMenu={(e) => e.preventDefault()}
              className="fixed z-50 border-2 border-black rounded-xl bg-white shadow-[4px_4px_0_#000] py-1 min-w-[200px] overflow-hidden"
              style={{ left: contextMenu.x, top: contextMenu.y }}
            >
              {[
                {
                  label: contextMenu.sectionIds.length === 1
                    ? "Regenerar página"
                    : `Regenerar ${contextMenu.sectionIds.length} páginas`,
                  icon: <span className="text-brand-500 text-sm">&#10022;</span>,
                  disabled: !!variantLoadingId,
                  onClick: () => {
                    const id = contextMenu.sectionIds[0];
                    setContextMenu(null);
                    setRegenTargetId(id);
                    setShowAddPrompt(true);
                  },
                },
                {
                  label: contextMenu.sectionIds.length === 1
                    ? "Exportar página a PDF"
                    : `Exportar ${contextMenu.sectionIds.length} páginas a PDF`,
                  icon: (
                    <svg className="w-4 h-4 text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                    </svg>
                  ),
                  onClick: () => {
                    const ids = contextMenu.sectionIds;
                    setContextMenu(null);
                    handleExportPdf(ids);
                  },
                },
                {
                  label: contextMenu.sectionIds.length === 1
                    ? "Suprimir página"
                    : `Suprimir ${contextMenu.sectionIds.length} páginas`,
                  icon: (
                    <svg className="w-4 h-4 text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                    </svg>
                  ),
                  onClick: () => {
                    const ids = contextMenu.sectionIds;
                    setContextMenu(null);
                    const updated = sections
                      .filter((s) => !ids.includes(s.id))
                      .map((s, i) => ({ ...s, order: i }));
                    handleSectionsChange(updated);
                  },
                },
              ].map((item, i, arr) => (
                <span key={i}>
                  <button
                    onClick={item.onClick}
                    disabled={item.disabled}
                    className="w-full text-left px-4 py-2 text-sm font-bold flex items-center gap-2 hover:bg-gray-100 disabled:opacity-40"
                  >
                    {item.icon}
                    {item.label}
                  </button>
                  {i < arr.length - 1 && <div className="mx-2 border-t-2 border-black/10" />}
                </span>
              ))}
            </div>
          </>
        )}

        {/* Code editor */}
        {codeViewSectionId && (
          <div className="hidden md:block w-1/2 h-full border-r border-gray-700">
            <CodeEditor
              code={codeValue}
              label={
                sections.find((s) => s.id === codeViewSectionId)?.label || ""
              }
              scrollToText={codeScrollTarget}
              onSave={(newCode) => {
                const updated = sections.map((s) =>
                  s.id === codeViewSectionId ? { ...s, html: newCode } : s
                );
                handleSectionsChange(updated);
              }}
              onClose={() => setCodeViewSectionId(null)}
            />
          </div>
        )}

        {/* Editor area — iframe during generation, GrapesJS after */}
        <div className={`${codeViewSectionId ? "md:w-1/2" : ""} flex-1 h-full overflow-hidden relative`}>
          {isGenerating ? (
            <StreamingPreview ref={streamingRef} sections={sections} themeCssData={themeCssData} />
          ) : sections.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-24 h-full bg-gray-200">
              <p className="text-gray-400 text-sm">Sin p&aacute;ginas</p>
            </div>
          ) : (
            <Suspense fallback={<div className="flex items-center justify-center h-full w-full bg-black text-gray-400">Cargando editor...</div>}>
              <GrapesEditor
                ref={editorRef}
                initialHtml={sectionsToHtml(sections)}
                theme={currentTheme}
                customColors={currentCustomColors}
                brandKits={brandKits as any}
                hiddenTabs={["blocks", "layers"]}
                canvasStyles={documentCanvasCss}
                devices={false}
                panelSide="right"
                onChange={handleEditorChange}
                onAiAction={handleAiAction}
                onThemeChange={handleThemeChange}
              />
            </Suspense>
          )}
          {/* Status overlays */}
          {refiningSections.size > 0 && (
            <div className="absolute bottom-4 left-1/2 -translate-x-1/2 flex items-center gap-3 bg-white border-2 border-black rounded-xl px-4 py-2 shadow-[4px_4px_0_0_rgba(0,0,0,1)] z-20">
              <span className="block w-4 h-4 border-2 border-gray-200 border-t-brand-500 rounded-full animate-spin" />
              <span className="text-sm font-bold">Refinando{refiningSections.size > 1 ? ` (${refiningSections.size})` : ""}...</span>
              <button
                onClick={() => { for (const [, ctrl] of refineAbortMap.current) ctrl.abort(); refineAbortMap.current.clear(); }}
                className="text-xs font-bold text-red-500 hover:underline ml-1"
              >Detener</button>
            </div>
          )}
          {isAddingSection && (
            <div className="absolute bottom-4 left-1/2 -translate-x-1/2 flex items-center gap-3 bg-white border-2 border-black rounded-xl px-4 py-2 shadow-[4px_4px_0_0_rgba(0,0,0,1)] z-20">
              <span className="block w-4 h-4 border-2 border-gray-200 border-t-brand-500 rounded-full animate-spin" />
              <span className="text-sm font-bold">Generando página...</span>
              <button onClick={() => { addPageAbortRef.current?.abort(); setIsAddingSection(false); }} className="text-xs font-bold text-red-500 hover:underline ml-1">Detener</button>
            </div>
          )}
          {isGenerating && (
            <div className="absolute bottom-4 left-1/2 -translate-x-1/2 flex items-center gap-3 bg-white border-2 border-black rounded-xl px-4 py-2 shadow-[4px_4px_0_0_rgba(0,0,0,1)] z-20">
              <span className="block w-4 h-4 border-2 border-gray-200 border-t-brand-500 rounded-full animate-spin" />
              <span className="text-sm font-bold">Generando...</span>
              <button onClick={stopGeneration} className="text-xs font-bold text-red-500 hover:underline ml-1">Detener</button>
            </div>
          )}
          {/* Zoom controls */}
          {!isGenerating && sections.length > 0 && (
            <div className="absolute bottom-4 right-4 flex items-center gap-1 bg-white border-2 border-black rounded-xl px-2 py-1 shadow-[4px_4px_0_0_rgba(0,0,0,1)] z-30 select-none">
              <button onClick={zoomOut} className="w-7 h-7 flex items-center justify-center text-lg font-bold hover:bg-gray-100 rounded" title="Alejar">−</button>
              <button onClick={zoomFit} className="min-w-[3rem] text-center text-xs font-bold hover:bg-gray-100 rounded px-1 py-1" title="Ajustar">{zoomPct}%</button>
              <button onClick={zoomIn} className="w-7 h-7 flex items-center justify-center text-lg font-bold hover:bg-gray-100 rounded" title="Acercar">+</button>
            </div>
          )}
        </div>
      </div>

      {/* AI Refine modal */}
      {pendingAiAction && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-white rounded-2xl border-2 border-black shadow-[6px_6px_0_#000] p-6 w-full max-w-md mx-4">
            <h3 className="text-lg font-black mb-3">
              {pendingAiAction.isSection ? "Refinar página" : "Refinar elemento"}
            </h3>
            <p className="text-sm text-gray-500 mb-4">
              Describe qué cambios quieres hacer
            </p>
            <textarea
              value={aiRefinePrompt}
              onChange={(e) => setAiRefinePrompt(e.target.value)}
              placeholder="Ej: Hazlo más profesional, cambia los colores a tonos azules, agrega más espacio..."
              rows={3}
              className="w-full px-4 py-2 border-2 border-black rounded-xl resize-none focus:outline-none"
              autoFocus
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey && aiRefinePrompt.trim()) {
                  e.preventDefault();
                  const action = pendingAiAction;
                  const prompt = aiRefinePrompt.trim();
                  setPendingAiAction(null);
                  setAiRefinePrompt("");
                  handleRefineFromGrapes(action, prompt);
                }
                if (e.key === "Escape") {
                  setPendingAiAction(null);
                  setAiRefinePrompt("");
                }
              }}
            />
            <div className="flex gap-2 mt-4 justify-end">
              <BrutalButton
                size="chip"
                mode="ghost"
                onClick={() => { setPendingAiAction(null); setAiRefinePrompt(""); }}
              >
                Cancelar
              </BrutalButton>
              <BrutalButton
                size="chip"
                onClick={() => {
                  const action = pendingAiAction;
                  const prompt = aiRefinePrompt.trim() || "Mejora este elemento";
                  setPendingAiAction(null);
                  setAiRefinePrompt("");
                  handleRefineFromGrapes(action, prompt);
                }}
                isDisabled={refiningSections.size > 0}
              >
                Refinar
              </BrutalButton>
            </div>
          </div>
        </div>
      )}

      {/* Add pages modal */}
      {showAddPrompt && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-white rounded-2xl border-2 border-black shadow-[6px_6px_0_#000] p-6 w-full max-w-md mx-4">
            <h3 className="text-lg font-black mb-3">
              {regenTargetId ? "Regenerar página" : insertAtIndex !== null ? `Insertar página (posición ${insertAtIndex + 1})` : "Agregar páginas"}
            </h3>
            <p className="text-sm text-gray-500 mb-4">
              {regenTargetId
                ? "Describe los cambios o adjunta una imagen de referencia"
                : "Sube archivos, una imagen de referencia, o describe el contenido"}
            </p>

            {/* File upload */}
            <div className="mb-3">
              <div className="flex items-center gap-2 flex-wrap">
                <button
                  type="button"
                  onClick={() => addFileRef.current?.click()}
                  className="text-xs font-bold text-brand-600 border border-brand-300 px-3 py-1.5 rounded-lg hover:bg-brand-50 transition-colors"
                >
                  + Archivos
                </button>
                <button
                  type="button"
                  onClick={() => addImageRef.current?.click()}
                  className="text-xs font-bold text-gray-600 border border-gray-300 px-3 py-1.5 rounded-lg hover:bg-gray-50 transition-colors"
                >
                  Imagen referencia
                </button>
                <input
                  ref={addFileRef}
                  type="file"
                  accept=".txt,.md,.csv,.xlsx,.xls,.docx,.pdf"
                  multiple
                  className="hidden"
                  onChange={async (e) => {
                    const files = Array.from(e.target.files || []);
                    if (!files.length) return;
                    setIsParsingAdd(true);
                    const all = [...addFiles, ...files];
                    setAddFiles(all);
                    try {
                      const parsed = await parseFiles(all);
                      setAddParsedContent(combineContent(parsed));
                    } catch {}
                    setIsParsingAdd(false);
                    e.target.value = "";
                  }}
                />
                <input
                  ref={addImageRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (!file) return;
                    resizeImageToDataUrl(file, 1024).then(setAddRefImage);
                    e.target.value = "";
                  }}
                />
              </div>
              {/* File chips */}
              {(addFiles.length > 0 || addRefImage) && (
                <div className="flex flex-wrap gap-1.5 mt-2">
                  {addFiles.map((f, i) => (
                    <span key={i} className="inline-flex items-center gap-1 text-[11px] font-bold bg-gray-100 px-2 py-1 rounded-md">
                      {f.name}
                      <button
                        onClick={() => {
                          const updated = addFiles.filter((_, j) => j !== i);
                          setAddFiles(updated);
                          if (updated.length === 0) setAddParsedContent("");
                          else parseFiles(updated).then(p => setAddParsedContent(combineContent(p)));
                        }}
                        className="text-red-400 hover:text-red-600 ml-0.5"
                      >&times;</button>
                    </span>
                  ))}
                  {addRefImage && (
                    <span className="inline-flex items-center gap-1 text-[11px] font-bold bg-purple-50 text-purple-700 px-2 py-1 rounded-md">
                      <img src={addRefImage} alt="" className="w-4 h-4 object-cover rounded" />
                      Referencia
                      <button onClick={() => setAddRefImage(null)} className="text-red-400 hover:text-red-600 ml-0.5">&times;</button>
                    </span>
                  )}
                </div>
              )}
              {isParsingAdd && <p className="text-xs text-gray-400 mt-1">Leyendo archivos...</p>}
            </div>

            <textarea
              value={addPrompt}
              onChange={(e) => setAddPrompt(e.target.value)}
              placeholder="Ej: Página de resumen ejecutivo, Gráfica de ventas Q1, Tabla de precios..."
              rows={3}
              className="w-full px-4 py-2 border-2 border-black rounded-xl resize-none focus:outline-none"
              autoFocus
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  if (regenTargetId) {
                    const _id = regenTargetId, _p = addPrompt, _img = addRefImage;
                    setShowAddPrompt(false);
                    setRegenTargetId(null);
                    setAddPrompt("");
                    setAddRefImage(null);
                    handleGenerateVariant(_id, _p || undefined, _img || undefined);
                  } else {
                    handleAddPage();
                  }
                }
              }}
            />
            <div className="flex gap-2 mt-4 justify-end">
              <BrutalButton
                size="chip"
                mode="ghost"
                onClick={() => {
                  setShowAddPrompt(false);
                  setRegenTargetId(null);
                  setInsertAtIndex(null);
                  setAddPrompt("");
                  setAddFiles([]);
                  setAddRefImage(null);
                  setAddParsedContent("");
                }}
              >
                Cancelar
              </BrutalButton>
              {!regenTargetId && (
                <BrutalButton
                  size="chip"
                  mode="ghost"
                  onClick={() => {
                    setAddPrompt("");
                    setAddParsedContent("");
                    setAddRefImage(null);
                    setAddFiles([]);
                    handleAddPage();
                  }}
                  isDisabled={isAddingSection}
                >
                  En blanco
                </BrutalButton>
              )}
              <BrutalButton
                size="chip"
                onClick={() => {
                  if (regenTargetId) {
                    const _id = regenTargetId, _p = addPrompt, _img = addRefImage;
                    setShowAddPrompt(false);
                    setRegenTargetId(null);
                    setAddPrompt("");
                    setAddRefImage(null);
                    handleGenerateVariant(_id, _p || undefined, _img || undefined);
                  } else {
                    handleAddPage();
                  }
                }}
                isLoading={regenTargetId ? !!variantLoadingId : isAddingSection}
                isDisabled={regenTargetId
                  ? !!variantLoadingId
                  : (!addPrompt.trim() && !addParsedContent && !addRefImage) || isAddingSection}
              >
                {regenTargetId ? (addPrompt.trim() ? "Refinar" : "Variante") : "Generar"}
              </BrutalButton>
            </div>
          </div>
        </div>
      )}

      <ConfirmDialog
        isOpen={showDeleteConfirm}
        title="Eliminar documento"
        message="Esta acción no se puede deshacer."
        confirmLabel="Eliminar"
        onConfirm={() => {
          setShowDeleteConfirm(false);
          setActiveIntent("delete");
          deployFetcher.submit({ intent: "delete" }, { method: "post" });
        }}
        onCancel={() => setShowDeleteConfirm(false)}
        destructive
      />
    </article>
  );
}

