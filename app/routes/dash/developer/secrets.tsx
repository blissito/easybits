import { useState } from "react";
import { useFetcher, useLoaderData } from "react-router";
import { getUserOrRedirect } from "~/.server/getters";
import {
  createSecret,
  deleteSecret,
  listSecrets,
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
  const [showCreate, setShowCreate] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; name: string } | null>(null);

  const lastError = fetcher.data && "error" in fetcher.data ? fetcher.data.error : null;
  const lastCreated = fetcher.data && "created" in fetcher.data ? fetcher.data.created : null;

  return (
    <div>
      <div className="flex justify-between items-center mb-4">
        <h2 className="text-lg font-black uppercase tracking-tight">Secretos</h2>
        <BrutalButton size="chip" onClick={() => setShowCreate(true)} className="text-sm px-4 py-1.5">
          + Nuevo secreto
        </BrutalButton>
      </div>

      <div className="mb-6 p-4 bg-brand-100 border-2 border-black rounded-xl text-sm">
        Los secretos se inyectan como variables de entorno cuando llamas{" "}
        <code className="font-mono bg-white px-1 border border-black rounded">agent_run({"{ secrets: [...] }"})</code>.
        El valor nunca se vuelve a mostrar después de guardarlo — solo el nombre.
      </div>

      {showCreate && (
        <div
          className="fixed inset-0 bg-black/60 flex items-center justify-center z-50"
          role="dialog"
          aria-modal="true"
          aria-labelledby="create-secret-title"
        >
          <div className="bg-white border-3 border-black rounded-xl p-6 w-full max-w-md shadow-[6px_6px_0px_0px_rgba(0,0,0,1)]">
            <h3 id="create-secret-title" className="text-lg font-black uppercase mb-4">Nuevo secreto</h3>
            <fetcher.Form
              method="post"
              onSubmit={() => {
                setShowCreate(false);
              }}
            >
              <input type="hidden" name="intent" value="create" />
              <label className="block mb-4">
                <span className="text-sm font-bold">Nombre</span>
                <input
                  name="name"
                  required
                  pattern="[A-Z_][A-Z0-9_]*"
                  placeholder="BRIGHTDATA_API_TOKEN"
                  title="Solo MAYÚSCULAS, números y guion bajo. Debe empezar con letra o _."
                  className="mt-1 block w-full border-2 border-black rounded-lg px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-brand-500"
                  autoFocus
                />
              </label>
              <label className="block mb-4">
                <span className="text-sm font-bold">Valor</span>
                <textarea
                  name="value"
                  required
                  rows={4}
                  placeholder="Pégalo aquí. No se mostrará después."
                  className="mt-1 block w-full border-2 border-black rounded-lg px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-brand-500"
                />
              </label>
              <div className="flex gap-2 justify-end">
                <BrutalButton
                  mode="ghost"
                  size="chip"
                  onClick={() => setShowCreate(false)}
                  className="text-sm px-4 py-1.5"
                  type="button"
                >
                  Cancelar
                </BrutalButton>
                <BrutalButton type="submit" size="chip" className="text-sm px-4 py-1.5">
                  Guardar
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
                <td className="px-4 py-3 font-mono font-bold">{s.name}</td>
                <td className="px-4 py-3 font-mono text-xs">{new Date(s.createdAt).toLocaleDateString()}</td>
                <td className="px-4 py-3 font-mono text-xs">
                  {s.lastUsedAt ? new Date(s.lastUsedAt).toLocaleString() : "—"}
                </td>
                <td className="px-4 py-3">
                  <BrutalButton
                    mode="danger"
                    size="chip"
                    onClick={() => setDeleteTarget({ id: s.id, name: s.name })}
                    isLoading={fetcher.state !== "idle" && fetcher.formData?.get("secretId") === s.id}
                  >
                    Borrar
                  </BrutalButton>
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
