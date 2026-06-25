import { data, Form, redirect, useActionData, useLoaderData } from "react-router";
import type { Route } from "./+types/cuentas";
import { getRealUserOrNull, isAdminUser } from "~/.server/getters";
import { commitSession, getSession } from "~/.server/sessions";
import {
  addClientAccount,
  canImpersonate,
  listClients,
  removeClientAccount,
} from "~/.server/delegation";
import { db } from "~/.server/db";
import logger from "~/.server/logger";

export const loader = async ({ request }: Route.LoaderArgs) => {
  const operator = await getRealUserOrNull(request);
  if (!operator) throw redirect("/login?next=/dash/cuentas");
  const admin = isAdminUser(operator);
  const clients = await listClients(operator.id);
  // Operators only: admins (can self-add) or anyone with a roster (client-granted).
  if (!admin && clients.length === 0) throw redirect("/dash");
  return { admin, clients };
};

export const action = async ({ request }: Route.ActionArgs) => {
  const operator = await getRealUserOrNull(request);
  if (!operator) throw redirect("/login?next=/dash/cuentas");
  const form = await request.formData();
  const intent = String(form.get("intent") || "");
  const session = await getSession(request.headers.get("Cookie"));

  // Start impersonation — re-verify authorization (roster membership).
  if (intent === "set") {
    const email = String(form.get("email") || "").trim().toLowerCase();
    const target = await db.user.findUnique({
      where: { email },
      select: { id: true, email: true },
    });
    if (!target || !(await canImpersonate(operator.id, target.id))) {
      return data({ error: "No autorizado para operar esa cuenta." }, { status: 403 });
    }
    session.set("actAsEmail", target.email);
    logger.info(
      `[impersonation] start operator=${operator.id} (${operator.email}) target=${target.id} (${target.email})`
    );
    throw redirect("/dash", {
      headers: { "set-cookie": await commitSession(session) },
    });
  }

  // Stop impersonation — always allowed (the operator's own session).
  if (intent === "clear") {
    const was = session.get("actAsEmail");
    session.unset("actAsEmail");
    logger.info(
      `[impersonation] stop operator=${operator.id} (${operator.email}) was=${was ?? "—"}`
    );
    throw redirect("/dash/cuentas", {
      headers: { "set-cookie": await commitSession(session) },
    });
  }

  // add/remove roster — admin only (self-granting access without client action).
  if (!isAdminUser(operator)) {
    return data({ error: "Solo administradores pueden gestionar cuentas." }, { status: 403 });
  }
  const email = String(form.get("email") || "").trim().toLowerCase();
  if (!email) return data({ error: "Email requerido." }, { status: 400 });
  try {
    if (intent === "add") await addClientAccount(operator.id, email);
    else if (intent === "remove") await removeClientAccount(operator.id, email);
  } catch (e) {
    const msg =
      e instanceof Response ? ((await e.json()) as { message?: string }).message : null;
    return data({ error: msg || "No se pudo completar la acción." }, { status: 400 });
  }
  return redirect("/dash/cuentas");
};

export default function Cuentas() {
  const { admin, clients } = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();

  return (
    <article className="ml-0 md:ml-20 p-6 w-full max-w-3xl">
      <header className="mb-6">
        <h1 className="text-2xl font-bold">Cuentas de clientes</h1>
        <p className="text-gray-500 text-sm mt-1">
          Opera la cuenta de un cliente como si fueras él. Mientras operas verás un
          banner arriba para salir.
        </p>
      </header>

      {actionData?.error && (
        <p className="mb-4 border-2 border-black rounded-xl bg-red-100 px-3 py-2 text-sm">
          {actionData.error}
        </p>
      )}

      {admin && (
        <Form method="post" className="flex gap-2 mb-6 max-w-md">
          <input type="hidden" name="intent" value="add" />
          <input
            name="email"
            type="email"
            required
            placeholder="email@cliente.com"
            className="flex-1 border-2 border-black rounded-xl px-3 py-2"
          />
          <button className="border-2 border-black rounded-xl px-4 py-2 bg-brand-500 text-white font-medium hover:opacity-90">
            Agregar
          </button>
        </Form>
      )}

      <div className="grid gap-2">
        {clients.length === 0 && (
          <p className="text-gray-400 text-sm">Aún no administras ninguna cuenta.</p>
        )}
        {clients.map((c) => (
          <div
            key={c.id}
            className="border-2 border-black rounded-xl p-3 flex items-center justify-between gap-2"
          >
            <div className="min-w-0">
              <p className="font-medium truncate">{c.displayName || c.email}</p>
              <p className="text-xs text-gray-500 truncate">{c.email}</p>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <Form method="post">
                <input type="hidden" name="intent" value="set" />
                <input type="hidden" name="email" value={c.email ?? ""} />
                <button className="border-2 border-black rounded-xl px-3 py-1.5 bg-black text-white text-sm font-medium hover:opacity-80">
                  Operar como
                </button>
              </Form>
              {admin && (
                <Form
                  method="post"
                  onSubmit={(e) => {
                    if (!confirm("¿Quitar esta cuenta de tu lista?")) e.preventDefault();
                  }}
                >
                  <input type="hidden" name="intent" value="remove" />
                  <input type="hidden" name="email" value={c.email ?? ""} />
                  <button className="border-2 border-black rounded-xl px-3 py-1.5 text-sm hover:bg-gray-100">
                    Quitar
                  </button>
                </Form>
              )}
            </div>
          </div>
        ))}
      </div>
    </article>
  );
}
