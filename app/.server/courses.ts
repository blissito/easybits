/**
 * Academia (/aprende): cursos y lecciones en disco, mismo patrón que blogPosts.ts.
 *
 *   app/content/cursos/<curso>/course.json      → metadatos del curso
 *   app/content/cursos/<curso>/NN-<leccion>.mdx → una lección (orden = NN)
 *
 * Una lección con `verify` se marca hecha cuando la CUENTA cumple el hecho
 * (tiene una caja, una base de datos…) — ver core/courseProgress.ts. Sin
 * `verify` es lectura y se marca a mano (LessonProgress).
 */
import fs from "node:fs/promises";
import path from "node:path";
import matter from "gray-matter";

const COURSES_DIR = "app/content/cursos";

export const VERIFY_KINDS = [
  "api_key",
  "mcp_connected",
  "file",
  "sandbox",
  "database",
  "fleet_agent",
  "whatsapp",
  "website",
  "release",
] as const;
export type VerifyKind = (typeof VERIFY_KINDS)[number];

export interface Lesson {
  slug: string;
  /** "<curso>/<leccion>": id estable para LessonProgress. */
  id: string;
  course: string;
  order: number;
  title: string;
  description: string;
  minutes: number;
  /** Costo honesto para el alumno, en prosa: "$0", "~$2 MXN". */
  cost: string;
  verify: VerifyKind | null;
  /** Prompt copiable para hacer la lección desde el agente del alumno. */
  agentPrompt: string | null;
  content: string;
}

export interface Course {
  slug: string;
  title: string;
  description: string;
  level: "inicial" | "intermedio" | "avanzado";
  minutes: number;
  /** Qué tienes al terminar, en una frase. */
  outcome: string;
  lessons: Lesson[];
}

let cache: Promise<Course[]> | null = null;

function lessonSlug(fileName: string): string {
  return fileName.replace(/^\d+-/, "").replace(/\.mdx$/, "");
}

async function readCourse(dir: string, slug: string): Promise<Course> {
  const meta = JSON.parse(await fs.readFile(path.join(dir, "course.json"), "utf-8"));
  const files = (await fs.readdir(dir)).filter((f) => /^\d+-.*\.mdx$/.test(f)).sort();
  const lessons = await Promise.all(
    files.map(async (fileName) => {
      const { data, content } = matter(await fs.readFile(path.join(dir, fileName), "utf-8"));
      const verify = data.verify ?? null;
      if (verify && !VERIFY_KINDS.includes(verify)) {
        throw new Error(`${slug}/${fileName}: verify "${verify}" no es válido`);
      }
      const s = lessonSlug(fileName);
      return {
        slug: s,
        id: `${slug}/${s}`,
        course: slug,
        order: Number(fileName.match(/^\d+/)![0]),
        title: data.title ?? s,
        description: data.description ?? "",
        minutes: Number(data.minutes ?? 10),
        cost: String(data.cost ?? "$0"),
        verify,
        agentPrompt: data.agentPrompt ?? null,
        content,
      } satisfies Lesson;
    })
  );
  return {
    slug,
    title: meta.title,
    description: meta.description,
    level: meta.level ?? "inicial",
    minutes: meta.minutes ?? lessons.reduce((n, l) => n + l.minutes, 0),
    outcome: meta.outcome ?? "",
    lessons,
  };
}

async function readAll(): Promise<Course[]> {
  const root = path.join(process.cwd(), COURSES_DIR);
  const entries = (await fs.readdir(root, { withFileTypes: true })).filter((e) => e.isDirectory());
  const courses = await Promise.all(entries.map((e) => readCourse(path.join(root, e.name), e.name)));
  // Orden editorial fijo: inicial → intermedio → avanzado.
  const rank = { inicial: 0, intermedio: 1, avanzado: 2 };
  return courses.sort((a, b) => rank[a.level] - rank[b.level]);
}

function all(): Promise<Course[]> {
  if (process.env.NODE_ENV !== "production") return readAll();
  cache ??= readAll();
  return cache;
}

export async function listCourses(): Promise<Course[]> {
  return all();
}

export async function getCourse(slug: string): Promise<Course | null> {
  return (await all()).find((c) => c.slug === slug) ?? null;
}

export async function getLesson(course: string, lesson: string): Promise<{ course: Course; lesson: Lesson } | null> {
  const c = await getCourse(course);
  const l = c?.lessons.find((x) => x.slug === lesson);
  return c && l ? { course: c, lesson: l } : null;
}
