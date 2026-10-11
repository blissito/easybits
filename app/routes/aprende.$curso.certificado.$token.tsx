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

// Roseta del sello: 16 picos alrededor de (100,92). Se calcula una vez al cargar el módulo.
const ROSETTE = (() => {
  const pts: string[] = [];
  for (let i = 0; i < 32; i++) {
    const a = (Math.PI * 2 * i) / 32 - Math.PI / 2;
    const r = i % 2 === 0 ? 70 : 60;
    pts.push(`${(100 + r * Math.cos(a)).toFixed(1)},${(92 + r * Math.sin(a)).toFixed(1)}`);
  }
  return `M${pts.join("L")}Z`;
})();

const SPARK = "M0,-11 L3,-3 L11,0 L3,3 L0,11 L-3,3 L-11,0 L-3,-3Z";

// Caricatura plana: contorno negro grueso, rellenos sólidos y sombra dura desplazada.
// La animación corre UNA vez (cae, estampa, se dibuja la palomita, saltan chispas).
const CERT_CSS = `
.cert-seal .seal-drop{transform-box:view-box;transform-origin:100px 92px;animation:cert-drop .7s cubic-bezier(.34,1.56,.64,1) .2s both}
.cert-seal .seal-ring{transform-box:view-box;transform-origin:100px 92px;opacity:0;animation:cert-ring .55s ease-out .78s both}
.cert-seal .seal-check{stroke-dasharray:90;stroke-dashoffset:0;animation:cert-draw .4s ease-out 1.05s both}
.cert-seal .seal-tail-l{transform-box:view-box;transform-origin:84px 140px;animation:cert-swing-l 1.1s ease-out .85s both}
.cert-seal .seal-tail-r{transform-box:view-box;transform-origin:116px 140px;animation:cert-swing-r 1.1s ease-out .85s both}
.cert-seal .spark{transform-box:fill-box;transform-origin:center;animation:cert-pop .5s cubic-bezier(.34,1.56,.64,1) both}
.cert-rise{animation:cert-rise .45s ease-out both}
@keyframes cert-drop{0%{transform:translateY(-140px) rotate(-25deg) scale(.9);opacity:0}55%{opacity:1}80%{transform:translateY(0) rotate(4deg) scale(1.12)}100%{transform:none}}
@keyframes cert-ring{0%{transform:scale(.8);opacity:1}100%{transform:scale(1.35);opacity:0}}
@keyframes cert-draw{from{stroke-dashoffset:90}to{stroke-dashoffset:0}}
@keyframes cert-swing-l{0%{transform:rotate(14deg)}40%{transform:rotate(-6deg)}70%{transform:rotate(3deg)}100%{transform:none}}
@keyframes cert-swing-r{0%{transform:rotate(-14deg)}40%{transform:rotate(6deg)}70%{transform:rotate(-3deg)}100%{transform:none}}
@keyframes cert-pop{0%{transform:scale(0) rotate(-45deg)}100%{transform:none}}
@keyframes cert-rise{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:none}}
@media (prefers-reduced-motion: reduce){.cert-seal *,.cert-rise{animation:none}}
@media print{.cert-seal *,.cert-rise{animation:none}}
`;

function Seal() {
  return (
    <svg viewBox="0 0 200 210" className="cert-seal w-full h-full" role="img" aria-label="Sello de certificado verificado">
      <g stroke="#000" strokeWidth="5" strokeLinejoin="round">
        {/* Colas del listón, con su sombra dura */}
        <g className="seal-tail-l">
          <path d="M70,130 L52,198 L70,186 L82,204 L98,138Z" fill="#000" transform="translate(6 6)" />
          <path d="M70,130 L52,198 L70,186 L82,204 L98,138Z" fill="#7c3aed" />
        </g>
        <g className="seal-tail-r">
          <path d="M130,130 L148,198 L130,186 L118,204 L102,138Z" fill="#000" transform="translate(6 6)" />
          <path d="M130,130 L148,198 L130,186 L118,204 L102,138Z" fill="#fbbf24" />
        </g>
        <circle className="seal-ring" cx="100" cy="92" r="72" fill="none" stroke="#7c3aed" strokeWidth="4" />
        <g className="seal-drop">
          <path d={ROSETTE} fill="#000" transform="translate(7 7)" />
          <path d={ROSETTE} fill="#fbbf24" />
          <circle cx="100" cy="92" r="46" fill="#7c3aed" />
          <circle cx="100" cy="92" r="36" fill="none" stroke="#fff" strokeWidth="3" strokeDasharray="6 6" />
          <path className="seal-check" d="M80,93 L95,108 L122,77" fill="none" stroke="#fff" strokeWidth="11" strokeLinecap="round" />
        </g>
      </g>
      <g fill="#fbbf24" stroke="#000" strokeWidth="3" strokeLinejoin="round">
        {/* El translate va en el <g>: la animación CSS del path pisaría su atributo transform */}
        <g transform="translate(24 32)"><path className="spark" d={SPARK} style={{ animationDelay: "1.15s" }} /></g>
        <g transform="translate(180 44) scale(.8)"><path className="spark" d={SPARK} style={{ animationDelay: "1.25s" }} /></g>
        <g transform="translate(178 152) scale(.65)"><path className="spark" d={SPARK} style={{ animationDelay: "1.35s" }} /></g>
      </g>
    </svg>
  );
}

export default function Certificado({ loaderData }: Route.ComponentProps) {
  const { name, course, lessons, issuedAt } = loaderData;
  return (
    <main className="min-h-screen bg-brand-100 flex items-center justify-center px-4 py-8 sm:p-6 print:bg-white print:p-0">
      <style>{CERT_CSS}</style>
      <article className="w-full max-w-2xl border-4 border-black bg-white shadow-[8px_8px_0_0_#000] print:shadow-none overflow-hidden">
        <header className="bg-[#7c3aed] border-b-4 border-black px-5 sm:px-10 py-3 flex items-center justify-between gap-3 print:bg-[#7c3aed] [print-color-adjust:exact]">
          <p className="font-mono text-xs sm:text-sm text-white font-bold tracking-wide">Academia EasyBits</p>
          <span className="font-mono text-[11px] sm:text-xs font-bold bg-[#fbbf24] text-black border-2 border-black px-2 py-0.5 shadow-[3px_3px_0_0_#000] whitespace-nowrap">✓ certificado verificado</span>
        </header>

        <div className="px-5 sm:px-10 pt-6 sm:pt-8 pb-8 sm:pb-10">
          <div className="flex flex-col-reverse sm:flex-row sm:items-start gap-4 sm:gap-6">
            <div className="flex-1 min-w-0">
              <p className="font-mono text-xs uppercase tracking-widest text-iron">Se certifica que</p>
              <h1 className="text-4xl sm:text-5xl font-bold leading-tight mt-2 break-words">{name}</h1>
              <div className="h-1.5 w-24 bg-[#fbbf24] border-2 border-black mt-3" />
              <p className="text-lg sm:text-xl mt-4">completó la ruta <strong className="bg-[#fbbf24] px-1 border-b-2 border-black">{course.title}</strong></p>
            </div>
            <div className="w-32 h-32 sm:w-40 sm:h-40 shrink-0 self-center sm:self-start">
              <Seal />
            </div>
          </div>

          <p className="text-iron mt-5">{course.outcome}</p>

          <section className="mt-8 border-4 border-black bg-brand-100 p-4 sm:p-5 shadow-[5px_5px_0_0_#000] print:shadow-none">
            <h2 className="font-mono text-xs font-bold text-black uppercase tracking-widest">Lo que su cuenta demuestra</h2>
            <ul className="mt-3 space-y-2">
              {lessons.map((l, i) => (
                <li key={l.slug} className="cert-rise flex gap-3 items-start" style={{ animationDelay: `${1.2 + i * 0.08}s` }}>
                  <span aria-hidden className="mt-0.5 shrink-0 w-5 h-5 grid place-items-center bg-[#7c3aed] text-white text-xs font-bold border-2 border-black">✓</span>
                  <span className="min-w-0">{l.title}{l.verify ? <span className="text-iron text-sm"> · verificado por uso</span> : null}</span>
                </li>
              ))}
            </ul>
          </section>

          <div className="flex flex-wrap justify-between items-end gap-3 mt-8 pt-4 border-t-4 border-dashed border-black font-mono text-xs">
            <span>
              <span className="block text-iron uppercase tracking-widest text-[10px]">Fecha</span>
              <span className="font-bold text-sm">{issuedAt}</span>
            </span>
            <span className="text-right">
              <span className="block text-iron uppercase tracking-widest text-[10px]">Verifícalo en</span>
              <span className="font-bold text-sm">easybits.cloud/aprende</span>
            </span>
          </div>

          <p className="text-xs text-iron mt-6 print:hidden">
            Este certificado se recalcula cada vez que se abre: existe mientras la cuenta cumpla los hechos. <Link to="/aprende" className="underline font-bold text-[#7c3aed]">Haz el tuyo →</Link>
          </p>
        </div>
      </article>
    </main>
  );
}
