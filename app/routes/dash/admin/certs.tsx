import { useFetcher, useLoaderData } from "react-router";
import { data, redirect } from "react-router";
import { getUserOrRedirect } from "~/.server/getters";
import { auditCerts, deleteOrphanedCerts } from "~/.server/core/certOperations";
import { BrutalButton } from "~/components/common/BrutalButton";
import { useState } from "react";
import type { Route } from "./+types/certs";

export const meta = () => [
  { title: "Certificados Fly — Admin — EasyBits" },
  { name: "robots", content: "noindex" },
];

export const loader = async ({ request }: Route.LoaderArgs) => {
  const user = await getUserOrRedirect(request);
  const adminEmails = (process.env.ADMIN_EMAILS || "")
    .split(",")
    .map((e) => e.trim().toLowerCase());
  const isSuperAdmin = adminEmails.includes(user.email?.toLowerCase() || "");
  const isRoleAdmin = user.roles.includes("Admin");
  if (!isSuperAdmin && !isRoleAdmin) return redirect("/dash");

  const audit = await auditCerts();
  return data(audit);
};

export const action = async ({ request }: Route.ActionArgs) => {
  const user = await getUserOrRedirect(request);
  const adminEmails = (process.env.ADMIN_EMAILS || "")
    .split(",")
    .map((e) => e.trim().toLowerCase());
  const isSuperAdmin = adminEmails.includes(user.email?.toLowerCase() || "");
  const isRoleAdmin = user.roles.includes("Admin");
  if (!isSuperAdmin && !isRoleAdmin) return redirect("/dash");

  const form = await request.formData();
  const intent = form.get("intent") as string;

  if (intent === "delete-selected") {
    const hostnames = (form.get("hostnames") as string || "").split(",").filter(Boolean);
    if (hostnames.length === 0) return data({ error: "No hostnames selected" });
    const result = await deleteOrphanedCerts(hostnames);
    return data({ ok: true, ...result });
  }

  if (intent === "delete-all-orphans") {
    const hostnames = (form.get("hostnames") as string || "").split(",").filter(Boolean);
    const result = await deleteOrphanedCerts(hostnames);
    return data({ ok: true, ...result });
  }

  return data({ error: "Unknown intent" });
};

export default function CertsAdmin() {
  const audit = useLoaderData<typeof loader>();
  const fetcher = useFetcher();
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const isSubmitting = fetcher.state !== "idle";
  const actionData = fetcher.data as any;

  const toggleSelect = (hostname: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(hostname)) next.delete(hostname);
      else next.add(hostname);
      return next;
    });
  };

  const selectAll = () => {
    if (selected.size === audit.orphanedCerts.length) {
      setSelected(new Set());
    } else {
      setSelected(new Set(audit.orphanedCerts.map((c) => c.hostname)));
    }
  };

  return (
    <div className="max-w-4xl">
      <h2 className="text-2xl font-black mb-1">Certificados Fly.io</h2>
      <p className="text-sm text-gray-500 mb-6">
        Gestiona certificados SSL en Fly. Elimina huerfanos para mantener limpio el entorno.
      </p>

      {/* Summary */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-8">
        {[
          { label: "Total", value: audit.totalFlyCerts, color: "bg-gray-100" },
          { label: "Validos", value: audit.validCerts.length, color: "bg-green-50" },
          { label: "Huerfanos", value: audit.orphanedCerts.length, color: "bg-red-50" },
          { label: "Protegidos", value: audit.protectedCerts.length, color: "bg-blue-50" },
        ].map((s) => (
          <div
            key={s.label}
            className={`${s.color} border-2 border-black rounded-xl p-4 shadow-[3px_3px_0_#000]`}
          >
            <p className="text-xs font-bold text-gray-500 uppercase">{s.label}</p>
            <p className="text-2xl font-black">{s.value}</p>
          </div>
        ))}
      </div>

      {/* Action feedback */}
      {actionData?.ok && (
        <div className="mb-4 p-3 bg-green-50 border-2 border-green-300 rounded-xl text-sm font-bold text-green-700">
          Eliminados: {actionData.deleted?.length || 0}
          {actionData.failed?.length > 0 && ` | Fallidos: ${actionData.failed.length}`}
        </div>
      )}
      {actionData?.error && (
        <div className="mb-4 p-3 bg-red-50 border-2 border-red-300 rounded-xl text-sm font-bold text-red-700">
          {actionData.error}
        </div>
      )}

      {/* Orphaned certs */}
      {audit.orphanedCerts.length > 0 && (
        <div className="mb-8">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-lg font-black text-red-700">
              Certificados huerfanos ({audit.orphanedCerts.length})
            </h3>
            <div className="flex gap-2">
              <BrutalButton size="chip" mode="ghost" onClick={selectAll}>
                {selected.size === audit.orphanedCerts.length ? "Deseleccionar" : "Seleccionar todos"}
              </BrutalButton>
              {selected.size > 0 && (
                <fetcher.Form method="post">
                  <input type="hidden" name="intent" value="delete-selected" />
                  <input type="hidden" name="hostnames" value={Array.from(selected).join(",")} />
                  <BrutalButton
                    type="submit"
                    size="chip"
                    disabled={isSubmitting}
                    className="bg-red-500 text-white border-red-700"
                  >
                    {isSubmitting ? "Eliminando..." : `Eliminar ${selected.size} seleccionados`}
                  </BrutalButton>
                </fetcher.Form>
              )}
            </div>
          </div>
          <div className="border-2 border-black rounded-xl overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-gray-100">
                <tr>
                  <th className="p-2 text-left w-8">
                    <input
                      type="checkbox"
                      checked={selected.size === audit.orphanedCerts.length}
                      onChange={selectAll}
                    />
                  </th>
                  <th className="p-2 text-left font-bold">Hostname</th>
                  <th className="p-2 text-left font-bold">Status</th>
                  <th className="p-2 text-left font-bold">Creado</th>
                </tr>
              </thead>
              <tbody>
                {audit.orphanedCerts.map((cert) => (
                  <tr
                    key={cert.hostname}
                    className="border-t border-gray-200 hover:bg-red-50 cursor-pointer"
                    onClick={() => toggleSelect(cert.hostname)}
                  >
                    <td className="p-2">
                      <input
                        type="checkbox"
                        checked={selected.has(cert.hostname)}
                        onChange={() => toggleSelect(cert.hostname)}
                      />
                    </td>
                    <td className="p-2 font-mono text-xs">{cert.hostname}</td>
                    <td className="p-2">
                      <span
                        className={`text-xs font-bold px-2 py-0.5 rounded-full ${
                          cert.clientStatus === "Issued"
                            ? "bg-green-100 text-green-700"
                            : "bg-yellow-100 text-yellow-700"
                        }`}
                      >
                        {cert.clientStatus}
                      </span>
                    </td>
                    <td className="p-2 text-xs text-gray-500">
                      {new Date(cert.createdAt).toLocaleDateString()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {audit.orphanedCerts.length === 0 && (
        <div className="mb-8 text-center py-8 bg-green-50 border-2 border-green-300 rounded-xl">
          <p className="text-lg font-black text-green-700">Sin certificados huerfanos</p>
          <p className="text-sm text-green-600 mt-1">Todo limpio</p>
        </div>
      )}

      {/* Valid certs */}
      <details className="mb-6">
        <summary className="cursor-pointer font-black text-lg mb-2">
          Certificados validos ({audit.validCerts.length})
        </summary>
        <div className="border-2 border-black rounded-xl overflow-hidden">
          <div className="max-h-64 overflow-y-auto">
            {audit.validCerts.map((h) => (
              <div key={h} className="px-3 py-1.5 border-b border-gray-100 font-mono text-xs">
                {h}
              </div>
            ))}
          </div>
        </div>
      </details>

      {/* Protected certs */}
      <details>
        <summary className="cursor-pointer font-black text-lg mb-2">
          Certificados protegidos ({audit.protectedCerts.length})
        </summary>
        <div className="border-2 border-black rounded-xl overflow-hidden">
          {audit.protectedCerts.map((h) => (
            <div key={h} className="px-3 py-1.5 border-b border-gray-100 font-mono text-xs">
              {h}
            </div>
          ))}
        </div>
      </details>
    </div>
  );
}
