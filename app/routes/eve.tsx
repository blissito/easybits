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
      "Corre tus agentes eve en microVMs Firecracker con @easybits.cloud/eve-sandbox: el contrato SandboxBackend completo — prewarm, sesiones durables, política de red por caja — en MXN y con plan gratuito.",
    url: "https://www.easybits.cloud/eve",
  }),
  { tagName: "link", rel: "canonical", href: "https://www.easybits.cloud/eve" },
];

const JSON_LD = productJsonLd({
  name: "EasyBits para eve",
  description:
    "SandboxBackend nativo para eve (Vercel): cada sesión de agente en su propia microVM Firecracker, con snapshot, suspend/resume y egress por caja.",
  path: "/eve",
});

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
          kicker: "eve (Vercel) · @easybits.cloud/eve-sandbox",
          title: "Tus agentes eve",
          highlight: "en microVMs de verdad",
          subtitle:
            "Un SandboxBackend nativo para eve: 100 % del contrato, sin tocar tu agente. Cambias una línea en agent/sandbox.ts y cada sesión corre en su propia máquina Firecracker, en tu cuenta, en MXN.",
          proof:
            "Snapshot de prewarm reusado en 0.2 s · fork por sesión ~7 s · resume ~1 s · Node 24 · npm i @easybits.cloud/eve-sandbox",
          bentos: [
            {
              title: "prewarm() se vuelve un snapshot copy-on-write",
              body: "eve corre tu bootstrap y tus seed files una vez; nosotros lo congelamos como imagen con nombre. Cada build siguiente lo reusa en vez de reconstruirlo.",
              bullets: [
                "Snapshot eve:<templateKey>:<hash>, idempotente por build",
                "Reuso medido en 0.2 s; captura fresca en ~11 s",
                "Los seeds ($HOME/.agents/skills/…) se resuelven dentro de la caja",
                "Sin template (templateKey null): caja fresca del template base",
              ],
              image: "/blog/assets/blog-eve-easybits-cover.png",
            },
            {
              title: "Sesiones durables: fork, siesta y reattach",
              body: "create() es un fork del snapshot. Entre turnos la caja duerme con snapshot de la VM y despierta en un segundo; eve la reabre por sandboxId con el disco intacto.",
              bullets: [
                "stop() / shutdown() = suspend; delete() = destroy",
                "run() y spawn() con streams reales y kill() al grupo de procesos",
                "Archivos: texto, binario, rangos de líneas; rutas ancladas en /workspace",
                "El estado durable de eve sigue en tu server; la caja sólo ejecuta",
              ],
              image: "/blog/assets/blog-eve-easybits-snapshot.png",
            },
            {
              title: "Política de red por caja y el servidor eve hospedado",
              body: "setNetworkPolicy sale a los dominios que tú autorices para esa caja, o a ninguno. Se cambia en caliente, se conserva al dormir, y lo que no está en la lista no sale. El servidor eve también cabe en una caja: template eve-nitro con /data persistente y URL pública.",
              bullets: [
                "allow-all · deny-all · allow-list por dominio (\"*.npmjs.org\")",
                "La misma política por REST, SDK y tools MCP",
                "eve-nitro: Node 24, pnpm, eve CLI, puerto 3000 expuesto con TLS",
                "Docs y skill easybits-eve para que tu agente lo configure solo",
              ],
              image: "/blog/assets/blog-eve-easybits-policy.png",
            },
          ],
          ctaLabel: "Leer el tutorial →",
          ctaTo: "/blog/agentes-eve-en-easybits",
          priceLine: (
            <>
              El plan gratuito incluye una caja: suficiente para correr tu primer agente
              eve. Los planes de pago suben las cajas concurrentes y el tiempo de vida.
              Para el servidor eve 24/7, eso es{" "}
              <a className="underline text-brand-500" href="/hosting">
                hosting
              </a>
              , desde $49/mes. English tutorial:{" "}
              <a className="underline text-brand-500" href="/blog/agentes-eve-en-easybits?lang=en">
                Run your eve agents on EasyBits
              </a>
              .
            </>
          ),
        }}
      />
    </>
  );
}
