import type { Route } from "./+types/web";
import getBasicMetaTags from "~/utils/getBasicMetaTags";
import { ProductPage, productJsonLd } from "./product/ProductPage";
import { productLoader } from "./product/loader";
import { WEB_PACKS } from "~/lib/plans";

export const loader = productLoader;

// Los packs salen de plans.ts (misma fuente que el checkout), no de la prosa.
const ENTRY = WEB_PACKS.reduce((a, b) => (a.price <= b.price ? a : b));

export const meta = () => [
  ...getBasicMetaTags({
    title: "Búsqueda y scraping para agentes — internet que no bloquea | EasyBits",
    description:
      "Tu agente busca en Google y Bing desde 195 países, lee páginas que bloquean bots y extrae registros con esquema de Maps, Mercado Libre, Amazon y miles de fuentes. Se cobra por consulta, en MXN.",
    url: "https://www.easybits.cloud/web",
  }),
  { tagName: "link", rel: "canonical", href: "https://www.easybits.cloud/web" },
];

const JSON_LD = productJsonLd({
  name: "EasyBits Web",
  description:
    "Búsqueda en buscadores, lectura de páginas protegidas y extracción estructurada para agentes de IA. Cobrado por consulta en MXN.",
  path: "/web",
  priceMxn: ENTRY.price,
});

export default function Web({ loaderData }: Route.ComponentProps) {
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(JSON_LD) }}
      />
      <ProductPage
        user={loaderData.user}
        data={{
          kicker: "Web",
          title: "Internet que",
          highlight: "no te bloquea",
          subtitle:
            "Un agente sin internet es un agente adivinando. El tuyo busca, lee y extrae de la web real — la que le cierra la puerta a un scraper normal.",
          proof: `Buscadores desde 195 países · miles de fuentes con esquema · desde \$${ENTRY.price} por ${ENTRY.queries} consultas`,
          bentos: [
            {
              title: "Buscar como si fueras de allá",
              body: "Resultados de Google y Bing en JSON estructurado, desde el país que le pidas. Lo que ve un usuario en Madrid no es lo que ve uno en Monterrey, y eso a veces es justo el dato.",
              bullets: [
                "Resultados en JSON, listos para el modelo",
                "195 países y regiones a elegir",
                "Red residencial y de datacenter",
                "Sin captchas que resolver de tu lado",
              ],
              image: "https://i.imgur.com/R8qvNsB.png",
            },
            {
              title: "Leer páginas que bloquean bots",
              body: "La página que te devuelve un 403 o un muro de Cloudflare llega aquí como HTML limpio o como markdown listo para meter al contexto.",
              bullets: [
                "HTML limpio o markdown para LLM",
                "Sitios con protección anti-bot incluidos",
                "Rastreo de un sitio completo cuando hace falta",
                "Sin mantener proxies ni navegadores tú",
              ],
              image: "https://i.imgur.com/lEOVfUp.png",
            },
            {
              title: "Extraer registros, no texto suelto",
              body: "Para las fuentes que importan hay extracción con esquema: te devuelve campos, no un muro de letras que el modelo tiene que adivinar.",
              bullets: [
                "Maps, Mercado Libre, Amazon, Instagram y miles más",
                "Campos tipados, listos para tu base de datos",
                "Trabajos grandes en asíncrono, con estado consultable",
                "La misma tool desde MCP, SDK o REST",
              ],
              image: "https://i.imgur.com/JjN1Q0l.png",
            },
          ],
          priceLine: (
            <>
              Se cobra por consulta, con packs que no caducan:{" "}
              {WEB_PACKS.map((p, i) => (
                <span key={p.id}>
                  {i > 0 && " · "}
                  <strong>
                    ${p.price} por {p.queries.toLocaleString("es-MX")} consultas
                  </strong>
                </span>
              ))}
              .
            </>
          ),
        }}
      />
    </>
  );
}
