import type { Route } from "./+types/flota";
import getBasicMetaTags from "~/utils/getBasicMetaTags";
import { ProductPage, productJsonLd } from "./product/ProductPage";
import { productLoader } from "./product/loader";
import { FLEET_BOX } from "~/lib/hostingCatalog";

export const loader = productLoader;

export const meta = () => [
  ...getBasicMetaTags({
    title: "Agentes en WhatsApp con flota elástica | EasyBits",
    description:
      "Un agente que atiende WhatsApp, tu web o tu app, con una caja aislada por conversación y capacidad que crece y se duerme sola. Multi-cliente desde el primer día.",
    url: "https://www.easybits.cloud/flota",
  }),
  { tagName: "link", rel: "canonical", href: "https://www.easybits.cloud/flota" },
];

const JSON_LD = productJsonLd({
  name: "EasyBits Flota",
  description:
    "Flota elástica de agentes multicanal: WhatsApp, widget web y API, con aislamiento por conversación y por cliente.",
  path: "/flota",
  priceMxn: FLEET_BOX.priceMxn,
});

export default function Flota({ loaderData }: Route.ComponentProps) {
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(JSON_LD) }}
      />
      <ProductPage
        user={loaderData.user}
        data={{
          kicker: "Flota",
          title: "Tu agente atiende",
          highlight: "WhatsApp",
          subtitle:
            "Una flota de agentes que responde en WhatsApp, en el chat de tu sitio o desde tu propia app — con una máquina aislada por conversación y capacidad que se duerme cuando nadie escribe.",
          proof: `Una caja corre ${FLEET_BOX.agents} agentes · \$${FLEET_BOX.priceMxn}/mes por caja · el mismo agente en varios canales`,
          bentos: [
            {
              title: "Un canal no es un producto distinto",
              body: "WhatsApp, el widget de tu web y tu API entran al mismo agente. Cambias de canal sin reescribir la lógica ni duplicar la configuración.",
              bullets: [
                "WhatsApp por número propio o compartido",
                "Widget web con respuesta en streaming",
                "Endpoint HTTP para meterlo en tu propia app",
                "Misma personalidad y mismas herramientas en los tres",
              ],
              image: "https://i.imgur.com/hn9dN49.png",
            },
            {
              title: "Aislamiento por cliente, de verdad",
              body: "Si vendes tu agente a varios clientes, cada uno necesita sus datos y sus credenciales separadas. Aquí eso no es una convención: es la arquitectura.",
              bullets: [
                "Credenciales por cliente, aplicadas turno por turno",
                "Cada conversación vive en su propia caja",
                "Conectores distintos por grupo o por cuenta",
                "Tokens con alcance: dar acceso no es dar el control",
              ],
              image: "https://i.imgur.com/lEOVfUp.png",
            },
            {
              title: "Crece y se encoge sola",
              body: "Las conversaciones ociosas se duermen y liberan capacidad; cuando alguien vuelve a escribir, despiertan. No pagas por el silencio.",
              bullets: [
                "Suspensión automática de las cajas ociosas",
                "Cola con reintento en vez de rechazar al usuario",
                "Trae tu llave de modelo, o usa la nuestra en pesos",
                "Panel para ver en vivo qué caja está atendiendo",
              ],
              image: "https://i.imgur.com/JjN1Q0l.png",
            },
          ],
          priceLine: (
            <>
              <strong>${FLEET_BOX.priceMxn}/mes</strong> por caja, y cada caja corre{" "}
              {FLEET_BOX.agents} agentes. La capacidad crece en cajas iguales: eliges
              cuántas, no qué tamaño.
            </>
          ),
        }}
      />
    </>
  );
}
