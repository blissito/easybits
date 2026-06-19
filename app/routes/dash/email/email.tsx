import { useFetcher, useLoaderData } from "react-router";
import { getUserOrRedirect } from "~/.server/getters";
import type { AuthContext } from "~/.server/apiAuth";
import { addContact, listContacts } from "~/.server/core/contactOperations";
import {
  createBroadcast,
  sendBroadcast,
  listBroadcasts,
} from "~/.server/core/broadcastOperations";
import type { Route } from "./+types/email";

export const loader = async ({ request }: Route.LoaderArgs) => {
  const user = await getUserOrRedirect(request);
  const ctx = { user, scopes: ["ADMIN"] } as AuthContext;
  const [contacts, broadcasts] = await Promise.all([
    listContacts(ctx, { limit: 100 }),
    listBroadcasts(ctx),
  ]);
  return { contacts, broadcasts };
};

export const action = async ({ request }: Route.ActionArgs) => {
  const user = await getUserOrRedirect(request);
  const ctx = { user, scopes: ["ADMIN"] } as AuthContext;
  const form = await request.formData();
  const intent = form.get("intent");

  try {
    if (intent === "add-contact") {
      const email = String(form.get("email") || "").trim();
      const name = String(form.get("name") || "").trim() || undefined;
      const tags = String(form.get("tags") || "")
        .split(",")
        .map((t) => t.trim())
        .filter(Boolean);
      await addContact(ctx, { email, name, tags });
      return { ok: true };
    }
    if (intent === "create-broadcast") {
      const subject = String(form.get("subject") || "").trim();
      const html = String(form.get("html") || "").trim();
      const audienceTag = String(form.get("audienceTag") || "").trim() || undefined;
      if (!subject || !html) return { error: "Asunto y contenido son obligatorios" };
      await createBroadcast(ctx, { subject, html, audienceTag });
      return { ok: true };
    }
    if (intent === "send-broadcast") {
      const id = String(form.get("broadcastId") || "");
      const result = await sendBroadcast(ctx, id);
      return { ok: true, result };
    }
  } catch (e) {
    const msg = e instanceof Response ? (await e.json()).error : "Error inesperado";
    return { error: msg };
  }
  return null;
};

export default function EmailPage() {
  const { contacts, broadcasts } = useLoaderData<typeof loader>();
  const contactFetcher = useFetcher();
  const broadcastFetcher = useFetcher();
  const sendFetcher = useFetcher();

  return (
    <main className="p-6 max-w-5xl mx-auto">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-black uppercase tracking-tight">Correos</h1>
        <span className="text-xs font-bold px-3 py-1 bg-brand-aqua border-2 border-black rounded-lg">
          {contacts.length} contactos
        </span>
      </div>

      {/* Contactos */}
      <section className="mb-10">
        <h2 className="text-sm font-black uppercase tracking-tight mb-2">Audiencia</h2>
        <div className="border-2 border-black rounded-xl p-4 bg-white shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] mb-4">
          <contactFetcher.Form method="post" className="grid sm:grid-cols-4 gap-2 items-end">
            <input type="hidden" name="intent" value="add-contact" />
            <label className="text-xs font-bold uppercase tracking-wider sm:col-span-1">
              Email
              <input name="email" type="email" required placeholder="ana@correo.com"
                className="mt-1 w-full border-2 border-black rounded-lg px-3 py-2 text-sm" />
            </label>
            <label className="text-xs font-bold uppercase tracking-wider">
              Nombre
              <input name="name" className="mt-1 w-full border-2 border-black rounded-lg px-3 py-2 text-sm" />
            </label>
            <label className="text-xs font-bold uppercase tracking-wider">
              Tags (coma)
              <input name="tags" placeholder="clientes, vip"
                className="mt-1 w-full border-2 border-black rounded-lg px-3 py-2 text-sm" />
            </label>
            <button type="submit"
              className="bg-black text-white text-sm font-bold px-4 py-2 rounded-lg border-2 border-black h-[42px]">
              Agregar
            </button>
          </contactFetcher.Form>
        </div>

        <div className="border-2 border-black rounded-xl overflow-hidden bg-white">
          <table className="w-full text-sm">
            <thead className="bg-black text-white">
              <tr>
                <th className="text-left px-4 py-2 text-xs uppercase tracking-wider">Email</th>
                <th className="text-left px-4 py-2 text-xs uppercase tracking-wider">Nombre</th>
                <th className="text-left px-4 py-2 text-xs uppercase tracking-wider">Tags</th>
                <th className="text-left px-4 py-2 text-xs uppercase tracking-wider">Estado</th>
              </tr>
            </thead>
            <tbody>
              {contacts.length === 0 && (
                <tr className="border-t-2 border-black">
                  <td colSpan={4} className="px-4 py-6 text-center text-gray-500">
                    Aún no hay contactos.
                  </td>
                </tr>
              )}
              {contacts.map((c) => (
                <tr key={c.id} className="border-t-2 border-black hover:bg-brand-100">
                  <td className="px-4 py-2 font-bold">{c.email}</td>
                  <td className="px-4 py-2">{c.name || "—"}</td>
                  <td className="px-4 py-2 font-mono text-xs">{c.tags.join(", ") || "—"}</td>
                  <td className="px-4 py-2">
                    <span className={`text-xs font-bold px-2 py-1 rounded-md border-2 border-black ${c.status === "subscribed" ? "bg-lime" : "bg-white"}`}>
                      {c.status}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* Broadcasts */}
      <section>
        <h2 className="text-sm font-black uppercase tracking-tight mb-2">Newsletters</h2>
        <div className="border-2 border-black rounded-xl p-4 bg-white shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] mb-4">
          <broadcastFetcher.Form method="post" className="grid gap-2">
            <input type="hidden" name="intent" value="create-broadcast" />
            <div className="grid sm:grid-cols-2 gap-2">
              <label className="text-xs font-bold uppercase tracking-wider">
                Asunto
                <input name="subject" required
                  className="mt-1 w-full border-2 border-black rounded-lg px-3 py-2 text-sm" />
              </label>
              <label className="text-xs font-bold uppercase tracking-wider">
                Tag de audiencia (vacío = todos)
                <input name="audienceTag" placeholder="clientes"
                  className="mt-1 w-full border-2 border-black rounded-lg px-3 py-2 text-sm" />
              </label>
            </div>
            <label className="text-xs font-bold uppercase tracking-wider">
              Contenido (HTML)
              <textarea name="html" required rows={4} placeholder="<h1>Hola 👋</h1><p>Novedades…</p>"
                className="mt-1 w-full border-2 border-black rounded-lg px-3 py-2 text-sm font-mono" />
            </label>
            <button type="submit"
              className="bg-black text-white text-sm font-bold px-4 py-2 rounded-lg border-2 border-black w-fit">
              Crear borrador
            </button>
          </broadcastFetcher.Form>
        </div>

        <div className="border-2 border-black rounded-xl overflow-hidden bg-white">
          <table className="w-full text-sm">
            <thead className="bg-black text-white">
              <tr>
                <th className="text-left px-4 py-2 text-xs uppercase tracking-wider">Asunto</th>
                <th className="text-left px-4 py-2 text-xs uppercase tracking-wider">Audiencia</th>
                <th className="text-left px-4 py-2 text-xs uppercase tracking-wider">Estado</th>
                <th className="text-left px-4 py-2 text-xs uppercase tracking-wider">Enviados</th>
                <th className="text-left px-4 py-2 text-xs uppercase tracking-wider"></th>
              </tr>
            </thead>
            <tbody>
              {broadcasts.length === 0 && (
                <tr className="border-t-2 border-black">
                  <td colSpan={5} className="px-4 py-6 text-center text-gray-500">
                    Aún no hay newsletters.
                  </td>
                </tr>
              )}
              {broadcasts.map((b) => (
                <tr key={b.id} className="border-t-2 border-black hover:bg-brand-100">
                  <td className="px-4 py-2 font-bold">{b.subject}</td>
                  <td className="px-4 py-2 font-mono text-xs">{b.audienceTag || "todos"}</td>
                  <td className="px-4 py-2">
                    <span className={`text-xs font-bold px-2 py-1 rounded-md border-2 border-black ${b.status === "sent" ? "bg-lime" : "bg-white"}`}>
                      {b.status}
                    </span>
                  </td>
                  <td className="px-4 py-2 font-mono text-xs">
                    {b.sent}/{b.total}{b.failed ? ` (${b.failed} fallidos)` : ""}
                  </td>
                  <td className="px-4 py-2">
                    {b.status === "draft" && (
                      <sendFetcher.Form method="post">
                        <input type="hidden" name="intent" value="send-broadcast" />
                        <input type="hidden" name="broadcastId" value={b.id} />
                        <button type="submit"
                          className="bg-black text-white text-xs font-bold px-3 py-1 rounded-md border-2 border-black">
                          Enviar
                        </button>
                      </sendFetcher.Form>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </main>
  );
}
