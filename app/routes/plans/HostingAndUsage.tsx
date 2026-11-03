import { Link } from "react-router";
import { BrutalElement } from "~/components/common/BrutalElement";
import { BrutalButton } from "~/components/common/BrutalButton";
import { TextBlurEffect } from "~/components/TextBlurEffect";
import { FLEET_BOX } from "~/lib/hostingCatalog";
import { GENERATION_PACKS, LLM_TOKEN_PACKS, WEB_PACKS } from "~/lib/plans";

/**
 * Hosting y consumo, públicos. Vivían solo detrás del login (/dash/packs), así
 * que nadie podía comparar precios antes de crear cuenta.
 *
 * Todo se DERIVA de hostingCatalog.ts y plans.ts — las mismas fuentes que usa
 * el checkout. Si mañana cambia un precio, esta página cambia sola; no hay una
 * cifra escrita a mano que se pueda quedar vieja.
 */

const mxn = (n: number) => `$${n.toLocaleString("es-MX")}`;

export const HostingAndUsage = () => (
  <>
    {/* Hosting por cotización (desde 3-nov-2026): ya no hay tabla de precios pública. Se
        cotiza por proyecto y se entrega montado; los tiers siguen en hostingCatalog como
        base interna. */}
    <section className="max-w-7xl mx-auto py-20 md:py-32 px-4 md:px-[5%] xl:px-0">
      <TextBlurEffect>
        <h2 className="text-3xl md:text-5xl font-bold text-center">
          Hosting gestionado para tu empresa
        </h2>
        <p className="text-iron text-xl md:text-2xl mt-6 text-center max-w-3xl mx-auto">
          Montamos tus apps en máquinas dedicadas y te las entregamos funcionando.{" "}
          <strong>Un solo cobro mensual, fijo y en pesos</strong>, cotizado según tu proyecto.
        </p>
      </TextBlurEffect>

      <div className="mt-12 grid gap-4 md:grid-cols-2">
        <BrutalElement className="border-2">
          <div className="bg-white p-6 h-full">
            <h3 className="text-lg font-semibold">Hosting a la medida</h3>
            <p className="text-iron mt-2">
              Deploy desde tu repo, dominio propio, respaldos diarios y rollback. Te lo cotizamos
              por proyecto: escríbenos a{" "}
              <a href="mailto:soporte@easybits.cloud?subject=Cotizar%20hosting" className="underline text-brand-500">
                soporte@easybits.cloud
              </a>
              .
            </p>
          </div>
        </BrutalElement>
        <BrutalElement className="border-2">
          <div className="bg-white p-6 h-full">
            <h3 className="text-lg font-semibold">Caja de Flota</h3>
            <p className="text-iron mt-2">
              <strong>{mxn(FLEET_BOX.priceMxn)}/mes</strong> por caja, y cada una
              corre {FLEET_BOX.agents} agentes.{" "}
              <Link to="/flota" className="underline text-brand-500">
                Ver Flota
              </Link>
            </p>
          </div>
        </BrutalElement>
      </div>

      <p className="text-center mt-10">
        <Link to="/hosting">
          <BrutalButton mode="ghost">Cómo funciona el hosting →</BrutalButton>
        </Link>
      </p>
    </section>

    <section className="max-w-7xl mx-auto py-20 md:py-32 px-4 md:px-[5%] xl:px-0">
      <TextBlurEffect>
        <h2 className="text-3xl md:text-5xl font-bold text-center">
          Consumo: packs que no caducan
        </h2>
        <p className="text-iron text-xl md:text-2xl mt-6 text-center max-w-3xl mx-auto">
          Lo que tu agente gasta se compra aparte de la suscripción, así que un mes
          tranquilo no te cuesta de más. Sirven en cualquier plan y{" "}
          <strong>no tienen fecha de vencimiento</strong>.
        </p>
      </TextBlurEffect>

      <div className="mt-12 lg:mt-16 grid gap-6 md:grid-cols-3">
        <PackColumn
          title="Consultas web"
          note="Buscar, leer y extraer de internet."
          href="/web"
          items={WEB_PACKS.map((p) => ({
            id: p.id,
            label: `${p.queries.toLocaleString("es-MX")} consultas`,
            price: p.price,
            featured: p.featured,
          }))}
        />
        <PackColumn
          title="Créditos de generación"
          note="Documentos, imágenes, landings y video."
          items={GENERATION_PACKS.slice(0, 4).map((p) => ({
            id: p.id,
            label: `${p.generations.toLocaleString("es-MX")} créditos`,
            price: p.promoPrice ?? p.prices.Byte,
            featured: p.featured,
          }))}
        />
        <PackColumn
          title="Tokens de modelo"
          note="Solo si prefieres no traer tus propias llaves."
          items={LLM_TOKEN_PACKS.map((p) => ({
            id: p.id,
            label: `${(p.tokens / 1_000_000).toLocaleString("es-MX")}M tokens`,
            price: p.price,
            featured: p.featured,
          }))}
        />
      </div>
    </section>
  </>
);

const PackColumn = ({
  title,
  note,
  href,
  items,
}: {
  title: string;
  note: string;
  href?: string;
  items: { id: string; label: string; price: number; featured?: boolean }[];
}) => (
  <BrutalElement className="border-2 h-full">
    <div className="bg-white p-6 h-full flex flex-col">
      <h3 className="text-xl font-bold">{title}</h3>
      <p className="text-iron text-sm mt-1">{note}</p>
      <ul className="mt-5 space-y-2 flex-1">
        {items.map((it) => (
          <li
            key={it.id}
            className={
              "flex justify-between gap-4 border-b border-black/10 pb-2" +
              (it.featured ? " font-bold" : "")
            }
          >
            <span>{it.label}</span>
            <span>{mxn(it.price)}</span>
          </li>
        ))}
      </ul>
      {href && (
        <Link to={href} className="underline text-brand-500 mt-5 inline-block">
          Ver cómo funciona →
        </Link>
      )}
    </div>
  </BrutalElement>
);
