import { Link, data } from "react-router";
import { db } from "~/.server/db";
import { getCourse } from "~/.server/courses";
import { courseStatus, getVerifiedFacts, parseCertificateToken } from "~/.server/core/courseProgress";
import getBasicMetaTags from "~/utils/getBasicMetaTags";
import type { Route } from "./+types/aprende.$curso.certificado.$token";

// Pública y sin tabla: el token es HMAC(userId:curso) y el progreso se recalcula
// aquí, así que el certificado sólo existe mientras los hechos existan.
export const loader = async ({ params }: Route.LoaderArgs) => {
  const course = await getCourse(params.curso);
  const userId = course && parseCertificateToken(params.token, params.curso);
  if (!course || !userId) throw data("Certificado no encontrado", { status: 404 });
  const [user, facts, read] = await Promise.all([
    db.user.findUnique({ where: { id: userId }, select: { displayName: true, email: true } }),
    getVerifiedFacts(userId),
    db.lessonProgress.findMany({ where: { userId }, select: { lessonId: true, completedAt: true } }),
  ]);
  if (!user) throw data("Certificado no encontrado", { status: 404 });
  const progress = courseStatus(course, facts, new Set(read.map((r) => r.lessonId)));
  if (progress.percent < 100) throw data("Este certificado ya no es válido: la cuenta no cumple todos los hechos del curso.", { status: 404 });
  const name = user.displayName || user.email.split("@")[0];
  const issuedAt = read.reduce<Date | null>((m, r) => (!m || r.completedAt > m ? r.completedAt : m), null) ?? new Date();
  return { name, course: { title: course.title, outcome: course.outcome, slug: course.slug }, lessons: progress.lessons, issuedAt: issuedAt.toISOString().slice(0, 10) };
};

export const meta = ({ data: d }: Route.MetaArgs) =>
  getBasicMetaTags({
    title: `${d?.name ?? ""} completó ${d?.course.title ?? ""} — Academia EasyBits`,
    description: d?.course.outcome ?? "",
    url: `https://www.easybits.cloud/aprende/${d?.course.slug}`,
  });

export default function Certificado({ loaderData }: Route.ComponentProps) {
  const { name, course, lessons, issuedAt } = loaderData;
  return (
    <main className="min-h-screen bg-brand-100 flex items-center justify-center p-6 print:bg-white print:p-0">
      <article className="w-full max-w-2xl border-4 border-black bg-white p-10 shadow-[8px_8px_0_0_#000] print:shadow-none">
        <p className="font-mono text-sm text-brand-500">Academia EasyBits · certificado verificado</p>
        <h1 className="text-4xl font-bold mt-4">{name}</h1>
        <p className="text-xl mt-2">completó la ruta <strong>{course.title}</strong></p>
        <p className="text-iron mt-4">{course.outcome}</p>
        <h2 className="font-mono text-xs text-iron mt-8 uppercase">Lo que su cuenta demuestra</h2>
        <ul className="mt-2 space-y-1">
          {lessons.map((l) => (
            <li key={l.slug} className="flex gap-2"><span>✓</span><span>{l.title}{l.verify ? <span className="text-iron"> · verificado por uso</span> : null}</span></li>
          ))}
        </ul>
        <div className="flex justify-between items-end mt-10 font-mono text-xs text-iron">
          <span>{issuedAt}</span>
          <span>easybits.cloud/aprende</span>
        </div>
        <p className="text-xs text-iron mt-6 print:hidden">
          Este certificado se recalcula cada vez que se abre: existe mientras la cuenta cumpla los hechos. <Link to="/aprende" className="underline">Haz el tuyo →</Link>
        </p>
      </article>
    </main>
  );
}
