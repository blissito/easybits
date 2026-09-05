import { Link } from "react-router";
import type { ReactNode } from "react";
import { AuthNav } from "~/components/login/auth-nav";
import { Footer } from "~/components/common/Footer";
import { Bento } from "~/routes/home/Bento";
import { ItemList } from "~/routes/home/ItemList";
import { BrutalButton } from "~/components/common/BrutalButton";
import { TextBlurEffect } from "~/components/TextBlurEffect";
import { FloatingChat } from "~/components/ai/FloatingChat";
import type { User } from "@prisma/client";

/**
 * Andamio de las páginas de pilar (/sandboxes, /hosting, /web, /flota,
 * /bases-de-datos). Cada una es DATOS + este renderizador: así las cinco
 * comparten estructura y ninguna se queda atrás cuando cambia el diseño.
 *
 * Regla de la casa: los números que aparecen aquí son MEDIDOS (resume <1 s,
 * cold boot ~12 s, deploy ~12 s) o DERIVADOS del catálogo. No se inventan
 * adjetivos donde puede ir un dato.
 */

export type ProductBento = {
  title: string;
  body: string;
  bullets: string[];
  image: string;
};

export type ProductPageData = {
  /** Encabezado corto; el <span> se pinta en color de marca. */
  kicker: string;
  title: string;
  highlight: string;
  subtitle: string;
  /** Línea de prueba social/específica bajo el CTA. */
  proof: string;
  bentos: ProductBento[];
  /** Pie de precio: una frase, con el precio ya formateado por quien llama. */
  priceLine: ReactNode;
  ctaLabel?: string;
  ctaTo?: string;
};

export const ProductPage = ({
  user,
  data,
}: {
  user?: User | null;
  data: ProductPageData;
}) => {
  const { kicker, title, highlight, subtitle, proof, bentos, priceLine } = data;
  return (
    <section className="overflow-hidden">
      <AuthNav user={user ?? undefined} />

      <header className="pt-32 md:pt-48 pb-16 md:pb-24 px-4 md:px-[5%] max-w-5xl mx-auto text-center">
        <TextBlurEffect>
          <p className="text-brand-500 font-bold uppercase tracking-wider text-sm md:text-base mb-4">
            {kicker}
          </p>
          <h1 className="text-4xl md:text-6xl lg:text-7xl font-bold leading-tight">
            {title} <span className="text-brand-500">{highlight}</span>
          </h1>
          <p className="text-iron text-xl md:text-2xl mt-6 max-w-3xl mx-auto">
            {subtitle}
          </p>
        </TextBlurEffect>
        <div className="mt-10 flex flex-wrap gap-4 justify-center">
          <Link to={data.ctaTo ?? "/login"}>
            <BrutalButton>{data.ctaLabel ?? "Empezar gratis →"}</BrutalButton>
          </Link>
          <Link to="/docs">
            <BrutalButton mode="ghost">Ver la documentación</BrutalButton>
          </Link>
        </div>
        <p className="text-iron/70 text-sm md:text-base mt-6">{proof}</p>
      </header>

      {bentos.map((bento, i) => (
        <Bento
          key={bento.title}
          title={bento.title}
          image={bento.image}
          position={i % 2 === 0 ? "left" : "right"}
          className={i === 0 ? "border-t-2 border-black" : undefined}
        >
          <p className="text-iron text-xl lg:text-2xl mt-4 mb-4">{bento.body}</p>
          {bento.bullets.map((b) => (
            <ItemList key={b} title={b} />
          ))}
        </Bento>
      ))}

      <section className="max-w-4xl mx-auto py-20 md:py-32 px-4 md:px-[5%] text-center">
        <h2 className="text-3xl md:text-5xl font-bold">Cuánto cuesta</h2>
        <div className="text-iron text-xl md:text-2xl mt-6">{priceLine}</div>
        <div className="mt-10 flex flex-wrap gap-4 justify-center">
          <Link to="/planes">
            <BrutalButton>Ver precios</BrutalButton>
          </Link>
          <Link to={data.ctaTo ?? "/login"}>
            <BrutalButton mode="ghost">
              {data.ctaLabel ?? "Empezar gratis →"}
            </BrutalButton>
          </Link>
        </div>
      </section>

      <Footer />
      <FloatingChat />
    </section>
  );
};

/**
 * JSON-LD de una página de pilar. Mismo patrón que HOME_JSON_LD
 * (app/routes/home/home.tsx): se declara el producto y se cuelga de la
 * organización que ya existe, para no crear una entidad suelta por página.
 */
export const productJsonLd = ({
  name,
  description,
  path,
  priceMxn,
}: {
  name: string;
  description: string;
  path: string;
  priceMxn?: number;
}) => ({
  "@context": "https://schema.org",
  "@type": "Product",
  name,
  description,
  url: `https://www.easybits.cloud${path}`,
  brand: { "@type": "Organization", "@id": "https://www.easybits.cloud/#org" },
  ...(priceMxn !== undefined && {
    offers: {
      "@type": "Offer",
      price: priceMxn,
      priceCurrency: "MXN",
      availability: "https://schema.org/InStock",
      url: `https://www.easybits.cloud${path}`,
    },
  }),
});
