import { useEffect, useState } from "react";
import { useFetcher, data } from "react-router";
import type { Route } from "./+types/hosting";
import { getUserOrRedirect } from "~/.server/getters";
import { db } from "~/.server/db";
import type { AuthContext } from "~/.server/apiAuth";
import { listPermanent, releasePermanent } from "~/.server/core/machineOperations";
import {
  listSandboxDomains,
  addSandboxDomain,
  removeSandboxDomain,
  suspendSandbox,
  resumeSandbox,
  verifySandboxDomain,
} from "~/.server/core/sandboxOperations";
import { listReleases, applyRelease, readMachineLogs } from "~/.server/core/releaseOperations";
import {
  listMachineSecrets,
  setMachineSecrets,
  unsetMachineSecret,
} from "~/.server/core/releaseOperations";
import { HOSTING_CATALOG } from "~/lib/hostingCatalog";
import { ConfirmDialog } from "~/components/common/ConfirmDialog";
import {
  LuExternalLink, LuLink, LuKeyRound, LuHistory, LuScrollText,
  LuPlay, LuPause, LuRotateCcw, LuTrash2, LuPlus, LuCircleCheck,
} from "react-icons/lu";

export const meta = () => [
  { title: "Hosting — EasyBits" },
  { name: "robots", content: "noindex" },
];

/**
 * Panel de hosting: dónde el dueño de un sitio ve SU sitio.
 *
 * Todo esto ya vivía en la API y en ningún lado más, así que un cliente con
 * hosting no tenía dónde mirar su URL, su dominio ni sus versiones. La lista
 * carga con la página; el detalle de cada caja se pide al abrirla, porque
 * releases, dominios y secretos son tres viajes al host por máquina.
 */

/** La IP pública del host: la misma que sirve addSandboxDomain. */
const PUBLIC_IP = process.env.SANDBOX_PUBLIC_IP || "54.38.94.14";
const CNAME_TARGET = "cname.sandboxes.easybits.cloud";

/** Un apex no admite CNAME; un subdominio sí. */
function dnsRecordFor(domain: string) {
  const apex = domain.split(".").length <= 2;
  return apex
    ? { type: "A", name: domain, value: PUBLIC_IP }
    : { type: "CNAME", name: domain, value: CNAME_TARGET };
}

export const loader = async ({ request }: Route.LoaderArgs) => {
  const user = await getUserOrRedirect(request);
  const ctx = { user, scopes: ["READ"] } as AuthContext;
  const all = await listPermanent(ctx).catch(() => []);

  // Borrar una máquina la destruye en el acto, así que ya no hay "en baja"
  // que esconder: listPermanent sólo devuelve las vivas. Lo único que queda
  // dormido es lo que suspendió la cancelación de una suscripción, y eso SÍ
  // debe verse para poder restaurarlo.
  const machines = all;

  // listPermanent no trae ni la versión publicada ni dónde se ve el sitio, que
  // es justamente lo que se viene a mirar.
  const rows = await db.sandbox.findMany({
    where: { sandboxId: { in: machines.map((m: any) => m.sandboxId) } },
    select: { sandboxId: true, currentReleaseId: true, runspec: true },
  });
  const extra = Object.fromEntries(rows.map((r) => [r.sandboxId, r]));

  const enriched = await Promise.all(
    machines.map(async (m: any) => {
      const row = extra[m.sandboxId];
      const port = (row?.runspec as any)?.port ?? 3000;
      const domains = await listSandboxDomains(ctx, m.sandboxId).catch(() => []);
      return {
        ...m,
        currentReleaseId: row?.currentReleaseId ?? null,
        domains: domains.map((d: any) => d.domain),
        // La dirección que el host publica para esa caja y ese puerto.
        url: `https://sb-${m.sandboxId.replace(/^sb_/, "")}-${port}.sandboxes.easybits.cloud`,
      };
    })
  );

  return data({ machines: enriched });
};

export const action = async ({ request }: Route.ActionArgs) => {
  const user = await getUserOrRedirect(request);
  const ctx = { user, scopes: ["READ", "WRITE", "DELETE"] } as AuthContext;
  const form = await request.formData();
  const intent = String(form.get("intent") || "");
  const id = String(form.get("sandboxId") || "");

  switch (intent) {
    case "detail": {
      // En paralelo y tolerante: una caja dormida no responde logs, y eso no
      // debe impedir ver sus versiones o su dominio.
      const [releases, domains, secrets, logs] = await Promise.all([
        listReleases(ctx, { sandboxId: id, limit: 8 }).catch(() => ({ items: [] })),
        // Cada dominio con su registro y si ya está resolviendo: el paso que
        // ocurre fuera de aquí es justamente el que se olvida, y hasta ahora
        // sólo se veía en el instante de darlo de alta.
        listSandboxDomains(ctx, id)
          .then((ds) =>
            Promise.all(
              ds.map(async (d: any) => ({
                ...d,
                dns: dnsRecordFor(d.domain),
                check: await verifySandboxDomain(ctx, d.domain).catch(() => null),
              }))
            )
          )
          .catch(() => []),
        listMachineSecrets(ctx, id).catch(() => ({ secretNames: [], inVault: [] })),
        readMachineLogs(ctx, id, { lines: 40 }).catch(() => ({ output: "" })),
      ]);
      return data({ detail: { releases, domains, secrets, logs } });
    }
    case "rollback":
      return data({ ok: await applyRelease(ctx, id, String(form.get("releaseId"))) });
    case "domain-add":
      return data({
        domain: await addSandboxDomain(ctx, id, String(form.get("domain")), 3000),
      });
    case "domain-remove":
      return data({ ok: await removeSandboxDomain(ctx, id, String(form.get("domain"))) });
    case "secret-set":
      return data({
        ok: await setMachineSecrets(ctx, id, {
          [String(form.get("name"))]: String(form.get("value")),
        }),
      });
    case "secret-unset":
      return data({ ok: await unsetMachineSecret(ctx, id, String(form.get("name"))) });
    case "suspend":
      return data({ ok: await suspendSandbox(ctx, id) });
    case "resume":
      return data({ ok: await resumeSandbox(ctx, id) });
    case "release":
      return data({ ok: await releasePermanent(ctx, id) });
    default:
      return data({ error: "intent desconocido" }, { status: 400 });
  }
};

/* ------------------------------------------------------------------ */

/**
 * Cómo llamar a un sitio en la lista.
 *
 * El id de la caja es un hexadecimal que no le dice nada a su dueño, y el
 * `name` de una máquina recreada desde un release trae ese mismo id con un
 * sufijo. Manda el dominio, que es como la persona piensa en su sitio.
 */
function title(machine: any) {
  if (machine.domains?.[0]) return machine.domains[0];
  const name = machine.name ?? "";
  return !name || /^sb_[0-9a-f-]{8}/i.test(name) ? "Sitio sin dominio" : name;
}

/** El id, recortado: sirve para hablar con soporte, no para leerlo entero. */
function shortId(sandboxId: string) {
  return sandboxId.replace(/^sb_/, "").slice(0, 8);
}

const DOT: Record<string, string> = {
  running: "bg-emerald-500",
  starting: "bg-amber-400 animate-pulse",
  provisioning: "bg-amber-400 animate-pulse",
  suspended: "bg-gray-400",
};

/** Botón chico del panel. Brutalista, pero legible también apagado. */
function Btn({
  children,
  onClick,
  disabled,
  tone = "default",
  className = "",
}: {
  children: React.ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  tone?: "default" | "danger" | "quiet";
  className?: string;
}) {
  const tones = {
    default: "bg-brand-500 border-black text-black",
    danger: "bg-white border-red-500 text-red-600 hover:bg-red-50",
    quiet: "bg-white border-black text-black hover:bg-cream",
  };
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`h-9 px-3 shrink-0 rounded-lg border-[2px] text-sm font-semibold transition-all
        ${tones[tone]}
        ${disabled ? "opacity-40 cursor-not-allowed" : "active:translate-y-px hover:-translate-y-px"}
        ${className}`}
    >
      {children}
    </button>
  );
}

const input =
  "h-9 px-3 w-full min-w-0 text-sm rounded-lg border-[2px] border-black bg-white " +
  "placeholder:text-metal/50 focus:outline-none focus:ring-2 focus:ring-brand-500/40";

export default function Hosting({ loaderData }: Route.ComponentProps) {
  const { machines } = loaderData;
  const [openId, setOpenId] = useState<string | null>(null);

  return (
    // El sidebar es fijo y no ocupa sitio en el flujo: sin el pl-20 la página
    // se le mete debajo y se ve cortada por la izquierda. Es la misma
    // estructura que packs.tsx y el resto del dash.
    <section className="w-full min-w-0 md:pl-20 pt-14 md:pt-0">
      <div className="max-w-4xl mx-auto px-4 md:px-6 py-8 md:py-10 min-w-0">
      <header className="mb-6">
        <h1 className="text-2xl md:text-3xl font-bold text-dark">Hosting</h1>
        <p className="mt-1 text-sm text-metal">
          {machines.length === 0
            ? "Todavía no tienes sitios publicados."
            : `${machines.length} ${machines.length === 1 ? "sitio" : "sitios"}`}
        </p>
      </header>

      <div className="grid gap-3 w-full min-w-0">
        {machines.map((m: any) => (
          <MachineCard
            key={m.sandboxId}
            machine={m}
            open={openId === m.sandboxId}
            onToggle={() => setOpenId(openId === m.sandboxId ? null : m.sandboxId)}
          />
          ))}
        </div>
      </div>
    </section>
  );
}

const TABS = [
  { key: "dominios", label: "Dominios", icon: LuLink },
  { key: "versiones", label: "Versiones", icon: LuHistory },
  { key: "variables", label: "Variables", icon: LuKeyRound },
  { key: "registro", label: "Registro", icon: LuScrollText },
] as const;

type Pending = { title: string; message: string; label: string; run: () => void; confirmPhrase?: string };

function MachineCard({
  machine,
  open,
  onToggle,
}: {
  machine: any;
  open: boolean;
  onToggle: () => void;
}) {
  const fetcher = useFetcher<any>();
  const [tab, setTab] = useState<(typeof TABS)[number]["key"]>("dominios");
  // Lo que está esperando confirmación. Vive en la tarjeta para que las tres
  // pestañas compartan el mismo diálogo.
  const [pending, setPending] = useState<Pending | null>(null);
  const tier = HOSTING_CATALOG[machine.tier as keyof typeof HOSTING_CATALOG];
  // El detalle vive en estado, no en `fetcher.data`: el mismo fetcher sirve
  // para mutar (dar de alta una variable, un dominio, volver a una versión) y
  // su respuesta PISABA el detalle → el panel se quedaba en "Cargando…" y
  // nunca mostraba lo recién guardado.
  const [detail, setDetail] = useState<any>(null);
  const address = machine.domains?.[0]
    ? `https://${machine.domains[0]}`
    : machine.url;

  const loadDetail = () =>
    fetcher.submit(
      { intent: "detail", sandboxId: machine.sandboxId },
      { method: "post" }
    );

  useEffect(() => {
    if (fetcher.state !== "idle" || !fetcher.data) return;
    if (fetcher.data.detail) setDetail(fetcher.data.detail);
    // Cualquier otra respuesta es una mutación ya aplicada: recargar para que
    // la lista muestre el estado nuevo.
    else if (!fetcher.data.error) loadDetail();
  }, [fetcher.state, fetcher.data]);

  const openAndLoad = () => {
    if (!open && !detail) loadDetail();
    onToggle();
  };

  return (
    <article className="w-full min-w-0 rounded-2xl border-[2px] border-black bg-white overflow-hidden transition-shadow hover:shadow-[4px_4px_0_0_#000]">
      <div className="flex items-center gap-3 p-3 md:p-4 min-w-0">
        <span
          className={`w-2.5 h-2.5 rounded-full shrink-0 ${DOT[machine.status] ?? "bg-gray-300"}`}
          title={machine.status}
        />
        <div className="min-w-0 flex-1">
          <a
            href={address}
            target="_blank"
            rel="noreferrer"
            className="font-semibold text-dark hover:text-brand-600 truncate block transition-colors"
          >
            {title(machine)}
          </a>
          {/* El id de la caja, en pequeño: hace falta para hablar de ella con
              soporte, pero no es lo que su dueño viene a leer. */}
          <p className="text-[11px] text-metal/70 tabular-nums truncate">
            <span className="font-mono">{shortId(machine.sandboxId)}</span>
            {" · "}
            {tier ? `${tier.vcpus} vCPU · ${tier.memoryMb / 1024} GB` : machine.tier}
            {machine.currentReleaseId ? "" : " · sin publicar"}
          </p>
        </div>

        <a
          href={address}
          target="_blank"
          rel="noreferrer"
          title="Abrir el sitio"
          className="hidden sm:grid place-content-center w-9 h-9 shrink-0 rounded-lg border-[2px] border-black hover:bg-cream transition-colors"
        >
          <LuExternalLink className="w-4 h-4" />
        </a>
        <Btn tone="quiet" onClick={openAndLoad}>
          {open ? "Cerrar" : "Administrar"}
        </Btn>
      </div>

      {open && (
        <div className="border-t-[2px] border-black bg-cream/30 min-w-0 overflow-hidden">
          {/* En pestañas y no todo apilado: el panel entero no cabía en una
              tablet, y a diario sólo se mira una de las cuatro cosas. */}
          <div className="flex gap-1 p-2 overflow-x-auto border-b-[2px] border-black/10">
            {TABS.map((t) => (
              <button
                key={t.key}
                onClick={() => setTab(t.key)}
                className={`flex items-center gap-1.5 px-3 h-8 shrink-0 rounded-lg text-xs font-semibold transition-colors
                  ${tab === t.key ? "bg-black text-white" : "text-metal hover:bg-black/5"}`}
              >
                <t.icon className="w-3.5 h-3.5" />
                {t.label}
              </button>
            ))}
          </div>

          <div className="p-3 md:p-4 min-w-0">
            {!detail && <p className="text-sm text-metal">Cargando…</p>}
            {detail && (
              <>
                {tab === "dominios" && (
                  <Domains machine={machine} detail={detail} fetcher={fetcher} confirm={setPending} />
                )}
                {tab === "versiones" && (
                  <Releases machine={machine} detail={detail} fetcher={fetcher} />
                )}
                {tab === "variables" && (
                  <Secrets machine={machine} detail={detail} fetcher={fetcher} confirm={setPending} />
                )}
                {tab === "registro" && <Logs detail={detail} />}

                <Danger machine={machine} fetcher={fetcher} confirm={setPending} />
              </>
            )}
          </div>
        </div>
      )}

      <ConfirmDialog
        isOpen={!!pending}
        title={pending?.title ?? ""}
        message={pending?.message}
        confirmLabel={pending?.label ?? "Confirmar"}
        confirmPhrase={pending?.confirmPhrase}
        destructive
        onCancel={() => setPending(null)}
        onConfirm={() => {
          pending?.run();
          setPending(null);
        }}
      />
    </article>
  );
}

function Domains({ machine, detail, fetcher, confirm }: any) {
  const [value, setValue] = useState("");
  const added = fetcher.data?.domain;
  const send = () => {
    if (!value.trim()) return;
    fetcher.submit(
      { intent: "domain-add", sandboxId: machine.sandboxId, domain: value.trim() },
      { method: "post" }
    );
    setValue("");
  };

  return (
    <div className="grid gap-3 w-full min-w-0">
      <ul className="grid gap-1.5">
        {detail.domains.length === 0 && (
          <li className="text-sm text-metal">
            Ninguno todavía. Tu sitio se ve en la dirección de arriba.
          </li>
        )}
        {detail.domains.map((d: any) => {
          const live = d.check?.https?.ok;
          return (
            <li
              key={d.domain}
              className="p-2.5 rounded-lg border-[2px] border-black/10 bg-white min-w-0"
            >
              <div className="flex items-center gap-2 min-w-0">
                <span
                  className={`w-2 h-2 rounded-full shrink-0 ${live ? "bg-emerald-500" : "bg-amber-400"}`}
                />
                <a
                  href={`https://${d.domain}`}
                  target="_blank"
                  rel="noreferrer"
                  className="font-medium text-dark hover:text-brand-600 truncate text-sm"
                >
                  {d.domain}
                </a>
                <span className="text-[11px] text-metal shrink-0">
                  {live ? "funcionando" : "falta el DNS"}
                </span>
                <button
                  onClick={() =>
                    confirm({
                      title: `¿Quitar ${d.domain}?`,
                      message:
                        "El sitio dejará de responder en ese dominio. Puedes volver a darlo de alta cuando quieras, y el registro DNS seguirá sirviendo.",
                      label: "Quitar dominio",
                      run: () =>
                        fetcher.submit(
                          { intent: "domain-remove", sandboxId: machine.sandboxId, domain: d.domain },
                          { method: "post" }
                        ),
                    })
                  }
                  className="ml-auto text-metal hover:text-red-500 shrink-0 transition-colors"
                  title={`Quitar ${d.domain}`}
                >
                  <LuTrash2 className="w-3.5 h-3.5" />
                </button>
              </div>

              {/* El registro se enseña siempre, no sólo al darlo de alta: es el
                  paso que ocurre fuera de aquí, y el que hay que consultar
                  justo cuando algo no funciona. */}
              {d.dns && (
                <p className="mt-1.5 font-mono text-[11px] text-metal break-all">
                  {d.dns.type} · {d.dns.name} → {d.dns.value}
                </p>
              )}
            </li>
          );
        })}
      </ul>

      <div className="flex gap-2 min-w-0">
        <input
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && send()}
          placeholder="tienda.midominio.com"
          className={input}
        />
        <Btn onClick={send} disabled={!value.trim()}>
          <span className="flex items-center gap-1">
            <LuPlus className="w-3.5 h-3.5" /> Añadir
          </span>
        </Btn>
      </div>

      {/* Sin el registro, añadir el dominio no sirve de nada: es el único paso
          que ocurre fuera de aquí. */}
      {added?.dns && (
        <div className="p-3 rounded-lg border-[2px] border-black bg-amber-50 text-sm min-w-0">
          <p className="font-semibold text-dark mb-1">Falta crear este registro en tu DNS:</p>
          <p className="font-mono text-xs break-all">
            {added.dns.type} · {added.dns.name} → {added.dns.value}
          </p>
          <p className="mt-1 text-xs text-metal">{added.dns.note}</p>
        </div>
      )}
    </div>
  );
}

/** Fecha corta de una versión: "12 ago, 14:03" (el año sólo si es otro). */
function releaseDate(iso: string | Date) {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "";
  const sameYear = d.getFullYear() === new Date().getFullYear();
  return d.toLocaleString("es-MX", {
    day: "numeric",
    month: "short",
    year: sameYear ? undefined : "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function Releases({ machine, detail, fetcher }: any) {
  const items = detail.releases.items ?? detail.releases ?? [];
  if (items.length === 0)
    return <p className="text-sm text-metal">Todavía no hay versiones publicadas.</p>;

  return (
    <ul className="grid gap-1">
      {items.map((r: any) => {
        const live = r.releaseId === machine.currentReleaseId;
        return (
          <li
            key={r.releaseId}
            className="flex items-center gap-2 py-1.5 text-sm border-b border-black/10 last:border-0 min-w-0"
          >
            <span className="font-mono text-xs tabular-nums w-7 shrink-0 text-metal">
              v{r.version}
            </span>
            <span className="flex-1 truncate text-dark">{r.message || "sin mensaje"}</span>
            {/* Cuándo se publicó: sin esto, "volver a esta versión" es a
                ciegas — el mensaje casi nunca dice de qué día es. */}
            {r.createdAt && (
              <span
                className="text-[11px] text-metal/70 tabular-nums shrink-0 hidden sm:block"
                title={new Date(r.createdAt).toLocaleString("es-MX")}
              >
                {releaseDate(r.createdAt)}
              </span>
            )}
            {live ? (
              <span className="flex items-center gap-1 text-xs font-semibold text-emerald-600 shrink-0">
                <LuCircleCheck className="w-3.5 h-3.5" /> en vivo
              </span>
            ) : (
              <button
                onClick={() =>
                  fetcher.submit(
                    { intent: "rollback", sandboxId: machine.sandboxId, releaseId: r.releaseId },
                    { method: "post" }
                  )
                }
                className="flex items-center gap-1 text-xs font-medium text-metal hover:text-dark shrink-0 transition-colors"
                title="Volver a esta versión"
              >
                <LuRotateCcw className="w-3.5 h-3.5" /> volver
              </button>
            )}
          </li>
        );
      })}
    </ul>
  );
}

function Secrets({ machine, detail, fetcher, confirm }: any) {
  const [name, setName] = useState("");
  const [value, setValue] = useState("");
  const send = () => {
    if (!name.trim() || !value) return;
    fetcher.submit(
      { intent: "secret-set", sandboxId: machine.sandboxId, name: name.trim(), value },
      { method: "post" }
    );
    setName("");
    setValue("");
  };

  return (
    <div className="grid gap-3 min-w-0">
      <ul className="flex flex-wrap gap-1.5">
        {detail.secrets.secretNames.length === 0 && (
          <li className="text-sm text-metal">Ninguna todavía.</li>
        )}
        {detail.secrets.secretNames.map((n: string) => (
          <li
            key={n}
            className="flex items-center gap-1.5 px-2 py-1 rounded-lg border-[2px] border-black bg-white text-xs font-mono"
          >
            {n}
            <button
              onClick={() =>
                confirm({
                  title: `¿Dejar de usar ${n}?`,
                  message:
                    "La app dejará de recibirla en el próximo despliegue. Si la necesita para arrancar, no levantará. El valor sigue guardado y puedes volver a activarla.",
                  label: "Dejar de usarla",
                  run: () =>
                    fetcher.submit(
                      { intent: "secret-unset", sandboxId: machine.sandboxId, name: n },
                      { method: "post" }
                    ),
                })
              }
              className="text-metal hover:text-red-500"
              title={`Dejar de usar ${n}`}
            >
              <LuTrash2 className="w-3 h-3" />
            </button>
          </li>
        ))}
      </ul>

      {/* Apilado en pantallas chicas: en una fila, los dos campos y el botón no
          caben en una tablet. */}
      <div className="grid sm:grid-cols-[minmax(0,11rem)_minmax(0,1fr)_auto] gap-2">
        <input
          value={name}
          onChange={(e) => setName(e.target.value.toUpperCase())}
          placeholder="DATABASE_URL"
          className={`${input} font-mono`}
        />
        <input
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && send()}
          type="password"
          placeholder="su valor"
          className={input}
        />
        <Btn onClick={send} disabled={!name.trim() || !value}>
          Guardar
        </Btn>
      </div>
      <p className="text-xs text-metal">
        Se guardan cifradas y sólo entran a la máquina al desplegar. No se pueden
        volver a leer desde aquí.
      </p>
    </div>
  );
}

function Logs({ detail }: any) {
  const output = detail.logs?.output?.trim();
  return (
    // break-all + scroll horizontal propio: una línea de systemd es larguísima
    // y sin esto estiraba la tarjeta entera fuera de la pantalla.
    <div className="w-full min-w-0 max-h-56 overflow-auto rounded-lg bg-dark">
      <pre className="p-3 text-[11px] leading-relaxed font-mono text-cream whitespace-pre-wrap break-all">
        {output || "Sin salida todavía."}
      </pre>
    </div>
  );
}

function Danger({ machine, fetcher, confirm }: any) {
  const suspended = machine.status === "suspended";
  return (
    <div className="flex flex-wrap items-center gap-2 mt-4 pt-3 border-t border-black/10">
      {/* "Pausar" y "Dar de baja" a secas no decían QUÉ se pausa: la pestaña de
          al lado va de dominios, y se leían como si fueran de eso. */}
      <Btn
        tone="quiet"
        onClick={() => {
          const run = () =>
            fetcher.submit(
              { intent: suspended ? "resume" : "suspend", sandboxId: machine.sandboxId },
              { method: "post" }
            );
          // Reanudar no rompe nada; pausar tira el sitio.
          if (suspended) return run();
          confirm({
            title: "¿Pausar el sitio?",
            message:
              "Dejará de responder hasta que lo reanudes. Nada se borra: sus datos y sus versiones siguen ahí.",
            label: "Pausar sitio",
            run,
          });
        }}
      >
        <span className="flex items-center gap-1.5">
          {suspended ? <LuPlay className="w-4 h-4" /> : <LuPause className="w-4 h-4" />}
          {suspended ? "Reanudar sitio" : "Pausar sitio"}
        </span>
      </Btn>

      <Btn
        tone="danger"
        onClick={() =>
          confirm({
            title: "¿Borrar la máquina?",
            message:
              "Se destruye de inmediato y deja de cobrarse. No hay deshacer: lo único que queda es su último respaldo, guardado 30 días, con el que puedes reconstruirla en una máquina nueva. Los datos que vivan fuera (tu base de datos) no se tocan.",
            label: "Borrar para siempre",
            confirmPhrase: machine.name || machine.sandboxId,
            run: () =>
              fetcher.submit({ intent: "release", sandboxId: machine.sandboxId }, { method: "post" }),
          })
        }
      >
        <span className="flex items-center gap-1.5">
          <LuTrash2 className="w-4 h-4" />
          Borrar
        </span>
      </Btn>
    </div>
  );
}
