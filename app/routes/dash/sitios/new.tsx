import { useState } from "react";
import { Form, redirect, useNavigation, useActionData, useLoaderData } from "react-router";
import { BrutalButton } from "~/components/common/BrutalButton";
import { getUserOrRedirect } from "~/.server/getters";
import type { AuthContext } from "~/.server/apiAuth";
import { createSite, engineChoicesFor, DEFAULT_SITE_ENGINE, type SiteKind } from "~/.server/core/siteOperations";
import { HOSTING_CATALOG } from "~/lib/hostingCatalog";
import type { Route } from "./+types/new";

export const meta = () => [{ title: "Nuevo sitio — EasyBits" }, { name: "robots", content: "noindex" }];

export const loader = async ({ request }: Route.LoaderArgs) => {
  const user = await getUserOrRedirect(request);
  return { engines: await engineChoicesFor(user.id) };
};

export const action = async ({ request }: Route.ActionArgs) => {
  const user = await getUserOrRedirect(request);
  const ctx = { user, scopes: ["READ", "WRITE"] } as AuthContext;
  const form = await request.formData();
  const kind = (String(form.get("kind")) === "webapp" ? "webapp" : "static") as SiteKind;
  const name = String(form.get("name") || "").trim() || "Mi sitio";
  const prompt = String(form.get("prompt") || "").trim();
  const engine = String(form.get("engine") || DEFAULT_SITE_ENGINE);
  const secretValue = String(form.get("secretValue") || "");
  try {
    const { site, checkoutUrl } = await createSite(ctx, { kind, name, engine, secretValue });
    // El primer mensaje viaja por la URL y el editor lo manda solo al abrir.
    const q = new URLSearchParams();
    if (prompt) q.set("prompt", prompt);
    if (checkoutUrl) q.set("checkout", checkoutUrl);
    return redirect(`/dash/sitios/${site.id}${q.size ? `?${q}` : ""}`);
  } catch (e) {
    const message = e instanceof Response ? await e.text().catch(() => e.statusText) : e instanceof Error ? e.message : "error";
    return { error: message };
  }
};

export default function NewSite() {
  const [kind, setKind] = useState<SiteKind>("static");
  const { engines } = useLoaderData<typeof loader>();
  const [engineId, setEngineId] = useState(DEFAULT_SITE_ENGINE);
  const engine = engines.find((e) => e.id === engineId);
  const nav = useNavigation();
  const result = useActionData<typeof action>();
  const micro = HOSTING_CATALOG.micro;
  return (
    <article className="pt-20 px-4 sm:px-8 pb-24 md:pl-36 w-full max-w-2xl mx-auto">
      <h1 className="text-2xl sm:text-4xl font-black tracking-tight uppercase mb-6">Nuevo sitio</h1>
      <Form method="post" className="space-y-5">
        <div className="grid grid-cols-2 gap-3">
          {(
            [
              ["static", "Sitio estático", "Landing, portafolio, catálogo. Incluido en tu plan."],
              ["webapp", "Web app", `Con servidor y base de datos. Su propia máquina desde $${micro.priceShared} MXN/mes.`],
            ] as const
          ).map(([k, title, desc]) => (
            <button
              key={k}
              type="button"
              onClick={() => setKind(k)}
              className={`text-left p-4 rounded-2xl border-2 transition-all ${kind === k ? "border-black bg-brand-500/10 shadow-[4px_4px_0px_0px_rgba(0,0,0,1)]" : "border-gray-200 hover:border-gray-400"}`}
            >
              <p className="font-bold">{title}</p>
              <p className="text-xs text-gray-500 mt-1">{desc}</p>
            </button>
          ))}
        </div>
        <input type="hidden" name="kind" value={kind} />
        <label className="block">
          <span className="text-sm font-bold">Nombre</span>
          <input name="name" required placeholder="Tacos La Esquina" className="mt-1 w-full px-4 py-2.5 border-2 border-black rounded-xl focus:outline-none" />
        </label>
        {/* ¿Quién lo construye? Motores del registro de la flota. Medido = tokens de tu
            cuenta; BYOK = tu llave (se pide una vez y queda en tu vault). */}
        <div>
          <span className="text-sm font-bold">¿Quién lo construye?</span>
          <div className="mt-1 grid grid-cols-2 sm:grid-cols-3 gap-2">
            {engines.map((e) => (
              <button
                key={e.id}
                type="button"
                disabled={!e.creatable}
                onClick={() => setEngineId(e.id)}
                className={`text-left p-3 rounded-xl border-2 transition-all disabled:opacity-40 disabled:cursor-not-allowed ${engineId === e.id ? "border-black bg-brand-500/10" : "border-gray-200 hover:border-gray-400"}`}
              >
                <p className="font-bold text-sm">{e.label}</p>
                <p className="text-[11px] text-gray-500 truncate">{e.model}</p>
                <p className="text-[10px] mt-1 font-semibold">
                  {!e.creatable ? "próximamente" : e.metered ? "tokens de tu cuenta" : e.needsSecret ? "pide tu llave" : "tu llave ✓"}
                </p>
              </button>
            ))}
          </div>
          <input type="hidden" name="engine" value={engineId} />
          {engine?.needsSecret && engine.creatable && (
            <label className="block mt-3">
              <span className="text-sm font-bold">{engine.secretKind === "oauth" ? "Token OAuth" : "API key"} de {engine.label}</span>
              <input name="secretValue" type="password" required placeholder={engine.secretPlaceholder} autoComplete="off"
                className="mt-1 w-full px-4 py-2.5 border-2 border-black rounded-xl focus:outline-none font-mono text-sm" />
              <span className="text-[11px] text-gray-500">Se guarda cifrada en tu vault; no se vuelve a pedir.</span>
            </label>
          )}
        </div>
        <label className="block">
          <span className="text-sm font-bold">¿Qué quieres que construya?</span>
          <textarea name="prompt" rows={4} placeholder="Una landing para mi taquería con menú, horarios, mapa y botón de WhatsApp…" className="mt-1 w-full px-4 py-2.5 border-2 border-black rounded-xl focus:outline-none" />
        </label>
        {result && "error" in result && <p className="text-sm text-red-600">{result.error}</p>}
        <BrutalButton type="submit" isDisabled={nav.state !== "idle"}>
          {nav.state !== "idle" ? "Creando…" : "Crear y empezar"}
        </BrutalButton>
      </Form>
    </article>
  );
}
