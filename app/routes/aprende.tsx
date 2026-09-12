import { Link } from "react-router";
import { AuthNav } from "~/components/login/auth-nav";
import { Footer } from "~/components/common/Footer";
import { FloatingChat } from "~/components/ai/FloatingChat";
import { listCourses } from "~/.server/courses";
import { listPublishedPosts } from "~/.server/blogPosts";
import getBasicMetaTags from "~/utils/getBasicMetaTags";
import type { Route } from "./+types/aprende";
import type { CourseProgress } from "~/.server/core/courseProgress";
import { LEVEL_LABEL, ProgressBar, WorkshopCards, card } from "./aprende/shared";

// Prerenderizada: el loader corre en el build y NO conoce al usuario. El
// progreso llega por clientLoader (patrón planes.tsx: servidor para el crawler,
// cliente para la sesión).
export const loader = async () => {
  const [courses, posts] = await Promise.all([listCourses(), listPublishedPosts()]);
  const cases = posts
    .filter((p) => p.kind === "build-in-public")
    .slice(0, 4)
    .map(({ slug, title, description }) => ({ slug, title, description }));
  return {
    courses: courses.map((c) => ({
      slug: c.slug,
      title: c.title,
      description: c.description,
      level: c.level,
      minutes: c.minutes,
      outcome: c.outcome,
      lessons: c.lessons.length,
      verified: c.lessons.filter((l) => l.verify).length,
    })),
    cases,
    progress: null as CourseProgress[] | null,
  };
};

export const clientLoader = async ({ serverLoader }: Route.ClientLoaderArgs) => {
  const data = await serverLoader();
  try {
    const r = await fetch("/api/v2/learn/progress");
    if (!r.ok) return data;
    const { courses } = await r.json();
    return { ...data, progress: courses as CourseProgress[] };
  } catch {
    return data;
  }
};

export const meta = () =>
  getBasicMetaTags({
    title: "Aprende — Agentes de IA en producción | EasyBits",
    description:
      "Cursos gratis con progreso verificado por uso real, y talleres en vivo. Lleva un agente de IA a producción: su caja, WhatsApp, memoria SQL, costos y deploy. En español y en MXN.",
    url: "https://www.easybits.cloud/aprende",
  });

export default function Aprende({ loaderData }: Route.ComponentProps) {
  const { courses, cases, progress } = loaderData;
  const pct = (slug: string) => progress?.find((p) => p.slug === slug) ?? null;

  return (
    <section className="overflow-hidden">
      <AuthNav user={undefined} />

      <header className="max-w-5xl mx-auto px-4 pt-32 pb-16">
        <p className="font-mono text-sm text-brand-500 mb-3">Academia</p>
        <h1 className="text-4xl md:text-6xl font-bold leading-tight">
          Agentes de IA en producción,
          <br />
          no en un notebook.
        </h1>
        <p className="mt-6 text-xl text-iron max-w-2xl">
          Tres rutas gratis. Ningún quiz: una lección se marca hecha cuando tu
          cuenta <em>de verdad</em> tiene la caja, el archivo o la base de datos.
          Cada lección se puede hacer desde tu agente. Y en vivo cuando quieras
          ir en serio.
        </p>
      </header>

      <div className="max-w-5xl mx-auto px-4 pb-20">
        <h2 className="text-2xl font-bold mb-6">Rutas</h2>
        <div className="grid md:grid-cols-3 gap-4">
          {courses.map((c) => {
            const p = pct(c.slug);
            return (
              <Link key={c.slug} to={`/aprende/${c.slug}`} className={`${card} p-6 flex flex-col hover:-translate-y-0.5 transition-transform`}>
                <span className="font-mono text-xs text-iron">{LEVEL_LABEL[c.level]}</span>
                <h3 className="text-2xl font-bold mt-1">{c.title}</h3>
                <p className="text-iron mt-2 flex-1">{c.description}</p>
                <p className="font-mono text-xs text-iron mt-4">
                  {c.lessons} {c.lessons === 1 ? "lección" : "lecciones"} · ~{Math.round(c.minutes / 60)}h · {c.verified} {c.verified === 1 ? "verificada" : "verificadas"} por uso
                </p>
                <div className="mt-3">
                  <ProgressBar percent={p?.percent ?? 0} />
                  <p className="font-mono text-xs mt-1">
                    {p ? `${p.done}/${p.total} · ${p.percent}%` : "gratis · sin tarjeta"}
                  </p>
                </div>
              </Link>
            );
          })}
        </div>
      </div>

      <div className="max-w-5xl mx-auto px-4 pb-20">
        <div className="flex items-baseline justify-between mb-6">
          <h2 className="text-2xl font-bold">Talleres en vivo</h2>
          <span className="font-mono text-sm text-iron">en español · en MXN</span>
        </div>
        <WorkshopCards />
        <p className="text-sm text-iron mt-6">
          Los talleres se imparten y cobran en fixtergeek.com; la infraestructura del taller es EasyBits.
        </p>
      </div>

      {cases.length > 0 && (
        <div className="max-w-5xl mx-auto px-4 pb-24">
          <div className="flex items-baseline justify-between mb-6">
            <h2 className="text-2xl font-bold">Casos reales</h2>
            <Link to="/blog" className="font-mono text-sm underline underline-offset-4">todos →</Link>
          </div>
          <ul className={`${card} divide-y-2 divide-black overflow-hidden`}>
            {cases.map((c) => (
              <li key={c.slug}>
                <Link to={`/blog/${c.slug}`} className="block p-5 hover:bg-brand-100 transition-colors">
                  <h3 className="font-bold">{c.title}</h3>
                  <p className="text-iron text-sm mt-1">{c.description}</p>
                </Link>
              </li>
            ))}
          </ul>
        </div>
      )}

      <Footer />
      <FloatingChat />
    </section>
  );
}
