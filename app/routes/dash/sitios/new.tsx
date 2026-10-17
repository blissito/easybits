import { useState } from "react";
import { Form, redirect, useNavigation, useActionData, useLoaderData, useSearchParams } from "react-router";
import { BrutalButton } from "~/components/common/BrutalButton";
import { PromptSuggestions } from "~/components/sitios/PromptSuggestions";
import { BrandLogo } from "~/components/sitios/BrandLogo";
import { getUserOrRedirect } from "~/.server/getters";
import type { AuthContext } from "~/.server/apiAuth";
import { createSite, engineChoicesFor, type SiteKind } from "~/.server/core/siteOperations";
import { DEFAULT_SITE_ENGINE } from "~/lib/fleetEngines";
import { HOSTING_CATALOG, sleepPrice, workBoxTierKey } from "~/lib/hostingCatalog";
import { SITE_STACKS, isSiteStack, type SiteStackId } from "~/lib/siteStacks";
import { SITE_TEMPLATES, isSiteTemplate, stackHasTemplates, templateFor, type SiteTemplateKey } from "~/lib/siteTemplates";
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
  const model = String(form.get("model") || "") || null;
  const stackRaw = form.get("stack");
  const stack = kind === "webapp" && isSiteStack(stackRaw) ? stackRaw : null;
  const templateRaw = form.get("template");
  const template = stackHasTemplates(stack) && isSiteTemplate(templateRaw) ? templateRaw : null;
  try {
    // Ya no hay "siempre prendida": toda web app nueva duerme sin visitas.
    const { site, checkoutUrl } = await createSite(ctx, { kind, name, engine, model, secretValue, sleep: true, stack, template });
    // El primer mensaje viaja por la URL y el editor lo manda solo al abrir.
    const q = new URLSearchParams();
    if (prompt) q.set("prompt", prompt);
    if (checkoutUrl) q.set("checkout", checkoutUrl);
    return redirect(`/dash/sitios/${site.id}${q.size ? `?${q}` : ""}`);
  } catch (e) {
    const raw = e instanceof Response ? await e.text().catch(() => e.statusText) : e instanceof Error ? e.message : "error";
    // Los errores del core llegan como {error, message}: se muestra el message, no el JSON.
    let message = raw;
    try { message = JSON.parse(raw).message ?? raw; } catch { /* texto plano */ }
    return { error: message };
  }
};

export default function NewSite() {
  const [searchParams] = useSearchParams();
  // ?kind=webapp llega desde /dash/hosting ("Crear app nueva").
  const [kind, setKind] = useState<SiteKind>(searchParams.get("kind") === "webapp" ? "webapp" : "static");
  const { engines } = useLoaderData<typeof loader>();
  // Claude (Opus 5.5, #1 de WebDev Arena) cuando ya tiene su llave; si no, el medido, que no pide nada.
  const [engineId, setEngineId] = useState(() =>
    engines.some((e) => e.id === "claude" && e.creatable && !e.needsSecret) ? "claude" : DEFAULT_SITE_ENGINE
  );
  const engine = engines.find((e) => e.id === engineId);
  const [modelId, setModelId] = useState<string | null>(null);
  // Al cambiar de motor, el elegido sólo vale si es de ese motor; si no, el default de sitios.
  const currentModel = engine?.models.some((m) => m.id === modelId) ? modelId : engine?.defaultModel ?? null;
  const nav = useNavigation();
  const result = useActionData<typeof action>();
  // ?prompt= llega del hero de la home (sin sesión → login → aquí, ya escrito).
  const [prompt, setPrompt] = useState(() => searchParams.get("prompt") ?? "");
  const [stack, setStack] = useState<SiteStackId | "node">("tanstack");
  // La caja de trabajo mide lo que pide el stack; al publicar se cobra ese tamaño.
  const work = HOSTING_CATALOG[workBoxTierKey(stack === "node" ? null : stack)];
  // Plantilla de la caja dorada: la que toca al prompt hasta que se elige otra ("none" = desde cero).
  const [templatePick, setTemplatePick] = useState<SiteTemplateKey | "none" | null>(null);
  const template = templatePick ?? templateFor(prompt);
  const withTemplates = kind === "webapp" && stack !== "node" && stackHasTemplates(stack);
  return (
    <article className="pt-20 px-4 sm:px-8 pb-24 md:pl-36 w-full max-w-2xl mx-auto">
      <h1 className="text-2xl sm:text-4xl font-black tracking-tight uppercase mb-6">Nuevo sitio</h1>
      <Form method="post" className="space-y-5">
        <div className="grid grid-cols-2 gap-3">
          {(
            [
              ["static", "Sitio estático", "Landing, portafolio, catálogo. Incluido en tu plan."],
              ["webapp", "Web app", `Con servidor y base de datos. Construirla es gratis; al publicar, su máquina cuesta $${sleepPrice(work)} MXN/mes, se duerme cuando nadie entra y despierta en menos de un segundo.`],
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
        {kind === "webapp" && (
          <div>
            <span className="text-sm font-bold">Stack</span>
            <div className="mt-1 grid grid-cols-2 sm:grid-cols-3 gap-2">
              {[
                ...SITE_STACKS.map((s) => [s.id, s.label, s.desc] as const),
                ["node", "Node libre", "Sin base: el agente elige el servidor (Express, Hono, Fastify)."] as const,
              ].map(([k, title, desc]) => (
                <button
                  key={k}
                  type="button"
                  onClick={() => setStack(k)}
                  className={`text-left p-3 rounded-xl border-2 transition-all ${stack === k ? "border-black bg-brand-500/10" : "border-gray-200 hover:border-gray-400"}`}
                >
                  <p className="font-bold text-sm flex items-center gap-2"><BrandLogo id={k} />{title}</p>
                  <p className="text-[11px] text-gray-500 mt-1">{desc}</p>
                </button>
              ))}
            </div>
            <input type="hidden" name="stack" value={stack} />
          </div>
        )}
        {withTemplates && (
          <div>
            <span className="text-sm font-bold">Empieza desde</span>
            <div className="mt-1 flex flex-wrap gap-2">
              {[...SITE_TEMPLATES.map((t) => [t.key, t.label] as const), ["none", "Desde cero"] as const].map(([k, label]) => (
                <button
                  key={k}
                  type="button"
                  onClick={() => setTemplatePick(k)}
                  className={`px-3 py-1.5 rounded-full border-2 text-xs font-semibold transition-all ${template === k ? "border-black bg-brand-500/10" : "border-gray-200 hover:border-gray-400"}`}
                >
                  {label}
                </button>
              ))}
            </div>
            {template !== "none" && <input type="hidden" name="template" value={template} />}
          </div>
        )}

        <label className="block">
          <span className="text-sm font-bold">Nombre</span>
          <input name="name" required placeholder="Estudio Orbe" className="mt-1 w-full px-4 py-2.5 border-2 border-black rounded-xl focus:outline-none" />
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
                <p className="font-bold text-sm flex items-center gap-2"><BrandLogo id={e.id} />{e.label}</p>
                <p className="text-[11px] text-gray-500 truncate">{e.model}</p>
                <p className="text-[10px] mt-1 font-semibold">
                  {!e.creatable ? "próximamente" : e.metered ? "tokens de tu cuenta" : e.needsSecret ? "pide tu llave" : "tu llave ✓"}
                </p>
              </button>
            ))}
          </div>
          <input type="hidden" name="engine" value={engineId} />
          {/* Modelo del motor elegido (default: el de sitios del motor). */}
          {engine && engine.models.length > 1 && (
            <div className="mt-3">
              <span className="text-sm font-bold">Modelo</span>
              <div className="mt-1 flex flex-wrap gap-2">
                {engine.models.map((m) => (
                  <button
                    key={m.id}
                    type="button"
                    onClick={() => setModelId(m.id)}
                    className={`px-3 py-1.5 rounded-full border-2 text-xs font-semibold transition-all ${currentModel === m.id ? "border-black bg-brand-500/10" : "border-gray-200 hover:border-gray-400"}`}
                  >
                    {m.label}
                  </button>
                ))}
              </div>
              <input type="hidden" name="model" value={currentModel ?? ""} />
            </div>
          )}
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
          <textarea
            name="prompt"
            rows={4}
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            placeholder="Un sitio para mi estudio de arquitectura con portafolio de proyectos, equipo y formulario de contacto…"
            className="mt-1 w-full px-4 py-2.5 border-2 border-black rounded-xl focus:outline-none"
          />
        </label>
        <PromptSuggestions kind={kind} value={prompt} onPick={setPrompt} />
        {result && "error" in result && <p className="text-sm text-red-600">{result.error}</p>}
        <BrutalButton type="submit" isDisabled={nav.state !== "idle"}>
          {nav.state !== "idle" ? "Creando…" : "Crear y empezar"}
        </BrutalButton>
      </Form>
    </article>
  );
}
