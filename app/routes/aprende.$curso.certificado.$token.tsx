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
  return { name, course: { title: course.title, outcome: course.outcome, slug: course.slug }, lessons: progress.lessons, issuedAt: issuedAt.toISOString().slice(0, 10), folio: params.token.replace(/[^a-zA-Z0-9]/g, "").slice(0, 10).toUpperCase() };
};

export const meta = ({ data: d }: Route.MetaArgs) =>
  getBasicMetaTags({
    title: `${d?.name ?? ""} completó ${d?.course.title ?? ""} — Academia EasyBits`,
    description: d?.course.outcome ?? "",
    url: `https://www.easybits.cloud/aprende/${d?.course.slug}`,
  });

// La serif sólo se usa en el título y el nombre; el cuerpo sigue con la fuente del sitio.
export const links: Route.LinksFunction = () => [
  { rel: "stylesheet", href: "https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,500;0,600;1,500&display=swap" },
];

const SERIF = { fontFamily: '"Cormorant Garamond", Georgia, "Times New Roman", serif' };

// Borde festoneado del sello: 60 ondas finas alrededor de (80,80).
const SCALLOP = (() => {
  const pts: string[] = [];
  for (let i = 0; i <= 240; i++) {
    const a = (Math.PI * 2 * i) / 240;
    const r = 74 + 2.2 * Math.cos(a * 60);
    pts.push(`${(80 + r * Math.cos(a)).toFixed(2)},${(80 + r * Math.sin(a)).toFixed(2)}`);
  }
  return `M${pts.join("L")}Z`;
})();

// Guilloché de esquina: 14 elipses finas girando sobre el mismo centro.
function Guilloche({ className }: { className: string }) {
  return (
    <svg viewBox="0 0 80 80" aria-hidden className={`cert-corner absolute w-14 h-14 sm:w-20 sm:h-20 ${className}`}>
      <g fill="none" stroke="#9870ED" strokeWidth=".6" opacity=".55">
        {Array.from({ length: 14 }, (_, i) => (
          <ellipse key={i} cx="40" cy="40" rx="30" ry="11" transform={`rotate(${(180 / 14) * i} 40 40)`} />
        ))}
        <circle cx="40" cy="40" r="6" />
      </g>
    </svg>
  );
}

// Animación sobria y de una sola vez: el sello aparece y sus anillos se trazan.
const CERT_CSS = `
.cert-seal{animation:cert-in .7s ease-out .15s both}
.cert-seal .ring{stroke-dasharray:1;stroke-dashoffset:0;animation:cert-draw 1.4s ease-in-out .3s both}
.cert-seal .ring-2{animation-delay:.5s}
.cert-seal .seal-text{animation:cert-fade .6s ease-out 1.2s both}
.cert-corner{animation:cert-fade 1s ease-out .2s both}
@keyframes cert-in{from{opacity:0;transform:scale(.96)}to{opacity:1;transform:none}}
@keyframes cert-draw{from{stroke-dashoffset:1}to{stroke-dashoffset:0}}
@keyframes cert-fade{from{opacity:0}to{opacity:1}}
@media (prefers-reduced-motion: reduce){.cert-seal,.cert-seal *,.cert-corner{animation:none}}
@media print{.cert-seal,.cert-seal *,.cert-corner{animation:none}@page{size:landscape;margin:10mm}}
`;

function Seal({ date }: { date: string }) {
  return (
    <svg viewBox="0 0 160 160" className="cert-seal w-32 h-32 sm:w-36 sm:h-36" role="img" aria-label={`Sello EasyBits verificado, ${date}`}>
      <defs>
        <path id="cert-seal-arc" d="M80,80 m-55,0 a55,55 0 1,1 110,0 a55,55 0 1,1 -110,0" />
      </defs>
      <path className="ring" pathLength={1} d={SCALLOP} fill="#fff" stroke="#9870ED" strokeWidth="1.2" />
      <circle className="ring ring-2" pathLength={1} cx="80" cy="80" r="67" fill="none" stroke="#9870ED" strokeWidth=".8" />
      <circle className="ring ring-2" pathLength={1} cx="80" cy="80" r="44" fill="none" stroke="#9870ED" strokeWidth=".8" />
      <circle className="ring" pathLength={1} cx="80" cy="80" r="40" fill="none" stroke="#ECD66E" strokeWidth="1.6" />
      <g className="seal-text">
        <text fill="#9870ED" fontSize="9" fontWeight="600" style={{ fontFamily: "ui-monospace, monospace" }}>
          <textPath href="#cert-seal-arc" textLength="340" lengthAdjust="spacing">EASYBITS · VERIFICADO · {date} ·</textPath>
        </text>
        <circle cx="80" cy="80" r="34" fill="#9870ED" />
        <path d="M66,81 L76,91 L95,70" fill="none" stroke="#fff" strokeWidth="5" strokeLinecap="round" strokeLinejoin="round" />
      </g>
    </svg>
  );
}

function longDate(iso: string) {
  return new Date(`${iso}T12:00:00Z`).toLocaleDateString("es-MX", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });
}

export default function Certificado({ loaderData }: Route.ComponentProps) {
  const { name, course, lessons, issuedAt, folio } = loaderData;
  return (
    <main className="min-h-screen bg-brand-100 flex items-center justify-center px-3 py-8 sm:p-8 print:bg-white print:p-0 print:min-h-0">
      <style>{CERT_CSS}</style>
      <article className="relative w-full max-w-4xl bg-white border-[5px] border-double border-[#1c1b22] p-2 sm:p-3 print:max-w-none">
        <div className="relative border border-[#9870ED]/50 px-5 pt-10 pb-16 sm:px-16 sm:py-14 print:py-8 text-center">
          <Guilloche className="top-1.5 left-1.5" />
          <Guilloche className="top-1.5 right-1.5" />
          <Guilloche className="bottom-1.5 left-1.5" />
          <Guilloche className="bottom-1.5 right-1.5" />

          {/* Marca oficial (public/brand): isotipo de ojitos + wordmark. No se recrea a mano. */}
          <div className="flex flex-col items-center gap-2">
            <img src="/brand/isotipo.svg" alt="" className="h-10 sm:h-12" />
            <div className="flex items-center gap-2">
              <img src="/brand/wordmark.svg" alt="EasyBits" className="h-5 sm:h-6" />
              <span className="text-[11px] sm:text-xs font-semibold uppercase tracking-[0.3em] text-[#9870ED]">Academia</span>
            </div>
          </div>
          <p className="mt-4 text-2xl sm:text-3xl tracking-wide text-[#1c1b22]" style={SERIF}>Certificado de finalización</p>
          <p className="mt-6 sm:mt-8 text-sm italic text-iron">Se certifica que</p>
          <h1 className="mt-2 text-4xl sm:text-6xl font-semibold leading-tight text-[#1c1b22] break-words" style={SERIF}>{name}</h1>
          <div className="mx-auto mt-3 h-px w-48 sm:w-80 bg-[#1c1b22]" />
          <p className="mt-5 text-base sm:text-lg text-[#1c1b22]">completó la ruta <strong className="font-semibold">{course.title}</strong></p>
          <p className="mx-auto mt-3 max-w-xl text-sm sm:text-base text-iron">{course.outcome}</p>

          <section className="mx-auto mt-8 sm:mt-10 max-w-2xl text-left">
            <h2 className="text-center text-[11px] font-semibold uppercase tracking-[0.25em] text-iron">Competencias verificadas</h2>
            <ul className="mt-4 grid gap-x-10 gap-y-2 sm:grid-cols-2 text-sm text-[#1c1b22]">
              {lessons.map((l) => (
                <li key={l.slug} className="flex gap-2 items-start">
                  <svg viewBox="0 0 12 12" aria-hidden className="mt-1 w-3 h-3 shrink-0"><path d="M2,6.5 L5,9.2 L10,3" fill="none" stroke="#9870ED" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" /></svg>
                  <span className="min-w-0">{l.title}{l.verify ? <span className="text-iron/70 text-xs"> · verificado por uso</span> : null}</span>
                </li>
              ))}
            </ul>
          </section>

          <div className="mt-10 grid gap-6 sm:grid-cols-3 items-end text-xs text-iron">
            <div className="order-2 sm:order-1">
              <p className="text-sm text-[#1c1b22]">{longDate(issuedAt)}</p>
              <div className="mx-auto mt-1 h-px w-40 bg-[#1c1b22]/60" />
              <p className="mt-1 uppercase tracking-[0.2em] text-[10px]">Fecha de emisión</p>
            </div>
            <div className="order-1 sm:order-2 flex justify-center"><Seal date={issuedAt} /></div>
            <div className="order-3">
              <div className="flex h-7 items-end justify-center gap-1.5">
                <img src="/brand/wordmark.svg" alt="EasyBits" className="h-5" />
                <span className="text-lg italic leading-none text-[#1c1b22]" style={SERIF}>Academia</span>
              </div>
              <div className="mx-auto mt-1 h-px w-40 bg-[#1c1b22]/60" />
              <p className="mt-1 text-[10px] uppercase tracking-[0.2em]">Verificable en easybits.cloud/aprende</p>
            </div>
          </div>

          <p className="mt-8 font-mono text-[10px] tracking-widest text-iron/80">FOLIO {folio}</p>
          <p className="mx-auto mt-2 max-w-lg text-[11px] text-iron/80 print:hidden">
            Este certificado se recalcula cada vez que se abre: existe mientras la cuenta cumpla los hechos. <Link to="/aprende" className="underline text-[#9870ED]">Haz el tuyo →</Link>
          </p>
        </div>
      </article>
    </main>
  );
}
