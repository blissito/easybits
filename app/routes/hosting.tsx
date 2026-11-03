import type { Route } from "./+types/hosting";
import getBasicMetaTags from "~/utils/getBasicMetaTags";
import { ProductPage, productJsonLd } from "./product/ProductPage";
import { productLoader } from "./product/loader";

export const loader = productLoader;

// Hosting por cotización (desde 3-nov-2026): sin lista pública de precios. Se cotiza por
// proyecto y se entrega montado; el cliente lo paga en pesos desde su cuenta.
const QUOTE_URL = "mailto:soporte@easybits.cloud?subject=Cotizar%20hosting";

export const meta = () => [
  ...getBasicMetaTags({
    title: "Hosting gestionado para tu empresa, en pesos | EasyBits",
    description:
      "Montamos y operamos tus apps en máquinas dedicadas: deploy desde tu repo, TLS, dominio propio, respaldos diarios y rollback. Precio fijo en pesos, cotizado por proyecto.",
    url: "https://www.easybits.cloud/hosting",
  }),
  { tagName: "link", rel: "canonical", href: "https://www.easybits.cloud/hosting" },
];

const JSON_LD = productJsonLd({
  name: "EasyBits Hosting",
  description:
    "Hosting gestionado de aplicaciones en microVMs dedicadas: deploy desde repositorio con TLS, dominio propio, rollback y respaldos diarios. Cotizado por proyecto, en MXN.",
  path: "/hosting",
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
          title: "Conecta tu repo",
          highlight: "y ya está",
          subtitle:
            "Instalas la App de GitHub, eliges el repo y se despliega. Cada push a tu rama sale a producción solo; si el build falla, tu sitio sigue en la versión anterior.",
          proof: "Deploy medido en ~12 s · recuperación total tras pérdida en 11.9 s · precio fijo en pesos",
          ctaLabel: "Cotizar mi hosting →",
          ctaTo: QUOTE_URL,
          bentos: [
            {
              title: "Del push a producción",
              body: "Traer el código, construirlo, publicar la URL y dejar el release guardado. Sin tokens que pegar ni webhooks que configurar a mano.",
              bullets: [
                "Detecta cómo construir y arrancar tu proyecto",
                "Cada push a la rama se despliega solo",
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
              title: "Te lo entregamos montado",
              body: "Cotizamos tu proyecto, lo montamos y te lo entregamos funcionando. Activas tu cobro desde tu cuenta y las apps quedan a tu nombre; tu equipo sigue dándoles mantenimiento.",
              bullets: [
                "Un solo cobro mensual, fijo y en pesos",
                "Las apps quedan a tu nombre desde el primer pago",
                "Tu agencia o desarrollador sigue con acceso para operarlas",
                "Sin cobro por tráfico ni sorpresas",
              ],
              image: "https://i.imgur.com/hn9dN49.png",
            },
          ],
          priceLine: (
            <>
              Cotizado por proyecto, <strong>en pesos y con precio fijo</strong>. Escríbenos a
              soporte@easybits.cloud.
            </>
          ),
        }}
      />
    </>
  );
}
