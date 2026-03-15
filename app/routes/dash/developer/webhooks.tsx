import { useFetcher, useLoaderData, data } from "react-router";
import { getUserOrRedirect } from "~/.server/getters";
import { db } from "~/.server/db";
import { randomBytes } from "crypto";
import { useState, useEffect } from "react";
import { BrutalButton } from "~/components/common/BrutalButton";
import type { Route } from "./+types/webhooks";

export const meta = () => [
  { title: "Webhooks — EasyBits" },
  { name: "robots", content: "noindex" },
];

const VALID_EVENTS = [
  "file.created",
  "file.updated",
  "file.deleted",
  "file.restored",
  "website.created",
  "website.deleted",
  "database.created",
  "database.deleted",
] as const;

export const loader = async ({ request }: Route.LoaderArgs) => {
  const user = await getUserOrRedirect(request);
  const webhooks = await db.webhook.findMany({
    where: { userId: user.id },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      url: true,
      events: true,
      status: true,
      failCount: true,
      lastError: true,
      createdAt: true,
    },
  });
  return { webhooks };
};

export const action = async ({ request }: Route.ActionArgs) => {
  const user = await getUserOrRedirect(request);
  const formData = await request.formData();
  const intent = formData.get("intent");

  if (intent === "create") {
    const url = (formData.get("url") as string)?.trim();
    if (!url || !url.startsWith("https://")) {
      return data({ error: "La URL debe usar HTTPS" }, { status: 400 });
    }
    const events = formData.getAll("events") as string[];
    const validEvents = events.filter((e) =>
      (VALID_EVENTS as readonly string[]).includes(e)
    );
    if (validEvents.length === 0) {
      return data({ error: "Selecciona al menos un evento" }, { status: 400 });
    }
    const count = await db.webhook.count({ where: { userId: user.id } });
    if (count >= 10) {
      return data({ error: "Máximo 10 webhooks por cuenta" }, { status: 400 });
    }
    const secret = `whsec_${randomBytes(24).toString("hex")}`;
    const webhook = await db.webhook.create({
      data: { url, events: validEvents, secret, userId: user.id },
    });
    return { created: { id: webhook.id, secret } };
  }

  if (intent === "toggle") {
    const webhookId = formData.get("webhookId") as string;
    const newStatus = formData.get("status") as string;
    if (newStatus !== "ACTIVE" && newStatus !== "PAUSED") return null;
    const webhook = await db.webhook.findUnique({ where: { id: webhookId } });
    if (!webhook || webhook.userId !== user.id) return null;
    const updates: Record<string, unknown> = { status: newStatus };
    if (newStatus === "ACTIVE") {
      updates.failCount = 0;
      updates.lastError = null;
    }
    await db.webhook.update({ where: { id: webhookId }, data: updates });
    return { toggled: true };
  }

  if (intent === "delete") {
    const webhookId = formData.get("webhookId") as string;
    const webhook = await db.webhook.findUnique({ where: { id: webhookId } });
    if (!webhook || webhook.userId !== user.id) return null;
    await db.webhook.delete({ where: { id: webhookId } });
    return { deleted: true };
  }

  return null;
};

export default function WebhooksPage() {
  const { webhooks } = useLoaderData<typeof loader>();
  const fetcher = useFetcher<typeof action>();
  const [showCreate, setShowCreate] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);

  const createdData =
    fetcher.data && "created" in fetcher.data ? fetcher.data.created : null;

  // Close modals on Escape
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        if (confirmDelete) setConfirmDelete(null);
        else if (showCreate) setShowCreate(false);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [showCreate, confirmDelete]);

  return (
    <div>
      <div className="flex justify-between items-center mb-4">
        <h2 className="text-lg font-black uppercase tracking-tight">
          Webhooks
        </h2>
        <BrutalButton
          size="chip"
          onClick={() => setShowCreate(true)}
          className="text-sm px-4 py-1.5"
        >
          + Create Webhook
        </BrutalButton>
      </div>

      {/* Create modal */}
      {showCreate && (
        <div
          className="fixed inset-0 bg-black/60 flex items-center justify-center z-50"
          role="dialog"
          aria-modal="true"
          aria-labelledby="create-webhook-title"
          onClick={(e) => {
            if (e.target === e.currentTarget) setShowCreate(false);
          }}
        >
          <div className="bg-white border-3 border-black rounded-xl p-6 w-full max-w-md shadow-[6px_6px_0px_0px_rgba(0,0,0,1)]">
            <h3
              id="create-webhook-title"
              className="text-lg font-black uppercase mb-4"
            >
              Create Webhook
            </h3>
            <fetcher.Form
              method="post"
              onSubmit={() => setShowCreate(false)}
            >
              <input type="hidden" name="intent" value="create" />
              <label className="block mb-4">
                <span className="text-sm font-bold">URL (HTTPS)</span>
                <input
                  name="url"
                  type="url"
                  placeholder="https://example.com/webhook"
                  required
                  className="mt-1 block w-full border-2 border-black rounded-lg px-3 py-2 text-sm font-mono"
                  autoFocus
                />
              </label>
              <fieldset className="mb-4">
                <legend className="text-sm font-bold mb-2">Events</legend>
                <div className="grid grid-cols-2 gap-2">
                  {VALID_EVENTS.map((event) => (
                    <label key={event} className="flex items-center gap-2 text-sm">
                      <input
                        type="checkbox"
                        name="events"
                        value={event}
                        defaultChecked
                        className="rounded border-black"
                      />
                      {event}
                    </label>
                  ))}
                </div>
              </fieldset>
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

      {/* Delete confirm modal */}
      {confirmDelete && (
        <div
          className="fixed inset-0 bg-black/60 flex items-center justify-center z-50"
          role="dialog"
          aria-modal="true"
          onClick={(e) => {
            if (e.target === e.currentTarget) setConfirmDelete(null);
          }}
        >
          <div className="bg-white border-3 border-black rounded-xl p-6 w-full max-w-sm shadow-[6px_6px_0px_0px_rgba(0,0,0,1)]">
            <h3 className="text-lg font-black uppercase mb-2">
              Eliminar webhook
            </h3>
            <p className="text-sm mb-4">
              Esta acción no se puede deshacer. Se dejará de enviar notificaciones a esta URL.
            </p>
            <div className="flex gap-2 justify-end">
              <BrutalButton
                mode="ghost"
                size="chip"
                onClick={() => setConfirmDelete(null)}
                className="text-sm px-4 py-1.5"
              >
                Cancelar
              </BrutalButton>
              <fetcher.Form
                method="post"
                onSubmit={() => setConfirmDelete(null)}
              >
                <input type="hidden" name="intent" value="delete" />
                <input type="hidden" name="webhookId" value={confirmDelete} />
                <BrutalButton
                  mode="danger"
                  size="chip"
                  type="submit"
                  className="text-sm px-4 py-1.5"
                >
                  Eliminar
                </BrutalButton>
              </fetcher.Form>
            </div>
          </div>
        </div>
      )}

      {/* Show secret once */}
      {createdData && (
        <div className="mb-4 p-4 bg-lime border-2 border-black rounded-xl shadow-[4px_4px_0px_0px_rgba(0,0,0,1)]">
          <p className="text-sm font-bold mb-2">
            Webhook creado! Copia el secret ahora — no lo verás de nuevo:
          </p>
          <code className="block bg-white p-3 rounded-lg text-sm font-mono break-all border-2 border-black">
            {createdData.secret}
          </code>
        </div>
      )}

      {/* Error display */}
      {fetcher.data && "error" in fetcher.data && (
        <div className="mb-4 p-3 bg-brand-red/10 border-2 border-brand-red rounded-xl text-sm font-bold text-brand-red">
          {(fetcher.data as { error: string }).error}
        </div>
      )}

      {/* Webhooks table */}
      <div className="border-2 border-black rounded-xl overflow-hidden shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] bg-white">
        <table className="w-full text-sm">
          <thead className="bg-black text-white">
            <tr>
              <th scope="col" className="text-left px-4 py-3 font-bold text-xs uppercase tracking-wider">URL</th>
              <th scope="col" className="text-left px-4 py-3 font-bold text-xs uppercase tracking-wider">Events</th>
              <th scope="col" className="text-left px-4 py-3 font-bold text-xs uppercase tracking-wider">Status</th>
              <th scope="col" className="text-left px-4 py-3 font-bold text-xs uppercase tracking-wider hidden md:table-cell">Last Error</th>
              <th scope="col" className="text-left px-4 py-3 font-bold text-xs uppercase tracking-wider hidden md:table-cell">Created</th>
              <th scope="col" className="px-4 py-3"></th>
            </tr>
          </thead>
          <tbody>
            {webhooks.map((wh) => (
              <tr
                key={wh.id}
                className="border-t-2 border-black hover:bg-brand-100 transition-colors"
              >
                <td className="px-4 py-3 font-mono text-xs max-w-[200px] truncate" title={wh.url}>
                  {wh.url}
                </td>
                <td className="px-4 py-3">
                  <div className="flex gap-1 flex-wrap">
                    {wh.events.map((e) => (
                      <span
                        key={e}
                        className="bg-brand-aqua text-xs font-bold px-2 py-0.5 rounded-md border border-black"
                      >
                        {e.replace("file.", "f.").replace("website.", "w.")}
                      </span>
                    ))}
                  </div>
                </td>
                <td className="px-4 py-3">
                  <StatusToggle webhook={wh} />
                </td>
                <td className="px-4 py-3 text-xs text-gray-500 max-w-[150px] truncate hidden md:table-cell" title={wh.lastError || ""}>
                  {wh.lastError || "—"}
                </td>
                <td className="px-4 py-3 font-mono text-xs hidden md:table-cell">
                  {new Date(wh.createdAt).toLocaleDateString()}
                </td>
                <td className="px-4 py-3">
                  <BrutalButton
                    mode="danger"
                    size="chip"
                    onClick={() => setConfirmDelete(wh.id)}
                  >
                    Delete
                  </BrutalButton>
                </td>
              </tr>
            ))}
            {webhooks.length === 0 && (
              <tr>
                <td
                  colSpan={6}
                  className="px-4 py-12 text-center font-bold text-gray-400 uppercase tracking-wider"
                >
                  No webhooks yet
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function StatusToggle({
  webhook,
}: {
  webhook: { id: string; status: string; failCount: number };
}) {
  const fetcher = useFetcher();
  const isActive =
    fetcher.formData?.get("status")
      ? fetcher.formData.get("status") === "ACTIVE"
      : webhook.status === "ACTIVE";
  const isFailed = webhook.status === "FAILED";

  return (
    <fetcher.Form method="post" className="flex items-center gap-2">
      <input type="hidden" name="intent" value="toggle" />
      <input type="hidden" name="webhookId" value={webhook.id} />
      <input
        type="hidden"
        name="status"
        value={isActive ? "PAUSED" : "ACTIVE"}
      />
      <button
        type="submit"
        className={`relative inline-flex h-6 w-11 items-center rounded-full border-2 border-black transition-colors ${
          isActive ? "bg-lime" : isFailed ? "bg-brand-red" : "bg-gray-300"
        }`}
        title={isFailed ? `Failed (${webhook.failCount} errors)` : isActive ? "Active" : "Paused"}
      >
        <span
          className={`inline-block h-4 w-4 rounded-full bg-white border border-black transition-transform ${
            isActive ? "translate-x-5" : "translate-x-1"
          }`}
        />
      </button>
      <span className="text-xs font-bold">
        {isFailed ? "FAILED" : isActive ? "ACTIVE" : "PAUSED"}
      </span>
    </fetcher.Form>
  );
}
