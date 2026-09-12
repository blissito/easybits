import { data } from "react-router";
import { getCourse, getLesson } from "~/.server/courses";
import { courseMarkdown, indexMarkdown, lessonMarkdown } from "~/.server/coursesMarkdown";
import type { Route } from "./+types/aprende.md";

// Versión Markdown de la academia, para AGENTES. Ruta de RECURSO (sin default
// export y sin más exports que el loader: cualquier otro export se bundlea al
// cliente y rompe el build por importar ~/.server). Responde a `/aprende.md`,
// `/aprende/<curso>.md` y `/aprende/<curso>/<leccion>.md`; las rutas HTML
// redirigen aquí cuando el cliente pide `Accept: text/markdown`.
//
// Cada lección lleva su navegación (anterior/siguiente/temario) y el prompt
// "Hazlo con tu agente", así que un agente puede recorrer el curso sin UI.

function md(text: string) {
  return new Response(text, { headers: { "Content-Type": "text/markdown; charset=utf-8", "Cache-Control": "public, max-age=300" } });
}

export async function loader({ params }: Route.LoaderArgs) {
  const { curso, leccion } = params as { curso?: string; leccion?: string };
  if (!curso) return md(await indexMarkdown());
  if (!leccion) {
    const c = await getCourse(curso);
    if (!c) throw data("Curso no encontrado", { status: 404 });
    return md(courseMarkdown(c));
  }
  const found = await getLesson(curso, leccion);
  if (!found) throw data("Lección no encontrada", { status: 404 });
  return md(lessonMarkdown(found.course, found.lesson));
}
