/**
 * Progreso de la academia verificado contra el USO REAL de la cuenta.
 *
 * No hay quiz: "tu primera caja" está hecha cuando la cuenta tuvo una caja.
 * Cada `VerifyKind` es un count barato sobre un modelo que ya existe. Las
 * lecciones sin `verify` se leen de LessonProgress.
 */
import { createHmac, timingSafeEqual } from "node:crypto";
import { db } from "../db";
import { listCourses, type Course, type VerifyKind } from "../courses";

export type VerifiedFacts = Record<VerifyKind, boolean>;

export async function getVerifiedFacts(userId: string): Promise<VerifiedFacts> {
  const gt0 = async (p: Promise<number>) => (await p) > 0;
  const [
    api_key,
    mcp_connected,
    file,
    sandbox,
    database,
    fleet_agent,
    whatsapp,
    website,
    release,
  ] = await Promise.all([
    gt0(db.apiKey.count({ where: { userId, status: "ACTIVE" } })),
    // Llave usada o conector OAuth (Claude.ai/ChatGPT) vivo: cualquiera prueba
    // que un agente habló con la cuenta.
    gt0(db.apiKey.count({ where: { userId, lastUsedAt: { not: null } } })).then(
      async (v) => v || gt0(db.oAuthRefreshToken.count({ where: { userId, revoked: false } }))
    ),
    gt0(db.file.count({ where: { ownerId: userId, status: { not: "DELETED" } } })),
    // SandboxSession registra también las efímeras; Sandbox sólo permanentes.
    gt0(db.sandboxSession.count({ where: { ownerId: userId } })).then(
      async (v) => v || gt0(db.sandbox.count({ where: { ownerId: userId } }))
    ),
    gt0(db.database.count({ where: { userId } })),
    gt0(db.fleetAgent.count({ where: { ownerId: userId } })),
    gt0(
      db.fleetAgent.count({
        where: { ownerId: userId, OR: [{ authCreds: { not: null } }, { wabaConfig: { not: null } }] },
      })
    ),
    gt0(db.website.count({ where: { ownerId: userId, deletedAt: null, fileCount: { gt: 0 } } })),
    gt0(db.machineRelease.count({ where: { ownerId: userId, status: "available" } })),
  ]);
  return { api_key, mcp_connected, file, sandbox, database, fleet_agent, whatsapp, website, release };
}

export interface LessonStatus {
  slug: string;
  title: string;
  minutes: number;
  cost: string;
  verify: VerifyKind | null;
  done: boolean;
}
export interface CourseProgress {
  slug: string;
  title: string;
  level: Course["level"];
  minutes: number;
  done: number;
  total: number;
  percent: number;
  lessons: LessonStatus[];
}

export function courseStatus(course: Course, facts: VerifiedFacts, readIds: Set<string>): CourseProgress {
  const lessons = course.lessons.map((l) => ({
    slug: l.slug,
    title: l.title,
    minutes: l.minutes,
    cost: l.cost,
    verify: l.verify,
    done: l.verify ? facts[l.verify] : readIds.has(l.id),
  }));
  const done = lessons.filter((l) => l.done).length;
  return {
    slug: course.slug,
    title: course.title,
    level: course.level,
    minutes: course.minutes,
    done,
    total: lessons.length,
    percent: lessons.length ? Math.round((done / lessons.length) * 100) : 0,
    lessons,
  };
}

export async function getLearningProgress(userId: string): Promise<CourseProgress[]> {
  const [courses, facts, read] = await Promise.all([
    listCourses(),
    getVerifiedFacts(userId),
    db.lessonProgress.findMany({ where: { userId }, select: { lessonId: true } }),
  ]);
  const readIds = new Set(read.map((r) => r.lessonId));
  return courses.map((c) => courseStatus(c, facts, readIds));
}

export async function markLessonRead(userId: string, lessonId: string) {
  await db.lessonProgress.upsert({
    where: { userId_lessonId: { userId, lessonId } },
    create: { userId, lessonId },
    update: {},
  });
}

// --- Certificado: URL pública sin tabla. El token es HMAC(userId:curso); el
// loader recalcula el progreso, así que el certificado sólo existe mientras los
// hechos existan.
function secret() {
  return process.env.JWT_SECRET ?? process.env.SECRET ?? "dev-secret";
}
export function certificateToken(userId: string, course: string): string {
  return `${userId}.${createHmac("sha256", secret()).update(`${userId}:${course}`).digest("hex").slice(0, 32)}`;
}
export function parseCertificateToken(token: string, course: string): string | null {
  const [userId, sig] = token.split(".");
  if (!userId || !sig) return null;
  const expected = certificateToken(userId, course).split(".")[1];
  const a = Buffer.from(sig), b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b) ? userId : null;
}
