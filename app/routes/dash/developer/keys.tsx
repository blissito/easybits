import { useFetcher, useLoaderData } from "react-router";
import { getUserOrRedirect } from "~/.server/getters";
import { listApiKeys } from "~/.server/iam";
import { createApiKey, revokeApiKey } from "~/.server/iam";
import { useState } from "react";
import { BrutalButton } from "~/components/common/BrutalButton";
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
    const key = await createApiKey(user.id, {
      name,
      scopes: ["READ", "WRITE", "DELETE"],
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

  const createdKey = fetcher.data && "created" in fetcher.data ? fetcher.data.created : null;

  return (
    <div>
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
        <div className="mb-4 p-4 bg-lime border-2 border-black rounded-xl shadow-[4px_4px_0px_0px_rgba(0,0,0,1)]">
          <p className="text-sm font-bold mb-2">
            Key created! Copy it now — you won't see it again:
          </p>
          <code className="block bg-white p-3 rounded-lg text-sm font-mono break-all border-2 border-black">
            {createdKey.raw}
          </code>
        </div>
      )}

      {/* Keys table */}
      <div className="border-2 border-black rounded-xl overflow-hidden shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] bg-white">
        <table className="w-full text-sm">
          <thead className="bg-black text-white">
            <tr>
              <th scope="col" className="text-left px-4 py-3 font-bold text-xs uppercase tracking-wider">Name</th>
              <th scope="col" className="text-left px-4 py-3 font-bold text-xs uppercase tracking-wider">Prefix</th>
              <th scope="col" className="text-left px-4 py-3 font-bold text-xs uppercase tracking-wider">Scopes</th>
              <th scope="col" className="text-left px-4 py-3 font-bold text-xs uppercase tracking-wider">Status</th>
              <th scope="col" className="text-left px-4 py-3 font-bold text-xs uppercase tracking-wider">Created</th>
              <th scope="col" className="px-4 py-3"></th>
            </tr>
          </thead>
          <tbody>
            {keys.map((k) => (
              <tr key={k.id} className="border-t-2 border-black hover:bg-brand-100 transition-colors">
                <td className="px-4 py-3 font-bold">{k.name}</td>
                <td className="px-4 py-3 font-mono text-xs bg-gray-50">{k.prefix}...</td>
                <td className="px-4 py-3">
                  <div className="flex gap-1 flex-wrap">
                    {k.scopes.map((s) => (
                      <span
                        key={s}
                        className="bg-brand-aqua text-xs font-bold px-2 py-0.5 rounded-md border border-black"
                      >
                        {s}
                      </span>
                    ))}
                  </div>
                </td>
                <td className="px-4 py-3">
                  <span
                    className={`text-xs font-bold px-2 py-1 rounded-md border-2 border-black ${
                      k.status === "ACTIVE"
                        ? "bg-lime"
                        : "bg-brand-red text-white"
                    }`}
                  >
                    {k.status}
                  </span>
                </td>
                <td className="px-4 py-3 font-mono text-xs">
                  {new Date(k.createdAt).toLocaleDateString()}
                </td>
                <td className="px-4 py-3">
                  {k.status === "ACTIVE" && (
                    <fetcher.Form
                      method="post"
                      onSubmit={(e) => {
                        if (!confirm("¿Revocar la API key \"" + k.name + "\"? Esta acción no se puede deshacer.")) {
                          e.preventDefault();
                        }
                      }}
                    >
                      <input type="hidden" name="intent" value="revoke" />
                      <input type="hidden" name="keyId" value={k.id} />
                      <BrutalButton
                        mode="danger"
                        size="chip"
                        type="submit"
                        isLoading={fetcher.state !== "idle" && fetcher.formData?.get("keyId") === k.id}
                      >
                        Revoke
                      </BrutalButton>
                    </fetcher.Form>
                  )}
                </td>
              </tr>
            ))}
            {keys.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-12 text-center font-bold text-gray-400 uppercase tracking-wider">
                  No API keys yet
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
