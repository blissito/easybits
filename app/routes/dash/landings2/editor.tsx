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
import Spinner from "~/components/common/Spinner";
import { getUserOrRedirect } from "~/.server/getters";
import { db } from "~/.server/db";
import { LANDING_THEMES } from "~/lib/landingCatalog";
import type { LandingBlock } from "~/lib/landing2/blockTypes";
import { BlockEditor } from "~/components/landings2/BlockEditor";
import type { CustomColors } from "~/lib/buildLandingHtml";
import type { Route } from "./+types/editor";

export const meta = () => [
  { title: "Editor Landing v2 — EasyBits" },
  { name: "robots", content: "noindex" },
];

export const loader = async ({ request, params }: Route.LoaderArgs) => {
  const user = await getUserOrRedirect(request);
  const landing = await db.landing.findUnique({ where: { id: params.id } });
  if (!landing || landing.ownerId !== user.id || landing.version !== 2) {
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
  if (!landing || landing.ownerId !== user.id || landing.version !== 2) {
    return { error: "No encontrado" };
  }

  const formData = await request.formData();
  const intent = formData.get("intent");

  if (intent === "update-blocks") {
    const sections = JSON.parse(String(formData.get("blocks") || "[]"));
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
    return { redirect: "/dash/landings2" };
  }

  return { error: "Intent desconocido" };
};

export default function Landing2Editor() {
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

  const [blocks, setBlocks] = useState<LandingBlock[]>(() => {
    const raw = landing.sections;
    return Array.isArray(raw) ? (raw as unknown as LandingBlock[]) : [];
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

  const [isGenerating, setIsGenerating] = useState(
    searchParams.get("generating") === "1"
  );
  const [liveUrl, setLiveUrl] = useState(websiteUrl);
  const [overflowOpen, setOverflowOpen] = useState(false);
  const overflowRef = useRef<HTMLDivElement>(null);
  const streamEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (deployFetcher.state === "idle") setActiveIntent(null);
    if (deployFetcher.data?.redirect) navigate(deployFetcher.data.redirect);
    if (deployFetcher.data?.url) setLiveUrl(deployFetcher.data.url);
    if (deployFetcher.data?.unpublished) setLiveUrl(null);
  }, [deployFetcher.state, deployFetcher.data, navigate]);

  // Auto-generate on mount
  useEffect(() => {
    if (!isGenerating || blocks.length > 0) {
      setIsGenerating(false);
      return;
    }
    generateBlocks();
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

  // ESC to close overflow
  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if (e.key === "Escape" && overflowOpen) setOverflowOpen(false);
    }
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [overflowOpen]);

  async function generateBlocks() {
    setIsGenerating(true);
    setBlocks([]);
    try {
      const res = await fetch("/api/v2/landing2-generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          landingId: landing.id,
          prompt: landing.prompt,
          theme,
        }),
      });
      if (!res.ok) throw new Error("Generation failed");

      const reader = res.body?.getReader();
      if (!reader) throw new Error("No stream");

      const decoder = new TextDecoder();
      let buf = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });

        const lines = buf.split("\n");
        buf = lines.pop() || "";

        let eventType = "";
        for (const line of lines) {
          if (line.startsWith("event: ")) {
            eventType = line.slice(7).trim();
          } else if (line.startsWith("data: ")) {
            const payload = line.slice(6);
            try {
              const data = JSON.parse(payload);
              if (eventType === "block") {
                setBlocks((prev) => [...prev, data]);
                requestAnimationFrame(() => {
                  streamEndRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
                });
              } else if (eventType === "block-update") {
                setBlocks((prev) =>
                  prev.map((b) =>
                    b.id === data.id
                      ? { ...b, content: { ...b.content, ...data.content } }
                      : b
                  )
                );
              }
            } catch { /* skip malformed */ }
            eventType = "";
          }
        }
      }
    } catch (err) {
      console.error("Generation error:", err);
    } finally {
      setIsGenerating(false);
    }
  }

  const saveBlocks = useCallback(
    (b: LandingBlock[]) => {
      saveFetcher.submit(
        { intent: "update-blocks", blocks: JSON.stringify(b) },
        { method: "post" }
      );
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    []
  );

  const handleBlocksChange = useCallback(
    (newBlocks: LandingBlock[]) => {
      setBlocks(newBlocks);
      saveBlocks(newBlocks);
    },
    [saveBlocks]
  );

  function saveTheme(newTheme: string) {
    setTheme(newTheme);
    const c =
      newTheme === "custom" ? customColors : null;
    if (newTheme === "custom" && !c) {
      const current =
        LANDING_THEMES.find((t) => t.id === theme) ?? LANDING_THEMES[0];
      const init: CustomColors = {
        bg: current.bg,
        accent: current.accent,
        text: current.text,
      };
      setCustomColors(init);
      saveFetcher.submit(
        {
          intent: "update-theme",
          theme: newTheme,
          customColors: JSON.stringify(init),
        },
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
    const updated = {
      ...(customColors ?? {
        bg: "#ffffff",
        accent: "#6366f1",
        text: "#111827",
      }),
      [key]: value,
    };
    setCustomColors(updated);
    saveFetcher.submit(
      {
        intent: "update-theme",
        theme: "custom",
        customColors: JSON.stringify(updated),
      },
      { method: "post" }
    );
  }

  return (
    <article className="pt-16 px-4 pb-8 md:pl-32 w-full min-h-screen flex flex-col">
      {/* Top bar */}
      <div className="flex items-center justify-between gap-4 mb-4 shrink-0">
        <div className="flex items-center gap-3">
          <Link
            to="/dash/landings2"
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
              <Copy
                text={liveUrl}
                mode="ghost"
                className="relative static p-0"
              />
            </span>
          )}
        </div>

        <div className="flex items-center gap-2">
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

          {isCustomTheme && customColors && (
            <div className="flex items-center gap-1.5">
              <ColorPicker
                label="Fondo"
                value={customColors.bg}
                onChange={(v) => updateCustomColor("bg", v)}
              />
              <ColorPicker
                label="Acento"
                value={customColors.accent}
                onChange={(v) => updateCustomColor("accent", v)}
              />
              <ColorPicker
                label="Texto"
                value={customColors.text}
                onChange={(v) => updateCustomColor("text", v)}
              />
            </div>
          )}

          <BrutalButton
            size="chip"
            onClick={() => {
              setActiveIntent("deploy");
              deployFetcher.submit({ intent: "deploy" }, { method: "post" });
            }}
            isLoading={activeIntent === "deploy"}
            isDisabled={blocks.length === 0 || activeIntent !== null}
          >
            {liveUrl ? "Actualizar" : "Publicar"}
          </BrutalButton>

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
                    generateBlocks();
                  }}
                  disabled={isGenerating}
                  className="w-full text-left px-4 py-2 text-sm font-bold hover:bg-gray-50 disabled:opacity-50 flex items-center gap-2"
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
                    className="w-full text-left px-4 py-2 text-sm font-bold hover:bg-gray-50 disabled:opacity-50 flex items-center gap-2"
                  >
                    Despublicar
                  </button>
                )}
                <div className="border-t border-gray-200 my-1" />
                <button
                  onClick={() => {
                    setOverflowOpen(false);
                    if (!confirm("¿Eliminar esta landing?")) return;
                    setActiveIntent("delete");
                    deployFetcher.submit(
                      { intent: "delete" },
                      { method: "post" }
                    );
                  }}
                  disabled={activeIntent !== null}
                  className="w-full text-left px-4 py-2 text-sm font-bold text-red-600 hover:bg-red-50 disabled:opacity-50 flex items-center gap-2"
                >
                  Eliminar
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Main editor */}
      <div className="flex-1 overflow-y-auto">
        {isGenerating && blocks.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-24">
            <Spinner />
            <p className="text-sm text-gray-500 mt-4">
              Generando bloques con AI...
            </p>
          </div>
        ) : (
          <>
            <BlockEditor blocks={blocks} onChange={isGenerating ? undefined : handleBlocksChange} theme={theme} customColors={customColors} />
            {isGenerating && (
              <div ref={streamEndRef} className="flex items-center gap-2 py-4 px-2">
                <Spinner />
                <p className="text-sm text-gray-400">Generando mas bloques...</p>
              </div>
            )}
          </>
        )}
      </div>
    </article>
  );
}

function ColorPicker({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
}) {
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
