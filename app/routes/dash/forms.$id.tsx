import { getUserOrRedirect } from "~/.server/getters";
import { db } from "~/.server/db";
import type { Route } from "./+types/forms.$id";

export const meta = () => [
  { title: "Respuestas — EasyBits" },
  { name: "robots", content: "noindex" },
];

type Field = {
  name: string;
  type: string;
  label: string;
  options?: string[] | null;
  rows?: string[] | null;
};

export const loader = async ({ request, params }: Route.LoaderArgs) => {
  const user = await getUserOrRedirect(request);
  const form = await db.formConfig.findUnique({ where: { id: params.id } });
  if (!form || form.ownerId !== user.id) {
    throw new Response("Formulario no encontrado", { status: 404 });
  }
  const submissions = await db.formSubmission.findMany({
    where: { formConfigId: form.id },
    orderBy: { createdAt: "desc" },
    take: 200,
  });
  return {
    form: {
      id: form.id,
      name: form.name,
      slug: form.slug,
      fields: (form.fields as unknown as Field[]).map((f) => ({
        name: f.name,
        type: f.type,
        label: f.label,
        options: f.options ?? null,
        rows: f.rows ?? null,
      })),
    },
    submissions: submissions.map((s) => ({
      id: s.id,
      data: s.data as Record<string, string>,
      createdAt: s.createdAt.toISOString(),
    })),
  };
};

function parseMatrix(v: string): Record<string, string> {
  try {
    const o = JSON.parse(v);
    return o && typeof o === "object" ? o : {};
  } catch {
    return {};
  }
}

function fmtDate(iso: string) {
  const d = new Date(iso);
  return d.toLocaleString("es-MX", { dateStyle: "medium", timeStyle: "short" });
}

// Flatten one submission to a flat {colKey: value} for CSV.
function flatten(fields: Field[], data: Record<string, string>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const f of fields) {
    const v = data[f.name] ?? "";
    if (f.type === "matrix") {
      const sel = parseMatrix(v);
      for (const row of f.rows || []) out[`${f.label} — ${row}`] = sel[row] || "";
    } else if (f.type === "checkbox") {
      out[f.label] = v === "true" ? "Sí" : "";
    } else {
      out[f.label] = v;
    }
  }
  return out;
}

export default function FormResponses({ loaderData }: Route.ComponentProps) {
  const { form, submissions } = loaderData;

  const downloadCsv = () => {
    if (!submissions.length) return;
    const rows = submissions.map((s) => ({ Fecha: fmtDate(s.createdAt), ...flatten(form.fields, s.data) }));
    const cols = Array.from(rows.reduce((set, r) => { Object.keys(r).forEach((k) => set.add(k)); return set; }, new Set<string>()));
    const esc = (v: string) => `"${String(v ?? "").replace(/"/g, '""')}"`;
    const csv = [cols.map(esc).join(","), ...rows.map((r) => cols.map((c) => esc((r as Record<string, string>)[c] || "")).join(","))].join("\n");
    const blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `${form.slug || form.id}-respuestas.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  return (
    <main className="max-w-3xl mx-auto px-4 py-8">
      <header className="mb-6 flex items-start justify-between gap-4 flex-wrap">
        <div>
          <a href="/dash/forms" className="text-xs text-gray-400 hover:text-[#9870ED]">← Formularios</a>
          <h1 className="text-2xl font-bold mt-1">{form.name}</h1>
          <p className="text-gray-500 text-sm">{submissions.length} respuesta{submissions.length === 1 ? "" : "s"}</p>
        </div>
        {submissions.length > 0 && (
          <button onClick={downloadCsv} className="text-xs font-bold border-2 border-black rounded-lg px-3 py-2 shadow-[2px_2px_0_#000] hover:bg-gray-50">
            Descargar CSV
          </button>
        )}
      </header>

      {submissions.length === 0 ? (
        <div className="border-2 border-dashed border-gray-300 rounded-2xl p-10 text-center text-gray-500 text-sm">
          Aún no hay respuestas. Comparte la liga del formulario.
        </div>
      ) : (
        <div className="flex flex-col gap-5">
          {submissions.map((s, i) => (
            <section key={s.id} className="border-2 border-black rounded-2xl overflow-hidden shadow-[3px_3px_0_#000]">
              <div className="bg-[#f4edfd] px-4 py-2 flex items-center justify-between">
                <span className="font-bold text-sm">Respuesta #{submissions.length - i}</span>
                <span className="text-xs text-gray-500 font-mono">{fmtDate(s.createdAt)}</span>
              </div>
              <dl className="divide-y divide-gray-100">
                {form.fields.map((f) => (
                  <div key={f.name} className="px-4 py-3 grid grid-cols-1 sm:grid-cols-[200px_1fr] gap-1 sm:gap-4">
                    <dt className="text-xs font-semibold text-gray-500 leading-snug">{f.label}</dt>
                    <dd className="text-sm">{renderValue(f, s.data[f.name] || "")}</dd>
                  </div>
                ))}
              </dl>
            </section>
          ))}
        </div>
      )}
    </main>
  );
}

function renderValue(field: Field, value: string) {
  if (field.type === "matrix") {
    const sel = parseMatrix(value);
    const rows = field.rows || [];
    const answered = rows.filter((r) => sel[r]).length;
    return (
      <div className="border border-gray-200 rounded-lg overflow-hidden">
        <div className="text-[10px] uppercase tracking-wide text-gray-400 px-3 py-1 bg-gray-50">
          {answered}/{rows.length} respondidas
        </div>
        <table className="w-full text-xs">
          <tbody>
            {rows.map((r) => (
              <tr key={r} className="border-t border-gray-100">
                <td className="px-3 py-1.5 text-gray-700">{r}</td>
                <td className={`px-3 py-1.5 text-right font-semibold ${sel[r] ? "text-[#7c5ce0]" : "text-gray-300"}`}>
                  {sel[r] || "—"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  }
  if (field.type === "checkbox") {
    return <span className={value === "true" ? "text-[#15803d] font-semibold" : "text-gray-400"}>{value === "true" ? "Sí" : "—"}</span>;
  }
  if (field.type === "file") {
    return value ? <span className="text-[#7c5ce0]">📎 archivo adjunto</span> : <span className="text-gray-300">—</span>;
  }
  return value ? <span className="whitespace-pre-wrap">{value}</span> : <span className="text-gray-300">—</span>;
}
