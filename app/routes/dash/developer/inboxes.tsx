import { useState } from "react";
import { useFetcher, useLoaderData } from "react-router";
import { getUserOrRedirect } from "~/.server/getters";
import type { AuthContext } from "~/.server/apiAuth";
import { createInbox, deleteInbox, listInboxes, readInboxEvents, rotateInboxToken } from "~/.server/core/inboxOperations";
import { BrutalButton } from "~/components/common/BrutalButton";
import { ConfirmDialog } from "~/components/common/ConfirmDialog";
import type { Route } from "./+types/inboxes";

// Buzones de eventos: lo mismo que `easybits inbox` y las tools inbox_* (inboxOperations.ts).

export const meta = () => [
  { title: "Buzones — EasyBits" },
  { name: "robots", content: "noindex" },
];

const ctxOf = async (request: Request): Promise<AuthContext> => ({ user: await getUserOrRedirect(request), scopes: ["READ", "WRITE", "DELETE"] });

export const loader = async ({ request }: Route.LoaderArgs) => {
  const ctx = await ctxOf(request);
  const inboxes = await listInboxes(ctx);
  const open = new URL(request.url).searchParams.get("open");
  // Mirar desde el panel no marca como leído: eso lo decide quien lee con `read`.
  const events = open && inboxes.some((b) => b.id === open) ? (await readInboxEvents(ctx, open, { since: 0, ack: false, limit: 200 })).items.reverse() : null;
  return { inboxes, open, events };
};

export const action = async ({ request }: Route.ActionArgs) => {
  const ctx = await ctxOf(request);
  const fd = await request.formData();
  const intent = String(fd.get("intent") ?? "");
  const id = String(fd.get("id") ?? "");
  try {
    if (intent === "create") return { created: await createInbox(ctx, { name: fd.get("name"), retentionDays: fd.get("retentionDays") || undefined }) };
    if (intent === "rotate") return { rotated: await rotateInboxToken(ctx, id) };
    if (intent === "delete") return { deleted: await deleteInbox(ctx, id) };
  } catch (e) {
    if (e instanceof Response) return { error: ((await e.json().catch(() => ({}))) as { error?: string }).error ?? "Error" };
    throw e;
  }
  return null;
};

export default function InboxesPage() {
  const { inboxes, open, events } = useLoaderData<typeof loader>();
  const fetcher = useFetcher<typeof action>();
  const [name, setName] = useState("");
  const [copied, setCopied] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; name: string } | null>(null);
  const error = fetcher.data && "error" in fetcher.data ? fetcher.data.error : null;

  const copy = async (id: string, url: string) => {
    await navigator.clipboard.writeText(url).catch(() => undefined);
    setCopied(id);
    setTimeout(() => setCopied(null), 1500);
  };

  return (
    <section>
      <h2 className="text-xl font-black mb-1">Buzones de eventos</h2>
      <p className="text-sm text-gray-600 mb-4 max-w-2xl">
        Una URL de webhook propia: cualquiera le escribe con <code className="font-mono text-xs">POST</code> (un cron, Stripe, GitHub) y lo que llega te
        alcanza en vivo con <code className="font-mono text-xs">easybits inbox listen</code> o te espera para{" "}
        <code className="font-mono text-xs">easybits inbox read</code>. Quien tenga la URL puede escribir: no la publiques.
      </p>

      <fetcher.Form method="post" className="flex flex-wrap items-end gap-2 mb-6" onSubmit={() => setName("")}>
        <input type="hidden" name="intent" value="create" />
        <label className="flex flex-col text-sm font-bold">
          Nombre
          <input name="name" value={name} onChange={(e) => setName(e.target.value)} required placeholder="builds" className="mt-1 border-2 border-black rounded-lg px-3 py-2 font-normal" />
        </label>
        <label className="flex flex-col text-sm font-bold">
          Días que se guardan
          <input name="retentionDays" type="number" min={1} max={30} defaultValue={7} className="mt-1 border-2 border-black rounded-lg px-3 py-2 w-28 font-normal" />
        </label>
        <BrutalButton type="submit" mode="brand" isDisabled={fetcher.state !== "idle"}>
          Crear buzón
        </BrutalButton>
      </fetcher.Form>
      {error && <p className="text-sm font-bold text-red-600 mb-4">{error}</p>}

      {inboxes.length === 0 ? (
        <p className="text-sm text-gray-500">Todavía no tienes buzones.</p>
      ) : (
        <div className="grid gap-3">
          {inboxes.map((b) => (
            <div key={b.id} className="border-2 border-black rounded-xl p-4 shadow-[3px_3px_0_#000]">
              <div className="flex flex-wrap items-center gap-2">
                <p className="font-black">{b.name}</p>
                {b.unread > 0 && <span className="text-xs font-bold bg-brand-500 text-white rounded-full px-2 py-0.5">{b.unread} sin leer</span>}
                <span className="text-xs text-gray-500">{b.lastEventAt ? `último evento ${new Date(b.lastEventAt).toLocaleString()}` : "sin eventos"} · se guardan {b.retentionDays} días</span>
              </div>
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <code className="font-mono text-xs break-all bg-gray-100 rounded px-2 py-1">{b.url}</code>
                <button type="button" className="text-xs font-bold underline" onClick={() => copy(b.id, b.url)}>
                  {copied === b.id ? "¡Copiada!" : "Copiar URL"}
                </button>
                <a className="text-xs font-bold underline" href={open === b.id ? "?" : `?open=${b.id}`}>
                  {open === b.id ? "Ocultar eventos" : "Ver eventos"}
                </a>
                <fetcher.Form method="post">
                  <input type="hidden" name="intent" value="rotate" />
                  <input type="hidden" name="id" value={b.id} />
                  <button className="text-xs font-bold underline" title="La URL vieja deja de aceptar eventos">
                    URL nueva
                  </button>
                </fetcher.Form>
                <button type="button" className="text-xs font-bold underline text-red-600" onClick={() => setDeleteTarget({ id: b.id, name: b.name })}>
                  Borrar
                </button>
              </div>
              {open === b.id && events && (
                <div className="mt-3 max-h-96 overflow-auto border-t-2 border-gray-200 pt-2">
                  {events.length === 0 ? (
                    <p className="text-xs text-gray-500">Sin eventos guardados.</p>
                  ) : (
                    events.map((e) => (
                      <details key={e.seq} className="text-xs py-1 border-b border-gray-100">
                        <summary className="cursor-pointer font-mono">
                          #{e.seq} · {new Date(e.receivedAt).toLocaleString()} · {e.source}
                          {e.method ? ` ${e.method}` : ""}
                        </summary>
                        <pre className="whitespace-pre-wrap break-all bg-gray-50 rounded p-2 mt-1">{e.json !== undefined ? JSON.stringify(e.json, null, 2) : e.body}</pre>
                      </details>
                    ))
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      <ConfirmDialog
        isOpen={!!deleteTarget}
        title="Borrar buzón"
        message={`¿Borrar «${deleteTarget?.name}» y sus eventos? Su URL deja de aceptar escrituras.`}
        onCancel={() => setDeleteTarget(null)}
        destructive
        confirmLabel="Borrar"
        onConfirm={() => {
          if (deleteTarget) fetcher.submit({ intent: "delete", id: deleteTarget.id }, { method: "post" });
          setDeleteTarget(null);
        }}
      />
    </section>
  );
}
