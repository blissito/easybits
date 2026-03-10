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
import type { Section3, IframeMessage } from "~/lib/landing3/types";
import { buildSingleThemeCss, getIframeScript } from "@easybits.cloud/html-tailwind-generator";
import { parseFiles, combineContent } from "~/lib/documents/parseFiles";
import { PLANS, type PlanKey } from "~/lib/plans";
import toast from "react-hot-toast";
import type { Route } from "./+types/editor";

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
  const pdfUrl = meta.pdfUrl as string | undefined;

  // AI generation usage
  const userMeta = (user.metadata as Record<string, unknown>) || {};
  const userPlan = (userMeta.plan as string) || "Spark";
  const planConfig = PLANS[userPlan as PlanKey] || PLANS.Spark;
  const aiGenUsed = (user as any).aiGenerationsCount || 0;
  const aiGenLimit = planConfig.aiGenerationsPerMonth;

  return { landing, websiteUrl, sourceContent, logoUrl, pdfUrl, aiGenUsed, aiGenLimit, userPlan };
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

  if (intent === "update-theme") {
    const newTheme = String(formData.get("theme") || "minimal");
    const existing = (landing.metadata as Record<string, unknown>) || {};
    await db.landing.update({
      where: { id: params.id },
      data: { metadata: { ...existing, theme: newTheme } },
    });
    return { ok: true };
  }

  const ctx = { user, scopes: ["ADMIN" as const] };

  if (intent === "deploy") {
    try {
      const pdfUrl = formData.get("pdfUrl")?.toString() || undefined;
      const { deployLanding } = await import(
        "~/.server/core/landingOperations"
      );
      const result = await deployLanding(ctx as any, params.id, { pdfUrl });
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

  if (intent === "get-pdf-put-url") {
    const { getPlatformDefaultClient, PUBLIC_BUCKET } = await import("~/.server/storage");
    const { nanoid } = await import("nanoid");
    const client = getPlatformDefaultClient({ bucket: PUBLIC_BUCKET });
    const storageKey = `pdf/${user.id}/doc-${params.id}-${nanoid(6)}.pdf`;
    const putUrl = await client.getPutUrl(storageKey);
    const publicUrl = `https://${PUBLIC_BUCKET}.fly.storage.tigris.dev/mcp/${storageKey}`;
    return { putUrl, publicUrl };
  }

  if (intent === "save-pdf-url") {
    const pdfUrl = String(formData.get("pdfUrl") || "");
    if (!pdfUrl) return { error: "Missing pdfUrl" };
    const existing = (landing.metadata as Record<string, unknown>) || {};
    await db.landing.update({
      where: { id: params.id },
      data: { metadata: { ...existing, pdfUrl } },
    });
    return { ok: true, pdfUrl };
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
    landing, websiteUrl, sourceContent, logoUrl, pdfUrl: initialPdfUrl,
    aiGenUsed: initialAiGenUsed, aiGenLimit, userPlan,
  } = useLoaderData<typeof loader>();
  const [aiGenUsed, setAiGenUsed] = useState(initialAiGenUsed);
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const saveFetcher = useFetcher();
  const deployFetcher = useFetcher<{
    url?: string;
    redirect?: string;
    unpublished?: boolean;
    putUrl?: string;
    publicUrl?: string;
    pdfUrl?: string;
    ok?: boolean;
  }>();
  const pdfFetcher = useFetcher<{ putUrl?: string; publicUrl?: string }>();
  const [activeIntent, setActiveIntent] = useState<string | null>(null);
  const [pdfLink, setPdfLink] = useState<string | null>(initialPdfUrl || null);
  const [isGeneratingPdf, setIsGeneratingPdf] = useState(false);
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; sectionIds: string[] } | null>(null);
  const [selectedSectionIds, setSelectedSectionIds] = useState<string[]>([]);

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
  const iframeRectRef = useRef<DOMRect | null>(null);
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const generatingShellRef = useRef<string | null>(null);
  const [, setToolbarTick] = useState(0);

  // Add page prompt modal
  const [showAddPrompt, setShowAddPrompt] = useState(false);
  const [addPrompt, setAddPrompt] = useState("");
  const [isAddingSection, setIsAddingSection] = useState(false);
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
  const themeRef = useRef(theme);
  themeRef.current = theme;
  const themeCssData = useMemo(() => buildSingleThemeCss(theme), [theme]);

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
        if (contextMenu) setContextMenu(null);
        else if (codeViewSectionId) setCodeViewSectionId(null);
        else if (showAddPrompt) setShowAddPrompt(false);
        else if (overflowOpen) setOverflowOpen(false);
        else if (selection) setSelection(null);
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
  ]);

  function stopGeneration() {
    abortRef.current?.abort();
    setIsGenerating(false);
  }

  // Build shell HTML for streaming (no sections, just the frame)
  function buildShellHtml(): string {
    return `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <script src="https://cdn.tailwindcss.com"><\/script>
  ${themeCssData ? `<script>tailwind.config = ${themeCssData.tailwindConfig}<\/script>` : ""}
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800;900&display=swap" rel="stylesheet">
  <style>
    ${themeCssData?.css || ""}
    * { box-sizing: border-box; }
    body { font-family: 'Inter', sans-serif; margin: 0; padding: 24px; background: #d1d5db; display: flex; flex-direction: column; align-items: center; gap: 24px; }
    .doc-page { width: 8.5in; min-height: 11in; background: white; box-shadow: 0 2px 8px rgba(0,0,0,0.15); position: relative; cursor: pointer; transition: box-shadow 0.2s; }
    .doc-page:hover { box-shadow: 0 4px 16px rgba(0,0,0,0.2); }
    .doc-page.selected { outline: 3px solid #9870ED; outline-offset: 2px; }
    @keyframes fadeInUp { from { opacity: 0; transform: translateY(20px); } to { opacity: 1; transform: translateY(0); } }
    .animate-page-in { animation: fadeInUp 0.4s ease-out; }
  </style>
</head>
<body id="pages">
<script>
${getIframeScript()}
<\/script>
</body>
</html>`;
  }

  // Inject a section into the iframe DOM without reloading srcDoc
  function injectSectionIntoIframe(section: Section3) {
    const doc = iframeRef.current?.contentDocument;
    if (!doc) return;
    const container = doc.getElementById("pages");
    if (!container) return;
    const div = doc.createElement("div");
    div.className = "doc-page animate-page-in";
    div.setAttribute("data-section-id", section.id);
    div.id = `section-${section.id}`;
    div.innerHTML = section.html;
    // Insert before the script tag
    const script = container.querySelector("script");
    if (script) {
      container.insertBefore(div, script);
    } else {
      container.appendChild(div);
    }
    div.scrollIntoView({ behavior: "smooth", block: "end" });
  }

  // Update a section's HTML in the iframe DOM
  function updateSectionInIframe(sectionId: string, html: string) {
    const doc = iframeRef.current?.contentDocument;
    if (!doc) return;
    const el = doc.getElementById(`section-${sectionId}`);
    if (el) el.innerHTML = html;
  }

  async function generateSections(extraInstructions?: string) {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setIsGenerating(true);
    setSections([]);
    // Accumulated sections for final state update
    const accumulated: Section3[] = [];

    try {
      // Check limit client-side
      if (aiGenLimit !== null && aiGenUsed >= aiGenLimit) {
        errorToast(`Has usado todas tus ${aiGenLimit} generaciones de este mes.`);
        setIsGenerating(false);
        return;
      }

      // Set shell HTML first, then wait for iframe to load
      const shellHtml = buildShellHtml();
      generatingShellRef.current = shellHtml;

      // Wait a tick for the iframe to render the shell
      await new Promise((r) => setTimeout(r, 100));

      const res = await fetch("/api/v2/document-generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          landingId: landing.id,
          prompt: landing.prompt,
          sourceContent,
          logoUrl,
          ...(extraInstructions ? { extraInstructions } : {}),
        }),
        signal: controller.signal,
      });
      if (!res.ok) {
        const errBody = await res.json().catch(() => ({}));
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
              if (eventType === "section") {
                accumulated.push(d);
                injectSectionIntoIframe(d);
              } else if (eventType === "section-update") {
                // Update accumulated
                const idx = accumulated.findIndex((s) => s.id === d.id);
                if (idx !== -1) accumulated[idx] = { ...accumulated[idx], html: d.html };
                updateSectionInIframe(d.id, d.html);
              }
            } catch {
              /* skip */
            }
          }
        }
      }

      // Set final sections state and freeze srcDoc
      setSections([...accumulated]);
      stableSrcDoc.current = buildPreviewHtml(accumulated, themeCssData);
      setSrcDocVersion((v) => v + 1);
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") return;
      console.error("Generation error:", err);
      errorToast((err as Error).message || "Error al generar documento");
      // Still set whatever we got
      if (accumulated.length > 0) setSections([...accumulated]);
    } finally {
      generatingShellRef.current = null;
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
      // Structural change — force iframe reload via ref + version bump
      stableSrcDoc.current = buildPreviewHtml(newSections, buildSingleThemeCss(themeRef.current));
      setSrcDocVersion((v) => v + 1);
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
      } else if (
        (msg.type === "text-edited" || msg.type === "section-html-updated") &&
        msg.sectionId &&
        msg.sectionHtml
      ) {
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
        }),
      });
      if (!res.ok) {
        const errBody = await res.json().catch(() => ({}));
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
              if ((event === "chunk" || event === "done") && d.html) {
                setSections((prev) =>
                  prev.map((s) =>
                    s.id === sectionId ? { ...s, html: d.html } : s
                  )
                );
                syncSectionToIframe(sectionId, d.html);
                if (event === "done") setSelection(null);
              }
            } catch {}
          }
        }
      }
      saveSections(sectionsRef.current);
      scrollIframeToSection(sectionId);
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
          allSections: sections.map((s) => ({ id: s.id, label: s.label, html: s.html })),
        }),
      });
      if (!res.ok) {
        const errBody = await res.json().catch(() => ({}));
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
              if ((event === "chunk" || event === "done") && d.html) {
                setSections((prev) =>
                  prev.map((s) =>
                    s.id === sectionId ? { ...s, html: d.html } : s
                  )
                );
                syncSectionToIframe(sectionId, d.html);
              }
            } catch {}
          }
        }
      }
      scrollIframeToSection(sectionId);
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

  function handleUpdateAttribute(
    sectionId: string,
    elementPath: string,
    attr: string,
    value: string
  ) {
    iframeRef.current?.contentWindow?.postMessage(
      {
        action: "update-attribute",
        sectionId,
        elementPath,
        tagName: selection?.tagName || "*",
        attr,
        value,
      },
      "*"
    );
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
    const newId = Math.random().toString(36).slice(2, 10);
    try {
      const instruction = [
        addPrompt.trim() ? `Create new pages: ${addPrompt}` : "Create new pages from this content",
        addParsedContent ? `\n\nSource content:\n${addParsedContent.substring(0, 15000)}` : "",
      ].join("");

      const res = await fetch("/api/v2/document-refine", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          landingId: landing.id,
          sectionId: "__new__",
          instruction,
          currentHtml: "<section></section>",
          ...(addRefImage && { referenceImage: addRefImage }),
        }),
      });
      if (!res.ok) {
        const errBody = await res.json().catch(() => ({}));
        throw new Error(errBody.error || "Error al agregar página");
      }

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
                syncSectionToIframe(newId, d.html);
                if (event === "done") {
                  setSections((prev) => {
                    const updated = prev.map((s) =>
                      s.id === newId ? { ...s, html: d.html } : s
                    );
                    saveSections(updated);
                    stableSrcDoc.current = buildPreviewHtml(updated, themeCssData);
                    setSrcDocVersion((v) => v + 1);
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
      setAddFiles([]);
      setAddRefImage(null);
      setAddParsedContent("");
    } catch (err) {
      console.error("Add page error:", err);
      errorToast((err as Error).message || "Error al agregar página");
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
    .page-section { page-break-after: always; }
    .page-section:last-child { page-break-after: auto; }
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

  async function handleDeployDocument() {
    if (sections.length === 0) return;
    setActiveIntent("deploy");
    try {
      // Generate PDF first, then deploy with the PDF URL
      const pdfUrl = await generateAndUploadPdf();
      const formData: Record<string, string> = { intent: "deploy" };
      if (pdfUrl) formData.pdfUrl = pdfUrl;
      deployFetcher.submit(formData, { method: "post" });
    } catch (err) {
      console.error("Deploy document error:", err);
      errorToast("Error al publicar documento");
      setActiveIntent(null);
    }
  }

  async function generateAndUploadPdf(filterSectionIds?: string[]): Promise<string | null> {
    const targetSections = filterSectionIds
      ? sections.filter((s) => filterSectionIds.includes(s.id))
      : sections;
    if (targetSections.length === 0) return null;
    setIsGeneratingPdf(true);
    try {
      // 1. Get PUT URL from server
      const formData = new FormData();
      formData.set("intent", "get-pdf-put-url");
      const res = await fetch(`/dash/documents/${landing.id}`, {
        method: "POST",
        body: formData,
      });
      const { putUrl, publicUrl } = await res.json();
      if (!putUrl || !publicUrl) throw new Error("No PUT URL returned");

      // 2. Generate PDF client-side with html2pdf.js
      const html2pdf = (await import("html2pdf.js")).default;
      const sorted = [...targetSections].sort((a, b) => a.order - b.order);
      const sectionsHtml = sorted
        .map((s) => `<div class="page-section">${s.html}</div>`)
        .join("\n");

      const fullHtml = `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <script src="https://cdn.tailwindcss.com"><\/script>
  ${themeCssData ? `<script>tailwind.config = ${themeCssData.tailwindConfig}<\/script>` : ""}
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800;900&display=swap" rel="stylesheet">
  <style>
    ${themeCssData?.css || ""}
    body { font-family: 'Inter', sans-serif; margin: 0; }
    .page-section { page-break-after: always; }
    .page-section:last-child { page-break-after: auto; }
  </style>
</head>
<body>${sectionsHtml}</body>
</html>`;

      // Create a temporary container to render
      const container = document.createElement("div");
      container.style.position = "absolute";
      container.style.left = "-9999px";
      container.style.width = "8.5in";
      document.body.appendChild(container);

      // Use iframe to render with Tailwind
      const iframe = document.createElement("iframe");
      iframe.style.width = "8.5in";
      iframe.style.height = "11in";
      iframe.style.border = "none";
      container.appendChild(iframe);

      await new Promise<void>((resolve) => {
        iframe.onload = () => setTimeout(resolve, 2000); // Wait for Tailwind CDN
        iframe.srcdoc = fullHtml;
      });

      const iframeBody = iframe.contentDocument?.body;
      if (!iframeBody) throw new Error("Could not access iframe body");

      const pdfBlob: Blob = await html2pdf()
        .set({
          margin: 0,
          filename: `${landing.name}.pdf`,
          image: { type: "jpeg", quality: 0.95 },
          html2canvas: { scale: 2, useCORS: true, logging: false },
          jsPDF: { unit: "in", format: "letter", orientation: "portrait" },
          pagebreak: { mode: ["css", "legacy"], avoid: [] },
        })
        .from(iframeBody)
        .outputPdf("blob");

      document.body.removeChild(container);

      // 3. Upload PDF blob
      const uploadRes = await fetch(putUrl, {
        method: "PUT",
        body: pdfBlob,
        headers: { "Content-Type": "application/pdf" },
      });
      if (!uploadRes.ok) throw new Error("PDF upload failed");

      // 4. Save pdfUrl in metadata
      const saveForm = new FormData();
      saveForm.set("intent", "save-pdf-url");
      saveForm.set("pdfUrl", publicUrl);
      await fetch(`/dash/documents/${landing.id}`, {
        method: "POST",
        body: saveForm,
      });

      setPdfLink(publicUrl);
      return publicUrl;
    } catch (err) {
      console.error("PDF generation error:", err);
      return null;
    } finally {
      setIsGeneratingPdf(false);
    }
  }

  function handleThemeChange(newTheme: string) {
    setTheme(newTheme);
    saveFetcher.submit(
      { intent: "update-theme", theme: newTheme },
      { method: "post" }
    );
    // Theme changes CSS — must reload iframe
    const newCss = buildSingleThemeCss(newTheme);
    stableSrcDoc.current = buildPreviewHtml(sections, newCss);
    setSrcDocVersion((v) => v + 1);
  }

  // Stable srcDoc — set once when sections first populate, then only updated for structural changes
  const stableSrcDoc = useRef<string | null>(null);
  const [srcDocVersion, setSrcDocVersion] = useState(0);
  if (!stableSrcDoc.current && sections.length > 0) {
    stableSrcDoc.current = buildPreviewHtml(sections, themeCssData);
  }
  const previewHtml = generatingShellRef.current || stableSrcDoc.current || buildPreviewHtml(sections, themeCssData);

  // Sync section HTML to iframe via postMessage (no reload)
  function syncSectionToIframe(sectionId: string, html: string) {
    iframeRef.current?.contentWindow?.postMessage(
      { action: 'update-section', id: sectionId, html }, '*'
    );
  }

  // Scroll iframe to a section via postMessage
  function scrollIframeToSection(sectionId: string) {
    iframeRef.current?.contentWindow?.postMessage(
      { action: 'scroll-to-section', id: sectionId }, '*'
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
          {isGeneratingPdf && (
            <span className="flex items-center gap-1.5 text-xs text-gray-500">
              <span className="w-3 h-3 border-2 border-gray-300 border-t-brand-500 rounded-full animate-spin" />
              Generando PDF...
            </span>
          )}
          {pdfLink && !isGeneratingPdf && (
            <span className="flex items-center gap-1.5">
              <a
                href={pdfLink}
                target="_blank"
                rel="noreferrer"
                className="text-xs text-red-600 hover:underline font-bold"
              >
                PDF
              </a>
              <Copy
                text={pdfLink}
                mode="ghost"
                className="relative static p-0"
              />
            </span>
          )}
          {aiGenLimit !== null && (() => {
            const remaining = aiGenLimit - aiGenUsed;
            const color = remaining <= 0 ? "text-red-500" : remaining <= 2 ? "text-yellow-600" : "text-gray-400";
            return (
              <span className={`text-xs font-bold ${color}`}>
                {remaining <= 0 ? "0" : remaining} gen restantes
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
      {aiGenLimit !== null && aiGenUsed >= aiGenLimit && (
        <div className="flex items-center justify-between px-4 py-2 bg-red-50 border-b-2 border-red-200 shrink-0">
          <span className="text-sm font-bold text-red-700">
            Agotaste tus generaciones de este mes.
          </span>
          <Link
            to="/plans"
            className="text-sm font-bold text-red-700 underline hover:text-red-900"
          >
            Ver planes →
          </Link>
        </div>
      )}

      {/* Prompt bar */}
      <div className="flex items-center gap-2 px-4 py-1.5 border-b border-gray-200 bg-white shrink-0">
        <input
          type="text"
          value={regenInput}
          onChange={(e) => setRegenInput(e.target.value)}
          placeholder="Instrucciones: ej. fondo blanco, 4 páginas, estilo minimalista..."
          disabled={isGenerating}
          className="flex-1 h-8 px-3 text-sm border-2 border-gray-200 rounded-lg bg-gray-50 placeholder:text-gray-400 disabled:opacity-50"
          onKeyDown={(e) => {
            if (e.key === "Enter" && regenInput.trim()) {
              generateSections(regenInput.trim());
              setRegenInput("");
            }
          }}
        />
        <BrutalButton
          size="chip"
          onClick={() => {
            if (!regenInput.trim()) return;
            generateSections(regenInput.trim());
            setRegenInput("");
          }}
          isLoading={isGenerating}
          isDisabled={!regenInput.trim() || isGenerating}
        >
          Regenerar
        </BrutalButton>
      </div>

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
              scrollIframeToSection(id);
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
                    const ids = contextMenu.sectionIds;
                    setContextMenu(null);
                    ids.forEach((id) => handleGenerateVariant(id));
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
                    key={srcDocVersion}
                    ref={iframeRef}
                    srcDoc={previewHtml}
                    className="w-full h-full border-none"
                    title="Document preview"
                    onLoad={() => {
                      if (iframeRef.current) {
                        iframeRectRef.current =
                          iframeRef.current.getBoundingClientRect();
                      }
                      // After structural reload, scroll to selected section
                      if (selectedSectionIds.length) {
                        setTimeout(() => scrollIframeToSection(selectedSectionIds[0]), 200);
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
          onUpdateAttribute={handleUpdateAttribute}
          isRefining={isRefining}
        />
      </div>

      {/* Add pages modal */}
      {showAddPrompt && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-white rounded-2xl border-2 border-black shadow-[6px_6px_0_#000] p-6 w-full max-w-md mx-4">
            <h3 className="text-lg font-black mb-3">
              Agregar p&aacute;ginas
            </h3>
            <p className="text-sm text-gray-500 mb-4">
              Sube archivos, una imagen de referencia, o describe el contenido
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
                    const reader = new FileReader();
                    reader.onload = () => setAddRefImage(reader.result as string);
                    reader.readAsDataURL(file);
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
                  setAddFiles([]);
                  setAddRefImage(null);
                  setAddParsedContent("");
                }}
              >
                Cancelar
              </BrutalButton>
              <BrutalButton
                size="chip"
                onClick={handleAddPage}
                isLoading={isAddingSection}
                isDisabled={(!addPrompt.trim() && !addParsedContent) || isAddingSection}
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
function buildPreviewHtml(sections: Section3[], themeCssData?: { css: string; tailwindConfig: string }): string {
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
  ${themeCssData ? `<script>tailwind.config = ${themeCssData.tailwindConfig}<\/script>` : ""}
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800;900&display=swap" rel="stylesheet">
  <style>
    ${themeCssData?.css || ""}
    * { box-sizing: border-box; }
    body { font-family: 'Inter', sans-serif; margin: 0; padding: 24px; background: #d1d5db; display: flex; flex-direction: column; align-items: center; gap: 24px; }
    .doc-page { width: 8.5in; min-height: 11in; background: white; box-shadow: 0 2px 8px rgba(0,0,0,0.15); position: relative; cursor: pointer; transition: box-shadow 0.2s; }
    .doc-page:hover { box-shadow: 0 4px 16px rgba(0,0,0,0.2); }
    .doc-page.selected { outline: 3px solid #9870ED; outline-offset: 2px; }
  </style>
</head>
<body>
${sectionsHtml}
<script>
${getIframeScript()}
<\/script>
</body>
</html>`;
}
