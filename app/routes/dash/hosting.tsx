import { useState } from "react";
import { useFetcher, data } from "react-router";
import type { Route } from "./+types/hosting";
import { getUserOrRedirect } from "~/.server/getters";
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
import { BrutalButton } from "~/components/common/BrutalButton";
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
  const machines = await listPermanent(ctx).catch(() => []);
  return data({ machines });
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

const DOT: Record<string, string> = {
  running: "bg-emerald-500",
  starting: "bg-amber-400 animate-pulse",
  provisioning: "bg-amber-400 animate-pulse",
  suspended: "bg-gray-400",
  pending_deletion: "bg-red-400",
};

export default function Hosting({ loaderData }: Route.ComponentProps) {
  const { machines } = loaderData;
  const [openId, setOpenId] = useState<string | null>(null);

  return (
    <section className="max-w-5xl mx-auto px-4 md:px-8 py-10">
      <header className="mb-8">
        <h1 className="text-3xl md:text-4xl font-bold text-dark">Hosting</h1>
        <p className="mt-1 text-sm text-metal">
          {machines.length === 0
            ? "Todavía no tienes sitios publicados."
            : `${machines.length} ${machines.length === 1 ? "sitio" : "sitios"}`}
        </p>
      </header>

      <div className="grid gap-3">
        {machines.map((m: any) => (
          <MachineCard
            key={m.sandboxId}
            machine={m}
            open={openId === m.sandboxId}
            onToggle={() =>
              setOpenId(openId === m.sandboxId ? null : m.sandboxId)
            }
          />
        ))}
      </div>
    </section>
  );
}

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
  const tier = HOSTING_CATALOG[machine.tier as keyof typeof HOSTING_CATALOG];
  const detail = fetcher.data?.detail;

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
    <article className="rounded-2xl border-[2px] border-black bg-white overflow-hidden">
      {/* Cabecera: lo que se mira a diario — está vivo, y dónde. */}
      <div className="flex items-center gap-3 p-4">
        <span
          className={`w-2.5 h-2.5 rounded-full shrink-0 ${
            DOT[machine.status] ?? "bg-gray-300"
          }`}
          title={machine.status}
        />
        <div className="min-w-0 flex-1">
          <h2 className="font-semibold text-dark truncate">
            {machine.name || machine.sandboxId}
          </h2>
          <p className="text-xs text-metal tabular-nums">
            {tier ? `${tier.vcpus} vCPU · ${tier.memoryMb / 1024} GB` : machine.tier}
            {machine.currentReleaseId ? " · publicado" : " · sin publicar"}
          </p>
        </div>

        {machine.url && (
          <a
            href={machine.url}
            target="_blank"
            rel="noreferrer"
            className="hidden sm:flex items-center gap-1.5 text-sm font-medium text-dark hover:text-brand-600 transition-colors"
          >
            Abrir <LuExternalLink className="w-4 h-4" />
          </a>
        )}

        <BrutalButton size="chip" mode="ghost" onClick={openAndLoad}>
          {open ? "Cerrar" : "Administrar"}
        </BrutalButton>
      </div>

      {open && (
        <div className="border-t-[2px] border-black bg-cream/40 p-4 grid gap-5">
          {fetcher.state !== "idle" && !detail && (
            <p className="text-sm text-metal">Cargando…</p>
          )}

          {detail && (
            <>
              <Domains machine={machine} detail={detail} fetcher={fetcher} />
              <Releases machine={machine} detail={detail} fetcher={fetcher} />
              <Secrets machine={machine} detail={detail} fetcher={fetcher} />
              <Logs detail={detail} />
              <Danger machine={machine} fetcher={fetcher} />
            </>
          )}
        </div>
      )}
    </article>
  );
}

/** Título de sección: el mismo en las cuatro, para que el ojo no trabaje. */
function Block({
  icon,
  title,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <h3 className="flex items-center gap-2 text-xs font-bold uppercase tracking-wide text-metal mb-2">
        {icon} {title}
      </h3>
      {children}
    </div>
  );
}

function Domains({ machine, detail, fetcher }: any) {
  const [value, setValue] = useState("");
  const added = fetcher.data?.domain;

  return (
    <Block icon={<LuGlobe className="w-3.5 h-3.5" />} title="Dominios">
      <ul className="grid gap-1.5 mb-2">
        {detail.domains.length === 0 && (
          <li className="text-sm text-metal">
            Ninguno. Tu sitio vive en la dirección de arriba.
          </li>
        )}
        {detail.domains.map((d: any) => (
          <li key={d.domain} className="flex items-center gap-2 text-sm">
            <a
              href={`https://${d.domain}`}
              target="_blank"
              rel="noreferrer"
              className="font-medium text-dark hover:text-brand-600"
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
              className="text-metal hover:text-red-500 transition-colors"
              title="Quitar"
            >
              <LuTrash2 className="w-3.5 h-3.5" />
            </button>
          </li>
        ))}
      </ul>

      <div className="flex gap-2">
        <input
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder="tienda.midominio.com"
          className="flex-1 h-9 px-3 text-sm rounded-lg border-[2px] border-black bg-white"
        />
        <BrutalButton
          size="chip"
          isDisabled={!value.trim()}
          onClick={() => {
            fetcher.submit(
              { intent: "domain-add", sandboxId: machine.sandboxId, domain: value.trim() },
              { method: "post" }
            );
            setValue("");
          }}
        >
          <LuPlus className="w-3.5 h-3.5" />
        </BrutalButton>
      </div>

      {/* Sin el registro, añadir el dominio no sirve de nada: es el único paso
          que ocurre fuera de aquí. */}
      {added?.dns && (
        <div className="mt-2 p-3 rounded-lg border-[2px] border-black bg-amber-50 text-sm">
          <p className="font-semibold text-dark mb-1">
            Falta un paso, en tu proveedor de DNS:
          </p>
          <p className="font-mono text-xs tabular-nums">
            {added.dns.type} &nbsp; {added.dns.name} &nbsp;→&nbsp; {added.dns.value}
          </p>
          <p className="mt-1 text-xs text-metal">{added.dns.note}</p>
        </div>
      )}
    </Block>
  );
}

function Releases({ machine, detail, fetcher }: any) {
  const items = detail.releases.items ?? detail.releases ?? [];
  return (
    <Block icon={<LuHistory className="w-3.5 h-3.5" />} title="Versiones">
      {items.length === 0 ? (
        <p className="text-sm text-metal">Todavía no hay versiones publicadas.</p>
      ) : (
        <ul className="grid gap-1">
          {items.map((r: any) => {
            const current = r.releaseId === machine.currentReleaseId;
            return (
              <li
                key={r.releaseId}
                className="flex items-center gap-3 py-1.5 text-sm border-b border-black/10 last:border-0"
              >
                <span className="font-mono text-xs tabular-nums w-8 text-metal">
                  v{r.version}
                </span>
                <span className="flex-1 truncate text-dark">
                  {r.message || "sin mensaje"}
                </span>
                {current ? (
                  <span className="flex items-center gap-1 text-xs font-semibold text-emerald-600">
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
                    className="flex items-center gap-1 text-xs font-medium text-metal hover:text-dark transition-colors"
                    title="Volver a esta versión"
                  >
                    <LuRotateCcw className="w-3.5 h-3.5" /> volver
                  </button>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </Block>
  );
}

function Secrets({ machine, detail, fetcher }: any) {
  const [name, setName] = useState("");
  const [value, setValue] = useState("");

  return (
    <Block icon={<LuKeyRound className="w-3.5 h-3.5" />} title="Variables secretas">
      <ul className="flex flex-wrap gap-1.5 mb-2">
        {detail.secrets.secretNames.length === 0 && (
          <li className="text-sm text-metal">Ninguna.</li>
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

      <div className="flex flex-wrap gap-2">
        <input
          value={name}
          onChange={(e) => setName(e.target.value.toUpperCase())}
          placeholder="DATABASE_URL"
          className="w-44 h-9 px-3 text-sm font-mono rounded-lg border-[2px] border-black bg-white"
        />
        <input
          value={value}
          onChange={(e) => setValue(e.target.value)}
          type="password"
          placeholder="su valor"
          className="flex-1 min-w-40 h-9 px-3 text-sm rounded-lg border-[2px] border-black bg-white"
        />
        <BrutalButton
          size="chip"
          isDisabled={!name.trim() || !value}
          onClick={() => {
            fetcher.submit(
              { intent: "secret-set", sandboxId: machine.sandboxId, name: name.trim(), value },
              { method: "post" }
            );
            setName("");
            setValue("");
          }}
        >
          Guardar
        </BrutalButton>
      </div>
      <p className="mt-1.5 text-xs text-metal">
        Se guardan cifradas y sólo entran a la máquina al desplegar. No se
        pueden volver a leer desde aquí.
      </p>
    </Block>
  );
}

function Logs({ detail }: any) {
  const output = detail.logs?.output?.trim();
  return (
    <Block icon={<LuScrollText className="w-3.5 h-3.5" />} title="Últimas líneas">
      <pre className="max-h-48 overflow-auto p-3 rounded-lg border-[2px] border-black bg-dark text-cream text-[11px] leading-relaxed font-mono whitespace-pre-wrap">
        {output || "Sin salida todavía."}
      </pre>
    </Block>
  );
}

function Danger({ machine, fetcher }: any) {
  const suspended = machine.status === "suspended";
  return (
    <div className="flex flex-wrap items-center gap-2 pt-1">
      <BrutalButton
        size="chip"
        mode="ghost"
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
      </BrutalButton>

      <BrutalButton
        size="chip"
        mode="danger"
        onClick={() => {
          // Se puede recuperar durante 7 días; decirlo aquí evita el susto y
          // también que alguien crea que ya no hay vuelta atrás.
          if (
            confirm(
              "Se apaga el sitio y se programa su borrado. Puedes recuperarlo durante 7 días. ¿Seguimos?"
            )
          ) {
            fetcher.submit(
              { intent: "release", sandboxId: machine.sandboxId },
              { method: "post" }
            );
          }
        }}
      >
        Dar de baja
      </BrutalButton>
    </div>
  );
}
