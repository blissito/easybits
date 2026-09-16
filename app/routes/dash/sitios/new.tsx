import { useState } from "react";
import { Form, redirect, useNavigation, useActionData } from "react-router";
import { BrutalButton } from "~/components/common/BrutalButton";
import { getUserOrRedirect } from "~/.server/getters";
import type { AuthContext } from "~/.server/apiAuth";
import { createSite, type SiteKind } from "~/.server/core/siteOperations";
import { HOSTING_CATALOG } from "~/lib/hostingCatalog";
import type { Route } from "./+types/new";

export const meta = () => [{ title: "Nuevo sitio — EasyBits" }, { name: "robots", content: "noindex" }];

export const action = async ({ request }: Route.ActionArgs) => {
  const user = await getUserOrRedirect(request);
  const ctx = { user, scopes: ["READ", "WRITE"] } as AuthContext;
  const form = await request.formData();
  const kind = (String(form.get("kind")) === "webapp" ? "webapp" : "static") as SiteKind;
  const name = String(form.get("name") || "").trim() || "Mi sitio";
  const prompt = String(form.get("prompt") || "").trim();
  try {
    const { site, checkoutUrl } = await createSite(ctx, { kind, name });
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
