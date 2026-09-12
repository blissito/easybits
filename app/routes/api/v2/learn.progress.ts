import type { Route } from "./+types/learn.progress";
import { authenticateRequest, requireAuth } from "~/.server/apiAuth";
import { getLearningProgress, markLessonRead } from "~/.server/core/courseProgress";
import { getLesson } from "~/.server/courses";

// GET /api/v2/learn/progress — progreso de la academia, verificado por uso real.
// Acepta API key, OAuth o cookie de sesión (el clientLoader de /aprende la usa).
export async function loader({ request }: Route.LoaderArgs) {
  const ctx = requireAuth(await authenticateRequest(request));
  return Response.json({ courses: await getLearningProgress(ctx.user.id) });
}

// POST /api/v2/learn/progress { lessonId } — marca leída una lección SIN verify.
export async function action({ request }: Route.ActionArgs) {
  const ctx = requireAuth(await authenticateRequest(request));
  const { lessonId } = await request.json();
  const [course, lesson] = String(lessonId ?? "").split("/");
  const found = await getLesson(course, lesson);
  if (!found) return Response.json({ error: "lesson not found" }, { status: 404 });
  if (found.lesson.verify) {
    return Response.json({ error: "esta lección se verifica por uso, no se marca a mano" }, { status: 400 });
  }
  await markLessonRead(ctx.user.id, found.lesson.id);
  return Response.json({ ok: true });
}
