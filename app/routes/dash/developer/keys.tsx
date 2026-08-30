import { useFetcher, useLoaderData, useSearchParams } from "react-router";
import { getUserOrRedirect } from "~/.server/getters";
import { listApiKeys } from "~/.server/iam";
import { createApiKey, revokeApiKey } from "~/.server/iam";
import { useEffect, useState } from "react";
import { BrutalButton } from "~/components/common/BrutalButton";
import { ConfirmDialog } from "~/components/common/ConfirmDialog";
import type { ApiKeyScope } from "@prisma/client";
import type { Route } from "./+types/keys";

export const meta = () => [
  { title: "API Keys — EasyBits" },
  { name: "robots", content: "noindex" },
];

export const loader = async ({ request }: Route.LoaderArgs) => {
  const user = await getUserOrRedirect(request);
  const keys = await listApiKeys(user.id);
  return { keys };
};

export const action = async ({ request }: Route.ActionArgs) => {
  const user = await getUserOrRedirect(request);
  const formData = await request.formData();
  const intent = formData.get("intent");

  if (intent === "create") {
    const name = (formData.get("name") as string) || "Unnamed key";
    const scopeValues = formData.getAll("scopes") as string[];
    const scopes = (scopeValues.length > 0 ? scopeValues : ["READ", "WRITE", "DELETE"]) as ApiKeyScope[];
    const key = await createApiKey(user.id, {
      name,
      scopes,
    });
    return { created: key };
  }

  if (intent === "revoke") {
    const keyId = formData.get("keyId") as string;
    await revokeApiKey(keyId, user.id);
    return { revoked: true };
  }

  return null;
};

export default function KeysPage() {
  const { keys } = useLoaderData<typeof loader>();
  const fetcher = useFetcher<typeof action>();
  const [showCreate, setShowCreate] = useState(false);
  const [revokeTarget, setRevokeTarget] = useState<{ id: string; name: string } | null>(null);

  const createdKey = fetcher.data && "created" in fetcher.data ? fetcher.data.created : null;

  // Bienvenida tras activar el trial desde el checkout (?welcome=trial)
  const [searchParams, setSearchParams] = useSearchParams();
  const [welcomeDismissed, setWelcomeDismissed] = useState(false);
  const showWelcome = searchParams.get("welcome") === "trial" && !welcomeDismissed;

  // Confetti al aterrizar desde el checkout — una sola vez
  useEffect(() => {
    if (searchParams.get("welcome") !== "trial") return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    import("js-confetti").then(({ default: JSConfetti }) => {
      const confetti = new JSConfetti();
      const colors = ["#9870ED", "#ECD66E", "#C8F9AB", "#75BAF9", "#F4B7EC"];
      // Tres tandas encadenadas: la primera llena la pantalla, las siguientes
      // caen mientras la anterior todavía baja.
      confetti.addConfetti({ confettiColors: colors, confettiNumber: 400 });
      setTimeout(
        () => confetti.addConfetti({ emojis: ["🎉", "✨", "🚀"], emojiSize: 60, confettiNumber: 40 }),
        350
      );
      setTimeout(
        () => confetti.addConfetti({ confettiColors: colors, confettiNumber: 300 }),
        900
      );
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const dismissWelcome = () => {
    setWelcomeDismissed(true);
    const next = new URLSearchParams(searchParams);
    next.delete("welcome");
    next.delete("session_id");
    setSearchParams(next, { replace: true, preventScrollReset: true });
  };

  return (
    <div>
      {showWelcome && (
        <div className="mb-6 border-2 border-black rounded-xl bg-[#F3EEFF] p-5 relative">
          <button
            onClick={dismissWelcome}
            aria-label="Cerrar"
            className="absolute top-3 right-4 text-xl leading-none text-black/50 hover:text-black"
          >
            ×
          </button>
          <h3 className="text-lg font-black uppercase tracking-tight mb-2">
            Tu trial de 30 días está activo 🎉
          </h3>
          <p className="text-sm text-black/70 mb-2">
            Crea tu API key aquí abajo, expórtala como{" "}
            <code className="font-mono bg-white border border-black/20 rounded px-1">
              EASYBITS_API_KEY
            </code>{" "}
            y ya puedes correr <code className="font-mono bg-white border border-black/20 rounded px-1">ghosty</code>.
          </p>
          <p className="text-sm text-black/70">
            Al terminar el mes no pasa nada: <strong>no estás obligado a quedarte</strong>. No dejaste
            tarjeta, así que si no haces nada la suscripción se cancela sola y no hay ningún cargo.
            Si te sirvió, ahí mismo decides continuar.
          </p>
        </div>
      )}
      <div className="flex justify-between items-center mb-4">
        <h2 className="text-lg font-black uppercase tracking-tight">API Keys</h2>
        <BrutalButton size="chip" onClick={() => setShowCreate(true)} className="text-sm px-4 py-1.5">
          + Create Key
        </BrutalButton>
      </div>

      {/* Create modal */}
      {showCreate && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50" role="dialog" aria-modal="true" aria-labelledby="create-key-title">
          <div className="bg-white border-3 border-black rounded-xl p-6 w-full max-w-md shadow-[6px_6px_0px_0px_rgba(0,0,0,1)]">
            <h3 id="create-key-title" className="text-lg font-black uppercase mb-4">Create API Key</h3>
            <fetcher.Form method="post" onSubmit={() => setShowCreate(false)}>
              <input type="hidden" name="intent" value="create" />
              <label className="block mb-4">
                <span className="text-sm font-bold">Key name</span>
                <input
                  name="name"
                  placeholder="My integration"
                  className="mt-1 block w-full border-2 border-black rounded-lg px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-brand-500"
                  autoFocus
                />
              </label>
              <fieldset className="mb-4">
                <legend className="text-sm font-bold mb-2">Scopes</legend>
                <div className="space-y-2">
                  {[
                    { value: "READ", desc: "Ver archivos, sitios, documentos, bases de datos, sandboxes y tu saldo de tokens." },
                    { value: "WRITE", desc: "Crear y modificar: subir archivos, ejecutar SQL, lanzar sandboxes y apps, usar el proxy LLM." },
                    { value: "DELETE", desc: "Borrar archivos, documentos, bases de datos y sandboxes de forma permanente." },
                  ].map((s) => (
                    <label key={s.value} className="flex items-start gap-2 cursor-pointer">
                      <input type="checkbox" name="scopes" value={s.value} defaultChecked className="mt-0.5 accent-black" />
                      <div>
                        <span className="text-xs font-mono font-bold">{s.value}</span>
                        <p className="text-xs text-gray-500">{s.desc}</p>
                      </div>
                    </label>
                  ))}
                </div>
                <p className="text-xs text-gray-400 mt-2">Por default READ + WRITE + DELETE. El proxy LLM exige WRITE: toda key con WRITE consume el saldo de tokens de la cuenta. Para ADMIN, pide al equipo.</p>
              </fieldset>
              <div className="flex gap-2 justify-end">
                <BrutalButton
                  mode="ghost"
                  size="chip"
                  onClick={() => setShowCreate(false)}
                  className="text-sm px-4 py-1.5"
                >
                  Cancel
                </BrutalButton>
                <BrutalButton
                  type="submit"
                  size="chip"
                  className="text-sm px-4 py-1.5"
                >
                  Create
                </BrutalButton>
              </div>
            </fetcher.Form>
          </div>
        </div>
      )}

      {/* Show raw key once */}
      {createdKey && (
        <div className="mb-6 p-4 bg-lime border-2 border-black rounded-xl shadow-[4px_4px_0px_0px_rgba(0,0,0,1)]">
          <div className="flex justify-between items-center mb-2">
            <p className="text-sm font-bold">Key creada. Cópiala ahora — no se vuelve a mostrar:</p>
            <CopyButton text={createdKey.raw} />
          </div>
          <code className="block bg-white p-3 rounded-lg text-sm font-mono break-all border-2 border-black">
            {createdKey.raw}
          </code>
          <GhostyInstall apiKey={createdKey.raw} />
        </div>
      )}

      {/* Keys list — discreta: la key nueva y el instalador son lo importante */}
      <div className="border border-black/20 rounded-xl overflow-hidden bg-white">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-[11px] uppercase tracking-wider text-gray-500 border-b border-black/10">
              <th scope="col" className="text-left px-4 py-2 font-bold">Name</th>
              <th scope="col" className="text-left px-4 py-2 font-bold">Prefix</th>
              <th scope="col" className="text-left px-4 py-2 font-bold hidden md:table-cell">Scopes</th>
              <th scope="col" className="text-left px-4 py-2 font-bold hidden sm:table-cell">Created</th>
              <th scope="col" className="px-4 py-2"></th>
            </tr>
          </thead>
          <tbody>
            {keys.map((k) => (
              <tr key={k.id} className={`border-t border-black/10 ${k.status !== "ACTIVE" ? "opacity-50" : ""}`}>
                <td className="px-4 py-2.5 font-bold">
                  {k.name}
                  {k.status !== "ACTIVE" && <span className="ml-2 text-[10px] uppercase text-gray-500">revocada</span>}
                </td>
                <td className="px-4 py-2.5 font-mono text-xs text-gray-600">{k.prefix}…</td>
                <td className="px-4 py-2.5 font-mono text-[11px] text-gray-500 hidden md:table-cell">
                  {k.scopes.join(" · ")}
                </td>
                <td className="px-4 py-2.5 text-xs text-gray-500 hidden sm:table-cell">
                  {new Date(k.createdAt).toLocaleDateString()}
                </td>
                <td className="px-4 py-2.5 text-right">
                  {k.status === "ACTIVE" && (
                    <button
                      type="button"
                      onClick={() => setRevokeTarget({ id: k.id, name: k.name })}
                      disabled={fetcher.state !== "idle" && fetcher.formData?.get("keyId") === k.id}
                      className="text-xs font-bold text-gray-500 hover:text-brand-red underline-offset-2 hover:underline disabled:opacity-50"
                    >
                      Revocar
                    </button>
                  )}
                </td>
              </tr>
            ))}
            {keys.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-10 text-center text-sm text-gray-400">
                  Aún no tienes API keys
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <ConfirmDialog
        isOpen={!!revokeTarget}
        title="Revocar API key"
        message={revokeTarget ? `¿Revocar la API key "${revokeTarget.name}"? Esta acción no se puede deshacer.` : ""}
        confirmLabel="Revocar"
        onConfirm={() => {
          if (!revokeTarget) return;
          fetcher.submit(
            { intent: "revoke", keyId: revokeTarget.id },
            { method: "post" }
          );
          setRevokeTarget(null);
        }}
        onCancel={() => setRevokeTarget(null)}
        destructive
      />
    </div>
  );
}

/**
 * One-liner para instalar Ghosty ya apuntando a EasyBits con la key recién
 * creada (LLM vía el proxy DeepSeek + MCP core). Solo se ofrece aquí porque es
 * el único momento en que la key existe en claro.
 */
function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  const copy = () => {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };
  return (
    <BrutalButton size="chip" onClick={copy} className="text-xs px-3 py-1">
      {copied ? "Copiado ✓" : "Copiar"}
    </BrutalButton>
  );
}

/** Copiar de un paso, sobre el fondo negro del bloque. */
function CopyStepButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      onClick={() => {
        navigator.clipboard.writeText(text).then(() => {
          setCopied(true);
          setTimeout(() => setCopied(false), 2000);
        });
      }}
      className="text-[11px] font-sans px-2 py-0.5 rounded border border-white/20 text-white/50 hover:text-lime hover:border-lime transition-colors shrink-0"
      aria-label="Copiar este paso"
    >
      {copied ? "Copiado ✓" : "Copiar"}
    </button>
  );
}

function GhostyInstall({ apiKey }: { apiKey: string }) {
  // Cada paso es un bloque visual; `Copiar` pega solo las líneas ejecutables.
  // Cada bloque se copia solo, así que la key va literal: una variable de
  // entorno definida en el paso de arriba no existe si copias únicamente éste.
  const steps = [
    {
      title: "1. Limpia cualquier Ghosty anterior",
      lines: [
        "npm uninstall -g ghostycode 2>/dev/null",
        "rm -f ~/.local/bin/ghosty ~/.ghosty/bin/ghosty",
      ],
    },
    {
      title: "2. Instala el CLI",
      lines: [
        "curl -fsSL https://formmy.app/ghosty/install.sh | sh",
        'export PATH="$HOME/.local/bin:$PATH"',
      ],
    },
    {
      title: "3. Conecta EasyBits (LLM + MCP)",
      lines: [
        `ghosty auth set --provider easybits --api-key "${apiKey}"`,
        'ghosty mcp add easybits --url "https://www.easybits.cloud/api/mcp/core"',
        "ghosty mcp login easybits",
      ],
    },
  ];
  const cmd = steps.flatMap((step) => step.lines).join("\n");
  return (
    <div className="mt-6">
      <div className="flex justify-between items-center mb-3">
        <p className="text-sm font-bold">Instalar Ghosty con esta key (macOS / Linux):</p>
        <CopyButton text={cmd} />
      </div>
      <div className="bg-black rounded-lg border-2 border-black overflow-hidden">
        {steps.map((step, i) => (
          <div
            key={step.title}
            className={`px-4 py-3 ${i > 0 ? "border-t border-white/15" : ""}`}
          >
            <div className="flex justify-between items-center gap-3 mb-1.5">
              <p className="text-[11px] uppercase tracking-wide text-white/45 font-sans">
                {step.title}
              </p>
              <CopyStepButton text={step.lines.join("\n")} />
            </div>
            <pre className="text-lime text-xs font-mono overflow-x-auto whitespace-pre leading-relaxed">
              {step.lines.join("\n")}
            </pre>
          </div>
        ))}
      </div>
      <ul className="text-xs mt-3 space-y-1 opacity-70 list-disc ml-4">
        <li>
          El <code>rm</code> solo borra el binario: tus keys y sesiones en{" "}
          <code>~/.ghosty</code> se quedan.
        </li>
        <li>
          Los <code>export</code> valen solo para esa terminal. Pásalos a tu{" "}
          <code>~/.zshrc</code> o el MCP dejará de autenticar mañana.
        </li>
        <li>
          Luego solo: <code>ghosty</code>.
        </li>
      </ul>
    </div>
  );
}
