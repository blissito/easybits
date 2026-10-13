import { useFetcher, useLoaderData } from "react-router";
import { useMemo, useState } from "react";
import { LuUnplug } from "react-icons/lu";
import { getUserOrRedirect } from "~/.server/getters";
import { listConnectedApps, revokeGrant } from "~/.server/oauth";
import { ConfirmDialog } from "~/components/common/ConfirmDialog";
import { TOOL_GROUPS, type ToolGroupKey } from "~/.server/mcp/toolGroups";
import type { Route } from "./+types/mcp";

const MCP_BASE_URL = "https://www.easybits.cloud/api/mcp";

export const meta = () => [
  { title: "Claude.ai / MCP — EasyBits" },
  { name: "robots", content: "noindex" },
];

export const loader = async ({ request }: Route.LoaderArgs) => {
  const user = await getUserOrRedirect(request);
  // Expose the registry metadata (labels, descriptions, recommended flag)
  // to the client. Allowlists stay server-side.
  const groups = TOOL_GROUPS.map(g => ({
    key: g.key,
    label: g.label,
    description: g.description,
    recommended: Boolean(g.recommended),
    toolCount: g.toolCount,
  }));
  const apps = (await listConnectedApps(user.id)).map((a) => ({
    clientId: a.clientId,
    clientName: a.clientName,
    connectedAt: a.connectedAt.toISOString(),
    lastUsedAt: a.lastUsedAt.toISOString(),
  }));
  return { groups, baseUrl: MCP_BASE_URL, apps };
};

// Desconectar = revocar la concesión: sus refresh y, por el `cid`, el access en curso.
export const action = async ({ request }: Route.ActionArgs) => {
  const user = await getUserOrRedirect(request);
  const form = await request.formData();
  if (form.get("intent") !== "disconnect") return { error: "intent inválido" };
  const clientId = String(form.get("clientId") || "");
  if (!clientId) return { error: "falta clientId" };
  await revokeGrant(user.id, clientId);
  return { ok: true };
};

type GroupMeta = {
  key: ToolGroupKey;
  label: string;
  description: string;
  recommended: boolean;
  toolCount?: number;
};

export default function McpPage() {
  const { groups, baseUrl, apps } = useLoaderData<typeof loader>();
  const fetcher = useFetcher<typeof action>();
  const [disconnectTarget, setDisconnectTarget] = useState<{ clientId: string; clientName: string } | null>(null);

  const initial = (groups.find(g => g.recommended)?.key ?? "core") as ToolGroupKey;
  const [selected, setSelected] = useState<Set<ToolGroupKey>>(new Set([initial]));
  const [copied, setCopied] = useState(false);

  const url = useMemo(() => {
    if (selected.size === 0) return baseUrl;
    const keys = groups
      .filter(g => selected.has(g.key as ToolGroupKey))
      .map(g => g.key)
      .join(",");
    return `${baseUrl}?tools=${keys}`;
  }, [selected, groups, baseUrl]);

  const toggle = (key: ToolGroupKey) => {
    setSelected(prev => {
      const next = new Set(prev);
      if (key === "all") {
        // "all" is exclusive — selecting it clears the rest
        return next.has("all") ? new Set() : new Set(["all" as ToolGroupKey]);
      }
      next.delete("all");
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {}
  };

  return (
    <div className="max-w-3xl">
      <div className="mb-8">
        <h2 className="text-xl font-bold mb-2">Conecta EasyBits a Claude.ai</h2>
        <p className="text-gray-500 text-sm">
          Usa EasyBits dentro de Claude.ai o Claude Design como si fuera Canva: creas
          documentos, presentaciones y brand kits directamente desde el chat. Conexión
          vía OAuth 2.1 — un solo click, sin API keys.
        </p>
      </div>

      {/* Step 1 — pick toolset */}
      <section className="mb-8">
        <h3 className="text-sm font-bold uppercase tracking-wide mb-3">
          1. Elige tu toolset
        </h3>
        <p className="text-xs text-gray-500 mb-4">
          Puedes combinar varios. Mientras más tools expones, más capacidades tiene el
          agente — pero también más cosas irrelevantes puede ver.
        </p>
        <div className="grid gap-2 sm:grid-cols-2">
          {groups.map((g) => {
            const meta = g as GroupMeta;
            const active = selected.has(meta.key);
            return (
              <button
                key={meta.key}
                type="button"
                onClick={() => toggle(meta.key)}
                className={`text-left rounded-xl border-2 border-black p-4 transition-all ${
                  active
                    ? "bg-brand-500 text-white -translate-x-1 -translate-y-1 shadow-[4px_4px_0_0_#000]"
                    : "bg-white hover:-translate-x-0.5 hover:-translate-y-0.5 hover:shadow-[2px_2px_0_0_#000]"
                }`}
              >
                <div className="flex items-center gap-2 mb-1">
                  <span className="font-black uppercase text-sm">{meta.label}</span>
                  {meta.recommended && (
                    <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded border ${
                      active ? "bg-white text-brand-500 border-white" : "bg-brand-500 text-white border-black"
                    }`}>
                      RECOMENDADO
                    </span>
                  )}
                  {typeof meta.toolCount === "number" && (
                    <span className={`text-[10px] font-mono ml-auto ${active ? "text-white/80" : "text-gray-500"}`}>
                      ~{meta.toolCount} tools
                    </span>
                  )}
                </div>
                <p className={`text-xs leading-relaxed ${active ? "text-white/90" : "text-gray-600"}`}>
                  {meta.description}
                </p>
              </button>
            );
          })}
        </div>
      </section>

      {/* Step 2 — copy URL */}
      <section className="mb-8">
        <h3 className="text-sm font-bold uppercase tracking-wide mb-3">
          2. Copia tu URL
        </h3>
        <div className="rounded-xl border-2 border-black bg-black text-white p-4 font-mono text-xs sm:text-sm break-all">
          {url}
        </div>
        <button
          type="button"
          onClick={copy}
          disabled={selected.size === 0}
          className="mt-3 inline-flex items-center gap-2 rounded-xl border-2 border-black bg-white px-4 py-2 text-sm font-bold transition-all hover:-translate-x-1 hover:-translate-y-1 hover:shadow-[4px_4px_0_0_#000] disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:translate-x-0 disabled:hover:translate-y-0 disabled:hover:shadow-none"
        >
          {copied ? "✓ Copiado" : "Copiar URL"}
        </button>
        {selected.size === 0 && (
          <p className="text-xs text-red-600 mt-2">Selecciona al menos un toolset.</p>
        )}
      </section>

      {/* Step 3 — install */}
      <section className="mb-8">
        <h3 className="text-sm font-bold uppercase tracking-wide mb-3">
          3. Instala en Claude.ai
        </h3>
        <ol className="space-y-2 text-sm">
          <Step n={1}>
            Abre <a href="https://claude.ai" target="_blank" rel="noreferrer" className="underline font-medium">claude.ai</a> e inicia sesión.
          </Step>
          <Step n={2}>
            Ve a <span className="font-mono text-xs bg-gray-100 px-1.5 py-0.5 rounded">Settings → Connectors</span> (o <span className="font-mono text-xs bg-gray-100 px-1.5 py-0.5 rounded">Integrations</span>).
          </Step>
          <Step n={3}>Haz click en <b>Add custom connector</b> y pega la URL copiada.</Step>
          <Step n={4}>Autentica con tu cuenta de EasyBits cuando aparezca la ventana OAuth.</Step>
          <Step n={5}>Listo. Prueba con un prompt tipo: <i>"Crea un documento de 1 página sobre X usando mi brand kit"</i>.</Step>
        </ol>
      </section>

      {/* Apps conectadas */}
      <section className="mb-8" id="apps-conectadas">
        <h3 className="text-sm font-bold uppercase tracking-wide mb-3">Apps conectadas</h3>
        <p className="text-xs text-gray-500 mb-3">
          Aplicaciones a las que diste acceso a tu cuenta por OAuth (Claude, Claude Code, otros
          clientes MCP). Desconectar revoca su acceso al instante.
        </p>
        {apps.length === 0 ? (
          <p className="text-sm text-gray-400 border-2 border-dashed border-gray-200 rounded-xl px-4 py-6 text-center">
            Ninguna app conectada
          </p>
        ) : (
          <ul className="border-2 border-black rounded-xl divide-y divide-gray-200">
            {apps.map((a) => (
              <li key={a.clientId} className="flex items-center gap-3 px-4 py-3 text-sm">
                <div className="min-w-0">
                  <p className="font-semibold truncate">{a.clientName}</p>
                  <p className="text-xs text-gray-500">
                    Conectada el {new Date(a.connectedAt).toLocaleDateString()} · último acceso{" "}
                    {new Date(a.lastUsedAt).toLocaleString()}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setDisconnectTarget({ clientId: a.clientId, clientName: a.clientName })}
                  disabled={fetcher.state !== "idle" && fetcher.formData?.get("clientId") === a.clientId}
                  className="ml-auto text-gray-500 hover:text-red-500 shrink-0 transition-colors disabled:opacity-40"
                  title={`Desconectar ${a.clientName}`}
                  aria-label={`Desconectar ${a.clientName}`}
                >
                  <LuUnplug className="w-4 h-4" />
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      <ConfirmDialog
        isOpen={!!disconnectTarget}
        title="Desconectar app"
        message={
          disconnectTarget
            ? `¿Desconectar «${disconnectTarget.clientName}»? Pierde el acceso a tu cuenta al instante; para volver a usarla tendrás que conectarla otra vez.`
            : ""
        }
        confirmLabel="Desconectar"
        onConfirm={() => {
          if (!disconnectTarget) return;
          fetcher.submit({ intent: "disconnect", clientId: disconnectTarget.clientId }, { method: "post" });
          setDisconnectTarget(null);
        }}
        onCancel={() => setDisconnectTarget(null)}
        destructive
      />

      {/* FAQ / Gotchas */}
      <section className="mb-8">
        <h3 className="text-sm font-bold uppercase tracking-wide mb-3">Notas</h3>
        <ul className="space-y-2 text-xs text-gray-600">
          <li>• La URL es la misma para todos los usuarios. OAuth se encarga de autenticarte con tu cuenta.</li>
          <li>• Puedes cambiar de toolset en cualquier momento — sólo elimina el connector en Claude.ai y añádelo de nuevo con la URL actualizada.</li>
          <li>• Si tu cliente no soporta OAuth (Claude Code, Cursor, etc.), usa el setup por <a href="/dash/developer/setup" className="underline">API key</a>.</li>
          <li>• Este connector también funciona en cualquier otro cliente MCP que soporte OAuth 2.1 + DCR (Cowork, etc.).</li>
          <li>• ¿Tu agente tiene terminal (Claude Code, Cursor, Codex)? Mejor que se instale los skills: <span className="font-mono text-xs bg-gray-100 px-1.5 py-0.5 rounded">npx skills add https://easybits.cloud</span> — ver <a href="/dash/developer/setup" className="underline">Setup</a>.</li>
        </ul>
      </section>
    </div>
  );
}

function Step({ n, children }: { n: number; children: React.ReactNode }) {
  return (
    <li className="flex gap-3 items-start">
      <span className="flex-shrink-0 w-6 h-6 rounded-full bg-black text-white font-bold text-xs flex items-center justify-center">
        {n}
      </span>
      <span className="flex-1 pt-0.5">{children}</span>
    </li>
  );
}
