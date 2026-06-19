import { useFetcher, useLoaderData } from "react-router";
import { getUserOrRedirect } from "~/.server/getters";
import { db } from "~/.server/db";
import type { Route } from "./+types/payments";

function maskToken(token: string): string {
  if (token.length <= 8) return "****";
  return "****" + token.slice(-4);
}

export const loader = async ({ request }: Route.LoaderArgs) => {
  const user = await getUserOrRedirect(request);
  const provider = await db.paymentProvider.findUnique({
    where: { userId_provider: { userId: user.id, provider: "MERCADOPAGO" } },
    select: { accessToken: true, createdAt: true },
  });
  const links = await db.paymentLink.findMany({
    where: { userId: user.id },
    orderBy: { createdAt: "desc" },
    take: 50,
  });
  return {
    connected: !!provider,
    maskedToken: provider ? maskToken(provider.accessToken) : null,
    links: links.map((l) => ({
      id: l.id,
      title: l.title,
      amount: l.amountCents / 100,
      currency: l.currency,
      status: l.status,
      initPoint: l.initPoint,
      createdAt: l.createdAt,
    })),
  };
};

export const action = async ({ request }: Route.ActionArgs) => {
  const user = await getUserOrRedirect(request);
  const form = await request.formData();
  const intent = form.get("intent");

  if (intent === "connect") {
    const accessToken = String(form.get("accessToken") || "").trim();
    const publicKey = String(form.get("publicKey") || "").trim() || undefined;
    const webhookSecret = String(form.get("webhookSecret") || "").trim() || undefined;
    if (!accessToken) {
      return { error: "El access token es obligatorio" };
    }
    await db.paymentProvider.upsert({
      where: { userId_provider: { userId: user.id, provider: "MERCADOPAGO" } },
      create: { userId: user.id, provider: "MERCADOPAGO", accessToken, publicKey, webhookSecret },
      update: { accessToken, publicKey, webhookSecret },
    });
    return { ok: true };
  }

  if (intent === "disconnect") {
    await db.paymentProvider
      .delete({ where: { userId_provider: { userId: user.id, provider: "MERCADOPAGO" } } })
      .catch(() => {});
    return { ok: true };
  }

  return null;
};

export default function PaymentsPage() {
  const { connected, maskedToken, links } = useLoaderData<typeof loader>();
  const fetcher = useFetcher();

  return (
    <div>
      <div className="flex justify-between items-center mb-4">
        <h2 className="text-lg font-black uppercase tracking-tight">Pagos · MercadoPago</h2>
        <span className="text-xs font-bold px-3 py-1 bg-brand-aqua border-2 border-black rounded-lg">
          {connected ? `Conectado ${maskedToken}` : "Sin conectar"}
        </span>
      </div>

      <div className="border-2 border-black rounded-xl p-5 bg-white shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] mb-6">
        <p className="text-sm mb-4">
          Conecta tu cuenta de MercadoPago para generar links de pago. El dinero
          va <strong>directo a tu cuenta</strong> — EasyBits no retiene fondos.
        </p>
        <fetcher.Form method="post" className="grid gap-3">
          <input type="hidden" name="intent" value="connect" />
          <label className="text-xs font-bold uppercase tracking-wider">
            Access token
            <input
              name="accessToken"
              type="password"
              required
              placeholder="APP_USR-..."
              className="mt-1 w-full border-2 border-black rounded-lg px-3 py-2 font-mono text-sm"
            />
          </label>
          <label className="text-xs font-bold uppercase tracking-wider">
            Public key (opcional)
            <input
              name="publicKey"
              className="mt-1 w-full border-2 border-black rounded-lg px-3 py-2 font-mono text-sm"
            />
          </label>
          <label className="text-xs font-bold uppercase tracking-wider">
            Webhook secret (opcional — hardening de firma)
            <input
              name="webhookSecret"
              type="password"
              className="mt-1 w-full border-2 border-black rounded-lg px-3 py-2 font-mono text-sm"
            />
          </label>
          <div className="flex gap-2">
            <button
              type="submit"
              className="bg-black text-white text-sm font-bold px-4 py-2 rounded-lg border-2 border-black"
            >
              {connected ? "Actualizar" : "Conectar"}
            </button>
            {connected && (
              <button
                type="submit"
                name="intent"
                value="disconnect"
                className="bg-white text-sm font-bold px-4 py-2 rounded-lg border-2 border-black"
              >
                Desconectar
              </button>
            )}
          </div>
        </fetcher.Form>
      </div>

      <h3 className="text-sm font-black uppercase tracking-tight mb-2">Links de pago</h3>
      <div className="border-2 border-black rounded-xl overflow-hidden shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] bg-white">
        <table className="w-full text-sm">
          <thead className="bg-black text-white">
            <tr>
              <th className="text-left px-4 py-3 font-bold text-xs uppercase tracking-wider">Título</th>
              <th className="text-left px-4 py-3 font-bold text-xs uppercase tracking-wider">Monto</th>
              <th className="text-left px-4 py-3 font-bold text-xs uppercase tracking-wider">Estado</th>
              <th className="text-left px-4 py-3 font-bold text-xs uppercase tracking-wider">Link</th>
            </tr>
          </thead>
          <tbody>
            {links.length === 0 && (
              <tr className="border-t-2 border-black">
                <td colSpan={4} className="px-4 py-6 text-center text-gray-500">
                  Aún no hay links. Genera uno con la tool <code>create_payment_link</code>.
                </td>
              </tr>
            )}
            {links.map((l) => (
              <tr key={l.id} className="border-t-2 border-black hover:bg-brand-100 transition-colors">
                <td className="px-4 py-3 font-bold">{l.title}</td>
                <td className="px-4 py-3 font-mono text-xs">
                  ${l.amount.toFixed(2)} {l.currency}
                </td>
                <td className="px-4 py-3">
                  <span className={`text-xs font-bold px-2 py-1 rounded-md border-2 border-black ${l.status === "paid" ? "bg-lime" : "bg-white"}`}>
                    {l.status === "paid" ? "PAGADO" : "PENDIENTE"}
                  </span>
                </td>
                <td className="px-4 py-3">
                  {l.initPoint ? (
                    <a href={l.initPoint} target="_blank" rel="noreferrer" className="underline font-medium text-xs">
                      Abrir
                    </a>
                  ) : (
                    "—"
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
