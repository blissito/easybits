import type { Route } from "./+types/sandboxes";
import getBasicMetaTags from "~/utils/getBasicMetaTags";
import { ProductPage, productJsonLd } from "./product/ProductPage";
import { productLoader } from "./product/loader";

export const loader = productLoader;

export const meta = () => [
  ...getBasicMetaTags({
    title: "Sandboxes para agentes — microVMs Firecracker | EasyBits",
    description:
      "Una máquina aislada por agente: root, internet y Bash en una microVM Firecracker. Duerme y despierta en menos de un segundo. Precios en MXN, con plan gratuito.",
    url: "https://www.easybits.cloud/sandboxes",
  }),
  { tagName: "link", rel: "canonical", href: "https://www.easybits.cloud/sandboxes" },
];

const JSON_LD = productJsonLd({
  name: "EasyBits Sandboxes",
  description:
    "MicroVMs Firecracker aisladas para agentes de IA: root, internet, snapshot y fork, con resume en menos de un segundo.",
  path: "/sandboxes",
});

export default function Sandboxes({ loaderData }: Route.ComponentProps) {
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(JSON_LD) }}
      />
      <ProductPage
        user={loaderData.user}
        data={{
          kicker: "Sandboxes",
          title: "Una máquina de verdad",
          highlight: "para cada agente",
          subtitle:
            "MicroVMs Firecracker aisladas. Tu agente la crea, ejecuta lo que necesite con root e internet, y la deja dormida; nosotros la despertamos cuando vuelva a hablar.",
          proof:
            "Resume medido en menos de 1 s · cold boot ~12 s · una caja incluida en el plan gratuito",
          bentos: [
            {
              title: "Aislamiento real, no un contenedor compartido",
              body: "Cada caja es una máquina virtual con su propio kernel. Lo que tu agente rompa dentro, se queda dentro.",
              bullets: [
                "Root, internet y Bash sin restricciones dentro de la caja",
                "Puertos expuestos con TLS, incluido WebSocket (wss://)",
                "Firewall de egress: el tráfico de salida está acotado",
                "Una caja por agente, o una por cliente de tu app",
              ],
              image: "https://i.imgur.com/lEOVfUp.png",
            },
            {
              title: "Duerme cuando no la usas, despierta en menos de un segundo",
              body: "Un sandbox ocioso no debería costarte lo mismo que uno trabajando. Lo suspendemos con snapshot y lo devolvemos caliente.",
              bullets: [
                "Suspend y resume por snapshot de la VM completa",
                "Cold boot de ~12 s cuando hay que arrancar de cero",
                "El estado del disco sobrevive al sueño",
                "Sin cobrarte el tiempo dormido",
              ],
              image: "https://i.imgur.com/JjN1Q0l.png",
            },
            {
              title: "Snapshot y fork: una caja lista, muchas copias",
              body: "Congela una caja ya configurada como imagen con nombre y lanza hijas en paralelo, cada una con su propia IP.",
              bullets: [
                "Copy-on-write: las hijas no duplican el disco",
                "Útil para probar N variantes del mismo estado",
                "Cada hija es un sandbox independiente",
                "Desde el SDK, la REST API o las tools MCP",
              ],
              image: "https://i.imgur.com/R8qvNsB.png",
            },
          ],
          priceLine: (
            <>
              El plan gratuito incluye una caja. Los planes de pago suben las cajas
              concurrentes y el tiempo de vida. Si la necesitas permanente, eso es{" "}
              <a className="underline text-brand-500" href="/hosting">
                hosting
              </a>
              , y empieza en $49/mes.
            </>
          ),
        }}
      />
    </>
  );
}
