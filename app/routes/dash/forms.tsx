import { useState } from "react";
import { getUserOrRedirect } from "~/.server/getters";
import { db } from "~/.server/db";
import type { Route } from "./+types/forms";

export const meta = () => [
  { title: "Formularios — EasyBits" },
  { name: "robots", content: "noindex" },
];

export const loader = async ({ request }: Route.LoaderArgs) => {
  const user = await getUserOrRedirect(request);
  const forms = await db.formConfig.findMany({
    where: { ownerId: user.id },
    orderBy: { createdAt: "desc" },
  });
  const ids = forms.map((f) => f.id);
  const counts = ids.length
    ? await db.formSubmission.groupBy({
        by: ["formConfigId"],
        _count: true,
        where: { formConfigId: { in: ids } },
      })
    : [];
  const cmap = Object.fromEntries(counts.map((c) => [c.formConfigId, c._count]));
  return {
    forms: forms.map((f) => ({
      id: f.id,
      name: f.name,
      slug: f.slug,
      theme: f.theme,
      standalone: !f.websiteId && !f.landingId,
      fieldCount: Array.isArray(f.fields) ? (f.fields as unknown[]).length : 0,
      submissions: cmap[f.id] ?? 0,
      createdAt: f.createdAt.toISOString().slice(0, 10),
    })),
  };
};

const THEME_LABEL: Record<string, string> = {
  formal: "Formal",
  brutalista: "Brutalista",
  institucional: "Institucional",
  editorial: "Editorial",
};

export default function FormsPage({ loaderData }: Route.ComponentProps) {
  const { forms } = loaderData;
  const [copied, setCopied] = useState<string | null>(null);

  const copy = (url: string, id: string) => {
    navigator.clipboard?.writeText(url).then(() => {
      setCopied(id);
      setTimeout(() => setCopied((c) => (c === id ? null : c)), 1500);
    });
  };

  return (
    <main className="max-w-4xl mx-auto px-4 py-8">
      <header className="mb-6">
        <h1 className="text-3xl font-bold">Formularios</h1>
        <p className="text-gray-500 mt-1 text-sm">
          Formularios hospedados de captura. Crea uno con el agente (<code className="bg-gray-100 px-1 rounded">@ghosty</code>) o el{" "}
          <a href="/docs#forms" className="text-[#9870ED] underline">SDK</a>; las respuestas caen aquí y disparan el webhook{" "}
          <code className="bg-gray-100 px-1 rounded">form.submitted</code>.
        </p>
      </header>

      {forms.length === 0 ? (
        <div className="border-2 border-dashed border-gray-300 rounded-2xl p-10 text-center">
          <p className="font-semibold mb-1">Aún no tienes formularios</p>
          <p className="text-gray-500 text-sm">
            Pídele a tu agente “crea un formulario de contacto” o usa{" "}
            <code className="bg-gray-100 px-1 rounded">eb.createForm(...)</code> del SDK.
          </p>
        </div>
      ) : (
        <ul className="flex flex-col gap-3">
          {forms.map((f) => {
            const url = f.slug ? `https://www.easybits.cloud/f/${f.slug}` : null;
            return (
              <li key={f.id} className="border-2 border-black rounded-2xl p-4 bg-white flex flex-wrap items-center gap-x-4 gap-y-2 shadow-[3px_3px_0_#000]">
                <div className="flex-1 min-w-[220px]">
                  <div className="font-bold text-lg leading-tight">{f.name}</div>
                  <div className="flex items-center gap-2 mt-1 flex-wrap">
                    {f.theme ? (
                      <span className="text-[10px] font-mono uppercase tracking-wide bg-[#f4edfd] text-[#7c5ce0] border border-[#e8e2f4] rounded-full px-2 py-0.5">
                        {THEME_LABEL[f.theme] || f.theme}
                      </span>
                    ) : null}
                    <span className="text-[10px] font-mono uppercase tracking-wide text-gray-500 border border-gray-200 rounded-full px-2 py-0.5">
                      {f.standalone ? "Hospedado" : "Embebido"}
                    </span>
                    <span className="text-xs text-gray-400">{f.fieldCount} campos · {f.createdAt}</span>
                  </div>
                </div>

                <div className="text-center px-3">
                  <div className="text-2xl font-bold tabular-nums">{f.submissions}</div>
                  <div className="text-[10px] uppercase tracking-wide text-gray-400">respuestas</div>
                </div>

                {url ? (
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => copy(url, f.id)}
                      className="text-xs font-semibold border-2 border-black rounded-lg px-3 py-2 hover:bg-gray-50"
                    >
                      {copied === f.id ? "¡Copiado!" : "Copiar liga"}
                    </button>
                    <a
                      href={`/f/${f.slug}`}
                      target="_blank"
                      rel="noreferrer"
                      className="text-xs font-bold bg-[#9870ED] text-white border-2 border-black rounded-lg px-3 py-2 shadow-[2px_2px_0_#000] hover:brightness-105"
                    >
                      Abrir
                    </a>
                  </div>
                ) : (
                  <span className="text-xs text-gray-400 italic">en sitio/landing</span>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </main>
  );
}
