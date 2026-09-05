import type { Route } from "./+types/hosting";
import getBasicMetaTags from "~/utils/getBasicMetaTags";
import { ProductPage, productJsonLd } from "./product/ProductPage";
import { productLoader } from "./product/loader";
import { HOSTING_CATALOG, SELLABLE_TIERS } from "~/lib/hostingCatalog";

export const loader = productLoader;

// El precio de entrada sale del catálogo, no de la prosa: si mañana cambia el
// tier más barato, esta página cambia sola.
const CHEAPEST = Math.min(
  ...SELLABLE_TIERS.map((k) => HOSTING_CATALOG[k].priceShared)
);

export const meta = () => [
  ...getBasicMetaTags({
    title: `Hosting de apps desde \$${CHEAPEST}/mes en MXN | EasyBits`,
    description:
      "De un repositorio a una URL pública con TLS en una sola llamada. Dominio propio, respaldos diarios y rollback. Sin plan de pago: la máquina es su propia suscripción.",
    url: "https://www.easybits.cloud/hosting",
  }),
  { tagName: "link", rel: "canonical", href: "https://www.easybits.cloud/hosting" },
];

const JSON_LD = productJsonLd({
  name: "EasyBits Hosting",
  description:
    "Hosting de aplicaciones en microVMs dedicadas: deploy desde repositorio con TLS, dominio propio, rollback y respaldos diarios. Precios en MXN.",
  path: "/hosting",
  priceMxn: CHEAPEST,
});

export default function Hosting({ loaderData }: Route.ComponentProps) {
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(JSON_LD) }}
      />
      <ProductPage
        user={loaderData.user}
        data={{
          kicker: "Hosting",
          title: "De un repo a una URL",
          highlight: "en una llamada",
          subtitle:
            "Tu app corre en su propia máquina, con TLS y dominio propio. Tu agente puede desplegarla igual que lo harías tú — porque usa la misma API.",
          proof: `Deploy medido en ~12 s · recuperación total tras pérdida en 11.9 s · desde \$${CHEAPEST}/mes`,
          ctaLabel: "Ver máquinas →",
          ctaTo: "/planes",
          bentos: [
            {
              title: "Una llamada hace todo el camino",
              body: "Provisionar la caja, traer el código, construirlo dentro, publicar la URL y dejar el release guardado. No hay pasos sueltos que se te olviden.",
              bullets: [
                "Desde un repositorio, un archivo o una caja que ya tenías",
                "TLS y subdominio público automáticos",
                "Dominio propio cuando lo quieras",
                "El build corre DENTRO de la caja, en Linux, no en tu Mac",
              ],
              image: "https://i.imgur.com/JjN1Q0l.png",
            },
            {
              title: "Se reconstruye sola",
              body: "Cada despliegue deja un release: el código, sus dependencias y cómo arrancarlo. Si algo sale mal, vuelves atrás; si la máquina se pierde, se rehace.",
              bullets: [
                "Rollback a la versión anterior en la misma máquina",
                "Redeploy a una máquina limpia — así se cambia de tamaño",
                "Respaldos diarios de tus datos, siete días, incluidos",
                "Recuperación completa medida en 11.9 s",
              ],
              image: "https://i.imgur.com/R8qvNsB.png",
            },
            {
              title: "No necesitas plan de pago",
              body: "Cada máquina es su propia suscripción. Contratas una, la pagas, y ya está corriendo — sin obligarte a un plan superior para poder empezar.",
              bullets: [
                "Cobro por máquina, mensual, en pesos",
                "Puedes revenderla a tu propio cliente",
                "Disco extra como add-on cuando haga falta",
                "Cancelas cuando quieras",
              ],
              image: "https://i.imgur.com/hn9dN49.png",
            },
          ],
          priceLine: (
            <>
              Desde <strong>${CHEAPEST}/mes</strong> por máquina, en pesos, con{" "}
              {SELLABLE_TIERS.length} tamaños según lo que necesites correr.
            </>
          ),
        }}
      />
    </>
  );
}
