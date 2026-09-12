import { Link } from "react-router";
import { AuthNav } from "~/components/login/auth-nav";
import { Footer } from "~/components/common/Footer";
import { FloatingChat } from "~/components/ai/FloatingChat";
import { listPublishedPosts } from "~/.server/blogPosts";
import getBasicMetaTags from "~/utils/getBasicMetaTags";
import type { Route } from "./+types/aprende";

// Prerenderizada: el loader corre en el build. Sin loader de servidor la página
// sale vacía para un crawler (mismo patrón que planes.tsx / home.tsx).
export const loader = async () => {
  const tutorials = (await listPublishedPosts())
    .filter((p) => p.kind === "tutorial" && p.lang === "es")
    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
    .map(({ slug, title, description, date, readingTime }) => ({
      slug,
      title,
      description,
      date,
      readingTime,
    }));
  return { tutorials };
};

export const meta = () =>
  getBasicMetaTags({
    title: "Aprende — Agentes de IA en producción | EasyBits",
    description:
      "Tutoriales gratis y talleres en vivo para llevar un agente de IA a producción: su propia caja, WhatsApp, memoria SQL, costos y deploy. En español y en MXN.",
    url: "https://www.easybits.cloud/aprende",
  });

// Talleres de pago: viven en fixtergeek.com (LMS + cobro). Aquí solo se listan.
const WORKSHOPS = [
  {
    title: "Diseño de sistemas agénticos",
    format: "5 sesiones en vivo de 2h + 1 sesión personal",
    price: "desde $2,490 MXN",
    blurb:
      "La caja, la interfaz, memoria y estado, human in the loop, refuerzo y tu caso. Sales con un agente tuyo corriendo en producción.",
    url: "https://www.fixtergeek.com/sistemas-agenticos",
    cta: "Ver el taller",
  },
  {
    title: "Tu agente en producción (1:1)",
    format: "Acompañamiento personal, a tu ritmo",
    price: "cupo limitado",
    blurb:
      "Traes tu caso; lo armamos juntos sobre EasyBits: WhatsApp, cobro, multi-tenant y costos medidos.",
    url: "mailto:fixtergeek@gmail.com?subject=Tu%20agente%20en%20producci%C3%B3n",
    cta: "Quiero esto",
  },
];

const START_STEPS = [
  {
    n: "1",
    title: "Crea tu cuenta",
    text: "Gratis. Tu API key abre archivos, bases de datos y una caja.",
    to: "/login",
    label: "Crear cuenta",
  },
  {
    n: "2",
    title: "Conecta el MCP",
    text: "Claude, Cursor o Codex: un endpoint, todas las herramientas.",
    to: "/docs",
    label: "Ver setup",
  },
  {
    n: "3",
    title: "Tu primer agente",
    text: "Sigue el primer tutorial y en 10 minutos tienes algo corriendo.",
    to: "/blog",
    label: "Ir al tutorial",
  },
];

export default function Aprende({ loaderData }: Route.ComponentProps) {
  const { tutorials } = loaderData;
  return (
    <section className="overflow-hidden">
      <AuthNav user={undefined} />

      <header className="max-w-5xl mx-auto px-4 pt-32 pb-16">
        <p className="font-mono text-sm text-brand-500 mb-3">Aprende</p>
        <h1 className="text-4xl md:text-6xl font-bold leading-tight">
          Agentes de IA en producción,
          <br />
          no en un notebook.
        </h1>
        <p className="mt-6 text-xl text-iron max-w-2xl">
          Sobran cursos de la herramienta. Aquí aprendes lo que viene después:
          darle a tu agente su propia caja, un número de WhatsApp, memoria, un
          costo que puedas medir y un deploy. Gratis para empezar, en vivo
          cuando quieras ir en serio.
        </p>
      </header>

      <div className="max-w-5xl mx-auto px-4 pb-20">
        <h2 className="text-2xl font-bold mb-6">Empieza aquí</h2>
        <ol className="grid md:grid-cols-3 gap-4">
          {START_STEPS.map((s) => (
            <li
              key={s.n}
              className="border-2 border-black rounded-2xl p-6 shadow-[4px_4px_0_0_#000] bg-white"
            >
              <span className="font-mono text-sm text-iron">Paso {s.n}</span>
              <h3 className="text-xl font-bold mt-1">{s.title}</h3>
              <p className="text-iron mt-2">{s.text}</p>
              <Link
                to={s.to}
                className="inline-block mt-4 font-semibold underline underline-offset-4"
              >
                {s.label} →
              </Link>
            </li>
          ))}
        </ol>
      </div>

      <div className="max-w-5xl mx-auto px-4 pb-20">
        <div className="flex items-baseline justify-between mb-6">
          <h2 className="text-2xl font-bold">Tutoriales</h2>
          <span className="font-mono text-sm text-iron">gratis · paso a paso</span>
        </div>
        {tutorials.length === 0 ? (
          <p className="text-iron">Pronto.</p>
        ) : (
          <ul className="divide-y-2 divide-black border-2 border-black rounded-2xl bg-white overflow-hidden">
            {tutorials.map((t) => (
              <li key={t.slug}>
                <Link
                  to={`/blog/${t.slug}`}
                  className="block p-6 hover:bg-brand-100 transition-colors"
                >
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <h3 className="text-lg font-bold">{t.title}</h3>
                    <span className="font-mono text-xs text-iron">
                      {t.readingTime} min
                    </span>
                  </div>
                  <p className="text-iron mt-1">{t.description}</p>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="max-w-5xl mx-auto px-4 pb-24">
        <div className="flex items-baseline justify-between mb-6">
          <h2 className="text-2xl font-bold">Talleres en vivo</h2>
          <span className="font-mono text-sm text-iron">en español · en MXN</span>
        </div>
        <div className="grid md:grid-cols-2 gap-4">
          {WORKSHOPS.map((w) => (
            <article
              key={w.title}
              className="border-2 border-black rounded-2xl p-6 shadow-[4px_4px_0_0_#000] bg-white flex flex-col"
            >
              <h3 className="text-xl font-bold">{w.title}</h3>
              <p className="font-mono text-sm text-iron mt-1">{w.format}</p>
              <p className="text-iron mt-3 flex-1">{w.blurb}</p>
              <div className="flex items-center justify-between mt-6">
                <span className="font-semibold">{w.price}</span>
                <a
                  href={w.url}
                  target={w.url.startsWith("http") ? "_blank" : undefined}
                  rel="noreferrer"
                  className="bg-black text-white px-4 py-2 rounded-full font-semibold hover:bg-brand-500 transition-colors"
                >
                  {w.cta}
                </a>
              </div>
            </article>
          ))}
        </div>
        <p className="text-sm text-iron mt-6">
          Los talleres se imparten y cobran en fixtergeek.com; la infraestructura
          del taller es EasyBits.
        </p>
      </div>

      <Footer />
      <FloatingChat />
    </section>
  );
}
