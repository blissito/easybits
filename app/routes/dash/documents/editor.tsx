import { useState, useEffect, useCallback, useRef, useMemo } from "react";
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
import { FloatingToolbar } from "~/components/landings3/FloatingToolbar";
import { CodeEditor } from "~/components/landings3/CodeEditor";
import { Canvas, type CanvasHandle } from "~/components/landings3/Canvas";
import type { Section3, IframeMessage } from "~/lib/landing3/types";
import { buildSingleThemeCss, buildCustomTheme, LANDING_THEMES, type CustomColors } from "@easybits.cloud/html-tailwind-generator";
import { useUndoStack } from "@easybits.cloud/html-tailwind-generator/components";
import { parseFiles, combineContent, MAX_FILE_SIZE } from "~/lib/documents/parseFiles";
import { playTone, warmAudio } from "~/hooks/useNotificationSound";
import { PLANS, normalizePlan } from "~/lib/plans";
import { checkAiGenerationLimit } from "~/.server/aiGenerationLimit";
import toast from "react-hot-toast";
import type { Route } from "./+types/editor";


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

  return { landing, websiteUrl, sourceContent, logoUrl, direction, aiGenUsed, aiGenLimit, aiGenBonus, userPlan, sectionVersions };
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
    const existing = (landing.metadata as Record<string, unknown>) || {};
    await db.landing.update({
      where: { id: params.id },
      data: { metadata: { ...existing, theme: newTheme } },
    });
    return { ok: true };
  }

  if (intent === "update-custom-colors") {
    const raw = String(formData.get("customColors") || "{}");
    const existing = (landing.metadata as Record<string, unknown>) || {};
    try {
      const customColors = JSON.parse(raw);
      await db.landing.update({
        where: { id: params.id },
        data: { metadata: { ...existing, theme: "custom", customColors } },
      });
    } catch {}
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

  return { error: "Intent desconocido" };
};

export default function DocumentEditor() {
  const {
    landing, websiteUrl, sourceContent, logoUrl, direction,
    aiGenUsed: initialAiGenUsed, aiGenLimit, aiGenBonus, userPlan,
    sectionVersions: savedVersions,
  } = useLoaderData<typeof loader>();
  const [aiGenUsed, setAiGenUsed] = useState(initialAiGenUsed);
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const saveFetcher = useFetcher();
  const deployFetcher = useFetcher<{
    url?: string;
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
  const [overflowOpen, setOverflowOpen] = useState(false);
  const overflowRef = useRef<HTMLDivElement>(null);
  const streamEndRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  // Selection state for FloatingToolbar
  const [selection, setSelection] = useState<IframeMessage | null>(null);
  const [isRefining, setIsRefining] = useState(false);
  const [variantLoadingId, setVariantLoadingId] = useState<string | null>(null);
  const [regenTargetId, setRegenTargetId] = useState<string | null>(null);
  const iframeRectRef = useRef<DOMRect | null>(null);
  const canvasRef = useRef<CanvasHandle>(null);
  const [, setToolbarTick] = useState(0);

  // Add page prompt modal
  const [showAddPrompt, setShowAddPrompt] = useState(false);
  const [addPrompt, setAddPrompt] = useState("");
  const [isAddingSection, setIsAddingSection] = useState(false);

  // Undo/Redo
  const { pushUndo, undo, redo, canUndo, canRedo } = useUndoStack<Section3[]>();
  const [addFiles, setAddFiles] = useState<File[]>([]);
  const [addRefImage, setAddRefImage] = useState<string | null>(null);
  const [addParsedContent, setAddParsedContent] = useState("");
  const [isParsingAdd, setIsParsingAdd] = useState(false);
  const addFileRef = useRef<HTMLInputElement>(null);
  const addImageRef = useRef<HTMLInputElement>(null);

  // Theme
  const [theme, setTheme] = useState<string>(() => {
    const meta = (landing.metadata as Record<string, unknown>) || {};
    return (meta?.theme as string) || "minimal";
  });
  const [customColors, setCustomColors] = useState<CustomColors>(() => {
    const meta = (landing.metadata as Record<string, unknown>) || {};
    return (meta?.customColors as CustomColors) || { primary: "#6366f1" };
  });
  const themeCssData = useMemo(() => {
    if (theme === "custom") {
      const t = buildCustomTheme(customColors);
      const css = `:root {\n${Object.entries(t.colors).map(([k, v]) => `  --color-${k}: ${v};`).join("\n")}\n}`;
      const { tailwindConfig } = buildSingleThemeCss("minimal");
      return { css, tailwindConfig };
    }
    return buildSingleThemeCss(theme);
  }, [theme, customColors]);

  const resolvedThemeColors = useMemo(() => {
    if (theme === "custom") {
      const base = LANDING_THEMES.find((t) => t.id === "minimal")!.colors;
      return { ...base, ...Object.fromEntries(Object.entries(customColors).filter(([, v]) => v)) } as typeof base;
    }
    return LANDING_THEMES.find((t) => t.id === theme)?.colors ?? LANDING_THEMES[0].colors;
  }, [theme, customColors]);

  // Inject custom theme CSS + document layout CSS into Canvas iframe
  useEffect(() => {
    if (theme === "custom") {
      const t = buildCustomTheme(customColors);
      const themeCss = `:root {\n${Object.entries(t.colors).map(([k, v]) => `  --color-${k}: ${v};`).join("\n")}\n}`;
      canvasRef.current?.postMessage({ action: "set-custom-css", css: documentCss + "\n" + themeCss });
    } else {
      canvasRef.current?.postMessage({ action: "set-custom-css", css: documentCss });
    }
  }, [theme, customColors]);

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
    }
    if (deployFetcher.data?.unpublished) setLiveUrl(null);
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
        if (contextMenu) setContextMenu(null);
        else if (codeViewSectionId) setCodeViewSectionId(null);
        else if (showAddPrompt) { setShowAddPrompt(false); setRegenTargetId(null); }
        else if (overflowOpen) setOverflowOpen(false);
        else if (selection) setSelection(null);
      }

      if (e.key === "Delete" || e.key === "Backspace") {
        const tag = (e.target as HTMLElement)?.tagName;
        const isEditable = (e.target as HTMLElement)?.isContentEditable;
        if (tag === "INPUT" || tag === "TEXTAREA" || isEditable) return;
        if (contextMenu || showAddPrompt || codeViewSectionId) return;
        if (selectedSectionIds.length === 0) return;
        if (isGenerating || variantLoadingId) return;

        e.preventDefault();
        const updated = sections
          .filter((s) => !selectedSectionIds.includes(s.id))
          .map((s, i) => ({ ...s, order: i }));
        if (updated.length === sections.length) return;
        handleSectionsChange(updated);
        setSelectedSectionIds([]);
        if (selection && selectedSectionIds.includes(selection.sectionId)) {
          setSelection(null);
        }
      }
    }
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [
    contextMenu,
    overflowOpen,
    selection,
    codeViewSectionId,
    showAddPrompt,
    selectedSectionIds,
    sections,
    isGenerating,
    variantLoadingId,
  ]);

  function stopGeneration() {
    abortRef.current?.abort();
    setIsGenerating(false);
  }

  // Document-specific CSS injected into Canvas iframe
  const documentCss = `
    body { padding: 24px; background: #d1d5db; display: flex; flex-direction: column; align-items: center; gap: 24px; }
    [data-section-id] { width: 8.5in; min-height: 11in; background: white; box-shadow: 0 2px 8px rgba(0,0,0,0.15); cursor: pointer; }
    [data-section-id]:hover { box-shadow: 0 4px 16px rgba(0,0,0,0.2); }
  `;

  async function generateSections(extraInstructions?: string, skipCover?: boolean) {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setIsGenerating(true);
    // When skipCover, keep existing cover sections; otherwise clear all
    const existingSections = skipCover ? [...sections] : [];
    if (!skipCover) setSections([]);
    // Accumulated sections for final state update
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
              if (eventType === "section-building") {
                const buildIdx = accumulated.findIndex((s) => s.id === "__building__");
                const building = {
                  id: "__building__",
                  order: d.order,
                  html: d.html,
                  label: "...",
                };
                if (buildIdx !== -1) {
                  accumulated[buildIdx] = building;
                } else {
                  accumulated.push(building);
                }
                setSections([...accumulated]);
              } else if (eventType === "section") {
                // Replace __building__ in-place instead of remove+add to avoid iframe flicker
                const buildIdx = accumulated.findIndex((s) => s.id === "__building__");
                if (buildIdx !== -1) {
                  accumulated[buildIdx] = d;
                } else {
                  accumulated.push(d);
                }
                setSections([...accumulated]);
                playTone();
                setTimeout(() => canvasRef.current?.scrollToSection(d.id), 300);
              } else if (eventType === "section-update") {
                const idx = accumulated.findIndex((s) => s.id === d.id);
                if (idx !== -1) accumulated[idx] = { ...accumulated[idx], html: d.html };
                setSections([...accumulated]);
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
      // Still set whatever we got
      if (accumulated.length > 0) setSections([...accumulated]);
    } finally {
      if (abortRef.current === controller) setIsGenerating(false);
    }
  }

  const saveTimeoutRef = useRef<ReturnType<typeof setTimeout>>();
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

  // Undo/Redo keydown listener
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
    },
    [saveSections, pushUndo, setSections]
  );

  const handleIframeMessage = useCallback((msg: IframeMessage) => {
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
      setSections((prev) => {
        const updated = prev.map((s) =>
          s.id === msg.sectionId ? { ...s, html: msg.sectionHtml } : s
        );
        saveSections(updated);
        return updated;
      });
    } else if (msg.type === "undo") {
      const prev = undo(sectionsRef.current);
      if (prev) { setSections(prev); saveSections(prev); canvasRef.current?.postMessage({ action: "reload-sections" }); }
    } else if (msg.type === "redo") {
      const next = redo(sectionsRef.current);
      if (next) { setSections(next); saveSections(next); canvasRef.current?.postMessage({ action: "reload-sections" }); }
    }
  }, [saveSections, pushUndo, setSections, undo, redo]);

  async function handleRefine(instruction: string, referenceImage?: string) {
    if (!selection?.sectionId) return;
    pushUndo(sectionsRef.current);
    setIsRefining(true);
    try {
      const section = sections.find((s) => s.id === selection.sectionId);
      if (!section) return;
      const sectionId = selection.sectionId;

      // Snapshot current version before refine
      setSections((prev) =>
        prev.map((s) => {
          if (s.id !== sectionId) return s;
          const sv = s as Section3WithVersions;
          const versions = [...(sv.versions || []), { html: s.html, timestamp: Date.now() }].slice(-10);
          return { ...s, versions } as any;
        })
      );

      const res = await fetch("/api/v2/document-refine", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          landingId: landing.id,
          sectionId,
          instruction,
          currentHtml: section.html,
          ...(referenceImage && { referenceImage }),
          ...(direction && { direction }),
        }),
      });
      if (!res.ok) {
        const errBody = await res.json().catch(() => ({}));
        if (errBody.upgradeUrl) {
          showLimitToast(errBody.error, errBody.upgradeUrl);
          return;
        }
        throw new Error(errBody.error || "Error al refinar página");
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
                if (event === "done") setSelection(null);
              }
            } catch {}
          }
        }
      }
      saveSections(sectionsRef.current);
      playTone();
      canvasRef.current?.scrollToSection(sectionId);
    } catch (err) {
      console.error("Refine error:", err);
      errorToast((err as Error).message || "Error al refinar página");
      // Rollback the premature version snapshot
      if (selection?.sectionId) {
        const rollbackId = selection.sectionId;
        setSections((prev) =>
          prev.map((s) => {
            if (s.id !== rollbackId) return s;
            const sv = s as Section3WithVersions;
            if (!sv.versions?.length) return s;
            return { ...s, versions: sv.versions.slice(0, -1) } as any;
          })
        );
      }
    } finally {
      setIsRefining(false);
    }
  }

  const variantAbortRef = useRef<AbortController | null>(null);

  function stopVariant() {
    variantAbortRef.current?.abort();
    variantAbortRef.current = null;
    setVariantLoadingId(null);
  }

  async function handleGenerateVariant(sectionId: string, instruction?: string, referenceImage?: string) {
    const section = sections.find((s) => s.id === sectionId);
    if (!section) return;
    setVariantLoadingId(sectionId);
    const abortController = new AbortController();
    variantAbortRef.current = abortController;
    try {
      // Snapshot current version
      setSections((prev) =>
        prev.map((s) => {
          if (s.id !== sectionId) return s;
          const sv = s as Section3WithVersions;
          const versions = [...(sv.versions || []), { html: s.html, timestamp: Date.now() }].slice(-10);
          return { ...s, versions } as any;
        })
      );

      const res = await fetch("/api/v2/document-refine", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: abortController.signal,
        body: JSON.stringify({
          landingId: landing.id,
          sectionId,
          instruction: instruction || "VARIANT_MODE",
          currentHtml: section.html,
          ...(referenceImage ? { referenceImage } : {}),
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
      canvasRef.current?.scrollToSection(sectionId);
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
    const sorted = [...sections].sort((a, b) => a.order - b.order);
    const [moved] = sorted.splice(fromIndex, 1);
    sorted.splice(toIndex, 0, moved);
    const reordered = sorted.map((s, i) => ({ ...s, order: i }));
    handleSectionsChange(reordered);
  }

  function handleChangeTag(sectionId: string, elementPath: string, newTag: string) {
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

  function handleDeleteElement(sectionId: string, elementPath: string) {
    pushUndo(sectionsRef.current);
    canvasRef.current?.postMessage({
      action: "delete-element",
      sectionId,
      elementPath,
    });
    setSelection(null);
  }

  function handleReplaceClass(sectionId: string, elementPath: string, removePrefixes: string[], addClass: string) {
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

  async function handleAddPage() {
    if ((!addPrompt.trim() && !addParsedContent) || isAddingSection) return;
    setIsAddingSection(true);
    const savedPrompt = addPrompt.trim();
    const savedParsedContent = addParsedContent;
    const savedRefImage = addRefImage;
    const newId = Math.random().toString(36).slice(2, 10);
    try {
      const instruction = [
        savedPrompt ? `Create new pages: ${savedPrompt}` : "Create new pages from this content",
        savedParsedContent ? `\n\nSource content:\n${savedParsedContent.substring(0, 15000)}` : "",
      ].join("");

      const res = await fetch("/api/v2/document-refine", {
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

      setSections((prev) => [
        ...prev,
        {
          id: newId,
          order: prev.length,
          html: "<section></section>",
          label: `Página ${prev.length + 1}`,
        },
      ]);

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
                  setSections((prev) => {
                    const without = prev.filter((s) => s.id !== newId);
                    const newSections = d.sections.map((html: string, i: number) => ({
                      id: Math.random().toString(36).slice(2, 10),
                      order: without.length + i,
                      html,
                      label: `Página ${without.length + i + 1}`,
                    }));
                    const updated = [...without, ...newSections];
                    saveSections(updated);
                    return updated;
                  });
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
      console.error("Add page error:", err);
      errorToast((err as Error).message || "Error al agregar página");
      // Remove the empty placeholder page on error
      setSections((prev) => prev.filter((s) => s.id !== newId));
    } finally {
      setIsAddingSection(false);
    }
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

  function handleExportPdf(filterSectionIds?: string[]) {
    // Build full HTML with Paged.js and open in new window for window.print()
    const base = filterSectionIds ? sections.filter(s => filterSectionIds.includes(s.id)) : sections;
    const sorted = [...base].sort((a, b) => a.order - b.order);
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
    body { font-family: 'Inter', sans-serif; margin: 0; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    .page-section {
      width: 8.5in;
      height: 11in;
      overflow: hidden;
      page-break-after: always;
      break-after: page;
      page-break-inside: avoid;
      break-inside: avoid;
    }
    .page-section:last-child { page-break-after: auto; break-after: auto; }
  </style>
</head>
<body>
${sectionsHtml}
<script>
  window.onload = () => {
    setTimeout(() => window.print(), 1500);
  };
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



  return (
    <article className="pt-14 pb-0 md:pl-28 w-full h-screen flex flex-col overflow-hidden">
      {/* Top bar */}
      <div className="flex items-center justify-between gap-4 px-4 py-2 shrink-0 border-b border-gray-200 bg-white">
        <div className="flex items-center gap-3">
          <Link
            to="/dash/documents"
            className="text-sm font-bold hover:underline"
          >
            &larr;
          </Link>
          <h1 className="text-lg font-black truncate max-w-xs">
            {landing.name}
          </h1>
          {liveUrl && (
            <span className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
              <a
                href={liveUrl}
                target="_blank"
                rel="noreferrer"
                className="text-xs text-brand-600 hover:underline truncate max-w-[200px]"
              >
                {liveUrl.replace(/^https?:\/\//, "")}
              </a>
              <Copy
                text={liveUrl}
                mode="ghost"
                className="relative static p-0"
              />
            </span>
          )}
          {aiGenLimit !== null && (() => {
            const monthlyRemaining = Math.max(0, aiGenLimit - aiGenUsed);
            const totalRemaining = monthlyRemaining + aiGenBonus;
            const color = totalRemaining <= 0 ? "text-red-500" : totalRemaining <= 2 ? "text-yellow-600" : "text-gray-400";
            return (
              <span className={`text-xs font-bold ${color}`}>
                {totalRemaining} generaciones restantes
              </span>
            );
          })()}
        </div>

        <div className="flex items-center gap-2">
          <BrutalButton
            size="chip"
            mode="ghost"
            onClick={() => handleExportPdf()}
            isDisabled={sections.length === 0}
          >
            Exportar PDF
          </BrutalButton>
          <BrutalButton
            size="chip"
            onClick={handleDeployDocument}
            isLoading={activeIntent === "deploy"}
            isDisabled={sections.length === 0 || activeIntent !== null}
          >
            {liveUrl ? "Actualizar" : "Publicar"}
          </BrutalButton>

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
                    if (!confirm("Eliminar este documento?")) return;
                    setActiveIntent("delete");
                    deployFetcher.submit(
                      { intent: "delete" },
                      { method: "post" }
                    );
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


      {/* Main content */}
      <div className="flex flex-1 overflow-hidden relative">
        {/* Section list sidebar */}
        {!codeViewSectionId && (
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
              canvasRef.current?.scrollToSection(id);
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
            onAdd={() => setShowAddPrompt(true)}
            theme={theme}
            onThemeChange={handleThemeChange}
            customColors={customColors}
            onCustomColorChange={handleCustomColorChange}
            themeCssData={themeCssData}
            onGenerateVariant={handleGenerateVariant}
            onStopVariant={stopVariant}
            loadingVariantId={variantLoadingId}
            onRestoreVersion={(sectionId, oldHtml) => {
              const updated = sections.map((s) => {
                if (s.id !== sectionId) return s;
                const sv = s as Section3WithVersions;
                // Push current to versions, restore old
                const versions = [...(sv.versions || []), { html: s.html, timestamp: Date.now() }].slice(-10);
                return { ...s, html: oldHtml, versions } as any;
              });
              handleSectionsChange(updated);
            }}
          />
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
          <div className="w-1/2 h-full border-r border-gray-700">
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

        {/* Canvas — document pages */}
        <div
          className={`${codeViewSectionId ? "w-1/2" : "flex-1"} overflow-auto relative flex flex-col`}
        >
          <div className="flex-1 overflow-auto relative flex justify-center bg-gray-200">
            <div className="transition-all duration-300 h-full w-full">
              {sections.length === 0 && !isGenerating ? (
                <div className="flex flex-col items-center justify-center py-24">
                  <p className="text-gray-400 text-sm">Sin p&aacute;ginas</p>
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
                        const themeCss = `:root {\n${Object.entries(t.colors).map(([k, v]) => `  --color-${k}: ${v};`).join("\n")}\n}`;
                        canvasRef.current?.postMessage({ action: "set-custom-css", css: documentCss + "\n" + themeCss });
                      } else {
                        canvasRef.current?.postMessage({ action: "set-custom-css", css: documentCss });
                      }
                    }}
                  />
                  {isGenerating && (
                    <div className="absolute bottom-4 left-1/2 -translate-x-1/2 flex items-center gap-3 bg-white border-2 border-black rounded-xl px-4 py-2 shadow-[4px_4px_0_0_rgba(0,0,0,1)] z-20">
                      <span className="block w-4 h-4 border-2 border-gray-200 border-t-brand-500 rounded-full animate-spin" />
                      <span className="text-sm font-bold">Generando...</span>
                      <button onClick={stopGeneration} className="text-xs font-bold text-red-500 hover:underline ml-1">Detener</button>
                    </div>
                  )}
                  {isGenerating && (
                    <div
                      ref={streamEndRef}
                      className="flex items-center gap-3 py-4 px-6 bg-gray-200"
                    >
                      <div className="flex gap-1">
                        <span
                          className="w-1.5 h-1.5 rounded-full bg-brand-500 animate-bounce"
                          style={{ animationDelay: "0ms" }}
                        />
                        <span
                          className="w-1.5 h-1.5 rounded-full bg-brand-400 animate-bounce"
                          style={{ animationDelay: "150ms" }}
                        />
                        <span
                          className="w-1.5 h-1.5 rounded-full bg-brand-300 animate-bounce"
                          style={{ animationDelay: "300ms" }}
                        />
                      </div>
                      <p className="text-sm font-bold text-gray-500">
                        Generando p&aacute;gina {sections.length + 1}...
                      </p>
                      <div className="ml-2">
                        <BrutalButton
                          size="chip"
                          mode="ghost"
                          onClick={stopGeneration}
                        >
                          Detener
                        </BrutalButton>
                      </div>
                    </div>
                  )}
                </>
              )}
            </div>
          </div>
        </div>

        {/* Floating toolbar */}
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
          isRefining={isRefining}
          hideStylePresets
          themeColors={resolvedThemeColors}
        />
      </div>

      {/* Add pages modal */}
      {showAddPrompt && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-white rounded-2xl border-2 border-black shadow-[6px_6px_0_#000] p-6 w-full max-w-md mx-4">
            <h3 className="text-lg font-black mb-3">
              {regenTargetId ? "Regenerar página" : "Agregar páginas"}
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
                  setAddPrompt("");
                  setAddFiles([]);
                  setAddRefImage(null);
                  setAddParsedContent("");
                }}
              >
                Cancelar
              </BrutalButton>
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
                  : (!addPrompt.trim() && !addParsedContent) || isAddingSection}
              >
                {regenTargetId ? (addPrompt.trim() ? "Refinar" : "Variante") : "Generar"}
              </BrutalButton>
            </div>
          </div>
        </div>
      )}
    </article>
  );
}

