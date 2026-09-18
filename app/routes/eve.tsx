import type { Route } from "./+types/eve";
import { useEffect, useState } from "react";
import { codeToHtml } from "shiki";
import getBasicMetaTags from "~/utils/getBasicMetaTags";
import { ProductPage, productJsonLd } from "./product/ProductPage";
import { productLoader } from "./product/loader";

// Página de pilar para la comunidad de eve (Vercel). Regla de la casa: los
// números son medidos (scripts/smoke.ts del paquete) o del catálogo; sin adjetivos.
export const loader = productLoader;

export const meta = () => [
  ...getBasicMetaTags({
    title: "eve (Vercel) en microVMs — backend nativo de sandboxes | EasyBits",
    description:
      "No muevas tu servidor eve (el framework de Vercel): con una línea en agent/sandbox.ts tus sesiones corren en máquinas virtuales de EasyBits, una por sesión, aislada, que duerme entre turnos y despierta en un segundo. Gratis para empezar; servidor hospedado desde Mega. En MXN.",
    url: "https://www.easybits.cloud/eve",
    image: "https://www.easybits.cloud/blog/assets/blog-eve-easybits-policy.png",
  }),
  { name: "keywords", content: "eve, Vercel eve, SandboxBackend, eve sandbox, agentes IA, microVM, Firecracker, EasyBits" },
  { tagName: "link", rel: "alternate", hrefLang: "es", href: "https://www.easybits.cloud/eve" },
  { tagName: "link", rel: "canonical", href: "https://www.easybits.cloud/eve" },
];

const JSON_LD = {
  ...productJsonLd({
    name: "EasyBits para eve (Vercel)",
    description:
      "Backend de sandboxes para eve, el framework de agentes de Vercel: tu servidor se queda donde está y cada sesión corre en su propia máquina virtual Firecracker, con imagen reusable, suspend/resume y política de red por caja. Gratis para empezar (una conversación a la vez); servidor eve hospedado en EasyBits desde $499 MXN/mes.",
    path: "/eve",
    priceMxn: 0,
  }),
  image: "https://www.easybits.cloud/blog/assets/blog-eve-easybits-cover.png",
  isRelatedTo: {
    "@type": "SoftwareApplication",
    name: "eve",
    url: "https://eve.dev",
    applicationCategory: "DeveloperApplication",
    // softwareRequirements es propiedad de SoftwareApplication, no de Product.
    softwareRequirements: "Node.js >= 24, npm package @easybits.cloud/eve-sandbox",
  },
};

// Bloque de código mínimo para los bentos: la landing debe enseñar la configuración
// real, no describirla. Sin dependencias de CodeMirror; el copy exacto vive en /docs.
function Snippet({ title, code }: { title: string; code: string }) {
  const src = code.trim();
  // Resaltado con shiki en el cliente (misma librería que el blog). Mientras
  // carga se muestra el texto plano para que el layout no brinque.
  const [html, setHtml] = useState("");
  useEffect(() => {
    let cancelled = false;
    codeToHtml(src, { lang: "ts", theme: "github-dark" })
      .then((r) => {
        if (!cancelled) setHtml(r);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [src]);
  const preClass = "px-3 py-3 text-xs md:text-sm font-mono leading-relaxed overflow-x-auto whitespace-pre";
  return (
    <div className="mt-4 rounded-xl border-2 border-black bg-[#0b0b0f] text-[#e8e8ee] shadow-[6px_6px_0_#000] overflow-hidden">
      <div className="px-3 py-1.5 text-xs font-mono text-[#fbbf24] border-b border-white/10">{title}</div>
      {html ? (
        <div
          className="[&_pre]:px-3 [&_pre]:py-3 [&_pre]:text-xs md:[&_pre]:text-sm [&_pre]:font-mono [&_pre]:leading-relaxed [&_pre]:overflow-x-auto [&_pre]:whitespace-pre [&_pre]:!bg-transparent [&_pre]:!m-0"
          dangerouslySetInnerHTML={{ __html: html }}
        />
      ) : (
        <pre className={preClass}>{src}</pre>
      )}
    </div>
  );
}

const SNIPPET_SANDBOX = `
// agent/sandbox.ts
import { defineSandbox } from "eve/sandbox";
import { easybits } from "@easybits.cloud/eve-sandbox";

export default defineSandbox({
  backend: easybits(),   // lee EASYBITS_API_KEY
  async bootstrap({ use }) {
    const s = await use();
    await s.run({ command: "npm ci" });
  },
});`;

const SNIPPET_WORLD = `
// agent/agent.ts
import { defineAgent } from "eve";
import { anthropic } from "@ai-sdk/anthropic";

export default defineAgent({
  model: anthropic("claude-sonnet-5"),
  experimental: { workflow: { world: "@easybits.cloud/eve-world" } },
});`;

const SNIPPET_POLICY = `
const sandbox = await ctx.getSandbox();
await sandbox.setNetworkPolicy({
  allow: { "api.github.com": [], "registry.npmjs.org": [] },
});`;

export default function Eve({ loaderData }: Route.ComponentProps) {
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(JSON_LD) }}
      />
      <ProductPage
        user={loaderData.user}
        data={{
          kicker: "Para agentes hechos con eve, el framework de Vercel",
          title: "Tus agentes eve",
          highlight: "en microVMs de verdad",
          subtitle: (
            <>
              No muevas tu servidor: eve deja que tú elijas dónde ejecuta código tu agente (
              <a className="underline" href="https://eve.dev/docs/sandbox" target="_blank" rel="noopener noreferrer">
                docs de eve: Sandbox
              </a>
              ). Una línea en <code>agent/sandbox.ts</code> y cada sesión corre en su propio sandbox
              en EasyBits, aislado, con root e internet, mientras tu servidor sigue en Vercel o en
              tu laptop. Gratis para empezar, en pesos mexicanos.
            </>
          ),
          proof:
            "Arranque de una sesión ~7 s · despertar ~1 s · el entorno preparado se reusa en cada build · npm i @easybits.cloud/eve-sandbox",
          bentos: [
            {
              title: "Una línea, y tu servidor no se mueve",
              body: (
                <>
                  Instala el paquete, cambia <code>agent/sandbox.ts</code> y sigue corriendo{" "}
                  <code>eve dev</code> o <code>eve start</code> donde ya lo hacías: Vercel o tu laptop. En el
                  primer arranque eve prepara lo que tu agente necesita (su{" "}
                  <a className="underline" href="https://eve.dev/docs/sandbox" target="_blank" rel="noopener noreferrer">
                    bootstrap
                  </a>
                  ) en un sandbox temporal y nosotros guardamos el resultado como imagen; los arranques
                  siguientes reusan la imagen en 0.2 s.
                  <Snippet title="npm i @easybits.cloud/eve-sandbox" code={SNIPPET_SANDBOX} />
                </>
              ),
              bullets: [
                "Gratis para empezar: una conversación a la vez, sesiones de 1 h",
                "Una imagen por versión de tu agente; primera captura ~11 s, reuso medido en 0.2 s",
                "Los archivos que eve siembra (skills, configuración) ya vienen dentro",
                "Validado con eve 0.58.1 y 0.59.1",
              ],
              image: "/blog/assets/blog-eve-easybits-cover.png",
            },
            {
              title: "Cada sesión tiene su sandbox, y la conserva entre turnos",
              body: "Cuando alguien le habla a tu agente, EasyBits levanta una copia de esa imagen sólo para esa conversación. Entre un mensaje y el siguiente el sandbox duerme; al volver despierta en un segundo con todo como lo dejó.",
              bullets: [
                "Aislamiento real: lo que rompa una sesión no toca a las demás",
                "Duerme y despierta sin perder archivos ni procesos instalados",
                "Comandos con salida en vivo; puedes matar un proceso y todo lo que abrió",
                "Cuando la sesión termina, eve la borra y dejas de pagar",
              ],
              image: "/blog/assets/blog-eve-easybits-snapshot.png",
            },
            {
              title: "El run sobrevive al sandbox (servidor hospedado, Mega+)",
              body: (
                <>
                  Si además hospedas el servidor eve en un sandbox de EasyBits, con{" "}
                  <a className="underline" href="https://www.npmjs.com/package/@easybits.cloud/eve-world" target="_blank" rel="noopener noreferrer">
                    @easybits.cloud/eve-world
                  </a>{" "}
                  el estado de eve (runs, pasos, hooks, streams) vive en EasyBits DB en vez del disco del
                  servidor. Lo probamos en producción: matamos el sandbox a mitad de un run de 8 pasos y otra
                  sandbox lo retomó en el paso 3, sin repetir los anteriores, 59 segundos después.
                  <Snippet title="npm i @easybits.cloud/eve-world" code={SNIPPET_WORLD} />
                </>
              ),
              bullets: [
                "Una línea en agent.ts: experimental.workflow.world",
                "Sin token: el sandbox eve-nitro nace con EASYBITS_DB_URL en su entorno (sólo desde dentro de EasyBits)",
                "Port del world oficial de Postgres a libSQL, misma línea de versiones que eve",
                "Sin EasyBits sigue funcionando: apunta a cualquier libSQL o cae al disco local",
              ],
              image: "/blog/assets/blog-eve-easybits-snapshot.png",
            },
            {
              title: "Tú decides a qué se conecta cada sandbox",
              body: (
                <>
                  Desde tu código de eve puedes limitar la salida a internet de una sesión: sólo a los dominios
                  que autorices, o a ninguno. Se cambia en caliente, se conserva al dormir, y lo que no está en la
                  lista simplemente no sale.
                  <Snippet title="dentro de una tool o callback de eve" code={SNIPPET_POLICY} />
                </>
              ),
              bullets: [
                "Todo abierto, todo cerrado, o una lista de dominios exactos",
                "La misma regla se puede poner desde la API, el SDK o las tools MCP",
                "El servidor eve también puede vivir en un sandbox de EasyBits, con URL pública",
                "Tu propio agente puede configurarlo con la skill easybits-eve",
              ],
              image: "/blog/assets/blog-eve-easybits-policy.png",
            },
          ],
          youtubeId: "IuQ6laQmjR0",
          ctaLabel: "Leer el tutorial →",
          ctaTo: "/blog/agentes-eve-en-easybits",
          priceLine: (
            <>
              <strong>Gratis</strong> para empezar: tu servidor eve se queda donde está y las sesiones
              corren en EasyBits, una a la vez. <strong>Servidor hospedado + estado durable</strong>:
              desde $499 MXN/mes (Mega); puedes añadir sandboxes extra por $299 MXN/mes cada uno. Sólo el servidor encendido 24 h:{" "}
              <a className="underline text-brand-500" href="/hosting">
                hosting
              </a>{" "}
              desde $49 MXN/mes.
              <span className="block mt-6 text-base md:text-lg">
                Pregúntale a tu agente de código:
              </span>
              <code className="block mt-2 font-mono text-sm md:text-base bg-black text-white rounded-xl px-4 py-3 w-fit mx-auto">
                npx skills add https://easybits.cloud
              </code>
            </>
          ),
        }}
      />
    </>
  );
}
