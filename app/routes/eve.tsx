import type { Route } from "./+types/eve";
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
      "Corre tus agentes eve (el framework de Vercel) en máquinas virtuales de EasyBits: una por sesión, aislada, que duerme entre turnos y despierta en un segundo. Cambias una línea en agent/sandbox.ts. En MXN, con plan gratuito.",
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
      "Backend de sandboxes para eve, el framework de agentes de Vercel: cada sesión corre en su propia máquina virtual Firecracker, con imagen reusable, suspend/resume y política de red por caja. Plan gratuito; servidor eve 24/7 desde $49 MXN/mes.",
    path: "/eve",
    priceMxn: 0,
  }),
  image: "https://www.easybits.cloud/blog/assets/blog-eve-easybits-cover.png",
  isRelatedTo: {
    "@type": "SoftwareApplication",
    name: "eve",
    url: "https://eve.dev",
    applicationCategory: "DeveloperApplication",
  },
  softwareRequirements: "Node.js >= 24, npm package @easybits.cloud/eve-sandbox",
};

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
              eve deja que tú elijas dónde ejecuta código tu agente (
              <a className="underline" href="https://eve.dev/docs/sandbox" target="_blank" rel="noopener noreferrer">
                docs de eve: Sandbox
              </a>
              ). Con una línea en <code>agent/sandbox.ts</code>, cada sesión corre en su propia máquina
              virtual en EasyBits: aislada, con root e internet, en tu cuenta y en pesos mexicanos.
            </>
          ),
          proof:
            "Arranque de una sesión ~7 s · despertar ~1 s · el entorno preparado se reusa en cada build · npm i @easybits.cloud/eve-sandbox",
          bentos: [
            {
              title: "El entorno se prepara una vez y se reusa siempre",
              body: (
                <>
                  Cuando corres <code>eve build</code>, eve instala lo que tu agente necesita (su{" "}
                  <a className="underline" href="https://eve.dev/docs/sandbox" target="_blank" rel="noopener noreferrer">
                    bootstrap
                  </a>
                  ). Nosotros guardamos ese resultado como una imagen lista. Los builds siguientes no vuelven a
                  instalar nada: reusan la imagen en 0.2 s.
                </>
              ),
              bullets: [
                "Una imagen por versión de tu agente; si no cambia, no se reconstruye",
                "Primera captura ~11 s; reuso medido en 0.2 s",
                "Los archivos que eve siembra (skills, configuración) ya vienen dentro",
                "Si tu agente no necesita preparación, arranca de una máquina limpia",
              ],
              image: "/blog/assets/blog-eve-easybits-cover.png",
            },
            {
              title: "Cada sesión tiene su máquina, y la conserva entre turnos",
              body: "Cuando alguien le habla a tu agente, EasyBits levanta una copia de esa imagen sólo para esa conversación. Entre un mensaje y el siguiente la máquina duerme; al volver despierta en un segundo con todo como lo dejó.",
              bullets: [
                "Aislamiento real: lo que rompa una sesión no toca a las demás",
                "Duerme y despierta sin perder archivos ni procesos instalados",
                "Comandos con salida en vivo; puedes matar un proceso y todo lo que abrió",
                "Cuando la sesión termina, eve la borra y dejas de pagar",
              ],
              image: "/blog/assets/blog-eve-easybits-snapshot.png",
            },
            {
              title: "Tú decides a qué se conecta cada máquina",
              body: "Desde tu código de eve puedes limitar la salida a internet de una sesión: sólo a los dominios que autorices, o a ninguno. Se cambia en caliente, se conserva al dormir, y lo que no está en la lista simplemente no sale.",
              bullets: [
                "Todo abierto, todo cerrado, o una lista de dominios exactos",
                "La misma regla se puede poner desde la API, el SDK o las tools MCP",
                "El servidor eve también puede vivir en una máquina de EasyBits, con URL pública",
                "Tu propio agente puede configurarlo con la skill easybits-eve",
              ],
              image: "/blog/assets/blog-eve-easybits-policy.png",
            },
          ],
          ctaLabel: "Leer el tutorial →",
          ctaTo: "/blog/agentes-eve-en-easybits",
          priceLine: (
            <>
              Gratis: una máquina, suficiente para tu primer agente. Con un plan de pago tu
              agente puede atender varias conversaciones a la vez, cada una en su máquina.
              Si además quieres el servidor eve encendido las 24 horas, eso es{" "}
              <a className="underline text-brand-500" href="/hosting">
                hosting
              </a>
              , desde $49 MXN/mes.
            </>
          ),
        }}
      />
    </>
  );
}
