import { useFetcher, useLoaderData } from "react-router";
import { getUserOrRedirect } from "~/.server/getters";
import { BrutalButton } from "~/components/common/BrutalButton";
import { useState, useEffect } from "react";
import {
  addCustomDomain,
  verifyCustomDomain,
  removeCustomDomain,
  listCustomDomains,
} from "~/.server/core/customDomainOperations";
import type { Route } from "./+types/domains";

export const meta = () => [
  { title: "Dominios — EasyBits" },
  { name: "robots", content: "noindex" },
];

export const loader = async ({ request }: Route.LoaderArgs) => {
  const user = await getUserOrRedirect(request);
  const domains = await listCustomDomains(user.id);
  return { domains };
};

export const action = async ({ request }: Route.ActionArgs) => {
  const user = await getUserOrRedirect(request);
  const form = await request.formData();
  const intent = form.get("intent") as string;

  try {
    if (intent === "add") {
      const domain = (form.get("domain") as string) || "";
      await addCustomDomain(user.id, domain);
      return { ok: true };
    }
    if (intent === "verify") {
      const domainId = form.get("domainId") as string;
      await verifyCustomDomain(domainId, user.id);
      return { ok: true };
    }
    if (intent === "remove") {
      const domainId = form.get("domainId") as string;
      await removeCustomDomain(domainId, user.id);
      return { ok: true };
    }
    return { error: "Unknown intent" };
  } catch (e: any) {
    return { error: e.message || "Error" };
  }
};

export default function DomainsPage() {
  const { domains } = useLoaderData<typeof loader>();
  const fetcher = useFetcher();
  const [newDomain, setNewDomain] = useState("");

  const isSubmitting = fetcher.state !== "idle";
  const actionError = (fetcher.data as any)?.error;

  useEffect(() => {
    if ((fetcher.data as any)?.ok) setNewDomain("");
  }, [fetcher.data]);

  return (
    <div className="max-w-3xl">
      <h2 className="text-2xl font-black mb-1">Custom Domains</h2>
      <p className="text-sm text-gray-500 mb-6">
        Publica landings y presentaciones en tu propio dominio (slug.tudominio.com)
      </p>

      {actionError && (
        <div className="mb-4 p-3 bg-red-50 border-2 border-red-300 rounded-xl text-sm font-bold text-red-700">
          {actionError}
        </div>
      )}

      {/* Add domain form */}
      <fetcher.Form method="post" className="flex gap-2 mb-8">
        <input type="hidden" name="intent" value="add" />
        <input
          type="text"
          name="domain"
          value={newDomain}
          onChange={(e) => setNewDomain(e.target.value)}
          placeholder="midominio.com"
          className="flex-1 border-2 border-black rounded-xl px-4 py-2 font-bold"
        />
        <BrutalButton type="submit" disabled={isSubmitting || !newDomain.trim()}>
          Agregar
        </BrutalButton>
      </fetcher.Form>

      {/* Domains list */}
      {domains.length === 0 ? (
        <div className="text-center py-12 text-gray-400">
          <p className="text-lg font-bold">Sin dominios custom</p>
          <p className="text-sm mt-1">Agrega un dominio para empezar</p>
        </div>
      ) : (
        <div className="space-y-4">
          {domains.map((d) => (
            <div
              key={d.id}
              className="border-2 border-black rounded-xl p-4 shadow-[4px_4px_0_#000] bg-white"
            >
              <div className="flex items-center justify-between mb-3">
                <div>
                  <span className="font-black text-lg">{d.domain}</span>
                  <span
                    className={`ml-2 text-xs font-bold px-2 py-0.5 rounded-full ${
                      d.verified
                        ? "bg-green-100 text-green-700"
                        : "bg-yellow-100 text-yellow-700"
                    }`}
                  >
                    {d.verified ? "Verificado" : "Pendiente"}
                  </span>
                </div>
                <div className="flex gap-2">
                  {!d.verified && (
                    <fetcher.Form method="post">
                      <input type="hidden" name="intent" value="verify" />
                      <input type="hidden" name="domainId" value={d.id} />
                      <BrutalButton type="submit" disabled={isSubmitting} size="chip">
                        Verificar
                      </BrutalButton>
                    </fetcher.Form>
                  )}
                  <fetcher.Form method="post">
                    <input type="hidden" name="intent" value="remove" />
                    <input type="hidden" name="domainId" value={d.id} />
                    <button
                      type="submit"
                      disabled={isSubmitting}
                      className="text-red-500 hover:text-red-700 text-sm font-bold px-2 py-1"
                    >
                      Eliminar
                    </button>
                  </fetcher.Form>
                </div>
              </div>

              {/* DNS Instructions */}
              {!d.verified && (
                <div className="bg-gray-50 rounded-lg p-3 text-sm space-y-2">
                  <p className="font-bold text-gray-700">Configura estos registros DNS:</p>
                  <div className="space-y-1">
                    <div className="flex gap-2">
                      <span className="font-mono text-xs bg-gray-200 px-2 py-0.5 rounded">TXT</span>
                      <span className="font-mono text-xs">_easybits-verify.{d.domain}</span>
                      <span className="text-gray-400 mx-1">&rarr;</span>
                      <code className="font-mono text-xs bg-yellow-50 px-2 py-0.5 rounded select-all break-all">
                        {d.txtToken}
                      </code>
                    </div>
                    <div className="flex gap-2">
                      <span className="font-mono text-xs bg-gray-200 px-2 py-0.5 rounded">CNAME</span>
                      <span className="font-mono text-xs">*.{d.domain}</span>
                      <span className="text-gray-400 mx-1">&rarr;</span>
                      <span className="font-mono text-xs">easybits.fly.dev</span>
                    </div>
                  </div>
                  <p className="text-xs text-gray-500 mt-2">
                    Despues de agregar los registros, haz clic en "Verificar". La propagacion DNS puede tardar hasta 48h.
                  </p>
                </div>
              )}

              {/* Linked websites */}
              {d.verified && d.websites.length > 0 && (
                <div className="mt-2">
                  <p className="text-xs font-bold text-gray-500 mb-1">Sitios vinculados:</p>
                  <div className="flex flex-wrap gap-1">
                    {d.websites.map((w) => (
                      <span key={w.id} className="text-xs font-mono bg-gray-100 px-2 py-0.5 rounded">
                        {w.slug}.{d.domain}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
