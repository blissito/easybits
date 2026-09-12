import { Link } from "react-router";
import type { CourseProgress } from "~/.server/core/courseProgress";

/** Un agente que pide `Accept: text/markdown` va a la versión .md de la misma página. */
export function wantsMarkdown(request: Request) {
  return /text\/markdown/i.test(request.headers.get("accept") ?? "");
}

export const WORKSHOPS = [
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

export const LEVEL_LABEL = { inicial: "Ruta 1 · Inicial", intermedio: "Ruta 2 · Intermedio", avanzado: "Ruta 3 · Avanzado" } as const;

export const card = "border-2 border-black rounded-2xl bg-white shadow-[4px_4px_0_0_#000]";

export function ProgressBar({ percent }: { percent: number }) {
  return (
    <div className="h-2 w-full rounded-full border border-black bg-white overflow-hidden" aria-label={`${percent}%`}>
      <div className="h-full bg-brand-500 transition-[width] duration-500" style={{ width: `${percent}%` }} />
    </div>
  );
}

export function Check({ done }: { done: boolean }) {
  return (
    <span
      className={`inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full border-2 border-black font-mono text-xs ${done ? "bg-brand-500 text-white" : "bg-white text-transparent"}`}
      aria-label={done ? "hecha" : "pendiente"}
    >
      ✓
    </span>
  );
}

export function LessonList({ course, progress, current }: { course: { slug: string; lessons: { slug: string; title: string; minutes: number; verify: string | null }[] }; progress?: CourseProgress | null; current?: string }) {
  const doneBy = new Map((progress?.lessons ?? []).map((l) => [l.slug, l.done]));
  return (
    <ol className="divide-y-2 divide-black">
      {course.lessons.map((l, i) => (
        <li key={l.slug}>
          <Link
            to={`/aprende/${course.slug}/${l.slug}`}
            className={`flex items-start gap-3 p-4 hover:bg-brand-100 transition-colors ${current === l.slug ? "bg-brand-100" : ""}`}
          >
            <Check done={doneBy.get(l.slug) === true} />
            <span className="font-mono text-xs text-iron pt-1">{i + 1}</span>
            <span className="min-w-0 flex-1">
              <span className="block font-semibold leading-snug">{l.title}</span>
              <span className="block font-mono text-xs text-iron mt-1">
                {l.minutes} min{l.verify ? " · verificada por uso" : " · lectura"}
              </span>
            </span>
          </Link>
        </li>
      ))}
    </ol>
  );
}

export function WorkshopCards() {
  return (
    <div className="grid md:grid-cols-2 gap-4">
      {WORKSHOPS.map((w) => (
        <article key={w.title} className={`${card} p-6 flex flex-col`}>
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
  );
}
