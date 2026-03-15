import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import {
  useLoaderData,
  useFetcher,
  useNavigate,
  Link,
  data,
} from "react-router";
import { BrutalButton } from "~/components/common/BrutalButton";
import { getUserOrRedirect } from "~/.server/getters";
import { db } from "~/.server/db";
import { getChapter, updateChapter } from "~/.server/core/bookOperations";
import { PageList, type Section3WithVersions } from "~/components/documents/PageList";
import { FloatingToolbar } from "~/components/landings3/FloatingToolbar";
import { CodeEditor } from "~/components/landings3/CodeEditor";
import { Canvas, type CanvasHandle } from "~/components/landings3/Canvas";
import type { Section3, IframeMessage } from "~/lib/landing3/types";
import {
  buildSingleThemeCss,
  buildCustomTheme,
  LANDING_THEMES,
  type CustomColors,
} from "@easybits.cloud/html-tailwind-generator";
import { useUndoStack } from "@easybits.cloud/html-tailwind-generator/components";
import { playTone, warmAudio } from "~/hooks/useNotificationSound";
import { checkAiGenerationLimit } from "~/.server/aiGenerationLimit";
import { normalizePlan } from "~/lib/plans";
import toast from "react-hot-toast";
import type { Route } from "./+types/book-chapter";

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

function errorToast(msg: string) {
  toast.error(msg, {
    style: { border: "2px solid #000", padding: "16px", color: "#000", fontWeight: 600 },
    duration: 5000,
  });
}

export const meta = () => [
  { title: "Editor de Capítulo — EasyBits" },
  { name: "robots", content: "noindex" },
];

export const loader = async ({ params, request }: Route.LoaderArgs) => {
  const user = await getUserOrRedirect(request);
  const chapter = await getChapter(params.chapterId, user.id);
  if (!chapter) throw new Response("Not found", { status: 404 });
  const book = chapter.book;
  const asset = book.asset;
  const allChapters = await db.bookChapter.findMany({
    where: { bookId: book.id },
    orderBy: { order: "asc" },
    select: { id: true, title: true, order: true },
  });
  const userMeta = (user.metadata as Record<string, unknown>) || {};
  const userPlan = normalizePlan(userMeta.plan as string);
  const genLimit = await checkAiGenerationLimit(user.id, userPlan);
  return {
    chapter,
    book,
    asset,
    allChapters,
    aiGenUsed: genLimit.used,
    aiGenLimit: genLimit.limit,
    aiGenBonus: genLimit.bonus,
  };
};

export const action = async ({ params, request }: Route.ActionArgs) => {
  const user = await getUserOrRedirect(request);
  const chapter = await getChapter(params.chapterId, user.id);
  if (!chapter) return data({ error: "No encontrado" }, { status: 404 });

  const formData = await request.formData();
  const intent = formData.get("intent");

  if (intent === "update-sections") {
    const sections = JSON.parse(String(formData.get("sections") || "[]"));
    const sectionVersionsRaw = formData.get("sectionVersions");
    const updateData: { sections: any; sectionVersions?: any; status?: string } = { sections };
    if (sectionVersionsRaw) {
      updateData.sectionVersions = JSON.parse(String(sectionVersionsRaw));
    }
    // Mark as translated if sections exist
    if (sections.length > 0 && chapter.status === "draft") {
      updateData.status = "translated";
    }
    await updateChapter(params.chapterId, user.id, updateData);
    return data({ ok: true });
  }

  if (intent === "update-theme") {
    const { updateBook } = await import("~/.server/core/bookOperations");
    const newTheme = String(formData.get("theme") || "minimal");
    await updateBook(chapter.book.assetId, user.id, { theme: newTheme });
    return data({ ok: true });
  }

  if (intent === "update-custom-colors") {
    const { updateBook } = await import("~/.server/core/bookOperations");
    const raw = String(formData.get("customColors") || "{}");
    try {
      const customColors = JSON.parse(raw);
      await updateBook(chapter.book.assetId, user.id, {
        theme: "custom",
        customColors,
      });
    } catch {}
    return data({ ok: true });
  }

  return data({ error: "Intent desconocido" }, { status: 400 });
};

export default function BookChapter() {
  const {
    chapter,
    book,
    asset,
    allChapters,
    aiGenUsed: initialAiGenUsed,
    aiGenLimit,
    aiGenBonus,
  } = useLoaderData<typeof loader>();
  const [aiGenUsed, setAiGenUsed] = useState(initialAiGenUsed);
  const navigate = useNavigate();
  const saveFetcher = useFetcher();

  const [selectedSectionIds, setSelectedSectionIds] = useState<string[]>([]);
  const [sections, _setSections] = useState<Section3[]>(() => {
    const raw = chapter.sections;
    const base = Array.isArray(raw) ? (raw as unknown as Section3[]) : [];
    const savedVersions = chapter.sectionVersions as Record<string, any> | null;
    if (savedVersions && typeof savedVersions === "object") {
      return base.map((s) => {
        const v = savedVersions[s.id];
        return v ? { ...s, versions: v } : s;
      });
    }
    return base;
  });
  const sectionsRef = useRef(sections);
  const setSections = useCallback(
    (updater: Section3[] | ((prev: Section3[]) => Section3[])) => {
      _setSections((prev) => {
        const next = typeof updater === "function" ? updater(prev) : updater;
        sectionsRef.current = next;
        return next;
      });
    },
    []
  );

  const [isGenerating, setIsGenerating] = useState(false);
  const [showMobilePages, setShowMobilePages] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  const canvasRef = useRef<CanvasHandle>(null);
  const iframeRectRef = useRef<DOMRect | null>(null);

  // Selection state for FloatingToolbar
  const [selection, setSelection] = useState<IframeMessage | null>(null);
  const [refiningSections, setRefiningSections] = useState<Set<string>>(new Set());
  const [variantLoadingId, setVariantLoadingId] = useState<string | null>(null);
  const [, setToolbarTick] = useState(0);

  // Code view
  const [codeViewSectionId, setCodeViewSectionId] = useState<string | null>(null);
  const [codeValue, setCodeValue] = useState("");
  const [codeScrollTarget, setCodeScrollTarget] = useState<string | undefined>();

  // Zoom state
  const ZOOM_LEVELS = [25, 50, 75, 100, 125, 150, 200];
  const [zoomPct, setZoomPct] = useState(100);
  const zoomIn = useCallback(
    () =>
      setZoomPct((z) => {
        const idx = ZOOM_LEVELS.indexOf(z);
        return idx >= 0 ? ZOOM_LEVELS[Math.min(idx + 1, ZOOM_LEVELS.length - 1)] : z;
      }),
    []
  );
  const zoomOut = useCallback(
    () =>
      setZoomPct((z) => {
        const idx = ZOOM_LEVELS.indexOf(z);
        return idx >= 0 ? ZOOM_LEVELS[Math.max(idx - 1, 0)] : z;
      }),
    []
  );
  const zoomFit = () => setZoomPct(75);

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

  // Book-specific CSS: 6x9 trade paperback
  const zoomFactor = zoomPct / 100;
  const documentCss = `
    body { padding: 24px; background: #d1d5db; display: flex; flex-direction: column; align-items: center; gap: 24px; zoom: ${zoomFactor}; }
    [data-section-id] { width: 6in; min-height: 9in; background: white; box-shadow: 0 2px 8px rgba(0,0,0,0.15); cursor: pointer; }
    [data-section-id]:hover { box-shadow: 0 4px 16px rgba(0,0,0,0.2); }
    @media (max-width: 650px) {
      body { padding: 8px; gap: 12px; }
      [data-section-id] { zoom: calc((100vw - 16px) / 6in); }
    }
  `;

  // Undo/Redo
  const { pushUndo, undo, redo } = useUndoStack<Section3[]>();

  // Theme
  const [theme, setTheme] = useState<string>(book.theme || "minimal");
  const [customColors, setCustomColors] = useState<CustomColors>(
    () => (book.customColors as unknown as CustomColors) || { primary: "#6366f1" }
  );
  const themeCssData = useMemo(() => {
    if (theme === "custom") {
      const t = buildCustomTheme(customColors);
      const css = `:root {\n${Object.entries(t.colors)
        .map(([k, v]) => `  --color-${k}: ${v};`)
        .join("\n")}\n}`;
      const { tailwindConfig } = buildSingleThemeCss("minimal");
      return { css, tailwindConfig };
    }
    return buildSingleThemeCss(theme);
  }, [theme, customColors]);

  const resolvedThemeColors = useMemo(() => {
    if (theme === "custom") {
      const base = LANDING_THEMES.find((t) => t.id === "minimal")!.colors;
      return {
        ...base,
        ...Object.fromEntries(Object.entries(customColors).filter(([, v]) => v)),
      } as typeof base;
    }
    return LANDING_THEMES.find((t) => t.id === theme)?.colors ?? LANDING_THEMES[0].colors;
  }, [theme, customColors]);

  // Inject CSS into Canvas iframe
  useEffect(() => {
    if (theme === "custom") {
      const t = buildCustomTheme(customColors);
      const themeCss = `:root {\n${Object.entries(t.colors)
        .map(([k, v]) => `  --color-${k}: ${v};`)
        .join("\n")}\n}`;
      canvasRef.current?.postMessage({
        action: "set-custom-css",
        css: documentCss + "\n" + themeCss,
      });
    } else {
      canvasRef.current?.postMessage({ action: "set-custom-css", css: documentCss });
    }
  }, [theme, customColors, documentCss]);

  // ESC to close things
  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        if (codeViewSectionId) setCodeViewSectionId(null);
        else if (selection) setSelection(null);
      }
    }
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [codeViewSectionId, selection]);

  // Warm audio
  useEffect(() => {
    warmAudio();
  }, []);

  // Save helpers
  const saveTimeoutRef = useRef<ReturnType<typeof setTimeout>>(undefined);
  const saveSections = useCallback((s: Section3[]) => {
    clearTimeout(saveTimeoutRef.current);
    saveTimeoutRef.current = setTimeout(() => {
      const clean = s.map(({ versions, ...rest }: any) => rest);
      const versionMap: Record<string, { html: string; timestamp: number }[]> = {};
      for (const sec of s as any[]) {
        if (sec.versions?.length) {
          versionMap[sec.id] = sec.versions.slice(-10);
        }
      }
      saveFetcher.submit(
        {
          intent: "update-sections",
          sections: JSON.stringify(clean),
          sectionVersions: JSON.stringify(versionMap),
        },
        { method: "post" }
      );
    }, 300);
  }, []);

  // Undo/Redo keydown
  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      const mod = e.metaKey || e.ctrlKey;
      if (!mod) return;
      const key = e.key.toLowerCase();
      const isUndo = key === "z" && !e.shiftKey;
      const isRedo = (key === "z" && e.shiftKey) || key === "y";
      if (!isUndo && !isRedo) return;
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA") return;
      e.preventDefault();
      if (isRedo) {
        const next = redo(sectionsRef.current);
        if (next) {
          setSections(next);
          saveSections(next);
          canvasRef.current?.postMessage({ action: "reload-sections" });
        }
      } else {
        const prev = undo(sectionsRef.current);
        if (prev) {
          setSections(prev);
          saveSections(prev);
          canvasRef.current?.postMessage({ action: "reload-sections" });
        }
      }
    }
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [undo, redo, saveSections, setSections]);

  const handleSectionsChange = useCallback(
    (newSections: Section3[]) => {
      pushUndo(sectionsRef.current);
      setSections(newSections);
      saveSections(newSections);
      setTimeout(
        () => canvasRef.current?.postMessage({ action: "reload-sections" }),
        50
      );
    },
    [saveSections, pushUndo, setSections]
  );

  const handleIframeMessage = useCallback(
    (msg: IframeMessage) => {
      if (msg.type === "element-selected") {
        setSelection(msg);
        setToolbarTick((t) => t + 1);
      } else if (msg.type === "element-deselected") {
        setSelection(null);
      } else if (
        (msg.type === "text-edited" || msg.type === "section-html-updated") &&
        msg.sectionId &&
        msg.sectionHtml
      ) {
        pushUndo(sectionsRef.current);
        const newHtml = msg.sectionHtml!;
        setSections((prev) => {
          const updated = prev.map((s) =>
            s.id === msg.sectionId ? { ...s, html: newHtml } : s
          );
          saveSections(updated);
          return updated;
        });
      } else if (msg.type === "undo") {
        const prev = undo(sectionsRef.current);
        if (prev) {
          setSections(prev);
          saveSections(prev);
          canvasRef.current?.postMessage({ action: "reload-sections" });
        }
      } else if (msg.type === "redo") {
        const next = redo(sectionsRef.current);
        if (next) {
          setSections(next);
          saveSections(next);
          canvasRef.current?.postMessage({ action: "reload-sections" });
        }
      }
    },
    [saveSections, pushUndo, setSections, undo, redo]
  );

  const refineAbortMap = useRef<Map<string, AbortController>>(new Map());
  const variantAbortRef = useRef<AbortController | null>(null);

  async function handleRefine(instruction: string, referenceImage?: string) {
    if (!selection?.sectionId) return;
    const refineId = selection.sectionId;
    const isElementScoped = !!(
      selection &&
      !selection.isSectionRoot &&
      selection.openTag &&
      selection.elementPath
    );
    pushUndo(sectionsRef.current);
    setRefiningSections((prev) => new Set(prev).add(refineId));
    const abortController = new AbortController();
    refineAbortMap.current.set(refineId, abortController);
    if (isElementScoped) {
      canvasRef.current?.postMessage({
        action: "element-loading",
        sectionId: refineId,
        elementPath: selection.elementPath,
      });
    }
    try {
      const section = sections.find((s) => s.id === selection.sectionId);
      if (!section) return;
      const sectionId = selection.sectionId;

      setSections((prev) =>
        prev.map((s) => {
          if (s.id !== sectionId) return s;
          const sv = s as Section3WithVersions;
          const versions = [
            ...(sv.versions || []),
            { html: s.html, timestamp: Date.now() },
          ].slice(-10);
          return { ...s, versions } as any;
        })
      );

      const res = await fetch("/api/v2/document-refine", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: abortController.signal,
        body: JSON.stringify({
          landingId: `book-chapter-${chapter.id}`,
          sectionId,
          instruction,
          currentHtml: section.html,
          allSections: sections.map((s) => ({ id: s.id, label: s.label, html: s.html })),
          ...(referenceImage && { referenceImage }),
          ...(selection &&
            !selection.isSectionRoot &&
            selection.openTag && {
              openTag: selection.openTag,
              elementText: selection.text,
            }),
        }),
      });
      if (!res.ok) {
        const errBody = await res.json().catch(() => ({}));
        if (errBody.upgradeUrl) {
          showLimitToast(errBody.error, errBody.upgradeUrl);
          return;
        }
        throw new Error(errBody.error || "Error al refinar");
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
              if (event === "error")
                throw new Error(d.message || "Error en generación");
              if ((event === "chunk" || event === "done") && d.html) {
                if (isElementScoped) {
                  canvasRef.current?.postMessage({ action: "element-loading-clear" });
                }
                setSections((prev) =>
                  prev.map((s) => (s.id === sectionId ? { ...s, html: d.html } : s))
                );
                if (event === "done") setSelection(null);
              }
            } catch {}
          }
        }
      }
      saveSections(sectionsRef.current);
      canvasRef.current?.scrollToSection(sectionId);
    } catch (err) {
      if ((err as Error).name === "AbortError") return;
      console.error("Refine error:", err);
      errorToast((err as Error).message || "Error al refinar");
    } finally {
      refineAbortMap.current.delete(refineId);
      canvasRef.current?.postMessage({ action: "element-loading-clear" });
      setRefiningSections((prev) => {
        const next = new Set(prev);
        next.delete(refineId);
        return next;
      });
    }
  }

  function stopVariant() {
    variantAbortRef.current?.abort();
    variantAbortRef.current = null;
    setVariantLoadingId(null);
  }

  async function handleGenerateVariant(
    sectionId: string,
    instruction?: string,
    referenceImage?: string
  ) {
    const section = sections.find((s) => s.id === sectionId);
    if (!section) return;
    if (variantAbortRef.current) {
      variantAbortRef.current.abort();
      variantAbortRef.current = null;
    }
    setVariantLoadingId(sectionId);
    const abortController = new AbortController();
    variantAbortRef.current = abortController;
    try {
      canvasRef.current?.postMessage({ action: "exit-preview", sectionId });
      const currentHtml = section.html;
      setSections((prev) =>
        prev.map((s) => {
          if (s.id !== sectionId) return s;
          const sv = s as Section3WithVersions;
          const versions = [
            ...(sv.versions || []),
            { html: currentHtml, timestamp: Date.now() },
          ].slice(-10);
          return { ...s, html: currentHtml, versions } as any;
        })
      );

      const res = await fetch("/api/v2/document-refine", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: abortController.signal,
        body: JSON.stringify({
          landingId: `book-chapter-${chapter.id}`,
          sectionId,
          instruction: instruction || "VARIANT_MODE",
          currentHtml,
          ...(referenceImage ? { referenceImage } : {}),
          allSections: sections.map((s) => ({
            id: s.id,
            label: s.label,
            html: s.html,
          })),
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
              if (event === "error")
                throw new Error(d.message || "Error en generación");
              if ((event === "chunk" || event === "done") && d.html) {
                setSections((prev) =>
                  prev.map((s) => (s.id === sectionId ? { ...s, html: d.html } : s))
                );
              }
            } catch {}
          }
        }
      }
      playTone();
      canvasRef.current?.scrollToSection(sectionId);
      saveSections(sectionsRef.current);
    } catch (err) {
      if ((err as Error).name === "AbortError") return;
      console.error("Variant error:", err);
      errorToast((err as Error).message || "Error al generar variante");
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
    const sorted = [...sections].sort((a, b) => a.order - b.order);
    const [moved] = sorted.splice(fromIndex, 1);
    sorted.splice(toIndex, 0, moved);
    const reordered = sorted.map((s, i) => ({ ...s, order: i }));
    handleSectionsChange(reordered);
    const newOrder = sorted.map((s) => s.id);
    setTimeout(
      () => canvasRef.current?.postMessage({ action: "reorder-sections", order: newOrder }),
      100
    );
  }

  function handleChangeTag(
    sectionId: string,
    elementPath: string,
    newTag: string
  ) {
    pushUndo(sectionsRef.current);
    canvasRef.current?.postMessage({
      action: "change-tag",
      sectionId,
      elementPath,
      newTag,
    });
  }

  function handleUpdateAttribute(
    sectionId: string,
    elementPath: string,
    attr: string,
    value: string
  ) {
    canvasRef.current?.postMessage({
      action: "update-attribute",
      sectionId,
      elementPath,
      tagName: selection?.tagName || "*",
      attr,
      value,
    });
  }

  function handleDeleteElement(
    sectionId: string,
    elementPath: string
  ) {
    pushUndo(sectionsRef.current);
    canvasRef.current?.postMessage({
      action: "delete-element",
      sectionId,
      elementPath,
    });
    setSelection(null);
  }

  function handleReplaceClass(
    sectionId: string,
    elementPath: string,
    removePrefixes: string[],
    addClass: string
  ) {
    pushUndo(sectionsRef.current);
    canvasRef.current?.postMessage({
      action: "replace-class",
      sectionId,
      elementPath,
      removePrefixes,
      addClass,
    });
  }

  function handleDeleteSection() {
    if (!selection?.sectionId) return;
    const updated = sections
      .filter((s) => s.id !== selection.sectionId)
      .map((s, i) => ({ ...s, order: i }));
    handleSectionsChange(updated);
    setSelection(null);
  }

  function handleOpenCode(sectionId: string) {
    const section = sections.find((s) => s.id === sectionId);
    if (!section) return;
    const target =
      selection?.openTag || selection?.text?.substring(0, 40) || undefined;
    if (codeViewSectionId === sectionId) {
      setCodeScrollTarget(undefined);
      requestAnimationFrame(() => setCodeScrollTarget(target));
    } else {
      setCodeScrollTarget(target);
      setCodeViewSectionId(sectionId);
    }
    setCodeValue(section.html);
    setSelection(null);
  }

  function handleThemeChange(newTheme: string) {
    setTheme(newTheme);
    saveFetcher.submit(
      { intent: "update-theme", theme: newTheme },
      { method: "post" }
    );
  }

  function handleCustomColorChange(partial: Partial<CustomColors>) {
    const merged = { ...customColors, ...partial };
    setCustomColors(merged);
    setTheme("custom");
    saveFetcher.submit(
      { intent: "update-custom-colors", customColors: JSON.stringify(merged) },
      { method: "post" }
    );
  }

  // Translation streaming
  async function translateChapter() {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setIsGenerating(true);
    const accumulated: Section3[] = [];

    try {
      if (aiGenLimit !== null && aiGenUsed >= aiGenLimit && aiGenBonus <= 0) {
        showLimitToast(
          `Has usado todas tus ${aiGenLimit} generaciones de este mes.`,
          "/dash/packs"
        );
        setIsGenerating(false);
        return;
      }

      const res = await fetch("/api/v2/book-generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chapterId: chapter.id,
          bookId: book.id,
          sourceText: chapter.sourceText,
          targetLanguage: book.targetLanguage,
          theme,
        }),
        signal: controller.signal,
      });

      if (!res.ok) {
        const errBody = await res.json().catch(() => ({}));
        if (errBody.upgradeUrl) {
          showLimitToast(errBody.error, errBody.upgradeUrl);
          return;
        }
        throw new Error(errBody.error || "Error al traducir capítulo");
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
              if (eventType === "section") {
                accumulated.push(d);
                setSections([...accumulated]);
              } else if (eventType === "section-update") {
                const idx = accumulated.findIndex((s) => s.id === d.id);
                if (idx !== -1) accumulated[idx] = { ...accumulated[idx], html: d.html };
                setSections([...accumulated]);
              } else if (eventType === "done") {
                playTone();
              } else if (eventType === "error") {
                errorToast(d.message || "Error en la traducción");
              }
            } catch {}
          }
        }
      }

      setSections([...accumulated]);
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") return;
      console.error("Translation error:", err);
      errorToast((err as Error).message || "Error al traducir capítulo");
      if (accumulated.length > 0) setSections([...accumulated]);
    } finally {
      if (abortRef.current === controller) setIsGenerating(false);
    }
  }

  function stopGeneration() {
    abortRef.current?.abort();
    setIsGenerating(false);
  }

  // Prev/next chapter navigation
  const currentChapterIdx = allChapters.findIndex((c: any) => c.id === chapter.id);
  const prevChapter = currentChapterIdx > 0 ? allChapters[currentChapterIdx - 1] : null;
  const nextChapter =
    currentChapterIdx < allChapters.length - 1
      ? allChapters[currentChapterIdx + 1]
      : null;

  // PageList shared props
  const pageListProps = {
    sections,
    selectedSectionIds,
    onSelect: (id: string, multi: boolean) => {
      setSelectedSectionIds((prev: string[]) =>
        multi
          ? prev.includes(id)
            ? prev.filter((x: string) => x !== id)
            : [...prev, id]
          : [id]
      );
      canvasRef.current?.scrollToSection(id);
    },
    onOpenCode: (id: string) => handleOpenCode(id),
    onReorder: handleReorder,
    onDelete: (id: string) => {
      const updated = sections
        .filter((s) => s.id !== id)
        .map((s, i) => ({ ...s, order: i }));
      handleSectionsChange(updated);
    },
    onRename: (id: string, label: string) => {
      const updated = sections.map((s) =>
        s.id === id ? { ...s, label } : s
      );
      handleSectionsChange(updated);
    },
    onAdd: () => {
      const newId = Math.random().toString(36).slice(2, 10);
      const newSection: Section3 = {
        id: newId,
        order: sections.length,
        html: "<section></section>",
        label: `Página ${sections.length + 1}`,
      };
      handleSectionsChange([...sections, newSection]);
    },
    theme,
    onThemeChange: handleThemeChange,
    customColors,
    onCustomColorChange: handleCustomColorChange,
    themeCssData,
    onGenerateVariant: handleGenerateVariant,
    onStopVariant: stopVariant,
    loadingVariantId: variantLoadingId,
    refiningIds: refiningSections,
    onRestoreVersion: (sectionId: string, oldHtml: string) => {
      canvasRef.current?.postMessage({ action: "exit-preview", sectionId });
      const updated = sections.map((s) => {
        if (s.id !== sectionId) return s;
        const sv = s as Section3WithVersions;
        const versions = [
          ...(sv.versions || []),
          { html: s.html, timestamp: Date.now() },
        ].slice(-10);
        return { ...s, html: oldHtml, versions } as any;
      });
      handleSectionsChange(updated);
    },
    onNavigateVersion: (sectionId: string, html: string) => {
      canvasRef.current?.postMessage({ action: "preview-version", sectionId, html });
    },
    onExitPreview: (sectionId: string) => {
      canvasRef.current?.postMessage({ action: "exit-preview", sectionId });
    },
  };

  return (
    <article className="pt-14 pb-0 md:pl-28 w-full h-screen flex flex-col overflow-hidden">
      {/* Top bar */}
      <div className="flex items-center justify-between gap-2 sm:gap-4 px-2 sm:px-4 py-2 shrink-0 border-b border-gray-200 bg-white">
        <div className="flex items-center gap-2 sm:gap-3 min-w-0">
          <Link
            to={`/dash/assets/${asset.id}/book-editor`}
            className="text-sm font-bold hover:underline shrink-0"
          >
            &larr;
          </Link>
          <h1 className="text-sm sm:text-lg font-black truncate">
            {chapter.title}
          </h1>
          <span className="hidden sm:inline text-xs text-gray-400">
            Cap. {currentChapterIdx + 1} de {allChapters.length}
          </span>
          {aiGenLimit !== null &&
            (() => {
              const monthlyRemaining = Math.max(0, aiGenLimit - aiGenUsed);
              const totalRemaining = monthlyRemaining + aiGenBonus;
              const color =
                totalRemaining <= 0
                  ? "text-red-500"
                  : totalRemaining <= 2
                    ? "text-yellow-600"
                    : "text-gray-400";
              return (
                <span className={`hidden sm:inline text-xs font-bold ${color}`}>
                  {totalRemaining} gen.
                </span>
              );
            })()}
        </div>

        <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
          {/* Prev/Next chapter */}
          {prevChapter && (
            <Link
              to={`/dash/assets/${asset.id}/book-editor/${(prevChapter as any).id}`}
              className="text-xs font-bold px-2 py-1 rounded-lg border border-gray-300 hover:bg-gray-50 transition-colors"
              title={(prevChapter as any).title}
            >
              &larr; Anterior
            </Link>
          )}
          {nextChapter && (
            <Link
              to={`/dash/assets/${asset.id}/book-editor/${(nextChapter as any).id}`}
              className="text-xs font-bold px-2 py-1 rounded-lg border border-gray-300 hover:bg-gray-50 transition-colors"
              title={(nextChapter as any).title}
            >
              Siguiente &rarr;
            </Link>
          )}

          {/* Translate button */}
          <BrutalButton
            size="chip"
            onClick={translateChapter}
            isLoading={isGenerating}
            isDisabled={isGenerating || !chapter.sourceText}
          >
            Traducir capítulo
          </BrutalButton>
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

      {/* Mobile PageList toggle */}
      {!codeViewSectionId && !showMobilePages && (
        <button
          type="button"
          onClick={() => setShowMobilePages(true)}
          className="md:hidden fixed bottom-20 left-4 z-[60] w-12 h-12 bg-white border-2 border-black rounded-xl shadow-[3px_3px_0_#000] flex items-center justify-center text-lg font-black hover:bg-gray-50 active:translate-x-[1px] active:translate-y-[1px] active:shadow-[1px_1px_0_#000] transition-all"
          title="Páginas"
        >
          &#9776;
        </button>
      )}

      {/* Main content */}
      <div className="flex flex-1 overflow-hidden relative">
        {/* Mobile PageList drawer */}
        {showMobilePages && !codeViewSectionId && (
          <>
            <div
              className="md:hidden fixed inset-0 bg-black/30 z-40"
              onClick={() => setShowMobilePages(false)}
            />
            <div className="md:hidden fixed inset-y-0 left-0 z-40 w-56 bg-white shadow-xl border-r-2 border-black">
              <PageList
                {...pageListProps}
                onSelect={(id: string, multi: boolean) => {
                  pageListProps.onSelect(id, multi);
                  setShowMobilePages(false);
                }}
              />
            </div>
          </>
        )}

        {/* Section list sidebar (desktop) */}
        {!codeViewSectionId && (
          <div className="hidden md:flex">
            <PageList {...pageListProps} />
          </div>
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

        {/* Canvas */}
        <div
          className={`${codeViewSectionId ? "md:w-1/2" : ""} flex-1 overflow-auto relative flex flex-col`}
        >
          <div className="flex-1 overflow-auto relative flex justify-center bg-gray-200">
            <div className="transition-all duration-300 h-full w-full">
              {sections.length === 0 && !isGenerating ? (
                <div className="flex flex-col items-center justify-center py-24">
                  <p className="text-gray-400 text-sm mb-2">
                    Sin páginas aún
                  </p>
                  {chapter.sourceText && (
                    <BrutalButton size="chip" onClick={translateChapter}>
                      Traducir capítulo
                    </BrutalButton>
                  )}
                </div>
              ) : (
                <>
                  <Canvas
                    ref={canvasRef}
                    sections={sections}
                    theme={theme}
                    onMessage={handleIframeMessage}
                    iframeRectRef={iframeRectRef}
                    onReady={() => {
                      if (theme === "custom") {
                        const t = buildCustomTheme(customColors);
                        const themeCss = `:root {\n${Object.entries(t.colors)
                          .map(([k, v]) => `  --color-${k}: ${v};`)
                          .join("\n")}\n}`;
                        canvasRef.current?.postMessage({
                          action: "set-custom-css",
                          css: documentCss + "\n" + themeCss,
                        });
                      } else {
                        canvasRef.current?.postMessage({
                          action: "set-custom-css",
                          css: documentCss,
                        });
                      }
                    }}
                  />
                  {refiningSections.size > 0 && (
                    <div className="absolute bottom-4 left-1/2 -translate-x-1/2 flex items-center gap-3 bg-white border-2 border-black rounded-xl px-4 py-2 shadow-[4px_4px_0_0_rgba(0,0,0,1)] z-20">
                      <span className="block w-4 h-4 border-2 border-gray-200 border-t-brand-500 rounded-full animate-spin" />
                      <span className="text-sm font-bold">
                        Refinando
                        {refiningSections.size > 1
                          ? ` (${refiningSections.size})`
                          : ""}
                        ...
                      </span>
                      <button
                        onClick={() => {
                          for (const [, ctrl] of refineAbortMap.current)
                            ctrl.abort();
                          refineAbortMap.current.clear();
                        }}
                        className="text-xs font-bold text-red-500 hover:underline ml-1"
                      >
                        Detener
                      </button>
                    </div>
                  )}
                  {isGenerating && (
                    <div className="absolute bottom-4 left-1/2 -translate-x-1/2 flex items-center gap-3 bg-white border-2 border-black rounded-xl px-4 py-2 shadow-[4px_4px_0_0_rgba(0,0,0,1)] z-20">
                      <span className="block w-4 h-4 border-2 border-gray-200 border-t-brand-500 rounded-full animate-spin" />
                      <span className="text-sm font-bold">
                        Traduciendo...
                      </span>
                      <button
                        onClick={stopGeneration}
                        className="text-xs font-bold text-red-500 hover:underline ml-1"
                      >
                        Detener
                      </button>
                    </div>
                  )}
                </>
              )}
            </div>
          </div>
          {/* Zoom controls */}
          <div className="absolute bottom-4 right-4 flex items-center gap-1 bg-white border-2 border-black rounded-xl px-2 py-1 shadow-[4px_4px_0_0_rgba(0,0,0,1)] z-30 select-none">
            <button
              onClick={zoomOut}
              className="w-7 h-7 flex items-center justify-center text-lg font-bold hover:bg-gray-100 rounded"
              title="Alejar"
            >
              −
            </button>
            <button
              onClick={zoomFit}
              className="min-w-[3rem] text-center text-xs font-bold hover:bg-gray-100 rounded px-1 py-1"
              title="Ajustar"
            >
              {zoomPct}%
            </button>
            <button
              onClick={zoomIn}
              className="w-7 h-7 flex items-center justify-center text-lg font-bold hover:bg-gray-100 rounded"
              title="Acercar"
            >
              +
            </button>
          </div>
        </div>

        {/* Floating toolbar */}
        {!(selection?.sectionId && refiningSections.has(selection.sectionId)) && (
          <FloatingToolbar
            selection={selection}
            iframeRect={iframeRectRef.current}
            onRefine={handleRefine}
            onMoveUp={() => {}}
            onMoveDown={() => {}}
            onDelete={handleDeleteSection}
            onClose={() => setSelection(null)}
            onViewCode={() => {
              if (selection?.sectionId) handleOpenCode(selection.sectionId);
            }}
            onUpdateAttribute={handleUpdateAttribute}
            onChangeTag={handleChangeTag}
            onReplaceClass={handleReplaceClass}
            onDeleteElement={handleDeleteElement}
            isRefining={refiningSections.size > 0}
            hideStylePresets
            themeColors={resolvedThemeColors}
          />
        )}
      </div>
    </article>
  );
}
