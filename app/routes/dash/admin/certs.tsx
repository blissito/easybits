import { useFetcher, useLoaderData } from "react-router";
import { data, redirect } from "react-router";
import { getUserOrRedirect } from "~/.server/getters";
import { auditCerts, deleteOrphanedCerts } from "~/.server/core/certOperations";
import { BrutalButton } from "~/components/common/BrutalButton";
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

  if (intent === "delete-one") {
    const hostname = (form.get("hostname") as string || "").trim();
    if (!hostname) return data({ error: "No hostname provided" });
    const result = await deleteOrphanedCerts([hostname]);
    return data({ ok: true, ...result });
  }

  return data({ error: "Unknown intent" });
};

export default function CertsAdmin() {
  const audit = useLoaderData<typeof loader>();
  const fetcher = useFetcher();

  const actionData = fetcher.data as any;

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
          <h3 className="text-lg font-black text-red-700 mb-3">
            Certificados huerfanos ({audit.orphanedCerts.length})
          </h3>
          <div className="border-2 border-black rounded-xl overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-gray-100">
                <tr>
                  <th className="p-2 text-left font-bold">Hostname</th>
                  <th className="p-2 text-left font-bold">Status</th>
                  <th className="p-2 text-left font-bold">Creado</th>
                  <th className="p-2 text-right font-bold">Accion</th>
                </tr>
              </thead>
              <tbody>
                {audit.orphanedCerts.map((cert) => {
                  const isDeleting =
                    fetcher.state !== "idle" &&
                    fetcher.formData?.get("hostname") === cert.hostname;
                  return (
                    <tr
                      key={cert.hostname}
                      className="border-t border-gray-200 hover:bg-red-50"
                    >
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
                      <td className="p-2 text-right">
                        <fetcher.Form method="post" className="inline">
                          <input type="hidden" name="intent" value="delete-one" />
                          <input type="hidden" name="hostname" value={cert.hostname} />
                          <BrutalButton
                            type="submit"
                            size="chip"
                            disabled={isDeleting}
                            className="bg-red-500 text-white border-red-700"
                          >
                            {isDeleting ? "..." : "Eliminar"}
                          </BrutalButton>
                        </fetcher.Form>
                      </td>
                    </tr>
                  );
                })}
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
