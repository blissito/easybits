import { useState, useEffect, useCallback, useRef } from "react";
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
import { SectionList } from "~/components/landings3/SectionList";
import { FloatingToolbar } from "~/components/landings3/FloatingToolbar";
import { CodeEditor } from "~/components/landings3/CodeEditor";
import type { Section3, IframeMessage } from "~/lib/landing3/types";
import type { Route } from "./+types/editor";

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
  const logoDataUrl = meta.logoDataUrl as string | undefined;

  return { landing, websiteUrl, sourceContent, logoDataUrl };
};

async function withRetry<T>(fn: () => Promise<T>, retries = 3): Promise<T> {
  for (let i = 0; i < retries; i++) {
    try {
      return await fn();
    } catch (err: any) {
      if (err?.code === "P2034" && i < retries - 1) continue;
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
    await withRetry(() =>
      db.landing.update({
        where: { id: params.id },
        data: { sections },
      })
    );
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
  const { landing, websiteUrl, sourceContent, logoDataUrl } =
    useLoaderData<typeof loader>();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const saveFetcher = useFetcher();
  const deployFetcher = useFetcher<{
    url?: string;
    redirect?: string;
    unpublished?: boolean;
  }>();
  const [activeIntent, setActiveIntent] = useState<string | null>(null);

  const [sections, setSections] = useState<Section3[]>(() => {
    const raw = landing.sections;
    return Array.isArray(raw) ? (raw as unknown as Section3[]) : [];
  });

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
  const iframeRectRef = useRef<DOMRect | null>(null);
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const [, setToolbarTick] = useState(0);

  // Add page prompt modal
  const [showAddPrompt, setShowAddPrompt] = useState(false);
  const [addPrompt, setAddPrompt] = useState("");
  const [isAddingSection, setIsAddingSection] = useState(false);

  // Regenerate prompt modal
  const [showRegenPrompt, setShowRegenPrompt] = useState(false);
  const [regenPrompt, setRegenPrompt] = useState("");

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
    if (deployFetcher.data?.url) setLiveUrl(deployFetcher.data.url);
    if (deployFetcher.data?.unpublished) setLiveUrl(null);
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
        if (codeViewSectionId) setCodeViewSectionId(null);
        else if (showRegenPrompt) setShowRegenPrompt(false);
        else if (showAddPrompt) setShowAddPrompt(false);
        else if (overflowOpen) setOverflowOpen(false);
        else if (selection) setSelection(null);
      }
    }
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [
    overflowOpen,
    selection,
    codeViewSectionId,
    showAddPrompt,
    showRegenPrompt,
  ]);

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
      const res = await fetch("/api/v2/document-generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          landingId: landing.id,
          prompt: landing.prompt,
          sourceContent,
          logoDataUrl,
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
              const d = JSON.parse(line.slice(6));
              if (eventType === "section") {
                setSections((prev) => [...prev, d]);
                requestAnimationFrame(() => {
                  streamEndRef.current?.scrollIntoView({
                    behavior: "smooth",
                    block: "end",
                  });
                });
              } else if (eventType === "section-update") {
                setSections((prev) =>
                  prev.map((s) =>
                    s.id === d.id ? { ...s, html: d.html } : s
                  )
                );
              }
            } catch {
              /* skip */
            }
          }
        }
      }
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") return;
      console.error("Generation error:", err);
    } finally {
      if (abortRef.current === controller) setIsGenerating(false);
    }
  }

  const saveSections = useCallback((s: Section3[]) => {
    queueMicrotask(() => {
      saveFetcher.submit(
        { intent: "update-sections", sections: JSON.stringify(s) },
        { method: "post" }
      );
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleSectionsChange = useCallback(
    (newSections: Section3[]) => {
      setSections(newSections);
      saveSections(newSections);
    },
    [saveSections]
  );

  // Listen to iframe messages
  useEffect(() => {
    function handleMessage(e: MessageEvent) {
      const msg = e.data;
      if (!msg?.type) return;
      if (msg.type === "element-selected") {
        setSelection(msg);
        setToolbarTick((t) => t + 1);
      } else if (msg.type === "element-deselected") {
        setSelection(null);
      } else if (msg.type === "text-edited" && msg.sectionId && msg.sectionHtml) {
        setSections((prev) => {
          const updated = prev.map((s) =>
            s.id === msg.sectionId ? { ...s, html: msg.sectionHtml } : s
          );
          saveSections(updated);
          return updated;
        });
      }
    }
    window.addEventListener("message", handleMessage);
    return () => window.removeEventListener("message", handleMessage);
  }, [saveSections]);

  async function handleRefine(instruction: string, referenceImage?: string) {
    if (!selection?.sectionId) return;
    setIsRefining(true);
    try {
      const section = sections.find((s) => s.id === selection.sectionId);
      if (!section) return;
      const sectionId = selection.sectionId;

      const res = await fetch("/api/v2/document-refine", {
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

  function handleDeleteSection() {
    if (!selection?.sectionId) return;
    const updated = sections
      .filter((s) => s.id !== selection.sectionId)
      .map((s, i) => ({ ...s, order: i }));
    handleSectionsChange(updated);
    setSelection(null);
  }

  async function handleAddPage() {
    if (!addPrompt.trim() || isAddingSection) return;
    setIsAddingSection(true);
    const newId = Math.random().toString(36).slice(2, 10);
    try {
      const res = await fetch("/api/v2/document-refine", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          landingId: landing.id,
          sectionId: "__new__",
          instruction: `Create a new page: ${addPrompt}`,
          currentHtml: "<section></section>",
        }),
      });
      if (!res.ok) throw new Error("Add page failed");

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
              if ((event === "chunk" || event === "done") && d.html) {
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
            } catch {}
          }
        }
      }

      setShowAddPrompt(false);
      setAddPrompt("");
    } catch (err) {
      console.error("Add page error:", err);
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

  function handleExportPdf() {
    // Build full HTML with Paged.js and open in new window for window.print()
    const sorted = [...sections].sort((a, b) => a.order - b.order);
    const sectionsHtml = sorted
      .map((s) => `<div class="page-section">${s.html}</div>`)
      .join("\n");

    const html = `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <title>${landing.name}</title>
  <script src="https://cdn.tailwindcss.com"><\/script>
  <script src="https://cdn.jsdelivr.net/npm/chart.js@4"><\/script>
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800;900&display=swap" rel="stylesheet">
  <style>
    @page { size: letter; margin: 0.75in; }
    body { font-family: 'Inter', sans-serif; margin: 0; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    .page-section { page-break-after: always; }
    .page-section:last-child { page-break-after: auto; }
  </style>
</head>
<body>
${sectionsHtml}
<script>
  // Auto-print after load
  window.onload = () => {
    // Wait for Tailwind + charts
    setTimeout(() => window.print(), 1500);
  };
<\/script>
</body>
</html>`;

    const blob = new Blob([html], { type: "text/html" });
    const url = URL.createObjectURL(blob);
    window.open(url, "_blank");
  }

  // Build preview HTML for iframe
  const previewHtml = buildPreviewHtml(sections);

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
        </div>

        <div className="flex items-center gap-2">
          <BrutalButton
            size="chip"
            mode="ghost"
            onClick={handleExportPdf}
            isDisabled={sections.length === 0}
          >
            Exportar PDF
          </BrutalButton>
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

      {/* Main content */}
      <div className="flex flex-1 overflow-hidden relative">
        {/* Section list sidebar */}
        {!codeViewSectionId && (
          <SectionList
            sections={sections}
            selectedSectionId={selection?.sectionId ?? null}
            theme="default"
            customColors={{ primary: "#ef4444" }}
            onThemeChange={() => {}}
            onCustomColorChange={() => {}}
            onSelect={(id) => {
              const el = iframeRef.current?.contentDocument?.getElementById(
                `section-${id}`
              );
              el?.scrollIntoView({ behavior: "smooth" });
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
          />
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
              {isGenerating && sections.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-24">
                  <div className="mb-4">
                    <span className="block w-8 h-8 border-[3px] border-gray-200 border-t-brand-500 rounded-full animate-spin" />
                  </div>
                  <p className="text-sm font-bold text-gray-700">
                    Generando tu documento con AI...
                  </p>
                  <p className="text-xs text-gray-400 mt-1">
                    Cada p&aacute;gina tama&ntilde;o carta se genera una a una
                  </p>
                  <div className="mt-5">
                    <BrutalButton
                      size="chip"
                      mode="ghost"
                      onClick={stopGeneration}
                    >
                      Detener
                    </BrutalButton>
                  </div>
                </div>
              ) : sections.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-24">
                  <p className="text-gray-400 text-sm">Sin p&aacute;ginas</p>
                </div>
              ) : (
                <>
                  <iframe
                    ref={iframeRef}
                    srcDoc={previewHtml}
                    className="w-full h-full border-none"
                    title="Document preview"
                    onLoad={() => {
                      if (iframeRef.current) {
                        iframeRectRef.current =
                          iframeRef.current.getBoundingClientRect();
                      }
                    }}
                  />
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
          onUpdateAttribute={() => {}}
          isRefining={isRefining}
        />
      </div>

      {/* Regenerate modal */}
      {showRegenPrompt && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-white rounded-2xl border-2 border-black shadow-[6px_6px_0_#000] p-6 w-full max-w-md mx-4">
            <h3 className="text-lg font-black mb-3">Regenerar documento</h3>
            <p className="text-sm text-gray-500 mb-4">
              Instrucciones adicionales (opcional)
            </p>
            <textarea
              value={regenPrompt}
              onChange={(e) => setRegenPrompt(e.target.value)}
              placeholder="Ej: Usa colores corporativos azules, agrega más gráficas, hazlo más minimalista..."
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

      {/* Add page modal */}
      {showAddPrompt && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-white rounded-2xl border-2 border-black shadow-[6px_6px_0_#000] p-6 w-full max-w-md mx-4">
            <h3 className="text-lg font-black mb-3">
              Agregar p&aacute;gina
            </h3>
            <p className="text-sm text-gray-500 mb-4">
              Describe el contenido de la nueva p&aacute;gina
            </p>
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
                  handleAddPage();
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
                onClick={handleAddPage}
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

/** Build preview HTML inline (no Paged.js for editor — shows pages visually) */
function buildPreviewHtml(sections: Section3[]): string {
  const sorted = [...sections].sort((a, b) => a.order - b.order);
  const sectionsHtml = sorted
    .map(
      (s) => `<div class="doc-page" data-section-id="${s.id}" id="section-${s.id}">
        ${s.html}
      </div>`
    )
    .join("\n");

  return `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <script src="https://cdn.tailwindcss.com"><\/script>
  <script src="https://cdn.jsdelivr.net/npm/chart.js@4"><\/script>
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800;900&display=swap" rel="stylesheet">
  <style>
    * { box-sizing: border-box; }
    body { font-family: 'Inter', sans-serif; margin: 0; padding: 24px; background: #d1d5db; display: flex; flex-direction: column; align-items: center; gap: 24px; }
    .doc-page { width: 8.5in; min-height: 11in; background: white; box-shadow: 0 2px 8px rgba(0,0,0,0.15); padding: 0.75in; position: relative; cursor: pointer; transition: box-shadow 0.2s; }
    .doc-page:hover { box-shadow: 0 4px 16px rgba(0,0,0,0.2); }
    .doc-page.selected { outline: 3px solid #9870ED; outline-offset: 2px; }
  </style>
</head>
<body>
${sectionsHtml}
<script>
  document.querySelectorAll('.doc-page').forEach(page => {
    page.addEventListener('click', (e) => {
      document.querySelectorAll('.doc-page').forEach(p => p.classList.remove('selected'));
      page.classList.add('selected');
      window.parent.postMessage({ type: 'element-selected', sectionId: page.dataset.sectionId, tagName: 'SECTION', text: page.textContent?.substring(0, 80) || '' }, '*');
    });
  });
  document.addEventListener('click', (e) => {
    if (!e.target.closest('.doc-page')) {
      document.querySelectorAll('.doc-page').forEach(p => p.classList.remove('selected'));
      window.parent.postMessage({ type: 'element-deselected' }, '*');
    }
  });
<\/script>
</body>
</html>`;
}
