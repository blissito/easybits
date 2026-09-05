import type { Route } from "./+types/bases-de-datos";
import getBasicMetaTags from "~/utils/getBasicMetaTags";
import { ProductPage, productJsonLd } from "./product/ProductPage";
import { productLoader } from "./product/loader";

export const loader = productLoader;

export const meta = () => [
  ...getBasicMetaTags({
    title: "Bases de datos SQL para agentes | EasyBits",
    description:
      "Tu agente crea su propia base SQL y la consulta desde MCP, SDK o REST. Una base por cliente, con respaldo y restauración. Tres incluidas en el plan gratuito.",
    url: "https://www.easybits.cloud/bases-de-datos",
  }),
  { tagName: "link", rel: "canonical", href: "https://www.easybits.cloud/bases-de-datos" },
];

const JSON_LD = productJsonLd({
  name: "EasyBits Databases",
  description:
    "Bases de datos SQL (libSQL) creadas y consultadas por agentes de IA, aisladas por cliente, con backup y restore.",
  path: "/bases-de-datos",
});

export default function BasesDeDatos({ loaderData }: Route.ComponentProps) {
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(JSON_LD) }}
      />
      <ProductPage
        user={loaderData.user}
        data={{
          kicker: "Bases de datos",
          title: "Tu agente se crea",
          highlight: "su propia base",
          subtitle:
            "SQL de verdad, creada y consultada por el agente sin que tú provisiones nada. Una base por cliente si la necesitas, con respaldo y restauración.",
          proof:
            "SQL sobre libSQL · una base por cliente o por caja · tres incluidas en el plan gratuito",
          bentos: [
            {
              title: "La crea el agente, no tú",
              body: "Pedirle a un agente que guarde algo no debería obligarte a abrir una consola. Crea la base, define el esquema y escribe — con las mismas herramientas que ya usa.",
              bullets: [
                "Crear, consultar y ejecutar desde MCP, SDK o REST",
                "SQL estándar, sin dialecto propietario que aprender",
                "Sin provisionar servidores ni administrar conexiones",
                "Se apaga sola cuando nadie la usa",
              ],
              image: "https://i.imgur.com/JjN1Q0l.png",
            },
            {
              title: "Una base por cliente",
              body: "Si tu producto atiende a varias empresas, sus datos no deberían compartir tabla. Cada cliente puede tener la suya, separada de las demás.",
              bullets: [
                "Aislamiento por espacio de nombres",
                "Se transfiere junto con la cuenta al adoptarla",
                "Los límites por plan van de tres bases en adelante",
                "Combina con las cajas: una base por sandbox si hace falta",
              ],
              image: "https://i.imgur.com/R8qvNsB.png",
            },
            {
              title: "Respaldo y restauración",
              body: "Puedes sacar una copia y devolverla, incluso a otra cuenta. Los datos son tuyos y se pueden mover.",
              bullets: [
                "Backup bajo demanda",
                "Restore sobre la misma cuenta o sobre otra",
                "Sin exportadores a medida ni scripts propios",
                "El agente también puede dispararlo",
              ],
              image: "https://i.imgur.com/lEOVfUp.png",
            },
          ],
          priceLine: (
            <>
              Incluidas en el plan: <strong>tres</strong> en el gratuito, y más en los
              de pago. No se cobran aparte.
            </>
          ),
        }}
      />
    </>
  );
}
