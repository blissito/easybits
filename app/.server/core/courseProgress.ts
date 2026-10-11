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
    multi_tenant,
    payment_link,
    custom_domain,
    real_traffic,
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
    gt0(db.website.count({ where: { ownerId: userId, OR: [{ deletedAt: null }, { deletedAt: { isSet: false } }], fileCount: { gt: 0 } } })),
    gt0(db.machineRelease.count({ where: { ownerId: userId, status: "available" } })),
    hasTwoTenants(userId),
    gt0(db.paymentLink.count({ where: { userId } })),
    gt0(db.customDomain.count({ where: { ownerId: userId, verified: true } })),
    hasRealTraffic(userId),
  ]);
  return {
    api_key, mcp_connected, file, sandbox, database, fleet_agent, whatsapp, website, release,
    multi_tenant, payment_link, custom_domain, real_traffic,
  };
}

// Dos clientes separados = un agente de flota con al menos dos configuraciones de
// canal (no la "*") que apuntan a bases DISTINTAS (`set-db-allow`). groupConfigs es
// JSON libre en Mongo, así que se revisa aquí y no en la consulta.
async function hasTwoTenants(userId: string): Promise<boolean> {
  const agents = await db.fleetAgent.findMany({ where: { ownerId: userId }, select: { groupConfigs: true } });
  return agents.some((a) => {
    const configs = (a.groupConfigs ?? {}) as Record<string, { dbAllow?: unknown } | null>;
    const scopes = new Set<string>();
    for (const [groupId, cfg] of Object.entries(configs)) {
      if (groupId === "*" || !Array.isArray(cfg?.dbAllow)) continue;
      const dbs = (cfg.dbAllow as unknown[]).map(String).filter((s) => s.trim()).sort();
      if (dbs.length) scopes.add(dbs.join(","));
    }
    return scopes.size >= 2;
  });
}

// Un caso real que medir: la flota ya atendió al menos 3 conversaciones y 20
// mensajes de clientes (filas "user" del log durable de la flota).
export const REAL_TRAFFIC_MIN = { conversations: 3, messages: 20 };
async function hasRealTraffic(userId: string): Promise<boolean> {
  const agents = await db.fleetAgent.findMany({ where: { ownerId: userId }, select: { id: true } });
  if (!agents.length) return false;
  const where = { fleetAgentId: { in: agents.map((a) => a.id) }, role: "user" };
  const [messages, conversations] = await Promise.all([
    db.fleetAgentMessage.count({ where, take: REAL_TRAFFIC_MIN.messages }),
    db.fleetAgentMessage.findMany({ where, distinct: ["groupId"], select: { groupId: true }, take: REAL_TRAFFIC_MIN.conversations }),
  ]);
  return messages >= REAL_TRAFFIC_MIN.messages && conversations.length >= REAL_TRAFFIC_MIN.conversations;
}

export interface LessonStatus {
  slug: string;
  title: string;
  minutes: number;
  cost: string;
  verify: VerifyKind | null;
  done: boolean;
}
/** Mínimo de lecciones para que un curso emita certificado. */
export const MIN_LESSONS_FOR_CERTIFICATE = 3;

export type CertificateStatus =
  | { eligible: true }
  | { eligible: false; reason: "too_short" | "incomplete"; message: string };

export interface CourseProgress {
  slug: string;
  title: string;
  level: Course["level"];
  minutes: number;
  done: number;
  total: number;
  percent: number;
  lessons: LessonStatus[];
  certificate: CertificateStatus;
}

/**
 * Candado del certificado: el curso necesita un mínimo de lecciones y TODAS sus
 * lecciones hechas, las verificables por hechos de la cuenta (no por "leída").
 * Lo usan la página del curso, la ruta que emite el token y el certificado público.
 */
export function certificateStatus(course: Course, lessons: LessonStatus[]): CertificateStatus {
  if (course.lessons.length < MIN_LESSONS_FOR_CERTIFICATE) {
    return {
      eligible: false,
      reason: "too_short",
      message: `Este curso todavía no emite certificado: necesita al menos ${MIN_LESSONS_FOR_CERTIFICATE} lecciones y hoy tiene ${course.lessons.length}.`,
    };
  }
  const pendingVerified = lessons.filter((l) => l.verify && !l.done);
  const pendingRead = lessons.filter((l) => !l.verify && !l.done);
  if (pendingVerified.length || pendingRead.length) {
    const names = [...pendingVerified, ...pendingRead].map((l) => `«${l.title}»`).join(", ");
    return {
      eligible: false,
      reason: "incomplete",
      message: `Faltan lecciones por completar: ${names}. Las que se verifican por uso se marcan solas cuando tu cuenta cumple el hecho.`,
    };
  }
  return { eligible: true };
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
    certificate: certificateStatus(course, lessons),
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
