import { Link, data, redirect, useFetcher, useRevalidator } from "react-router";
import { AuthNav } from "~/components/login/auth-nav";
import { Footer } from "~/components/common/Footer";
import { PostContent } from "./blog/PostContent";
import { getLesson } from "~/.server/courses";
import getBasicMetaTags from "~/utils/getBasicMetaTags";
import type { Route } from "./+types/aprende.$curso.$leccion";
import type { CourseProgress } from "~/.server/core/courseProgress";
import { Check, LessonList, card } from "./aprende/shared";
import { wantsMarkdown } from "./aprende/shared";

export const loader = async ({ request, params }: Route.LoaderArgs) => {
  if (wantsMarkdown(request)) throw redirect(`/aprende/${params.curso}/${params.leccion}.md`);
  const found = await getLesson(params.curso, params.leccion);
  if (!found) throw data("Lección no encontrada", { status: 404 });
  const { course, lesson } = found;
  const i = course.lessons.findIndex((l) => l.slug === lesson.slug);
  const strip = ({ content: _c, ...l }: typeof lesson) => l;
  return {
    course: { slug: course.slug, title: course.title, lessons: course.lessons.map(strip) },
    lesson,
    prev: i > 0 ? strip(course.lessons[i - 1]) : null,
    next: i < course.lessons.length - 1 ? strip(course.lessons[i + 1]) : null,
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
    title: `${d?.lesson.title ?? "Lección"} — ${d?.course.title ?? ""} | Academia EasyBits`,
    description: d?.lesson.description ?? "",
    url: `https://www.easybits.cloud/aprende/${d?.course.slug}/${d?.lesson.slug}`,
  });

const VERIFY_TEXT: Record<string, string> = {
  api_key: "tu cuenta tiene una API key activa",
  mcp_connected: "tu llave autenticó una llamada (o tu conector OAuth está vivo)",
  file: "tu cuenta tiene al menos un archivo",
  sandbox: "tu cuenta ha tenido una caja",
  database: "tu cuenta tiene una base de datos",
  fleet_agent: "tu cuenta tiene un agente de flota",
  whatsapp: "un agente tuyo quedó vinculado a WhatsApp",
  website: "tu cuenta tiene un sitio con archivos",
  release: "tu cuenta tiene un release publicado",
};

export default function Leccion({ loaderData }: Route.ComponentProps) {
  const { course, lesson, prev, next, progress } = loaderData;
  const status = progress?.lessons.find((l) => l.slug === lesson.slug);
  const done = status?.done === true;
  const fetcher = useFetcher();
  const { revalidate, state } = useRevalidator();

  const post = {
    slug: lesson.slug, title: lesson.title, description: lesson.description, date: "", author: "",
    tags: [], readingTime: lesson.minutes, content: lesson.content, excerpt: "", published: true,
  };

  return (
    <section className="overflow-hidden">
      <AuthNav user={undefined} />
      <div className="max-w-6xl mx-auto px-4 pt-32 pb-24 grid lg:grid-cols-[280px_1fr] gap-10">
        <aside className="lg:sticky lg:top-28 self-start">
          <Link to={`/aprende/${course.slug}`} className="font-mono text-sm underline underline-offset-4">← {course.title}</Link>
          <div className={`${card} mt-4 overflow-hidden text-sm`}>
            <LessonList course={course} progress={progress} current={lesson.slug} />
          </div>
        </aside>

        <article>
          <div className="flex items-center gap-3 font-mono text-xs text-iron">
            <span>{lesson.minutes} min</span>
            <span>·</span>
            <span>costo: {lesson.cost}</span>
            {lesson.verify && <><span>·</span><span>verificada por uso</span></>}
          </div>
          <h1 className="text-3xl md:text-5xl font-bold mt-2">{lesson.title}</h1>
          <p className="text-xl text-iron mt-3">{lesson.description}</p>

          <div className="mt-8">
            <PostContent post={post} />
          </div>

          {lesson.agentPrompt && (
            <div className={`${card} p-6 mt-4`}>
              <h2 className="text-lg font-bold">Hazlo con tu agente</h2>
              <p className="text-iron text-sm mt-1">Pega esto en Claude Code, Cursor o Codex con el MCP de EasyBits conectado.</p>
              <pre className="mt-3 whitespace-pre-wrap rounded-xl border border-black bg-brand-100 p-4 font-mono text-sm select-all">{lesson.agentPrompt}</pre>
            </div>
          )}

          <div className={`${card} p-6 mt-6 flex flex-wrap items-center gap-4`}>
            <Check done={done} />
            <div className="flex-1 min-w-[200px]">
              <p className="font-semibold">{done ? "Lección hecha" : "Pendiente"}</p>
              <p className="text-sm text-iron">
                {lesson.verify
                  ? `Se marca sola cuando ${VERIFY_TEXT[lesson.verify]}.`
                  : "Lección de lectura: márcala cuando la tengas clara."}
                {!progress && " Inicia sesión para ver tu estado."}
              </p>
            </div>
            {progress && !done && lesson.verify && (
              <button
                onClick={() => revalidate()}
                disabled={state !== "idle"}
                className="bg-black text-white px-4 py-2 rounded-full font-semibold hover:bg-brand-500 disabled:opacity-50"
              >
                {state === "idle" ? "Verificar ahora" : "Verificando…"}
              </button>
            )}
            {progress && !done && !lesson.verify && (
              <button
                onClick={() =>
                  fetcher.submit(JSON.stringify({ lessonId: lesson.id }), {
                    method: "POST", action: "/api/v2/learn/progress", encType: "application/json",
                  })
                }
                disabled={fetcher.state !== "idle"}
                className="bg-black text-white px-4 py-2 rounded-full font-semibold hover:bg-brand-500 disabled:opacity-50"
              >
                Marcar como leída
              </button>
            )}
          </div>

          <nav className="flex justify-between mt-8 font-semibold">
            {prev ? <Link to={`/aprende/${course.slug}/${prev.slug}`} className="underline underline-offset-4">← {prev.title}</Link> : <span />}
            {next ? <Link to={`/aprende/${course.slug}/${next.slug}`} className="underline underline-offset-4">{next.title} →</Link> : <Link to={`/aprende/${course.slug}`} className="underline underline-offset-4">Ver temario y certificado →</Link>}
          </nav>
        </article>
      </div>
      <Footer />
    </section>
  );
}
