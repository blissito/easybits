import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { motion, AnimatePresence } from "motion/react";
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
import {
  type LandingSection,
  type SectionType,
  SECTION_LABELS,
  LANDING_THEMES,
  renderSection,
} from "~/lib/landingCatalog";
import { buildLandingHtml, type CustomColors } from "~/lib/buildLandingHtml";
import type { Route } from "./+types/editor";

export const meta = () => [
  { title: "Editor Landing — EasyBits" },
  { name: "robots", content: "noindex" },
];

export const loader = async ({ request, params }: Route.LoaderArgs) => {
  const user = await getUserOrRedirect(request);
  const landing = await db.landing.findUnique({ where: { id: params.id } });
  if (!landing || landing.ownerId !== user.id) {
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

export const action = async ({ request, params }: Route.ActionArgs) => {
  const user = await getUserOrRedirect(request);
  const landing = await db.landing.findUnique({ where: { id: params.id } });
  if (!landing || landing.ownerId !== user.id) {
    return { error: "No encontrado" };
  }

  const formData = await request.formData();
  const intent = formData.get("intent");

  if (intent === "update-sections") {
    const sections = JSON.parse(String(formData.get("sections") || "[]"));
    await db.landing.update({
      where: { id: params.id },
      data: { sections },
    });
    return { ok: true };
  }

  if (intent === "update-theme") {
    const theme = String(formData.get("theme"));
    const rawColors = formData.get("customColors");
    const customColors = rawColors ? JSON.parse(String(rawColors)) : null;
    await db.landing.update({
      where: { id: params.id },
      data: { theme, customColors },
    });
    return { ok: true };
  }

  if (intent === "deploy") {
    const { deployLanding } = await import(
      "~/.server/core/landingOperations"
    );
    const { authenticateRequest, requireAuth } = await import(
      "~/.server/apiAuth"
    );
    const ctx = requireAuth(await authenticateRequest(request));
    const result = await deployLanding(ctx, params.id);
    return result;
  }

  if (intent === "unpublish") {
    const { unpublishLanding } = await import(
      "~/.server/core/landingOperations"
    );
    const { authenticateRequest, requireAuth } = await import(
      "~/.server/apiAuth"
    );
    const ctx = requireAuth(await authenticateRequest(request));
    await unpublishLanding(ctx, params.id);
    return { unpublished: true };
  }

  if (intent === "delete") {
    if (landing.websiteId) {
      const { unpublishLanding } = await import(
        "~/.server/core/landingOperations"
      );
      const { authenticateRequest, requireAuth } = await import(
        "~/.server/apiAuth"
      );
      const ctx = requireAuth(await authenticateRequest(request));
      await unpublishLanding(ctx, params.id);
    }
    await db.landing.delete({ where: { id: params.id } });
    return { redirect: "/dash/landings" };
  }

  return { error: "Intent desconocido" };
};

// ── Viewport presets ──
const VIEWPORTS = [
  { id: "desktop", width: "100%", label: "Desktop", icon: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="3" width="20" height="14" rx="2"/><path d="M8 21h8m-4-4v4"/></svg>
  )},
  { id: "tablet", width: "768px", label: "Tablet", icon: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="4" y="2" width="16" height="20" rx="2"/><path d="M12 18h.01"/></svg>
  )},
  { id: "mobile", width: "375px", label: "Mobile", icon: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="5" y="2" width="14" height="20" rx="2"/><path d="M12 18h.01"/></svg>
  )},
] as const;

export default function LandingEditor() {
  const { landing, websiteUrl } = useLoaderData<typeof loader>();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const saveFetcher = useFetcher();
  const deployFetcher = useFetcher<{ url?: string; redirect?: string; unpublished?: boolean }>();
  const [activeIntent, setActiveIntent] = useState<string | null>(null);

  const [sections, setSections] = useState<LandingSection[]>(() => {
    const raw = landing.sections;
    return Array.isArray(raw) ? (raw as unknown as LandingSection[]) : [];
  });
  const [theme, setTheme] = useState(landing.theme || "modern");
  const [customColors, setCustomColors] = useState<CustomColors | null>(() => {
    const raw = landing.customColors;
    if (raw && typeof raw === "object" && "bg" in (raw as any)) {
      return raw as unknown as CustomColors;
    }
    return null;
  });
  const isCustomTheme = theme === "custom";

  const [selectedSection, setSelectedSection] = useState<string | null>(null);
  const [isGenerating, setIsGenerating] = useState(
    searchParams.get("generating") === "1"
  );
  const [liveUrl, setLiveUrl] = useState(websiteUrl);
  const [previewWidth, setPreviewWidth] = useState<string>("100%");
  const [overflowOpen, setOverflowOpen] = useState(false);

  const iframeRef = useRef<HTMLIFrameElement>(null);
  const overflowRef = useRef<HTMLDivElement>(null);

  // Handle redirect from delete + clear active intent
  useEffect(() => {
    if (deployFetcher.state === "idle") setActiveIntent(null);
    if (deployFetcher.data?.redirect) {
      navigate(deployFetcher.data.redirect);
    }
    if (deployFetcher.data?.url) {
      setLiveUrl(deployFetcher.data.url);
    }
    if (deployFetcher.data?.unpublished) {
      setLiveUrl(null);
    }
  }, [deployFetcher.state, deployFetcher.data, navigate]);

  // Auto-generate on mount
  useEffect(() => {
    if (!isGenerating || sections.length > 0) {
      setIsGenerating(false);
      return;
    }
    generateSections();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Close overflow on outside click
  useEffect(() => {
    if (!overflowOpen) return;
    function handleClick(e: MouseEvent) {
      if (overflowRef.current && !overflowRef.current.contains(e.target as Node)) {
        setOverflowOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [overflowOpen]);

  // ESC to deselect / close overflow
  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        if (overflowOpen) setOverflowOpen(false);
        else setSelectedSection(null);
      }
    }
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [overflowOpen]);

  async function generateSections() {
    setIsGenerating(true);
    try {
      const res = await fetch("/api/v2/landing-generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          landingId: landing.id,
          prompt: landing.prompt,
          theme,
        }),
      });
      if (!res.ok) throw new Error("Generation failed");
      const result = await res.json();
      if (result.sections) {
        setSections(result.sections);
        saveSections(result.sections);
      }
    } catch (err) {
      console.error("Generation error:", err);
    } finally {
      setIsGenerating(false);
    }
  }

  function saveSections(s: LandingSection[]) {
    saveFetcher.submit(
      { intent: "update-sections", sections: JSON.stringify(s) },
      { method: "post" }
    );
  }

  function saveTheme(newTheme: string, colors?: CustomColors | null) {
    setTheme(newTheme);
    const c = newTheme === "custom" ? (colors ?? customColors) : null;
    if (newTheme === "custom" && !c) {
      // Initialize custom colors from current theme
      const current = LANDING_THEMES.find((t) => t.id === theme) ?? LANDING_THEMES[0];
      const init: CustomColors = { bg: current.bg, accent: current.accent, text: current.text };
      setCustomColors(init);
      saveFetcher.submit(
        { intent: "update-theme", theme: newTheme, customColors: JSON.stringify(init) },
        { method: "post" }
      );
      return;
    }
    setCustomColors(c ?? null);
    saveFetcher.submit(
      {
        intent: "update-theme",
        theme: newTheme,
        ...(c ? { customColors: JSON.stringify(c) } : {}),
      },
      { method: "post" }
    );
  }

  function updateCustomColor(key: keyof CustomColors, value: string) {
    const updated = { ...(customColors ?? { bg: "#ffffff", accent: "#6366f1", text: "#111827" }), [key]: value };
    setCustomColors(updated);
    // Debounce save via theme
    saveFetcher.submit(
      { intent: "update-theme", theme: "custom", customColors: JSON.stringify(updated) },
      { method: "post" }
    );
  }

  const updateSection = useCallback(
    (id: string, newProps: Record<string, any>) => {
      setSections((prev) => {
        const updated = prev.map((s) =>
          s.id === id
            ? { ...s, props: { ...s.props, ...newProps }, html: undefined }
            : s
        );
        saveSections(updated);
        return updated;
      });
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    []
  );

  function removeSection(id: string) {
    setSections((prev) => {
      const updated = prev
        .filter((s) => s.id !== id)
        .map((s, i) => ({ ...s, order: i }));
      saveSections(updated);
      return updated;
    });
    if (selectedSection === id) setSelectedSection(null);
  }

  function moveSection(id: string, direction: "up" | "down") {
    setSections((prev) => {
      const idx = prev.findIndex((s) => s.id === id);
      if (idx < 0) return prev;
      const swap = direction === "up" ? idx - 1 : idx + 1;
      if (swap < 0 || swap >= prev.length) return prev;
      const arr = [...prev];
      [arr[idx], arr[swap]] = [arr[swap], arr[idx]];
      const updated = arr.map((s, i) => ({ ...s, order: i }));
      saveSections(updated);
      return updated;
    });
  }

  // Build preview HTML
  const previewHtml = useMemo(
    () => buildLandingHtml(sections, theme, isCustomTheme ? customColors : null, { preview: true }),
    [sections, theme, customColors, isCustomTheme]
  );
  const initialHtmlRef = useRef(previewHtml);
  const iframeReady = useRef(false);

  // Update iframe content on any change
  useEffect(() => {
    if (!iframeReady.current) return;
    const doc = iframeRef.current?.contentDocument;
    if (!doc) return;
    doc.open();
    doc.write(previewHtml);
    doc.close();
  }, [previewHtml]);

  const [refineInstruction, setRefineInstruction] = useState("");
  const [isRefining, setIsRefining] = useState(false);

  async function refineSection(sectionId: string, instruction: string) {
    setIsRefining(true);
    try {
      const res = await fetch("/api/v2/landing-refine-section", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          landingId: landing.id,
          sectionId,
          instruction,
        }),
      });
      if (!res.ok) throw new Error("Refine failed");
      const { html } = await res.json();
      setSections((prev) => {
        const updated = prev.map((s) =>
          s.id === sectionId ? { ...s, html } : s
        );
        saveSections(updated);
        return updated;
      });
      setRefineInstruction("");
    } catch (err) {
      console.error("Refine error:", err);
    } finally {
      setIsRefining(false);
    }
  }

  function resetSectionToTemplate(id: string) {
    setSections((prev) => {
      const updated = prev.map((s) =>
        s.id === id ? { ...s, html: undefined } : s
      );
      saveSections(updated);
      return updated;
    });
  }

  const selected = sections.find((s) => s.id === selectedSection);

  return (
    <article className="pt-16 px-4 pb-8 md:pl-32 w-full h-screen flex flex-col">
      {/* Top bar */}
      <div className="flex items-center justify-between gap-4 mb-4 shrink-0">
        <div className="flex items-center gap-3">
          <Link
            to="/dash/landings"
            className="text-sm font-bold hover:underline"
          >
            &larr;
          </Link>
          <h1 className="text-xl font-black truncate max-w-xs">
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
              <Copy text={liveUrl} mode="ghost" className="relative static p-0" />
            </span>
          )}
        </div>

        <div className="flex items-center gap-2">
          {/* Theme selector */}
          <select
            value={theme}
            onChange={(e) => saveTheme(e.target.value)}
            className="text-xs border-2 border-black rounded-lg px-2 py-1 font-bold bg-white"
          >
            {LANDING_THEMES.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
            <option value="custom">Personalizado</option>
          </select>

          {/* Custom color pickers */}
          {isCustomTheme && customColors && (
            <div className="flex items-center gap-1.5">
              <ColorPicker label="Fondo" value={customColors.bg} onChange={(v) => updateCustomColor("bg", v)} />
              <ColorPicker label="Acento" value={customColors.accent} onChange={(v) => updateCustomColor("accent", v)} />
              <ColorPicker label="Texto" value={customColors.text} onChange={(v) => updateCustomColor("text", v)} />
            </div>
          )}

          {/* Primary action */}
          <BrutalButton
            size="chip"
            onClick={() => {
              setActiveIntent("deploy");
              deployFetcher.submit({ intent: "deploy" }, { method: "post" });
            }}
            isLoading={activeIntent === "deploy"}
            isDisabled={sections.length === 0 || activeIntent !== null}
          >
            {liveUrl ? "Actualizar" : "Publicar"}
          </BrutalButton>

          {/* Overflow menu */}
          <div ref={overflowRef} className="relative">
            <button
              onClick={() => setOverflowOpen((p) => !p)}
              className="flex items-center justify-center w-8 h-8 rounded-lg border-2 border-black bg-white font-black text-sm hover:bg-gray-50 transition-colors"
              title="Más acciones"
            >
              ···
            </button>
            {overflowOpen && (
              <div className="absolute right-0 top-full mt-1 w-48 bg-white border-2 border-black rounded-xl shadow-[4px_4px_0_#000] z-50 py-1 overflow-hidden">
                <button
                  onClick={() => {
                    setOverflowOpen(false);
                    generateSections();
                  }}
                  disabled={isGenerating}
                  className="w-full text-left px-4 py-2 text-sm font-bold hover:bg-gray-50 disabled:opacity-50 flex items-center gap-2"
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 2v6h-6"/><path d="M3 12a9 9 0 0 1 15-6.7L21 8"/><path d="M3 22v-6h6"/><path d="M21 12a9 9 0 0 1-15 6.7L3 16"/></svg>
                  Regenerar
                </button>
                {liveUrl && (
                  <button
                    onClick={() => {
                      setOverflowOpen(false);
                      setActiveIntent("unpublish");
                      deployFetcher.submit({ intent: "unpublish" }, { method: "post" });
                    }}
                    disabled={activeIntent !== null}
                    className="w-full text-left px-4 py-2 text-sm font-bold hover:bg-gray-50 disabled:opacity-50 flex items-center gap-2"
                  >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18.36 6.64a9 9 0 1 1-12.73 0"/><line x1="12" y1="2" x2="12" y2="12"/></svg>
                    Despublicar
                  </button>
                )}
                <div className="border-t border-gray-200 my-1" />
                <button
                  onClick={() => {
                    setOverflowOpen(false);
                    if (!confirm("¿Eliminar esta landing?")) return;
                    setActiveIntent("delete");
                    deployFetcher.submit({ intent: "delete" }, { method: "post" });
                  }}
                  disabled={activeIntent !== null}
                  className="w-full text-left px-4 py-2 text-sm font-bold text-red-600 hover:bg-red-50 disabled:opacity-50 flex items-center gap-2"
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/></svg>
                  Eliminar
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Main layout */}
      <div className="flex-1 flex gap-4 min-h-0">
        {/* Left: section list + editor */}
        <div className="w-80 shrink-0 flex flex-col gap-3 overflow-y-auto">
          {isGenerating ? (
            <div className="flex flex-col items-center justify-center py-16">
              <Spinner />
              <p className="text-sm text-gray-500 mt-4">
                Generando secciones...
              </p>
            </div>
          ) : (
            <>
              <div className="space-y-1">
                {sections
                  .sort((a, b) => a.order - b.order)
                  .map((section) => (
                    <div
                      key={section.id}
                      className={`flex items-center gap-2 p-2 rounded-lg cursor-pointer border-2 transition-all ${
                        selectedSection === section.id
                          ? "border-brand-500 bg-brand-50"
                          : "border-transparent hover:bg-gray-50"
                      }`}
                      onClick={() => {
                        const next = selectedSection === section.id ? null : section.id;
                        setSelectedSection(next);
                        if (next && iframeRef.current?.contentWindow) {
                          iframeRef.current.contentWindow.postMessage(
                            { type: "scrollToSection", id: next },
                            "*"
                          );
                        }
                      }}
                    >
                      <span className="text-xs font-bold text-gray-400 w-5 text-center">
                        {section.order + 1}
                      </span>
                      <span className="text-sm font-bold flex-1 truncate">
                        {SECTION_LABELS[section.type] || section.type}
                      </span>
                      {section.html && (
                        <span className="text-[10px] font-black bg-brand-100 text-brand-700 px-1.5 py-0.5 rounded-md">
                          IA
                        </span>
                      )}
                      <div className="flex gap-0.5">
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            moveSection(section.id, "up");
                          }}
                          className="p-1 hover:bg-gray-200 rounded text-xs"
                          title="Mover arriba"
                        >
                          ↑
                        </button>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            moveSection(section.id, "down");
                          }}
                          className="p-1 hover:bg-gray-200 rounded text-xs"
                          title="Mover abajo"
                        >
                          ↓
                        </button>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            removeSection(section.id);
                          }}
                          className="p-1 hover:bg-red-100 rounded text-xs text-red-500"
                          title="Eliminar"
                        >
                          ×
                        </button>
                      </div>
                    </div>
                  ))}
              </div>

              {/* Section editor */}
              <AnimatePresence mode="wait">
                {selected && (
                  <motion.div
                    key={selected.id}
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -8 }}
                    className="border-2 border-black rounded-xl p-4 bg-white"
                  >
                    <h3 className="text-sm font-black mb-3 uppercase">
                      {SECTION_LABELS[selected.type]}
                    </h3>
                    <SectionPropsEditor
                      section={selected}
                      onUpdate={(newProps) =>
                        updateSection(selected.id, newProps)
                      }
                    />

                    {/* Refine with AI */}
                    <div className="mt-4 pt-4 border-t border-gray-200">
                      <label className="block text-xs font-bold text-gray-500 mb-1">
                        Refinar con IA
                      </label>
                      <textarea
                        value={refineInstruction}
                        onChange={(e) => setRefineInstruction(e.target.value)}
                        placeholder="Describe el cambio... ej: hazlo más oscuro, agrega una animación, cambia el layout a dos columnas"
                        rows={2}
                        className="w-full text-sm border rounded-lg px-2 py-1 resize-none mb-2"
                      />
                      <div className="flex gap-2">
                        <BrutalButton
                          size="chip"
                          onClick={() =>
                            refineSection(selected.id, refineInstruction)
                          }
                          isLoading={isRefining}
                          isDisabled={
                            isRefining || !refineInstruction.trim()
                          }
                        >
                          Aplicar
                        </BrutalButton>
                        {selected.html && (
                          <BrutalButton
                            size="chip"
                            mode="ghost"
                            onClick={() =>
                              resetSectionToTemplate(selected.id)
                            }
                          >
                            Restablecer
                          </BrutalButton>
                        )}
                      </div>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </>
          )}
        </div>

        {/* Right: preview */}
        <div className="flex-1 flex flex-col border-2 border-black rounded-xl overflow-hidden bg-gray-100">
          {/* Viewport bar */}
          <div className="flex items-center gap-1 px-3 py-1.5 bg-white border-b-2 border-black shrink-0">
            {VIEWPORTS.map((vp) => (
              <button
                key={vp.id}
                onClick={() => setPreviewWidth(vp.width)}
                className={`p-1.5 rounded-lg transition-colors ${
                  previewWidth === vp.width
                    ? "bg-black text-white"
                    : "text-gray-500 hover:bg-gray-100"
                }`}
                title={vp.label}
              >
                {vp.icon}
              </button>
            ))}
          </div>
          <div className="flex-1 overflow-hidden flex justify-center bg-gray-100">
            <iframe
              ref={iframeRef}
              srcDoc={initialHtmlRef.current}
              onLoad={() => { iframeReady.current = true; }}
              className="h-full border-0 bg-white transition-all duration-300"
              style={{ width: previewWidth, maxWidth: "100%" }}
              sandbox="allow-scripts allow-same-origin"
              title="Landing preview"
            />
          </div>
        </div>
      </div>
    </article>
  );
}

// ── Color Picker ──

function ColorPicker({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <label className="flex items-center gap-1 cursor-pointer" title={label}>
      <input
        type="color"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-6 h-6 rounded border border-black cursor-pointer p-0"
      />
      <span className="text-[10px] font-bold text-gray-500">{label}</span>
    </label>
  );
}

// ── TextField (stable component — must be outside SectionPropsEditor) ──

function TextField({
  label,
  field,
  value: initialValue,
  onUpdate,
  multiline,
}: {
  label: string;
  field: string;
  value: string;
  onUpdate: (props: Record<string, any>) => void;
  multiline?: boolean;
}) {
  const [value, setValue] = useState(initialValue);
  const timerRef = useRef<ReturnType<typeof setTimeout>>(undefined);

  function handleChange(val: string) {
    setValue(val);
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => onUpdate({ [field]: val }), 500);
  }

  return (
    <div className="mb-3">
      <label className="block text-xs font-bold text-gray-500 mb-1">
        {label}
      </label>
      {multiline ? (
        <textarea
          value={value}
          onChange={(e) => handleChange(e.target.value)}
          rows={3}
          className="w-full text-sm border rounded-lg px-2 py-1 resize-none"
        />
      ) : (
        <input
          value={value}
          onChange={(e) => handleChange(e.target.value)}
          className="w-full text-sm border rounded-lg px-2 py-1"
        />
      )}
    </div>
  );
}

// ── Section Props Editor ──

function SectionPropsEditor({
  section,
  onUpdate,
}: {
  section: LandingSection;
  onUpdate: (props: Record<string, any>) => void;
}) {
  const props = section.props || {};

  const f = (label: string, field: string, multiline?: boolean) => (
    <TextField
      key={`${section.id}-${field}`}
      label={label}
      field={field}
      value={props[field] || ""}
      onUpdate={onUpdate}
      multiline={multiline}
    />
  );

  switch (section.type) {
    case "hero":
      return (
        <>
          {f("Título", "headline")}
          {f("Subtítulo", "subtitle", true)}
          {f("Texto del botón", "ctaText")}
          {f("URL del botón", "ctaUrl")}
          {f("URL de imagen", "imageUrl")}
        </>
      );
    case "features":
      return (
        <>
          {f("Título", "title")}
          {f("Subtítulo", "subtitle")}
          <p className="text-xs text-gray-400 mt-2">
            Las características se editan en el JSON por ahora.
          </p>
        </>
      );
    case "howItWorks":
      return (
        <>
          {f("Título", "title")}
          <p className="text-xs text-gray-400 mt-2">
            Los pasos se editan en el JSON por ahora.
          </p>
        </>
      );
    case "testimonials":
      return <>{f("Título", "title")}</>;
    case "pricing":
      return (
        <>
          {f("Título", "title")}
          {f("Subtítulo", "subtitle")}
        </>
      );
    case "stats":
      return <>{f("Título", "title")}</>;
    case "faq":
      return <>{f("Título", "title")}</>;
    case "cta":
      return (
        <>
          {f("Título", "headline")}
          {f("Subtítulo", "subtitle")}
          {f("Texto del botón", "ctaText")}
        </>
      );
    case "logoCloud":
      return <>{f("Título", "title")}</>;
    case "footer":
      return <>{f("Nombre de empresa", "companyName")}</>;
    default:
      return (
        <p className="text-xs text-gray-400">
          Editor no disponible para este tipo de sección.
        </p>
      );
  }
}

