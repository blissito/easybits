import { useFetcher, useLoaderData, useSearchParams } from "react-router";
import { getUserOrRedirect } from "~/.server/getters";
import { BrutalButton } from "~/components/common/BrutalButton";
import { useState, useEffect } from "react";
import {
  addCustomDomain,
  verifyCustomDomain,
  removeCustomDomain,
  listCustomDomains,
  setDomainApex,
  autoConfigureDomainDns,
  undoDomainDns,
} from "~/.server/core/customDomainOperations";
import { mailmaskConnection, disconnectMailmask } from "~/.server/core/mailmaskOperations";

const MAILMASK_NOTICE: Record<string, string> = {
  connected: "Mailmask conectado. Ya puedes configurar tus dominios con un clic.",
  configured: "Listo: Mailmask escribió los registros y el dominio quedó verificado.",
  written: "Registros escritos en Mailmask. El DNS tarda unos minutos: dale «Verificar» en un rato.",
  nozone: "Mailmask quedó conectado, pero el DNS de ese dominio no está en tu cuenta de Mailmask.",
  denied: "Cancelaste la conexión con Mailmask.",
  state: "La conexión con Mailmask expiró. Vuelve a intentar.",
  error: "No se pudo conectar con Mailmask. Vuelve a intentar.",
};
import { listWebsites } from "~/.server/core/operations";
import type { AuthContext } from "~/.server/apiAuth";
import { FLY_EDGE_IPS } from "~/lib/fly_certs/edge_ips";
import type { Route } from "./+types/domains";

export const meta = () => [
  { title: "Dominios — EasyBits" },
  { name: "robots", content: "noindex" },
];

export const loader = async ({ request }: Route.LoaderArgs) => {
  const user = await getUserOrRedirect(request);
  const domains = await listCustomDomains(user.id);
  // Heurística barata para resaltar «Configurar con Mailmask»: Mailmask hospeda zonas en
  // Route 53, así que NS `awsdns-*` lo hacen probable (no seguro: puede ser otra cuenta de AWS).
  // Se sube por las etiquetas hasta dar con la zona (custom.fancyfiles.app → fancyfiles.app).
  const { resolveNs } = await import("node:dns/promises");
  const route53 = async (domain: string) => {
    const labels = domain.split(".");
    for (let i = 0; i < labels.length - 1; i++) {
      const ns = await resolveNs(labels.slice(i).join(".")).catch(() => null);
      if (ns?.length) return ns.some((n) => /awsdns/i.test(n));
    }
    return false;
  };
  const inRoute53 = Object.fromEntries(
    await Promise.all(domains.filter((d) => !d.verified).map(async (d) => [d.id, await route53(d.domain)] as const))
  );
  const { items: websites } = await listWebsites(
    { user, scopes: ["READ"] } as unknown as AuthContext,
    { limit: 200 }
  );
  const mailmask = await mailmaskConnection(user.id).catch(() => ({ connected: false as const }));
  return { domains, inRoute53, mailmask, websites: websites.map((w) => ({ id: w.id, name: w.name, slug: w.slug })) };
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
    if (intent === "set-apex") {
      const domainId = form.get("domainId") as string;
      const websiteId = (form.get("websiteId") as string) || null;
      await setDomainApex(domainId, user.id, websiteId);
      return { ok: true };
    }
    if (intent === "mailmask-auto") {
      const r = await autoConfigureDomainDns(form.get("domainId") as string, user.id);
      return { ok: true, notice: r.verified ? MAILMASK_NOTICE.configured : MAILMASK_NOTICE.written };
    }
    if (intent === "mailmask-undo") {
      const r = await undoDomainDns(form.get("domainId") as string, user.id);
      return {
        ok: true,
        notice: r.skipped.length
          ? `Registros restaurados. No toqué ${r.skipped.join(", ")} porque los cambiaste después.`
          : "Registros restaurados a como estaban antes.",
      };
    }
    if (intent === "mailmask-disconnect") {
      await disconnectMailmask(user.id);
      return { ok: true, notice: "Mailmask desconectado." };
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
  const { domains, websites, inRoute53, mailmask } = useLoaderData<typeof loader>();
  const [params] = useSearchParams();
  const urlNotice = MAILMASK_NOTICE[params.get("mailmask") ?? ""] ?? null;
  const fetcher = useFetcher();
  const [newDomain, setNewDomain] = useState("");

  const isSubmitting = fetcher.state !== "idle";
  const actionError = (fetcher.data as any)?.error;
  const notice = ((fetcher.data as any)?.notice as string | undefined) ?? urlNotice;

  useEffect(() => {
    if ((fetcher.data as any)?.ok) setNewDomain("");
  }, [fetcher.data]);

  return (
    <div className="max-w-3xl">
      <h2 className="text-2xl font-black mb-1">Custom Domains</h2>
      <p className="text-sm text-gray-500 mb-6">
        Publica sitios en tu propio dominio: en subdominios (slug.tudominio.com) o en el dominio raíz (tudominio.com)
      </p>

      {notice && !actionError && (
        <p className="mb-4 rounded-lg border-2 border-black bg-brand-500/10 px-3 py-2 text-sm">{notice}</p>
      )}
      {mailmask.connected && (
        <div className="mb-4 flex items-center gap-2 text-xs text-gray-500">
          <span className="font-bold text-green-700">● Mailmask conectado</span>
          {mailmask.scope && <span>· permiso: {mailmask.scope === "dns" ? "sólo DNS" : "cuenta completa"}</span>}
          <fetcher.Form method="post" className="inline">
            <input type="hidden" name="intent" value="mailmask-disconnect" />
            <button type="submit" className="underline hover:text-black">Desconectar</button>
          </fetcher.Form>
        </div>
      )}
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

              {/* Conector Mailmask: si el DNS vive ahí, EasyBits escribe (y deshace) los registros solo. */}
              {d.dnsProvider === "mailmask" ? (
                <div className="mb-3 rounded-lg border-2 border-black bg-green-50 p-3 text-sm flex items-center gap-3 flex-wrap">
                  <p className="flex-1 min-w-0 text-gray-700">
                    <strong>DNS administrado por Mailmask.</strong> EasyBits escribió estos registros por ti
                    {d.verified ? "." : "; si aún no verifica, el DNS está propagando."}
                  </p>
                  <fetcher.Form method="post" className="shrink-0">
                    <input type="hidden" name="intent" value="mailmask-undo" />
                    <input type="hidden" name="domainId" value={d.id} />
                    <button type="submit" disabled={isSubmitting} className="text-sm font-bold underline hover:text-black">
                      Deshacer registros
                    </button>
                  </fetcher.Form>
                </div>
              ) : !d.verified && (
                <div
                  className={`mb-3 rounded-lg border-2 p-3 text-sm flex items-center gap-3 flex-wrap ${
                    inRoute53[d.id] ? "border-black bg-brand-500/10" : "border-gray-200"
                  }`}
                >
                  <p className="flex-1 min-w-0 text-gray-700">
                    {inRoute53[d.id] ? <strong>Parece que tu DNS está en Mailmask. </strong> : "¿Tu DNS está en Mailmask? "}
                    {mailmask.connected
                      ? "EasyBits escribe los registros por ti y los puedes deshacer."
                      : "Conéctalo una vez y EasyBits escribe los registros por ti (y los puede deshacer)."}
                  </p>
                  {mailmask.connected ? (
                    <fetcher.Form method="post" className="shrink-0">
                      <input type="hidden" name="intent" value="mailmask-auto" />
                      <input type="hidden" name="domainId" value={d.id} />
                      <BrutalButton type="submit" disabled={isSubmitting} size="chip">
                        {isSubmitting ? "Configurando…" : "Configurar automático"}
                      </BrutalButton>
                    </fetcher.Form>
                  ) : (
                    // Navegación completa: es un ida y vuelta por el consentimiento de Mailmask.
                    <a
                      href={`/dash/integrations/mailmask/connect?domain=${d.id}`}
                      className="shrink-0 inline-flex items-center h-9 px-3 rounded-lg border-2 border-black bg-white font-bold text-sm hover:bg-brand-500/10"
                    >
                      Conectar Mailmask y configurar
                    </a>
                  )}
                </div>
              )}

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
                      <span className="font-mono text-xs">{FLY_EDGE_IPS.cnameTarget}</span>
                    </div>
                    <p className="text-xs text-gray-500 pt-1">Solo si vas a usar el dominio raíz:</p>
                    <div className="flex gap-2">
                      <span className="font-mono text-xs bg-gray-200 px-2 py-0.5 rounded">A</span>
                      <span className="font-mono text-xs">{d.domain}</span>
                      <span className="text-gray-400 mx-1">&rarr;</span>
                      <span className="font-mono text-xs">{FLY_EDGE_IPS.v4}</span>
                    </div>
                    {FLY_EDGE_IPS.v6 && (
                      <div className="flex gap-2">
                        <span className="font-mono text-xs bg-gray-200 px-2 py-0.5 rounded">AAAA</span>
                        <span className="font-mono text-xs">{d.domain}</span>
                        <span className="text-gray-400 mx-1">&rarr;</span>
                        <span className="font-mono text-xs">{FLY_EDGE_IPS.v6}</span>
                      </div>
                    )}
                  </div>
                  <p className="text-xs text-gray-500 mt-2">
                    Despues de agregar los registros, haz clic en "Verificar". La propagacion DNS puede tardar hasta 48h.
                  </p>
                </div>
              )}

              {/* Sitio en el dominio raíz */}
              {d.verified && (
                <fetcher.Form method="post" className="mt-2 flex flex-wrap items-center gap-2 text-sm">
                  <input type="hidden" name="intent" value="set-apex" />
                  <input type="hidden" name="domainId" value={d.id} />
                  <label className="text-xs font-bold text-gray-500">Sitio en {d.domain} y www:</label>
                  <select
                    name="websiteId"
                    defaultValue={d.apexWebsite?.id ?? ""}
                    className="border-2 border-black rounded-lg px-2 py-1 text-xs font-bold bg-white"
                  >
                    <option value="">— ninguno —</option>
                    {websites.map((w) => (
                      <option key={w.id} value={w.id}>
                        {w.name} ({w.slug})
                      </option>
                    ))}
                  </select>
                  <BrutalButton type="submit" disabled={isSubmitting} size="chip">
                    Guardar
                  </BrutalButton>
                  {d.apexWebsite && (
                    <a
                      href={`https://${d.domain}`}
                      target="_blank"
                      rel="noreferrer"
                      className="text-xs font-mono underline"
                    >
                      https://{d.domain}
                    </a>
                  )}
                </fetcher.Form>
              )}
              {d.verified && !d.apexWebsite && (
                <p className="text-xs text-gray-500 mt-1">
                  Para el dominio raíz necesitas el registro A hacia {FLY_EDGE_IPS.v4} y CNAME www &rarr; {FLY_EDGE_IPS.cnameTarget}.
                </p>
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
