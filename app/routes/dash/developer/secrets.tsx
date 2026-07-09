import { useEffect, useRef, useState } from "react";
import { useFetcher, useLoaderData } from "react-router";
import { getUserOrRedirect } from "~/.server/getters";
import {
  createSecret,
  deleteSecret,
  listSecrets,
  revealSecretValue,
} from "~/.server/core/secretOperations";
import { BrutalButton } from "~/components/common/BrutalButton";
import { ConfirmDialog } from "~/components/common/ConfirmDialog";
import type { Route } from "./+types/secrets";

export const meta = () => [
  { title: "Secretos — EasyBits" },
  { name: "robots", content: "noindex" },
];

export const loader = async ({ request }: Route.LoaderArgs) => {
  const user = await getUserOrRedirect(request);
  const secrets = await listSecrets(user.id);
  return { secrets };
};

export const action = async ({ request }: Route.ActionArgs) => {
  const user = await getUserOrRedirect(request);
  const formData = await request.formData();
  const intent = formData.get("intent");

  if (intent === "create") {
    const name = ((formData.get("name") as string) || "").trim();
    const value = (formData.get("value") as string) || "";
    try {
      const secret = await createSecret(user.id, { name, value });
      return { created: { name: secret.name } };
    } catch (err) {
      return { error: (err as Error).message };
    }
  }

  if (intent === "reveal") {
    // On-demand decrypt for copy-to-clipboard. Owner-gated; value is returned
    // to the client only to be written to the clipboard — never rendered.
    const secretId = formData.get("secretId") as string;
    const value = await revealSecretValue(user.id, secretId);
    if (value == null) return { error: "Secreto no encontrado" };
    return { revealed: { secretId, value } };
  }

  if (intent === "delete") {
    const secretId = formData.get("secretId") as string;
    await deleteSecret(user.id, secretId);
    return { deleted: true };
  }

  return null;
};

export default function SecretsPage() {
  const { secrets } = useLoaderData<typeof loader>();
  const fetcher = useFetcher<typeof action>();
  const revealFetcher = useFetcher<typeof action>();
  // modal === null → cerrado; {name:""} → nuevo; {name:"X"} → editar (nombre fijo).
  const [modal, setModal] = useState<{ name: string } | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; name: string } | null>(null);
  const [copied, setCopied] = useState<string | null>(null);
  const [copyError, setCopyError] = useState<string | null>(null);

  const lastError = fetcher.data && "error" in fetcher.data ? fetcher.data.error : null;
  const lastCreated = fetcher.data && "created" in fetcher.data ? fetcher.data.created : null;
  const isEdit = !!modal?.name;
  const submitting = fetcher.state !== "idle" && fetcher.formData?.get("intent") === "create";
  const copyingId = revealFetcher.state !== "idle" ? (revealFetcher.formData?.get("secretId") as string | null) : null;

  // Cierra el modal SOLO cuando el guardado confirma (created), no optimista —
  // así se ve el spinner y si hay error el modal permanece abierto.
  const wasSubmitting = useRef(false);
  useEffect(() => {
    if (submitting) wasSubmitting.current = true;
    else if (wasSubmitting.current) {
      wasSubmitting.current = false;
      if (fetcher.data && "created" in fetcher.data) setModal(null);
    }
  }, [submitting, fetcher.data]);

  // El valor descifrado llega del server SOLO para escribirlo al portapapeles;
  // nunca se renderiza ni se guarda en estado persistente.
  useEffect(() => {
    if (revealFetcher.state !== "idle" || !revealFetcher.data) return;
    const d = revealFetcher.data;
    if ("revealed" in d && d.revealed) {
      const { secretId, value } = d.revealed;
      navigator.clipboard?.writeText(value).then(
        () => {
          setCopied(secretId);
          setTimeout(() => setCopied((c) => (c === secretId ? null : c)), 1400);
        },
        () => setCopyError("No se pudo copiar — revisa permisos del portapapeles.")
      );
    } else if ("error" in d && d.error) {
      setCopyError(d.error);
    }
  }, [revealFetcher.state, revealFetcher.data]);

  // ESC cierra el modal (gotcha: todo modal cierra con ESC).
  useEffect(() => {
    if (!modal) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !submitting) setModal(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [modal, submitting]);

  const copyValue = (secretId: string) => {
    setCopyError(null);
    revealFetcher.submit({ intent: "reveal", secretId }, { method: "post" });
  };

  return (
    <div>
      <div className="flex justify-between items-center mb-4">
        <h2 className="text-lg font-black uppercase tracking-tight">Secretos</h2>
        <BrutalButton size="chip" onClick={() => setModal({ name: "" })} className="text-sm px-4 py-1.5">
          + Nuevo secreto
        </BrutalButton>
      </div>

      <div className="mb-6 p-4 bg-brand-100 border-2 border-black rounded-xl text-sm">
        Los secretos se inyectan como variables de entorno cuando llamas{" "}
        <code className="font-mono bg-white px-1 border border-black rounded">agent_run({"{ secrets: [...] }"})</code>.
        El valor nunca se vuelve a mostrar después de guardarlo — solo el nombre.
      </div>

      {modal && (
        <div
          className="fixed inset-0 bg-black/60 flex items-center justify-center z-50"
          role="dialog"
          aria-modal="true"
          aria-labelledby="create-secret-title"
          onClick={() => { if (!submitting) setModal(null); }}
        >
          <div
            className="animate-fade-in bg-white border-3 border-black rounded-xl p-6 w-full max-w-md shadow-[6px_6px_0px_0px_rgba(0,0,0,1)]"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 id="create-secret-title" className="text-lg font-black uppercase mb-4">
              {isEdit ? "Editar secreto" : "Nuevo secreto"}
            </h3>
            <fetcher.Form method="post">
              <input type="hidden" name="intent" value="create" />
              <label className="block mb-4">
                <span className="text-sm font-bold">Nombre</span>
                <input
                  name="name"
                  required
                  pattern="[A-Z_][A-Z0-9_]*"
                  placeholder="BRIGHTDATA_API_TOKEN"
                  title="Solo MAYÚSCULAS, números y guion bajo. Debe empezar con letra o _."
                  defaultValue={modal.name}
                  readOnly={isEdit}
                  className={`mt-1 block w-full border-2 border-black rounded-lg px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-brand-500 ${isEdit ? "bg-gray-100 text-gray-500" : ""}`}
                  autoFocus={!isEdit}
                />
              </label>
              <label className="block mb-4">
                <span className="text-sm font-bold">Valor</span>
                <textarea
                  name="value"
                  required
                  rows={4}
                  placeholder={isEdit ? "Pega el nuevo valor. Reemplaza el anterior." : "Pégalo aquí. No se mostrará después."}
                  className="mt-1 block w-full border-2 border-black rounded-lg px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-brand-500"
                  autoFocus={isEdit}
                />
              </label>
              <div className="flex gap-2 justify-end">
                <BrutalButton
                  mode="ghost"
                  size="chip"
                  onClick={() => setModal(null)}
                  className="text-sm px-4 py-1.5"
                  type="button"
                  isDisabled={submitting}
                >
                  Cancelar
                </BrutalButton>
                <BrutalButton type="submit" size="chip" className="text-sm px-4 py-1.5" isLoading={submitting}>
                  {isEdit ? "Actualizar" : "Guardar"}
                </BrutalButton>
              </div>
            </fetcher.Form>
          </div>
        </div>
      )}

      {lastError && (
        <div className="mb-4 p-3 bg-brand-red text-white border-2 border-black rounded-xl shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] text-sm font-bold">
          {lastError}
        </div>
      )}

      {lastCreated && (
        <div className="mb-4 p-3 bg-lime border-2 border-black rounded-xl shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] text-sm font-bold">
          Secreto <code className="font-mono">{lastCreated.name}</code> guardado.
        </div>
      )}

      {copyError && (
        <div className="mb-4 p-3 bg-brand-red text-white border-2 border-black rounded-xl shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] text-sm font-bold">
          {copyError}
        </div>
      )}

      <div className="border-2 border-black rounded-xl overflow-hidden shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] bg-white">
        <table className="w-full text-sm">
          <thead className="bg-black text-white">
            <tr>
              <th scope="col" className="text-left px-4 py-3 font-bold text-xs uppercase tracking-wider">Nombre</th>
              <th scope="col" className="text-left px-4 py-3 font-bold text-xs uppercase tracking-wider">Creado</th>
              <th scope="col" className="text-left px-4 py-3 font-bold text-xs uppercase tracking-wider">Último uso</th>
              <th scope="col" className="px-4 py-3"></th>
            </tr>
          </thead>
          <tbody>
            {secrets.map((s) => (
              <tr key={s.id} className="border-t-2 border-black hover:bg-brand-100 transition-colors">
                <td className="px-4 py-3">
                  <div className="flex items-center gap-2">
                    <span className="font-mono font-bold">{s.name}</span>
                    <button
                      type="button"
                      onClick={() => copyValue(s.id)}
                      disabled={copyingId === s.id}
                      title="Copiar valor al portapapeles"
                      aria-label={`Copiar valor de ${s.name}`}
                      className="shrink-0 p-1 rounded-md border-2 border-transparent text-gray-400 hover:text-black hover:border-black transition-colors disabled:opacity-60"
                    >
                      {copyingId === s.id ? (
                        <svg className="animate-spin" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                          <path d="M21 12a9 9 0 1 1-6.219-8.56" />
                        </svg>
                      ) : copied === s.id ? (
                        <span className="text-xs font-bold text-green-600">✓</span>
                      ) : (
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
                          <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
                        </svg>
                      )}
                    </button>
                  </div>
                </td>
                <td className="px-4 py-3 font-mono text-xs">{new Date(s.createdAt).toLocaleDateString()}</td>
                <td className="px-4 py-3 font-mono text-xs">
                  {s.lastUsedAt ? new Date(s.lastUsedAt).toLocaleString() : "—"}
                </td>
                <td className="px-4 py-3">
                  <div className="flex items-center gap-2">
                    <BrutalButton
                      mode="ghost"
                      size="chip"
                      onClick={() => setModal({ name: s.name })}
                    >
                      Editar
                    </BrutalButton>
                    <BrutalButton
                      mode="danger"
                      size="chip"
                      onClick={() => setDeleteTarget({ id: s.id, name: s.name })}
                      isLoading={fetcher.state !== "idle" && fetcher.formData?.get("secretId") === s.id}
                    >
                      Borrar
                    </BrutalButton>
                  </div>
                </td>
              </tr>
            ))}
            {secrets.length === 0 && (
              <tr>
                <td colSpan={4} className="px-4 py-12 text-center font-bold text-gray-400 uppercase tracking-wider">
                  No hay secretos
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <ConfirmDialog
        isOpen={!!deleteTarget}
        title="Borrar secreto"
        message={
          deleteTarget
            ? `¿Borrar el secreto "${deleteTarget.name}"? Cualquier agent_run que lo use va a fallar hasta que lo recrees.`
            : ""
        }
        confirmLabel="Borrar"
        onConfirm={() => {
          if (!deleteTarget) return;
          fetcher.submit(
            { intent: "delete", secretId: deleteTarget.id },
            { method: "post" }
          );
          setDeleteTarget(null);
        }}
        onCancel={() => setDeleteTarget(null)}
        destructive
      />
    </div>
  );
}
