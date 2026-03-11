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
import Spinner from "~/components/common/Spinner";
import { getUserOrRedirect } from "~/.server/getters";
import { db } from "~/.server/db";
import { Canvas, type CanvasHandle } from "~/components/landings3/Canvas";
import { SectionList } from "~/components/landings3/SectionList";
import { FloatingToolbar } from "~/components/landings3/FloatingToolbar";
import { CodeEditor } from "~/components/landings3/CodeEditor";
import type { Section3, IframeMessage } from "~/lib/landing3/types";
import { buildCustomThemeCss, LANDING_THEMES, type CustomColors } from "~/lib/landing3/themes";
import { ViewportToggle, type Viewport } from "@easybits.cloud/html-tailwind-generator";
import { useUndoStack } from "@easybits.cloud/html-tailwind-generator/components";
import type { Route } from "./+types/editor";

export const meta = () => [
  { title: "Editor Landing v3 — EasyBits" },
  { name: "robots", content: "noindex" },
];

export const loader = async ({ request, params }: Route.LoaderArgs) => {
  const user = await getUserOrRedirect(request);
  const landing = await db.landing.findUnique({ where: { id: params.id } });
  if (!landing || landing.ownerId !== user.id || landing.version !== 3) {
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

  return { landing, websiteUrl };
};

/** Retry a DB operation on write conflict (P2034) with exponential backoff */
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
  if (!landing || landing.ownerId !== user.id || landing.version !== 3) {
    return { error: "No encontrado" };
  }

  const formData = await request.formData();
  const intent = formData.get("intent");

  if (intent === "update-sections") {
    const sections = JSON.parse(String(formData.get("sections") || "[]"));
    await withRetry(() =>
      db.landing.update({
        where: { id: params.id },
        data: { sections },
      })
    );
    return { ok: true };
  }

  if (intent === "update-theme") {
    const newTheme = String(formData.get("theme") || "default");
    const customColorsRaw = formData.get("customColors") ? String(formData.get("customColors")) : undefined;
    await withRetry(async () => {
      const fresh = await db.landing.findUnique({ where: { id: params.id } });
      const existing = (fresh?.metadata as Record<string, unknown>) || {};
      const meta: Record<string, unknown> = { ...existing, theme: newTheme };
      if (customColorsRaw) {
        try { meta.customColors = JSON.parse(customColorsRaw); } catch { /* ignore */ }
      }
      return db.landing.update({
        where: { id: params.id },
        data: { metadata: meta as any },
      });
    });
    return { ok: true };
  }

  // Build auth context from session user (no API key needed for dashboard actions)
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
      const msg = err instanceof Response
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
    return { redirect: "/dash/landings3" };
  }

  return { error: "Intent desconocido" };
};

export default function Landing3Editor() {
  const { landing, websiteUrl } = useLoaderData<typeof loader>();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const saveFetcher = useFetcher();
  const deployFetcher = useFetcher<{
    url?: string;
    redirect?: string;
    unpublished?: boolean;
  }>();
  const [activeIntent, setActiveIntent] = useState<string | null>(null);

  const [sections, _setSections] = useState<Section3[]>(() => {
    const raw = landing.sections;
    return Array.isArray(raw) ? (raw as unknown as Section3[]) : [];
  });
  const sectionsRef = useRef(sections);
  const setSections = useCallback((updater: Section3[] | ((prev: Section3[]) => Section3[])) => {
    _setSections((prev) => {
      const next = typeof updater === "function" ? updater(prev) : updater;
      sectionsRef.current = next;
      return next;
    });
  }, []);

  const [theme, setTheme] = useState<string>(() => {
    const meta = landing.metadata as Record<string, unknown> | null;
    return (meta?.theme as string) || "minimal";
  });

  const [isGenerating, setIsGenerating] = useState(
    searchParams.get("generating") === "1"
  );
  const [liveUrl, setLiveUrl] = useState(websiteUrl);
  const [viewport, setViewport] = useState<Viewport>("desktop");
  const [customColors, setCustomColors] = useState<CustomColors>(() => {
    const meta = landing.metadata as Record<string, unknown> | null;
    const saved = meta?.customColors as CustomColors | undefined;
    // Migrate from old single customColor
    if (!saved && meta?.customColor) {
      return { primary: meta.customColor as string };
    }
    return saved || { primary: "#6366f1" };
  });
  const [overflowOpen, setOverflowOpen] = useState(false);
  const overflowRef = useRef<HTMLDivElement>(null);
  const streamEndRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  // Selection state for FloatingToolbar
  const [selection, setSelection] = useState<IframeMessage | null>(null);
  const [isRefining, setIsRefining] = useState(false);
  const iframeRectRef = useRef<DOMRect | null>(null);
  const canvasRef = useRef<CanvasHandle>(null);
  // Force re-render for toolbar positioning
  const [, setToolbarTick] = useState(0);

  // Add section prompt modal
  const [showAddPrompt, setShowAddPrompt] = useState(false);
  const [addPrompt, setAddPrompt] = useState("");
  const [isAddingSection, setIsAddingSection] = useState(false);

  // Undo/Redo
  const { pushUndo, undo, redo, canUndo, canRedo } = useUndoStack<Section3[]>();

  // Regenerate prompt modal
  const [showRegenPrompt, setShowRegenPrompt] = useState(false);
  const [regenPrompt, setRegenPrompt] = useState("");

  // Code view
  const [codeViewSectionId, setCodeViewSectionId] = useState<string | null>(null);
  const [codeValue, setCodeValue] = useState("");
  const [codeScrollTarget, setCodeScrollTarget] = useState<string | undefined>();

  useEffect(() => {
    if (deployFetcher.state === "idle") setActiveIntent(null);
    if (deployFetcher.data?.redirect) navigate(deployFetcher.data.redirect);
    if (deployFetcher.data?.url) setLiveUrl(deployFetcher.data.url);
    if (deployFetcher.data?.unpublished) setLiveUrl(null);
  }, [deployFetcher.state, deployFetcher.data, navigate]);

  // Resolve theme colors for FloatingToolbar swatches
  const resolvedThemeColors = useMemo(() => {
    if (theme === "custom") {
      const base = LANDING_THEMES.find((t) => t.id === "minimal")!.colors;
      return { ...base, ...Object.fromEntries(Object.entries(customColors).filter(([, v]) => v)) } as typeof base;
    }
    return LANDING_THEMES.find((t) => t.id === theme)?.colors ?? LANDING_THEMES[0].colors;
  }, [theme, customColors]);

  // Inject custom theme CSS when theme is "custom"
  useEffect(() => {
    if (theme === "custom") {
      canvasRef.current?.postMessage({
        action: "set-custom-css",
        css: buildCustomThemeCss(customColors),
      });
    } else {
      canvasRef.current?.postMessage({ action: "set-custom-css", css: "" });
    }
  }, [theme, customColors]);

  // Auto-generate on mount
  useEffect(() => {
    if (!isGenerating || sections.length > 0) {
      setIsGenerating(false);
      return;
    }
    generateSections();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Close overflow & code view on outside click
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
        if (codeViewSectionId) {
          setCodeViewSectionId(null);
        } else if (showRegenPrompt) {
          setShowRegenPrompt(false);
        } else if (showAddPrompt) {
          setShowAddPrompt(false);
        } else if (overflowOpen) {
          setOverflowOpen(false);
        } else if (selection) {
          setSelection(null);
        }
      }
    }
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [overflowOpen, selection, codeViewSectionId, showAddPrompt, showRegenPrompt]);

  function stopGeneration() {
    abortRef.current?.abort();
    setIsGenerating(false);
  }

  async function generateSections(extraInstructions?: string) {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setIsGenerating(true);
    setSections([]);
    try {
      // Check for reference image from creation flow
      let referenceImage: string | undefined;
      try {
        const stored = sessionStorage.getItem("landing3_refImg");
        if (stored) {
          referenceImage = stored;
          sessionStorage.removeItem("landing3_refImg");
        }
      } catch { /* ignore */ }

      const res = await fetch("/api/v2/landing3-generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          landingId: landing.id,
          prompt: landing.prompt,
          referenceImage,
          ...(extraInstructions ? { extraInstructions } : {}),
        }),
        signal: controller.signal,
      });
      if (!res.ok) throw new Error("Generation failed");

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
              const data = JSON.parse(line.slice(6));
              if (eventType === "section") {
                setSections((prev) => [...prev, data]);
                requestAnimationFrame(() => {
                  streamEndRef.current?.scrollIntoView({
                    behavior: "smooth",
                    block: "end",
                  });
                });
              } else if (eventType === "section-update") {
                setSections((prev) =>
                  prev.map((s) =>
                    s.id === data.id ? { ...s, html: data.html } : s
                  )
                );
              }
            } catch {
              /* skip malformed */
            }
          }
        }
      }
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") {
        return; // Silently ignore — user cancelled or effect re-ran
      }
      console.error("Generation error:", err);
    } finally {
      if (abortRef.current === controller) {
        setIsGenerating(false);
      }
    }
  }

  const saveSections = useCallback(
    (s: Section3[]) => {
      // Defer to avoid setState-during-render when called from setSections updaters
      queueMicrotask(() => {
        saveFetcher.submit(
          { intent: "update-sections", sections: JSON.stringify(s) },
          { method: "post" }
        );
      });
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    []
  );

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
    } else if (msg.type === "text-edited" && msg.sectionId) {
      const sectionHtml = (msg as any).sectionHtml;
      if (sectionHtml) {
        pushUndo(sectionsRef.current);
        setSections((prev) => {
          const updated = prev.map((s) =>
            s.id === msg.sectionId ? { ...s, html: sectionHtml } : s
          );
          saveSections(updated);
          return updated;
        });
      }
    } else if (msg.type === "section-html-updated" && msg.sectionId && msg.sectionHtml) {
      setSections((prev) => {
        const updated = prev.map((s) =>
          s.id === msg.sectionId ? { ...s, html: msg.sectionHtml! } : s
        );
        saveSections(updated);
        return updated;
      });
    }
  }, [saveSections, pushUndo, setSections]);

  async function handleRefine(instruction: string, referenceImage?: string) {
    if (!selection?.sectionId) return;
    pushUndo(sectionsRef.current);
    setIsRefining(true);
    try {
      const section = sections.find((s) => s.id === selection.sectionId);
      if (!section) return;
      const sectionId = selection.sectionId;

      const res = await fetch("/api/v2/landing3-refine", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          landingId: landing.id,
          sectionId,
          instruction,
          currentHtml: section.html,
          ...(referenceImage && { referenceImage }),
        }),
      });
      if (!res.ok) throw new Error("Refine failed");

      const reader = res.body!.getReader();
      const decoder = new TextDecoder();
      let buf = "";
      let event = "";

      const processLine = (line: string) => {
        if (line.startsWith("event: ")) {
          event = line.slice(7);
        } else if (line.startsWith("data: ")) {
          try {
            const data = JSON.parse(line.slice(6));
            if (event === "chunk" && data.html) {
              setSections((prev) =>
                prev.map((s) => (s.id === sectionId ? { ...s, html: data.html } : s))
              );
            } else if (event === "done" && data.html) {
              setSections((prev) =>
                prev.map((s) => (s.id === sectionId ? { ...s, html: data.html } : s))
              );
              setSelection(null);
            }
          } catch {}
        }
      };

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });

        const lines = buf.split("\n");
        buf = lines.pop() || "";
        for (const line of lines) processLine(line);
      }

      // Process remaining buffer
      if (buf.trim()) {
        for (const line of buf.split("\n")) processLine(line);
      }
    } catch (err) {
      console.error("Refine error:", err);
    } finally {
      setIsRefining(false);
    }
  }

  function handleReorder(fromIndex: number, toIndex: number) {
    const sorted = [...sections].sort((a, b) => a.order - b.order);
    const [moved] = sorted.splice(fromIndex, 1);
    sorted.splice(toIndex, 0, moved);
    const reordered = sorted.map((s, i) => ({ ...s, order: i }));
    handleSectionsChange(reordered);
  }

  function handleMoveSection(direction: "up" | "down") {
    if (!selection?.sectionId) return;
    const sorted = [...sections].sort((a, b) => a.order - b.order);
    const idx = sorted.findIndex((s) => s.id === selection.sectionId);
    if (idx === -1) return;
    const targetIdx = direction === "up" ? idx - 1 : idx + 1;
    if (targetIdx < 0 || targetIdx >= sorted.length) return;
    handleReorder(idx, targetIdx);
    setSelection(null);
  }

  function handleDeleteSection() {
    if (!selection?.sectionId) return;
    const updated = sections
      .filter((s) => s.id !== selection.sectionId)
      .map((s, i) => ({ ...s, order: i }));
    handleSectionsChange(updated);
    setSelection(null);
  }

  async function handleAddSection() {
    if (!addPrompt.trim() || isAddingSection) return;
    setIsAddingSection(true);
    const newId = Math.random().toString(36).slice(2, 10);
    const label = "Nueva sección";
    try {
      const res = await fetch("/api/v2/landing3-refine", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          landingId: landing.id,
          sectionId: "__new__",
          instruction: `Create a new section: ${addPrompt}`,
          currentHtml: "<section></section>",
        }),
      });
      if (!res.ok) throw new Error("Add section failed");

      // Add placeholder section immediately
      setSections((prev) => [
        ...prev,
        { id: newId, order: prev.length, html: "<section></section>", label },
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
              const data = JSON.parse(line.slice(6));
              if (event === "chunk" && data.html) {
                setSections((prev) =>
                  prev.map((s) => (s.id === newId ? { ...s, html: data.html } : s))
                );
              } else if (event === "done" && data.html) {
                setSections((prev) => {
                  const updated = prev.map((s) =>
                    s.id === newId ? { ...s, html: data.html } : s
                  );
                  saveSections(updated);
                  return updated;
                });
              }
            } catch {}
          }
        }
      }

      // Process remaining buffer
      if (buf.trim()) {
        for (const line of buf.split("\n")) {
          if (line.startsWith("event: ")) event = line.slice(7);
          else if (line.startsWith("data: ")) {
            try {
              const data = JSON.parse(line.slice(6));
              if (event === "done" && data.html) {
                setSections((prev) => {
                  const updated = prev.map((s) =>
                    s.id === newId ? { ...s, html: data.html } : s
                  );
                  saveSections(updated);
                  return updated;
                });
              }
            } catch {}
          }
        }
      }

      setShowAddPrompt(false);
      setAddPrompt("");
    } catch (err) {
      console.error("Add section error:", err);
    } finally {
      setIsAddingSection(false);
    }
  }

  function handleThemeChange(newTheme: string) {
    setTheme(newTheme);
    saveFetcher.submit(
      { intent: "update-theme", theme: newTheme },
      { method: "post" }
    );
  }

  const colorSaveTimer = useRef<ReturnType<typeof setTimeout>>(null);

  function handleCustomColorChange(partial: Partial<CustomColors>) {
    const merged = { ...customColors, ...partial };
    setCustomColors(merged);
    setTheme("custom");
    canvasRef.current?.postMessage({
      action: "set-custom-css",
      css: buildCustomThemeCss(merged),
    });
    // Debounce DB save — color pickers fire rapidly
    if (colorSaveTimer.current) clearTimeout(colorSaveTimer.current);
    colorSaveTimer.current = setTimeout(() => {
      saveFetcher.submit(
        { intent: "update-theme", theme: "custom", customColors: JSON.stringify(merged) },
        { method: "post" }
      );
    }, 400);
  }

  function handleUpdateAttribute(sectionId: string, elementPath: string, attr: string, value: string) {
    canvasRef.current?.postMessage({
      action: "update-attribute",
      sectionId,
      elementPath,
      tagName: selection?.tagName || "*",
      attr,
      value,
    });
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

  function handleOpenCode(sectionId: string) {
    const section = sections.find((s) => s.id === sectionId);
    if (!section) return;
    const target = selection?.openTag || selection?.text?.substring(0, 40) || undefined;
    // If editor is already open on this section, force a scroll update by toggling
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

  return (
    <article className="pt-14 pb-0 md:pl-28 w-full h-screen flex flex-col overflow-hidden">
      {/* Top bar */}
      <div className="flex items-center justify-between gap-4 px-4 py-2 shrink-0 border-b border-gray-200 bg-white">
        <div className="flex items-center gap-3">
          <Link
            to="/dash/landings3"
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
        </div>

        <div className="flex items-center gap-2">
          <BrutalButton
            size="chip"
            onClick={() => {
              // Cancel any pending debounced color save to avoid write conflicts
              if (colorSaveTimer.current) clearTimeout(colorSaveTimer.current);
              setActiveIntent("deploy");
              deployFetcher.submit({ intent: "deploy" }, { method: "post" });
            }}
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
                <button
                  onClick={() => {
                    setOverflowOpen(false);
                    setShowRegenPrompt(true);
                  }}
                  disabled={isGenerating}
                  className="w-full text-left px-4 py-2 text-sm font-bold hover:bg-gray-50 disabled:opacity-50"
                >
                  Regenerar
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
                    if (!confirm("Eliminar esta landing?")) return;
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

      {/* Main content */}
      <div className="flex flex-1 overflow-hidden relative">
        {/* Section list sidebar — hidden in split view */}
        {!codeViewSectionId && (
          <SectionList
            sections={sections}
            selectedSectionId={selection?.sectionId ?? null}
            theme={theme}
            customColors={customColors}
            onThemeChange={handleThemeChange}
            onCustomColorChange={handleCustomColorChange}
            onSelect={(id) => {
              canvasRef.current?.scrollToSection(id);
            }}
            onOpenCode={(id) => {
              handleOpenCode(id);
            }}
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
          />
        )}

        {/* Code editor — left half in split view */}
        {codeViewSectionId && (
          <div className="w-1/2 h-full border-r border-gray-700">
            <CodeEditor
              code={codeValue}
              label={sections.find((s) => s.id === codeViewSectionId)?.label || ""}
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
        <div className={`${codeViewSectionId ? "w-1/2" : "flex-1"} overflow-auto relative flex flex-col`}>
          {/* Viewport buttons */}
          <ViewportToggle
            value={viewport}
            onChange={setViewport}
            activeClass="bg-brand-100 text-brand-700"
          />

          {/* Canvas area with viewport sizing */}
          <div className={`flex-1 overflow-auto relative ${viewport !== "desktop" ? "flex justify-center bg-gray-100" : ""}`}>
          <div
            className={`transition-all duration-300 h-full ${viewport !== "desktop" ? "shrink-0" : ""}`}
            style={{ width: viewport === "tablet" ? 768 : viewport === "mobile" ? 375 : "100%" }}
          >
          {isGenerating && sections.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-24">
              <div className="mb-4">
                <span className="block w-8 h-8 border-[3px] border-gray-200 border-t-brand-500 rounded-full animate-spin" />
              </div>
              <p className="text-sm font-bold text-gray-700">
                Generando tu landing con AI...
              </p>
              <p className="text-xs text-gray-400 mt-1">
                ~6-10 secciones, esto toma unos segundos
              </p>
              <div className="mt-5">
                <BrutalButton size="chip" mode="ghost" onClick={stopGeneration}>
                  Detener
                </BrutalButton>
              </div>
            </div>
          ) : sections.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-24">
              <p className="text-gray-400 text-sm">Sin secciones</p>
            </div>
          ) : (
            <>
              <Canvas
                ref={canvasRef}
                sections={sections}
                theme={theme}
                onMessage={handleIframeMessage}
                iframeRectRef={iframeRectRef}
              />
              {isGenerating && (
                <div
                  ref={streamEndRef}
                  className="flex items-center gap-3 py-4 px-6"
                >
                  <div className="flex gap-1">
                    <span className="w-1.5 h-1.5 rounded-full bg-brand-500 animate-bounce" style={{ animationDelay: "0ms" }} />
                    <span className="w-1.5 h-1.5 rounded-full bg-brand-400 animate-bounce" style={{ animationDelay: "150ms" }} />
                    <span className="w-1.5 h-1.5 rounded-full bg-brand-300 animate-bounce" style={{ animationDelay: "300ms" }} />
                  </div>
                  <p className="text-sm font-bold text-gray-500">
                    Generando sección {sections.length + 1} de ~8...
                  </p>
                  <div className="ml-2">
                    <BrutalButton size="chip" mode="ghost" onClick={stopGeneration}>
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
          onMoveUp={() => handleMoveSection("up")}
          onMoveDown={() => handleMoveSection("down")}
          onDelete={handleDeleteSection}
          onClose={() => setSelection(null)}
          onViewCode={() => {
            if (selection?.sectionId) {
              handleOpenCode(selection.sectionId);
            }
          }}
          onUpdateAttribute={handleUpdateAttribute}
          onChangeTag={handleChangeTag}
          onReplaceClass={handleReplaceClass}
          onDeleteElement={handleDeleteElement}
          isRefining={isRefining}
          themeColors={resolvedThemeColors}
        />
      </div>

      {/* Regenerate modal */}
      {showRegenPrompt && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-white rounded-2xl border-2 border-black shadow-[6px_6px_0_#000] p-6 w-full max-w-md mx-4">
            <h3 className="text-lg font-black mb-3">Regenerar landing</h3>
            <p className="text-sm text-gray-500 mb-4">
              Instrucciones adicionales (opcional)
            </p>
            <textarea
              value={regenPrompt}
              onChange={(e) => setRegenPrompt(e.target.value)}
              placeholder="Ej: Usa tonos oscuros, agrega una sección de FAQ, hazlo más minimalista..."
              rows={3}
              className="w-full px-4 py-2 border-2 border-black rounded-xl resize-none focus:outline-none"
              autoFocus
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  setShowRegenPrompt(false);
                  generateSections(regenPrompt.trim() || undefined);
                  setRegenPrompt("");
                }
              }}
            />
            <div className="flex gap-2 mt-4 justify-end">
              <BrutalButton
                size="chip"
                mode="ghost"
                onClick={() => {
                  setShowRegenPrompt(false);
                  setRegenPrompt("");
                }}
              >
                Cancelar
              </BrutalButton>
              <BrutalButton
                size="chip"
                mode="ghost"
                onClick={() => {
                  setShowRegenPrompt(false);
                  generateSections();
                  setRegenPrompt("");
                }}
              >
                Sin instrucciones
              </BrutalButton>
              <BrutalButton
                size="chip"
                onClick={() => {
                  setShowRegenPrompt(false);
                  generateSections(regenPrompt.trim() || undefined);
                  setRegenPrompt("");
                }}
              >
                Regenerar
              </BrutalButton>
            </div>
          </div>
        </div>
      )}

      {/* Add section modal */}
      {showAddPrompt && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-white rounded-2xl border-2 border-black shadow-[6px_6px_0_#000] p-6 w-full max-w-md mx-4">
            <h3 className="text-lg font-black mb-3">Agregar secci&oacute;n</h3>
            <p className="text-sm text-gray-500 mb-4">
              Describe la secci&oacute;n que quieres agregar
            </p>
            <textarea
              value={addPrompt}
              onChange={(e) => setAddPrompt(e.target.value)}
              placeholder="Ej: Una sección de pricing con 3 planes, Testimonios de clientes..."
              rows={3}
              className="w-full px-4 py-2 border-2 border-black rounded-xl resize-none focus:outline-none"
              autoFocus
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  handleAddSection();
                }
              }}
            />
            <div className="flex gap-2 mt-4 justify-end">
              <BrutalButton
                size="chip"
                mode="ghost"
                onClick={() => {
                  setShowAddPrompt(false);
                  setAddPrompt("");
                }}
              >
                Cancelar
              </BrutalButton>
              <BrutalButton
                size="chip"
                onClick={handleAddSection}
                isLoading={isAddingSection}
                isDisabled={!addPrompt.trim() || isAddingSection}
              >
                Generar
              </BrutalButton>
            </div>
          </div>
        </div>
      )}

    </article>
  );
}
