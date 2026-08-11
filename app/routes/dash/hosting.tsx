import { useState } from "react";
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
  readLogs,
  suspendSandbox,
  resumeSandbox,
} from "~/.server/core/sandboxOperations";
import { listReleases, applyRelease } from "~/.server/core/releaseOperations";
import {
  listMachineSecrets,
  setMachineSecrets,
  unsetMachineSecret,
} from "~/.server/core/releaseOperations";
import { HOSTING_CATALOG } from "~/lib/hostingCatalog";
import {
  LuExternalLink, LuGlobe, LuKeyRound, LuHistory, LuScrollText,
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

export const loader = async ({ request }: Route.LoaderArgs) => {
  const user = await getUserOrRedirect(request);
  const ctx = { user, scopes: ["READ"] } as AuthContext;
  const all = await listPermanent(ctx).catch(() => []);

  // Las dadas de baja siguen en la lista de la API durante su gracia de 7
  // días, para poder restaurarlas. Mezclarlas con las vivas hace que la
  // página mienta: una cuenta con un sitio parecía tener ocho.
  const machines = all.filter((m: any) => m.status !== "pending_deletion");
  const retired = all.length - machines.length;

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

  return data({ machines: enriched, retired });
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
        listSandboxDomains(ctx, id).catch(() => []),
        listMachineSecrets(ctx, id).catch(() => ({ secretNames: [], inVault: [] })),
        readLogs(ctx, id, { lines: 40 }).catch(() => ({ output: "" })),
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
  const { machines, retired } = loaderData;
  const [openId, setOpenId] = useState<string | null>(null);

  return (
    <section className="max-w-4xl mx-auto px-4 md:px-6 py-8 md:py-10">
      <header className="mb-6">
        <h1 className="text-2xl md:text-3xl font-bold text-dark">Hosting</h1>
        <p className="mt-1 text-sm text-metal">
          {machines.length === 0
            ? "Todavía no tienes sitios publicados."
            : `${machines.length} ${machines.length === 1 ? "sitio" : "sitios"}`}
          {retired > 0 && (
            <span className="text-metal/70">
              {" · "}
              {retired} en baja, se {retired === 1 ? "borra" : "borran"} en 7 días
            </span>
          )}
        </p>
      </header>

      <div className="grid gap-3">
        {machines.map((m: any) => (
          <MachineCard
            key={m.sandboxId}
            machine={m}
            open={openId === m.sandboxId}
            onToggle={() => setOpenId(openId === m.sandboxId ? null : m.sandboxId)}
          />
        ))}
      </div>
    </section>
  );
}

const TABS = [
  { key: "dominios", label: "Dominios", icon: LuGlobe },
  { key: "versiones", label: "Versiones", icon: LuHistory },
  { key: "variables", label: "Variables", icon: LuKeyRound },
  { key: "registro", label: "Registro", icon: LuScrollText },
] as const;

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
  const tier = HOSTING_CATALOG[machine.tier as keyof typeof HOSTING_CATALOG];
  const detail = fetcher.data?.detail;
  const address = machine.domains?.[0]
    ? `https://${machine.domains[0]}`
    : machine.url;

  const openAndLoad = () => {
    if (!open && !detail) {
      fetcher.submit(
        { intent: "detail", sandboxId: machine.sandboxId },
        { method: "post" }
      );
    }
    onToggle();
  };

  return (
    <article className="rounded-2xl border-[2px] border-black bg-white overflow-hidden transition-shadow hover:shadow-[4px_4px_0_0_#000]">
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
          <p className="text-[11px] text-metal tabular-nums truncate">
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
        <div className="border-t-[2px] border-black bg-cream/30">
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
                  <Domains machine={machine} detail={detail} fetcher={fetcher} />
                )}
                {tab === "versiones" && (
                  <Releases machine={machine} detail={detail} fetcher={fetcher} />
                )}
                {tab === "variables" && (
                  <Secrets machine={machine} detail={detail} fetcher={fetcher} />
                )}
                {tab === "registro" && <Logs detail={detail} />}

                <Danger machine={machine} fetcher={fetcher} />
              </>
            )}
          </div>
        </div>
      )}
    </article>
  );
}

function Domains({ machine, detail, fetcher }: any) {
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
    <div className="grid gap-3">
      <ul className="grid gap-1.5">
        {detail.domains.length === 0 && (
          <li className="text-sm text-metal">
            Ninguno todavía. Tu sitio se ve en la dirección de arriba.
          </li>
        )}
        {detail.domains.map((d: any) => (
          <li key={d.domain} className="flex items-center gap-2 text-sm min-w-0">
            <a
              href={`https://${d.domain}`}
              target="_blank"
              rel="noreferrer"
              className="font-medium text-dark hover:text-brand-600 truncate"
            >
              {d.domain}
            </a>
            <button
              onClick={() =>
                fetcher.submit(
                  { intent: "domain-remove", sandboxId: machine.sandboxId, domain: d.domain },
                  { method: "post" }
                )
              }
              className="text-metal hover:text-red-500 shrink-0 transition-colors"
              title="Quitar"
            >
              <LuTrash2 className="w-3.5 h-3.5" />
            </button>
          </li>
        ))}
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

function Secrets({ machine, detail, fetcher }: any) {
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
                fetcher.submit(
                  { intent: "secret-unset", sandboxId: machine.sandboxId, name: n },
                  { method: "post" }
                )
              }
              className="text-metal hover:text-red-500"
              title="Dejar de usarla"
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
    <pre className="max-h-56 overflow-auto p-3 rounded-lg bg-dark text-cream text-[11px] leading-relaxed font-mono whitespace-pre-wrap break-all">
      {output || "Sin salida todavía."}
    </pre>
  );
}

function Danger({ machine, fetcher }: any) {
  const suspended = machine.status === "suspended";
  return (
    <div className="flex flex-wrap items-center gap-2 mt-4 pt-3 border-t border-black/10">
      <Btn
        tone="quiet"
        onClick={() =>
          fetcher.submit(
            { intent: suspended ? "resume" : "suspend", sandboxId: machine.sandboxId },
            { method: "post" }
          )
        }
      >
        <span className="flex items-center gap-1.5">
          {suspended ? <LuPlay className="w-3.5 h-3.5" /> : <LuPause className="w-3.5 h-3.5" />}
          {suspended ? "Reanudar" : "Pausar"}
        </span>
      </Btn>

      <Btn
        tone="danger"
        onClick={() => {
          // Se recupera durante 7 días; decirlo evita el susto, y también que
          // alguien crea que ya no hay vuelta atrás.
          if (
            confirm(
              "Se apaga el sitio y se programa su borrado. Puedes recuperarlo durante 7 días. ¿Seguimos?"
            )
          ) {
            fetcher.submit({ intent: "release", sandboxId: machine.sandboxId }, { method: "post" });
          }
        }}
      >
        Dar de baja
      </Btn>
    </div>
  );
}
