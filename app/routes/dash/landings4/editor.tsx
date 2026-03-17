import {
  useState,
  useEffect,
  useCallback,
  useRef,
  lazy,
  Suspense,
} from "react";
import { useLoaderData, useFetcher, useNavigate, Link } from "react-router";
import { BrutalButton } from "~/components/common/BrutalButton";
import { useBrutalToast } from "~/hooks/useBrutalToast";
import { Copy } from "~/components/common/Copy";
import { getUserOrRedirect } from "~/.server/getters";
import { db } from "~/.server/db";
import type { Section3 } from "~/lib/landing3/types";
import { grapesToSections } from "~/lib/landing4/grapesToSections";
import { sectionsToHtml } from "~/lib/landing4/sectionsToGrapes";
import type {
  GrapesEditorHandle,
  AiAction,
} from "~/components/landings4/GrapesEditor";
import type { Route } from "./+types/editor";

const GrapesEditor = lazy(() => import("~/components/landings4/GrapesEditor"));

export const meta = () => [
  { title: "Editor Landing v4 — EasyBits" },
  { name: "robots", content: "noindex" },
];

export const loader = async ({ request, params }: Route.LoaderArgs) => {
  const user = await getUserOrRedirect(request);
  const landing = await db.landing.findUnique({ where: { id: params.id } });
  if (!landing || landing.ownerId !== user.id || landing.version !== 5) {
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

  const brandKits = await db.brandKit.findMany({
    where: { ownerId: user.id },
    select: {
      id: true,
      name: true,
      colors: true,
      fonts: true,
      mood: true,
      logoUrl: true,
      isDefault: true,
    },
  });

  return { landing, websiteUrl, brandKits };
};

async function withRetry<T>(fn: () => Promise<T>, retries = 5): Promise<T> {
  for (let i = 0; i < retries; i++) {
    try {
      return await fn();
    } catch (err: any) {
      if (err?.code === "P2034" && i < retries - 1) {
        await new Promise((r) =>
          setTimeout(r, 50 * 2 ** i + Math.random() * 100),
        );
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
  if (!landing || landing.ownerId !== user.id || landing.version !== 5) {
    return { error: "No encontrado" };
  }

  const formData = await request.formData();
  const intent = formData.get("intent");

  if (intent === "update-sections") {
    const sections = JSON.parse(String(formData.get("sections") || "[]"));
    const grapesProject = formData.get("grapesProject")
      ? String(formData.get("grapesProject"))
      : undefined;
    await withRetry(async () => {
      const updateData: any = { sections };
      if (grapesProject) {
        const fresh = await db.landing.findUnique({ where: { id: params.id } });
        const existing = (fresh?.metadata as Record<string, unknown>) || {};
        updateData.metadata = {
          ...existing,
          grapesProject: JSON.parse(grapesProject),
        };
      }
      return db.landing.update({
        where: { id: params.id },
        data: updateData,
      });
    });
    return { ok: true };
  }

  if (intent === "update-theme") {
    const newTheme = String(formData.get("theme") || "default");
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
      } else {
        delete meta.brandKitId;
      }
      return db.landing.update({
        where: { id: params.id },
        data: { metadata: meta as any },
      });
    });
    return { ok: true };
  }

  const ctx = { user, scopes: ["ADMIN" as const] };

  if (intent === "deploy") {
    try {
      const { deployLanding } =
        await import("~/.server/core/landingOperations");
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
    const { unpublishLanding } =
      await import("~/.server/core/landingOperations");
    await unpublishLanding(ctx as any, params.id);
    return { unpublished: true };
  }

  if (intent === "delete") {
    if (landing.websiteId) {
      const { unpublishLanding } =
        await import("~/.server/core/landingOperations");
      await unpublishLanding(ctx as any, params.id);
    }
    await db.landing.delete({ where: { id: params.id } });
    return { redirect: "/dash/landings4" };
  }

  return { error: "Intent desconocido" };
};

function playCompletionSound() {
  try {
    const ctx = new AudioContext();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.frequency.setValueAtTime(587, ctx.currentTime); // D5
    osc.frequency.setValueAtTime(784, ctx.currentTime + 0.1); // G5
    osc.frequency.setValueAtTime(988, ctx.currentTime + 0.2); // B5
    gain.gain.setValueAtTime(0.15, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.4);
    osc.start(ctx.currentTime);
    osc.stop(ctx.currentTime + 0.4);
  } catch {
    /* silent fail */
  }
}

export default function Landing4Editor() {
  const { landing, websiteUrl, brandKits } = useLoaderData<typeof loader>();
  const navigate = useNavigate();
  const saveFetcher = useFetcher();
  const deployFetcher = useFetcher<{
    url?: string;
    redirect?: string;
    unpublished?: boolean;
  }>();
  const [activeIntent, setActiveIntent] = useState<string | null>(null);
  const [liveUrl, setLiveUrl] = useState(websiteUrl);
  const [overflowOpen, setOverflowOpen] = useState(false);
  const [aiModal, setAiModal] = useState<AiAction | null>(null);
  const [aiPrompt, setAiPrompt] = useState("");
  const [isRefining, setIsRefining] = useState(false);
  const [showGenModal, setShowGenModal] = useState(false);
  const [previewActive, setPreviewActive] = useState(false);
  const [swActive, setSwActive] = useState(false);
  const overflowRef = useRef<HTMLDivElement>(null);
  const editorRef = useRef<GrapesEditorHandle>(null);
  const saveTimer = useRef<ReturnType<typeof setTimeout>>(null);

  const sections = useRef<Section3[]>(
    Array.isArray(landing.sections)
      ? (landing.sections as unknown as Section3[])
      : [],
  );

  const initialHtml = (() => {
    const raw = landing.sections;
    const secs = Array.isArray(raw) ? (raw as unknown as Section3[]) : [];
    return sectionsToHtml(secs);
  })();

  const landingMeta = landing.metadata as Record<string, unknown> | null;
  const initialTheme = (landingMeta?.theme as string) || "minimal";
  const initialCustomColors = (landingMeta?.customColors as Record<string, string>) || undefined;
  const [currentTheme, setCurrentTheme] = useState(initialTheme);
  const [currentCustomColors, setCurrentCustomColors] = useState<Record<string, string> | undefined>(initialCustomColors);
  const [activeBrandKit, setActiveBrandKit] = useState<{
    fonts?: { heading?: string; body?: string } | null;
    mood?: string | null;
    logoUrl?: string | null;
    colors?: Record<string, string>;
  } | null>(null);

  const brutalToast = useBrutalToast();
  const getThemeName = useCallback(() => currentTheme, [currentTheme]);

  const getBrandKit = useCallback(() => {
    if (!activeBrandKit) return undefined;
    return {
      fonts: activeBrandKit.fonts || undefined,
      mood: activeBrandKit.mood || undefined,
      logoUrl: activeBrandKit.logoUrl || undefined,
    };
  }, [activeBrandKit]);

  const themeDebounce = useRef<ReturnType<typeof setTimeout>>();
  const handleThemeChange = useCallback((themeId: string, customColors?: Record<string, string>, brandKitId?: string) => {
    setCurrentTheme(themeId);
    setCurrentCustomColors(customColors);
    // Debounce server save (color picker fires on every mouse move)
    if (themeDebounce.current) clearTimeout(themeDebounce.current);
    themeDebounce.current = setTimeout(() => {
      const data: Record<string, string> = { intent: "update-theme", theme: themeId };
      if (customColors) data.customColors = JSON.stringify(customColors);
      if (brandKitId) data.brandKitId = brandKitId;
      saveFetcher.submit(data, { method: "post" });
    }, 300);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Cancel pending saves on unmount
  useEffect(() => {
    return () => {
      if (saveTimer.current) clearTimeout(saveTimer.current);
    };
  }, []);

  const deploySeq = useRef(0);
  const lastDeploySeq = useRef(0);
  useEffect(() => {
    if (deployFetcher.state === "idle") setActiveIntent(null);
    if (deployFetcher.data?.redirect) navigate(deployFetcher.data.redirect);
    if (deployFetcher.data?.url && deploySeq.current !== lastDeploySeq.current) {
      lastDeploySeq.current = deploySeq.current;
      setLiveUrl(deployFetcher.data.url);
      brutalToast(liveUrl ? "Landing actualizada 🚀" : "Landing publicada 🚀");
      try {
        const ctx = new AudioContext();
        const o = ctx.createOscillator();
        const g = ctx.createGain();
        o.connect(g); g.connect(ctx.destination);
        o.frequency.setValueAtTime(880, ctx.currentTime);
        o.frequency.setValueAtTime(1100, ctx.currentTime + 0.1);
        g.gain.setValueAtTime(0.3, ctx.currentTime);
        g.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.3);
        o.start(ctx.currentTime); o.stop(ctx.currentTime + 0.3);
      } catch {}
    }
    if (deployFetcher.data?.unpublished && deploySeq.current !== lastDeploySeq.current) {
      lastDeploySeq.current = deploySeq.current;
      setLiveUrl(null);
      brutalToast("Landing despublicada");
    }
  }, [deployFetcher.state, deployFetcher.data, navigate]);

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

  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if (e.key !== "Escape") return;
      if (aiModal) {
        setAiModal(null);
        return;
      }
      if (showGenModal) {
        setShowGenModal(false);
        return;
      }
      if (previewActive) {
        editorRef.current?.togglePreview();
        setPreviewActive(false);
        return;
      }
      if (overflowOpen) {
        setOverflowOpen(false);
        return;
      }
    }
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [overflowOpen, aiModal, showGenModal, previewActive]);

  // Track the last known good section count to prevent saving empty/degraded state
  const lastSectionCount = useRef(
    Array.isArray(landing.sections)
      ? (landing.sections as unknown as Section3[]).filter(
          (s: any) => s.id !== "__grapes_css__",
        ).length
      : 0,
  );
  const isSavingLocked = useRef(false);

  const handleEditorChange = useCallback((html: string) => {
    // GUARD 1: Don't save if locked (during generation, etc.)
    if (isSavingLocked.current) return;
    // GUARD 2: Don't save empty content
    if (!html || !html.trim()) return;
    // GUARD 3: Must have real content (not just a <style> tag)
    const stripped = html.replace(/<style[\s\S]*?<\/style>/gi, "").trim();
    if (!stripped) return;

    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      const newSections = grapesToSections(html);
      const contentSections = newSections.filter(
        (s) => s.id !== "__grapes_css__",
      );
      // GUARD 4: Don't save if sections went from many to zero (wipe detection)
      if (contentSections.length === 0 && lastSectionCount.current > 0) {
        console.warn(
          "[v4 editor] Blocked save: would wipe",
          lastSectionCount.current,
          "sections",
        );
        return;
      }
      // GUARD 5: Don't save if sections dropped by more than 50% (partial wipe)
      if (
        lastSectionCount.current > 2 &&
        contentSections.length < lastSectionCount.current * 0.5
      ) {
        console.warn(
          "[v4 editor] Blocked save: section count dropped from",
          lastSectionCount.current,
          "to",
          contentSections.length,
        );
        return;
      }
      lastSectionCount.current = contentSections.length;
      saveFetcher.submit(
        {
          intent: "update-sections",
          sections: JSON.stringify(newSections),
        },
        { method: "post" },
      );
    }, 2000);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // AI generation
  const [isGenerating, setIsGenerating] = useState(false);
  const [genPrompt, setGenPrompt] = useState("");
  const abortRef = useRef<AbortController | null>(null);

  const [genSectionCount, setGenSectionCount] = useState(0);

  // Check if canvas has content
  const hasContent = useCallback(() => {
    const ed = editorRef.current?.getEditor();
    if (!ed) return false;
    const html = ed.getHtml();
    return !!(html && html.trim());
  }, []);

  async function handleGenerate() {
    if (!genPrompt.trim() || isGenerating) return;
    setIsGenerating(true);
    setGenSectionCount(0);
    setShowGenModal(false);
    isSavingLocked.current = true;

    const ac = new AbortController();
    abortRef.current = ac;

    const ed = editorRef.current?.getEditor();
    const allSections: Section3[] = [];

    try {
      const res = await fetch("/api/v2/landing3-generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        signal: ac.signal,
        body: JSON.stringify({
          landingId: landing.id,
          prompt: genPrompt,
          themeName: getThemeName(),
          brandKit: getBrandKit(),
        }),
      });
      if (!res.ok) {
        const errText = await res.text().catch(() => "");
        console.error("Generate failed:", res.status, errText);
        throw new Error(`Generation failed: ${res.status}`);
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
              const parsed = JSON.parse(line.slice(6));

              if (eventType === "section") {
                allSections.push(parsed);
                setGenSectionCount(allSections.length);

                // Rebuild entire canvas with all sections so far
                // This ensures GrapesJS renders everything correctly
                if (ed) {
                  const fullHtml = allSections.map((s) => s.html).join("\n");
                  ed.setComponents(fullHtml);
                  // Scroll canvas to bottom
                  requestAnimationFrame(() => {
                    const canvasBody = ed.Canvas.getBody();
                    if (canvasBody)
                      canvasBody.scrollTop = canvasBody.scrollHeight;
                  });
                }
              } else if (eventType === "section-update") {
                const idx = allSections.findIndex((s) => s.id === parsed.id);
                if (idx >= 0) {
                  allSections[idx] = { ...allSections[idx], html: parsed.html };
                  // Rebuild canvas with updated section
                  if (ed) {
                    const fullHtml = allSections.map((s) => s.html).join("\n");
                    ed.setComponents(fullHtml);
                  }
                }
              }
            } catch {
              /* skip malformed */
            }
          }
        }
      }
    } catch (err: any) {
      if (err?.name !== "AbortError")
        console.error("AI generation error:", err);
    } finally {
      // Save whatever sections were generated (even if stopped early)
      if (allSections.length > 0) {
        saveFetcher.submit(
          {
            intent: "update-sections",
            sections: JSON.stringify(allSections),
          },
          { method: "post" },
        );
      }
      abortRef.current = null;
      setIsGenerating(false);
      setGenSectionCount(0);
      isSavingLocked.current = false;
      playCompletionSound();
    }
  }

  // ─── AI Improve (whole page refine) ────────────────────
  async function handleImprove() {
    if (!genPrompt.trim() || isRefining) return;
    setIsRefining(true);
    setShowGenModal(false);
    isSavingLocked.current = true;

    const ac = new AbortController();
    abortRef.current = ac;

    const ed = editorRef.current?.getEditor();
    if (!ed) {
      setIsRefining(false);
      isSavingLocked.current = false;
      abortRef.current = null;
      return;
    }

    const currentHtml = ed.getHtml();

    try {
      const res = await fetch("/api/v2/landing3-refine", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        signal: ac.signal,
        body: JSON.stringify({
          landingId: landing.id,
          sectionId: "__new__",
          instruction: genPrompt,
          currentHtml,
          skipDbUpdate: true,
          themeName: getThemeName(),
          brandKit: getBrandKit(),
        }),
      });

      if (!res.ok) {
        console.error("Improve failed:", res.status);
        return;
      }

      const reader = res.body?.getReader();
      if (!reader) return;

      const decoder = new TextDecoder();
      let buf = "";
      let event = "";
      let latestHtml = "";

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
              const data = JSON.parse(line.slice(6));
              if ((event === "chunk" || event === "done") && data.html) {
                latestHtml = data.html;
              }
            } catch {
              /* skip */
            }
          }
        }
      }

      // Apply final result with markdown fence cleanup
      if (latestHtml) {
        latestHtml = latestHtml
          .replace(/^```html?\s*/i, "")
          .replace(/```\s*$/, "")
          .trim();
        ed.setComponents(latestHtml);
      }

      // Save
      const finalHtml = editorRef.current?.getHtml() || "";
      const newSections = grapesToSections(finalHtml);
      saveFetcher.submit(
        { intent: "update-sections", sections: JSON.stringify(newSections) },
        { method: "post" },
      );
    } catch (err: any) {
      if (err?.name !== "AbortError") console.error("AI improve error:", err);
    } finally {
      abortRef.current = null;
      setIsRefining(false);
      setGenPrompt("");
      isSavingLocked.current = false;
      playCompletionSound();
    }
  }

  // ─── AI Refine / Regenerate (unified) ──────────────────
  type AiMode = "refine-element" | "refine-section" | "regenerate-section";
  const [aiMode, setAiMode] = useState<AiMode>("refine-element");

  function handleAiAction(action: AiAction) {
    setAiModal(action);
    setAiPrompt("");
    // Default mode: if user selected a section directly, default to refine-section
    setAiMode(action.isSection ? "refine-section" : "refine-element");
  }

  async function executeAiAction(modeOverride?: AiMode) {
    if (!aiModal) return;
    const mode = modeOverride || aiMode;
    const instruction = aiPrompt.trim();
    if (mode !== "regenerate-section" && !instruction) return;

    const targetId =
      mode === "refine-element"
        ? aiModal.componentId
        : aiModal.sectionComponentId || aiModal.componentId;
    const targetHtml =
      mode === "refine-element"
        ? aiModal.html
        : aiModal.sectionHtml || aiModal.html;

    // Capture current full HTML and the target's HTML before closing modal
    const ed = editorRef.current?.getEditor();
    if (!ed) return;
    const fullHtmlBefore = ed.getHtml();

    setIsRefining(true);
    setAiModal(null);
    isSavingLocked.current = true;

    const ac = new AbortController();
    abortRef.current = ac;

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
      const body: Record<string, unknown> = {
        landingId: landing.id,
        sectionId: "__new__",
        currentHtml: targetHtml,
        skipDbUpdate: true,
        themeName: getThemeName(),
        brandKit: getBrandKit(),
        instruction:
          mode === "regenerate-section"
            ? instruction ||
              "Regenerate this section with a completely fresh design, keep the same purpose and content type but change the visual approach entirely"
            : instruction,
      };
      if (mode === "regenerate-section") body.isVariant = true;

      const res = await fetch("/api/v2/landing3-refine", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        signal: ac.signal,
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        const errText = await res.text().catch(() => "");
        console.error("Refine failed:", res.status, errText);
        return;
      }

      const reader = res.body?.getReader();
      if (!reader) return;

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
              const data = JSON.parse(line.slice(6));
              if ((event === "chunk" || event === "done") && data.html) {
                latestNewHtml = data.html;
                // No throttled canvas updates — shimmer provides feedback,
                // final result applied after stream completes
              }
            } catch {
              /* skip */
            }
          }
        }
      }

      // Clean markdown fences from AI output
      if (latestNewHtml) {
        latestNewHtml = latestNewHtml
          .replace(/^```html?\s*/i, "")
          .replace(/```\s*$/, "")
          .trim();
        const updatedFull = fullHtmlBefore.replace(targetHtml, latestNewHtml);
        ed.setComponents(updatedFull);
        // Scroll canvas to the refined section
        requestAnimationFrame(() => {
          try {
            const wrapper = ed.DomComponents.getWrapper();
            if (wrapper) {
              const updated = findById(wrapper, targetId);
              if (updated) {
                const el = updated.getEl();
                if (el)
                  el.scrollIntoView({ behavior: "smooth", block: "center" });
              }
            }
          } catch {
            /* skip */
          }
        });
      }

      // Save after refine completes
      if (latestNewHtml) {
        const finalHtml = editorRef.current?.getHtml() || "";
        const css = ed.getCss();
        const fullWithCss = css
          ? `<style>${css}</style>\n${finalHtml}`
          : finalHtml;
        const newSections = grapesToSections(fullWithCss);
        saveFetcher.submit(
          { intent: "update-sections", sections: JSON.stringify(newSections) },
          { method: "post" },
        );
      }
    } catch (err: any) {
      if (err?.name !== "AbortError") console.error("AI refine error:", err);
    } finally {
      abortRef.current = null;
      // Remove shimmer
      try {
        const wrapper = ed.DomComponents.getWrapper();
        if (wrapper) {
          const comp = findById(wrapper, targetId);
          if (comp) comp.removeClass("easybits-refining");
        }
      } catch {
        /* skip */
      }
      setIsRefining(false);
      setAiPrompt("");
      isSavingLocked.current = false;
      playCompletionSound();
    }
  }

  return (
    <article className="pt-14 pb-0 md:pl-20 w-full h-screen flex flex-col overflow-hidden">
      {/* Top bar */}
      <div className="grid grid-cols-3 items-center px-4 py-2 shrink-0 border-b border-gray-200 bg-white z-10">
        {/* Left: back + name */}
        <div className="flex items-center gap-3">
          <Link
            to="/dash/landings4"
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

        {/* Center: viewport toggle */}
        <div className="flex items-center justify-center gap-1">
          {[
            {
              id: "Desktop",
              label: "Desktop",
              icon: (
                <svg
                  className="w-4 h-4"
                  viewBox="0 0 20 20"
                  fill="currentColor"
                >
                  <path
                    fillRule="evenodd"
                    d="M2 4.25A2.25 2.25 0 014.25 2h11.5A2.25 2.25 0 0118 4.25v8.5A2.25 2.25 0 0115.75 15h-3.105a3.501 3.501 0 001.1 1.677A.75.75 0 0113.26 18H6.74a.75.75 0 01-.484-1.323A3.501 3.501 0 007.355 15H4.25A2.25 2.25 0 012 12.75v-8.5zm1.5 0a.75.75 0 01.75-.75h11.5a.75.75 0 01.75.75v8.5a.75.75 0 01-.75.75H4.25a.75.75 0 01-.75-.75v-8.5z"
                    clipRule="evenodd"
                  />
                </svg>
              ),
            },
            {
              id: "Tablet",
              label: "Tablet",
              icon: (
                <svg
                  className="w-4 h-4"
                  viewBox="0 0 20 20"
                  fill="currentColor"
                >
                  <path
                    fillRule="evenodd"
                    d="M5 1a2 2 0 00-2 2v14a2 2 0 002 2h10a2 2 0 002-2V3a2 2 0 00-2-2H5zm0 1.5h10a.5.5 0 01.5.5v14a.5.5 0 01-.5.5H5a.5.5 0 01-.5-.5V3a.5.5 0 01.5-.5zm4 14a1 1 0 112 0 1 1 0 01-2 0z"
                    clipRule="evenodd"
                  />
                </svg>
              ),
            },
            {
              id: "Mobile",
              label: "Mobile",
              icon: (
                <svg
                  className="w-4 h-4"
                  viewBox="0 0 20 20"
                  fill="currentColor"
                >
                  <path
                    fillRule="evenodd"
                    d="M6 2a2 2 0 00-2 2v12a2 2 0 002 2h8a2 2 0 002-2V4a2 2 0 00-2-2H6zm0 1.5h8a.5.5 0 01.5.5v12a.5.5 0 01-.5.5H6a.5.5 0 01-.5-.5V4a.5.5 0 01.5-.5zm3 13a1 1 0 112 0 1 1 0 01-2 0z"
                    clipRule="evenodd"
                  />
                </svg>
              ),
            },
          ].map((d) => (
            <button
              key={d.id}
              onClick={() => editorRef.current?.getEditor()?.setDevice(d.id)}
              className="p-1.5 rounded-lg transition-colors text-gray-400 hover:text-gray-600 hover:bg-gray-100"
              title={d.label}
            >
              {d.icon}
            </button>
          ))}
        </div>

        {/* Right: actions */}
        <div className="flex items-center gap-2 justify-end">
          {/* AI generate/improve button */}
          {isGenerating || isRefining ? (
            <BrutalButton
              size="chip"
              mode="ghost"
              onClick={() => abortRef.current?.abort()}
            >
              <span className="inline-block w-3.5 h-3.5 border-2 border-gray-300 border-t-brand-500 rounded-full animate-spin mr-1.5 align-middle" />
              {isGenerating
                ? `Generando (${genSectionCount})...`
                : "Refinando..."}{" "}
              <span className="text-red-500 font-black">✕</span>
            </BrutalButton>
          ) : (
            <BrutalButton
              size="chip"
              mode="ghost"
              onClick={() => setShowGenModal(true)}
            >
              {hasContent() ? "Regenerar todo" : "Generar con AI"}
            </BrutalButton>
          )}

          {/* Preview toggle */}
          <button
            onClick={() => {
              const newState = editorRef.current?.togglePreview();
              setPreviewActive(!!newState);
            }}
            className={`p-1.5 rounded-lg transition-colors ${
              previewActive
                ? "text-brand-600 bg-brand-50 ring-1 ring-brand-300"
                : "text-gray-400 hover:text-gray-600 hover:bg-gray-100"
            }`}
            title={previewActive ? "Salir de preview" : "Preview"}
          >
            <svg className="w-4 h-4" viewBox="0 0 20 20" fill="currentColor"><path d="M10 12.5a2.5 2.5 0 100-5 2.5 2.5 0 000 5z" /><path fillRule="evenodd" d="M.664 10.59a1.651 1.651 0 010-1.186A10.004 10.004 0 0110 3c4.257 0 7.893 2.66 9.336 6.41.147.381.146.804 0 1.186A10.004 10.004 0 0110 17c-4.257 0-7.893-2.66-9.336-6.41zM14 10a4 4 0 11-8 0 4 4 0 018 0z" clipRule="evenodd" /></svg>
          </button>

          {/* Toggle component border guides (sw-visibility) */}
          <button
            onClick={() => {
              const newState = editorRef.current?.toggleSwVisibility();
              setSwActive(!!newState);
            }}
            className={`p-1.5 rounded-lg transition-colors ${
              swActive
                ? "text-brand-600 bg-brand-50 ring-1 ring-brand-300"
                : "text-gray-400 hover:text-gray-600 hover:bg-gray-100"
            }`}
            title={swActive ? "Ocultar guías" : "Mostrar guías"}
          >
            <svg className="w-4 h-4" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5">
              <rect x="3" y="3" width="14" height="14" rx="2" strokeDasharray="3 2" />
              <line x1="10" y1="3" x2="10" y2="17" strokeDasharray="3 2" />
              <line x1="3" y1="10" x2="17" y2="10" strokeDasharray="3 2" />
            </svg>
          </button>



          <BrutalButton
            size="chip"
            onClick={() => {
              if (saveTimer.current) clearTimeout(saveTimer.current);
              // Save current state first
              const html = editorRef.current?.getHtml() || "";
              const currentSections = grapesToSections(html);
              saveFetcher.submit(
                {
                  intent: "update-sections",
                  sections: JSON.stringify(currentSections),
                },
                { method: "post" },
              );
              setActiveIntent("deploy");
              deploySeq.current++;
              deployFetcher.submit({ intent: "deploy" }, { method: "post" });
            }}
            isLoading={activeIntent === "deploy"}
            isDisabled={activeIntent !== null}
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
                      deploySeq.current++;
                      deployFetcher.submit(
                        { intent: "unpublish" },
                        { method: "post" },
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
                    deploySeq.current++;
                    deployFetcher.submit(
                      { intent: "delete" },
                      { method: "post" },
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

      {/* Main editor area — sidebar + canvas inside GrapesEditor */}
      <div className="flex-1 overflow-hidden">
        <Suspense
          fallback={
            <div className="flex items-center justify-center h-full">
              <span className="block w-8 h-8 border-[3px] border-gray-200 border-t-brand-500 rounded-full animate-spin" />
            </div>
          }
        >
          <GrapesEditor
            ref={editorRef}
            initialHtml={initialHtml}
            theme={currentTheme}
            customColors={currentCustomColors}
            brandKits={brandKits as any}
            initialBrandKitId={(landingMeta?.brandKitId as string) || undefined}
            onChange={handleEditorChange}
            onAiAction={handleAiAction}
            onThemeChange={handleThemeChange}
            onBrandKitChange={setActiveBrandKit}
          />
        </Suspense>
      </div>

      {/* Refining indicator */}
      {isRefining && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 flex items-center gap-3 px-5 py-3 bg-gray-900 text-white rounded-xl shadow-xl border border-gray-700">
          <span className="block w-4 h-4 border-2 border-gray-500 border-t-brand-400 rounded-full animate-spin" />
          <span className="text-sm font-bold">AI refinando...</span>
        </div>
      )}

      {/* AI modal — context-aware */}
      {aiModal &&
        (() => {
          const isSection = !!aiModal.isSection;
          return (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
              <div className="bg-white rounded-2xl border-2 border-black shadow-[6px_6px_0_#000] p-6 w-full max-w-md mx-4">
                <h3 className="text-lg font-black mb-1">
                  ✦ {isSection ? "Secci\u00f3n" : "Elemento"}
                </h3>
                <p className="text-sm text-gray-500 mb-4">
                  {isSection
                    ? "\u00bfQu\u00e9 quieres cambiar de esta secci\u00f3n?"
                    : "\u00bfQu\u00e9 quieres cambiar de este elemento?"}
                </p>

                <textarea
                  value={aiPrompt}
                  onChange={(e) => setAiPrompt(e.target.value)}
                  placeholder="Ej: Mejor copy, m\u00e1s profesional, otro color, m\u00e1s compacto..."
                  rows={3}
                  className="w-full px-4 py-2 border-2 border-black rounded-xl resize-none focus:outline-none"
                  autoFocus
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault();
                      executeAiAction(
                        isSection ? "refine-section" : "refine-element",
                      );
                    }
                    if (e.key === "Escape") setAiModal(null);
                  }}
                />

                <div className="flex gap-2 mt-4 justify-end">
                  <BrutalButton
                    size="chip"
                    mode="ghost"
                    onClick={() => {
                      setAiModal(null);
                      setAiPrompt("");
                    }}
                  >
                    Cancelar
                  </BrutalButton>
                  {isSection && (
                    <BrutalButton
                      size="chip"
                      mode="ghost"
                      onClick={() => executeAiAction("regenerate-section")}
                      isLoading={isRefining && aiMode === "regenerate-section"}
                    >
                      Regenerar
                    </BrutalButton>
                  )}
                  <BrutalButton
                    size="chip"
                    onClick={() =>
                      executeAiAction(
                        isSection ? "refine-section" : "refine-element",
                      )
                    }
                    isDisabled={!aiPrompt.trim()}
                    isLoading={isRefining && aiMode !== "regenerate-section"}
                  >
                    Refinar
                  </BrutalButton>
                </div>
              </div>
            </div>
          );
        })()}

      {/* AI Generation/Improve modal */}
      {showGenModal &&
        (() => {
          const isImprove = hasContent();
          return (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
              <div className="bg-white rounded-2xl border-2 border-black shadow-[6px_6px_0_#000] p-6 w-full max-w-md mx-4">
                <h3 className="text-lg font-black mb-3">
                  {isImprove ? "Regenerar todo" : "Generar con AI"}
                </h3>
                <p className="text-sm text-gray-500 mb-4">
                  {isImprove
                    ? "Se regenerar\u00e1 toda la landing. Describe c\u00f3mo la quieres."
                    : "Describe tu landing y la AI generar\u00e1 las secciones"}
                </p>
                <textarea
                  value={genPrompt}
                  onChange={(e) => setGenPrompt(e.target.value)}
                  placeholder="Ej: Landing para un SaaS de analytics con hero, features, pricing y CTA..."
                  rows={4}
                  className="w-full px-4 py-2 border-2 border-black rounded-xl resize-none focus:outline-none"
                  autoFocus
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault();
                      handleGenerate();
                    }
                  }}
                />
                <div className="flex gap-2 mt-4 justify-end">
                  <BrutalButton
                    size="chip"
                    mode="ghost"
                    onClick={() => {
                      setShowGenModal(false);
                      setGenPrompt("");
                    }}
                  >
                    Cancelar
                  </BrutalButton>
                  <BrutalButton
                    size="chip"
                    onClick={handleGenerate}
                    isDisabled={!genPrompt.trim()}
                  >
                    {isImprove ? "Regenerar todo" : "Generar"}
                  </BrutalButton>
                </div>
              </div>
            </div>
          );
        })()}
    </article>
  );
}
