import { Link, data } from "react-router";
import { AuthNav } from "~/components/login/auth-nav";
import { Footer } from "~/components/common/Footer";
import { getCourse } from "~/.server/courses";
import getBasicMetaTags from "~/utils/getBasicMetaTags";
import type { Route } from "./+types/aprende.$curso";
import type { CourseProgress } from "~/.server/core/courseProgress";
import { LEVEL_LABEL, LessonList, ProgressBar, card } from "./aprende/shared";

export const loader = async ({ params }: Route.LoaderArgs) => {
  const course = await getCourse(params.curso);
  if (!course) throw data("Curso no encontrado", { status: 404 });
  const { lessons, ...meta } = course;
  return {
    course: { ...meta, lessons: lessons.map(({ content: _c, ...l }) => l) },
    progress: null as CourseProgress | null,
  };
};

export const clientLoader = async ({ serverLoader, params }: Route.ClientLoaderArgs) => {
  const d = await serverLoader();
  try {
    const r = await fetch("/api/v2/learn/progress");
    if (!r.ok) return d;
    const { courses } = await r.json();
    return { ...d, progress: (courses as CourseProgress[]).find((c) => c.slug === params.curso) ?? null };
  } catch {
    return d;
  }
};

export const meta = ({ data: d }: Route.MetaArgs) =>
  getBasicMetaTags({
    title: `${d?.course.title ?? "Curso"} — Academia EasyBits`,
    description: d?.course.description ?? "",
    url: `https://www.easybits.cloud/aprende/${d?.course.slug ?? ""}`,
  });

export default function Curso({ loaderData }: Route.ComponentProps) {
  const { course, progress } = loaderData;
  const complete = progress?.percent === 100;
  return (
    <section className="overflow-hidden">
      <AuthNav user={undefined} />
      <div className="max-w-3xl mx-auto px-4 pt-32 pb-24">
        <Link to="/aprende" className="font-mono text-sm underline underline-offset-4">← Academia</Link>
        <p className="font-mono text-sm text-brand-500 mt-6">{LEVEL_LABEL[course.level]}</p>
        <h1 className="text-4xl md:text-5xl font-bold mt-1">{course.title}</h1>
        <p className="text-xl text-iron mt-4">{course.description}</p>
        <p className="mt-4"><span className="font-semibold">Al terminar:</span> {course.outcome}</p>

        <div className="mt-8">
          <ProgressBar percent={progress?.percent ?? 0} />
          <p className="font-mono text-xs mt-1 text-iron">
            {progress ? `${progress.done}/${progress.total} lecciones · ${progress.percent}%` : "Inicia sesión para ver tu progreso"}
          </p>
        </div>

        <div className={`${card} mt-8 overflow-hidden`}>
          <LessonList course={course} progress={progress} />
        </div>

        <div className={`${card} mt-8 p-6`}>
          <h2 className="text-xl font-bold">Certificado</h2>
          <p className="text-iron mt-2">
            Es una URL pública que existe mientras tu cuenta cumpla los hechos del curso. No es un PDF de asistencia.
          </p>
          {complete ? (
            <a href={`/aprende/${course.slug}/certificado`} className="inline-block mt-4 bg-black text-white px-4 py-2 rounded-full font-semibold hover:bg-brand-500">
              Ver mi certificado →
            </a>
          ) : (
            <p className="font-mono text-xs text-iron mt-4">Se desbloquea al 100%.</p>
          )}
        </div>
      </div>
      <Footer />
    </section>
  );
}
