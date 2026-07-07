import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Route } from "./+types/f.$slug";
import { db } from "~/.server/db";
import { FlipLetters } from "~/components/animated/FlipLetters";

/** Field shape as returned by the loader (subset of the server FormField). */
type RawField = {
  name: string;
  type: string;
  label: string;
  required?: boolean;
  placeholder?: string | null;
  options?: string[] | null;
  showIf?: { field: string; equals: string } | null;
  accept?: string | null;
};

/** Single-condition showIf — mirrors isFieldVisible in formOperations (kept local
 *  so this client route never imports a `.server` module value). */
function fieldVisible(field: { showIf?: { field: string; equals: string } | null }, data: Record<string, unknown>): boolean {
  if (!field.showIf) return true;
  const dep = data[field.showIf.field];
  return typeof dep === "string" && dep === field.showIf.equals;
}

export function meta({ data }: Route.MetaArgs) {
  return [{ title: data?.name ? `${data.name} — EasyBits Forms` : "Formulario" }];
}

export async function loader({ params }: Route.LoaderArgs) {
  const form = await db.formConfig.findFirst({ where: { slug: params.slug } });
  if (!form) {
    throw new Response("Formulario no encontrado", { status: 404 });
  }
  const fields = (form.fields as unknown as RawField[]).map((f) => ({
    name: f.name,
    type: f.type,
    label: f.label,
    required: !!f.required,
    placeholder: f.placeholder ?? null,
    options: f.options ?? null,
    showIf: f.showIf ?? null,
    accept: f.accept ?? null,
  }));
  return {
    formId: form.id,
    name: form.name,
    theme: form.theme || "formal",
    successMessage: form.successMessage,
    fields,
  };
}

type LoadedField = Awaited<ReturnType<typeof loader>>["fields"][number];

const STEP_SIZE = 5;

export default function HostedForm({ loaderData }: Route.ComponentProps) {
  const { formId, name, theme, successMessage, fields } = loaderData;
  const storageKey = `ebform:${formId}`;

  const [values, setValues] = useState<Record<string, string>>({});
  const [fileMeta, setFileMeta] = useState<Record<string, { name: string; uploading?: boolean }>>({});
  const [step, setStep] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const restored = useRef(false);

  // Restore saved progress (save & resume).
  useEffect(() => {
    try {
      const raw = localStorage.getItem(storageKey);
      if (raw) {
        const saved = JSON.parse(raw);
        if (saved && typeof saved === "object") {
          setValues(saved.values || {});
          setFileMeta(saved.fileMeta || {});
          if (typeof saved.step === "number") setStep(saved.step);
        }
      }
    } catch {
      /* ignore */
    }
    restored.current = true;
  }, [storageKey]);

  // Persist progress on every change (after the initial restore).
  useEffect(() => {
    if (!restored.current || done) return;
    try {
      localStorage.setItem(storageKey, JSON.stringify({ values, fileMeta, step }));
    } catch {
      /* ignore */
    }
  }, [values, fileMeta, step, done, storageKey]);

  const isVisible = useCallback(
    (f: LoadedField) => fieldVisible(f, values),
    [values]
  );

  const steps = useMemo(() => {
    const chunks: LoadedField[][] = [];
    for (let i = 0; i < fields.length; i += STEP_SIZE) {
      chunks.push(fields.slice(i, i + STEP_SIZE));
    }
    return chunks.length ? chunks : [[]];
  }, [fields]);

  const totalSteps = steps.length;
  const currentFields = steps[step] || [];

  // Progress = share of visible required fields answered across the whole form.
  const progress = useMemo(() => {
    const req = fields.filter((f) => f.required && isVisible(f));
    if (!req.length) return Math.round(((step + 1) / totalSteps) * 100);
    const filled = req.filter((f) => (values[f.name] || "").trim()).length;
    return Math.round((filled / req.length) * 100);
  }, [fields, values, isVisible, step, totalSteps]);

  const setVal = (nameKey: string, v: string) =>
    setValues((prev) => ({ ...prev, [nameKey]: v }));

  const stepValid = () =>
    currentFields.every(
      (f) => !f.required || !isVisible(f) || (values[f.name] || "").trim()
    );

  async function onFile(f: LoadedField, file: File | null) {
    if (!file) return;
    setFileMeta((m) => ({ ...m, [f.name]: { name: file.name, uploading: true } }));
    setErrors((e) => ({ ...e, [f.name]: "" }));
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch(`/api/v2/forms/${formId}/upload`, { method: "POST", body: fd });
      const d = await res.json();
      if (!res.ok || !d.ok) throw new Error(d.error || "Error al subir");
      setVal(f.name, d.fileId);
      setFileMeta((m) => ({ ...m, [f.name]: { name: d.name || file.name } }));
    } catch (err) {
      setFileMeta((m) => {
        const n = { ...m };
        delete n[f.name];
        return n;
      });
      setErrors((e) => ({ ...e, [f.name]: err instanceof Error ? err.message : "Error al subir" }));
    }
  }

  async function submit() {
    setSubmitting(true);
    setErrors({});
    try {
      const res = await fetch(`/api/v2/forms/${formId}/submit`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(values),
      });
      const d = await res.json();
      if (!res.ok || !d.ok) {
        if (d.errors) setErrors(d.errors);
        setSubmitting(false);
        return;
      }
      try {
        localStorage.removeItem(storageKey);
      } catch {
        /* ignore */
      }
      setDone(true);
      if (d.deliveryUrl) window.location.href = d.deliveryUrl;
    } catch {
      setErrors({ _form: "No se pudo enviar. Revisa tu conexión e intenta de nuevo." });
      setSubmitting(false);
    }
  }

  const isLast = step === totalSteps - 1;

  return (
    <div className="eb-form-root" data-theme={theme}>
      <style dangerouslySetInnerHTML={{ __html: FORM_CSS }} />
      <div className="wrap">
        <div className="brand">
          <img src="/logo-purple.svg" alt="EasyBits" className="ebmark" />
          <FlipLetters word="EasyBits" type="light" />
        </div>

        {done ? (
          <div className="sheet done">
            <div className="check">✓</div>
            <h1>{successMessage}</h1>
            <p className="muted">Tus respuestas se guardaron correctamente.</p>
          </div>
        ) : (
          <div className="sheet">
            <div className="sheet-head">
              <h1>{name}</h1>
              <div className="progress">
                <div className="pbar">
                  <span style={{ width: `${progress}%` }} />
                </div>
                <span className="pmeta">
                  Paso {step + 1} de {totalSteps} · {progress}%
                </span>
              </div>
            </div>

            <div className="body">
              {currentFields.map((f, i) =>
                isVisible(f) ? (
                  <FieldView
                    key={f.name}
                    field={f}
                    index={step * STEP_SIZE + i}
                    value={values[f.name] || ""}
                    error={errors[f.name]}
                    fileMeta={fileMeta[f.name]}
                    onChange={(v) => setVal(f.name, v)}
                    onFile={(file) => onFile(f, file)}
                  />
                ) : null
              )}
            </div>

            {errors._form ? <p className="formerr">{errors._form}</p> : null}

            <div className="foot">
              {step > 0 ? (
                <button className="btn ghost" onClick={() => setStep((s) => s - 1)} disabled={submitting}>
                  Atrás
                </button>
              ) : (
                <span />
              )}
              {isLast ? (
                <button className="btn cta" onClick={submit} disabled={submitting || !stepValid()}>
                  {submitting ? "Enviando…" : "Enviar respuestas"}
                </button>
              ) : (
                <button className="btn cta" onClick={() => setStep((s) => s + 1)} disabled={!stepValid()}>
                  Continuar
                </button>
              )}
            </div>
          </div>
        )}
        <div className="powered">Powered by formmy.app</div>
      </div>
    </div>
  );
}

function FieldView({
  field,
  index,
  value,
  error,
  fileMeta,
  onChange,
  onFile,
}: {
  field: LoadedField;
  index: number;
  value: string;
  error?: string;
  fileMeta?: { name: string; uploading?: boolean };
  onChange: (v: string) => void;
  onFile: (f: File | null) => void;
}) {
  const n = String(index + 1).padStart(2, "0");
  const req = field.required ? <span className="req" title="Obligatorio">✳</span> : null;
  const opts = field.options || [];

  let control: React.ReactNode = null;
  if (field.type === "textarea") {
    control = (
      <textarea value={value} placeholder={field.placeholder || ""} onChange={(e) => onChange(e.target.value)} />
    );
  } else if (field.type === "select") {
    control = (
      <select value={value} onChange={(e) => onChange(e.target.value)}>
        <option value="">Selecciona…</option>
        {opts.map((o) => (
          <option key={o} value={o}>
            {o}
          </option>
        ))}
      </select>
    );
  } else if (field.type === "radio") {
    const choices = opts.length ? opts : ["Sí", "No"];
    control = (
      <div className="yn">
        {choices.map((o) => (
          <label key={o} className={value === o ? "on" : ""}>
            <input
              type="radio"
              name={field.name}
              checked={value === o}
              onChange={() => onChange(o)}
            />
            <span>{o}</span>
          </label>
        ))}
      </div>
    );
  } else if (field.type === "checkbox") {
    control = (
      <label className="consent">
        <input type="checkbox" checked={value === "true"} onChange={(e) => onChange(e.target.checked ? "true" : "")} />
        <span>{field.placeholder || "Acepto"}</span>
      </label>
    );
  } else if (field.type === "file") {
    control = (
      <label className="filedrop">
        <input
          type="file"
          accept={field.accept || undefined}
          onChange={(e) => onFile(e.target.files?.[0] || null)}
        />
        <span className="fdinner">
          {fileMeta?.uploading
            ? "Subiendo…"
            : fileMeta?.name
              ? `📎 ${fileMeta.name}`
              : "Arrastra o haz clic para subir"}
        </span>
        {field.accept ? <span className="fdhint">{field.accept}</span> : null}
      </label>
    );
  } else {
    const t = field.type === "email" ? "email" : field.type === "tel" ? "tel" : field.type === "number" ? "number" : field.type === "date" ? "date" : "text";
    control = (
      <input type={t} value={value} placeholder={field.placeholder || ""} onChange={(e) => onChange(e.target.value)} />
    );
  }

  return (
    <div className={`q${error ? " has-error" : ""}`}>
      <div className="qlabel">
        <span className="n">{n}</span>
        <span>
          {field.label} {req}
        </span>
      </div>
      <div className="control">{control}</div>
      {error ? <div className="err">{error}</div> : null}
    </div>
  );
}

const FORM_CSS = String.raw`
.eb-form-root{--paper:#f9f9f9;--panel:#fff;--ink:#1a1a1a;--muted:#6b6575;--hair:#e8e2f4;--accent:#9870ED;--accent-ink:#7c5ce0;--accent-tint:#f4edfd;--req:#c2410c;--ok:#15803d;--border-w:2px;--border-col:#1a1a1a;--radius:2px;--shadow:3px 3px 0 #1a1a1a;--head-font:"Helvetica Neue",ui-sans-serif,system-ui,sans-serif;--head-weight:800;--card-gap:14px;color-scheme:light;min-height:100vh;background:var(--paper);color:var(--ink);font:15px/1.55 ui-sans-serif,system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;-webkit-font-smoothing:antialiased}
.eb-form-root *{box-sizing:border-box}
/* Formal (default): hairline, soft, serif headings, airy */
.eb-form-root[data-theme="formal"]{--border-w:1px;--border-col:var(--hair);--radius:8px;--shadow:0 1px 3px rgba(26,23,32,.08),0 8px 24px rgba(26,23,32,.05);--head-font:"Iowan Old Style","Palatino Linotype",Palatino,Georgia,ui-serif,serif;--head-weight:600;--card-gap:18px}
/* Brutalista discreto: EasyBits ink border + hard shadow */
.eb-form-root[data-theme="brutalista"]{--border-w:2px;--border-col:#1a1a1a;--radius:2px;--shadow:3px 3px 0 #1a1a1a;--head-font:"Helvetica Neue",ui-sans-serif,system-ui,sans-serif;--head-weight:800}
/* Institucional: banded header, sober sans, corporate */
.eb-form-root[data-theme="institucional"]{--border-w:1px;--border-col:#d8d3e4;--radius:4px;--shadow:0 1px 2px rgba(26,23,32,.06);--head-font:"Georgia",ui-serif,serif;--head-weight:700;--card-gap:16px}
/* Editorial: serif display, magazine air */
.eb-form-root[data-theme="editorial"]{--border-w:1px;--border-col:#1a1a1a;--radius:0;--shadow:none;--head-font:"Iowan Old Style",Georgia,ui-serif,serif;--head-weight:700;--card-gap:20px}
.eb-form-root .wrap{max-width:640px;margin:0 auto;padding:34px 20px 60px}
.eb-form-root .brand{display:flex;align-items:center;gap:4px;margin-bottom:2px}
.eb-form-root .ebmark{width:40px;height:auto;flex:none}
.eb-form-root .sheet{background:var(--panel);border:var(--border-w) solid var(--border-col);border-radius:var(--radius);box-shadow:var(--shadow);overflow:hidden}
.eb-form-root[data-theme="institucional"] .sheet-head{background:var(--accent-tint);border-bottom:2px solid var(--accent)}
.eb-form-root .sheet-head{padding:24px 28px 20px;border-bottom:var(--border-w) solid var(--border-col)}
.eb-form-root[data-theme="formal"] .sheet-head{border-bottom:1px solid var(--hair)}
.eb-form-root .sheet-head h1{font-family:var(--head-font);font-weight:var(--head-weight);letter-spacing:-.01em;text-wrap:balance;font-size:25px;line-height:1.15;margin:0 0 14px}
.eb-form-root .progress{display:flex;align-items:center;gap:12px}
.eb-form-root .pbar{flex:1;height:8px;background:var(--hair);border-radius:99px;overflow:hidden}
.eb-form-root .pbar span{display:block;height:100%;background:var(--accent);transition:width .3s ease}
.eb-form-root .pmeta{font:600 12px/1 ui-monospace,monospace;color:var(--muted);white-space:nowrap}
.eb-form-root .body{padding:22px 28px 6px;display:flex;flex-direction:column;gap:var(--card-gap)}
.eb-form-root .q{border:var(--border-w) solid var(--border-col);border-radius:var(--radius);padding:15px 16px;background:var(--paper)}
.eb-form-root[data-theme="formal"] .q,.eb-form-root[data-theme="institucional"] .q{background:var(--panel);border-color:var(--hair)}
.eb-form-root .q:focus-within{border-color:var(--accent)}
.eb-form-root .q.has-error{border-color:var(--req)}
.eb-form-root .qlabel{font-weight:650;font-size:14.5px;display:flex;gap:8px;align-items:baseline}
.eb-form-root .n{font:700 12px/1 ui-monospace,monospace;color:var(--accent-ink);flex:none}
.eb-form-root[data-theme="editorial"] .n{font-family:var(--head-font);font-size:15px}
.eb-form-root .req{color:var(--req);font-weight:700}
.eb-form-root .control{margin-top:10px}
.eb-form-root input[type=text],.eb-form-root input[type=email],.eb-form-root input[type=tel],.eb-form-root input[type=number],.eb-form-root input[type=date],.eb-form-root select,.eb-form-root textarea{width:100%;font:14px/1.4 ui-sans-serif,system-ui;color:var(--ink);background:var(--panel);border:1.5px solid var(--hair);border-radius:calc(var(--radius) + 2px);padding:10px 12px;outline:none;transition:border-color .12s,box-shadow .12s}
.eb-form-root textarea{resize:vertical;min-height:76px}
.eb-form-root input:focus,.eb-form-root select:focus,.eb-form-root textarea:focus{border-color:var(--accent);box-shadow:0 0 0 3px color-mix(in srgb,var(--accent) 22%,transparent)}
.eb-form-root .yn{display:flex;gap:10px;flex-wrap:wrap}
.eb-form-root .yn label{flex:1;min-width:88px;text-align:center;cursor:pointer;border:1.5px solid var(--hair);border-radius:calc(var(--radius) + 2px);padding:10px;font-weight:650;font-size:13.5px;color:var(--muted);transition:all .12s}
.eb-form-root .yn label.on{background:var(--accent);border-color:var(--accent);color:#fff}
.eb-form-root .yn input{position:absolute;opacity:0;pointer-events:none}
.eb-form-root .yn label:hover{border-color:var(--accent)}
.eb-form-root .consent{display:flex;gap:10px;align-items:flex-start;cursor:pointer;font-size:14px;color:var(--ink)}
.eb-form-root .consent input{margin-top:3px;width:18px;height:18px;accent-color:var(--accent)}
.eb-form-root .filedrop{display:flex;flex-direction:column;gap:4px;align-items:center;justify-content:center;text-align:center;cursor:pointer;border:1.5px dashed var(--accent);border-radius:calc(var(--radius) + 2px);padding:18px;background:var(--accent-tint);color:var(--accent-ink);font-weight:600;font-size:13.5px}
.eb-form-root .filedrop input{position:absolute;opacity:0;width:0;height:0}
.eb-form-root .fdhint{font:500 11px/1 ui-monospace,monospace;color:var(--muted);letter-spacing:.04em}
.eb-form-root .err{color:var(--req);font-size:12.5px;margin-top:7px;font-weight:600}
.eb-form-root .formerr{color:var(--req);text-align:center;padding:0 28px;font-weight:600;font-size:13.5px}
.eb-form-root .foot{padding:20px 28px 24px;display:flex;align-items:center;justify-content:space-between;gap:12px}
.eb-form-root .btn{appearance:none;cursor:pointer;font:700 14px/1 ui-sans-serif,system-ui;border-radius:var(--radius);padding:13px 22px;transition:transform .1s,box-shadow .1s,opacity .1s}
.eb-form-root .btn:disabled{opacity:.5;cursor:not-allowed}
.eb-form-root .btn.ghost{background:transparent;border:var(--border-w) solid var(--border-col);color:var(--muted)}
.eb-form-root .btn.cta{background:var(--accent);color:#fff;border:var(--border-w) solid var(--border-col);box-shadow:var(--shadow)}
.eb-form-root[data-theme="formal"] .btn.cta,.eb-form-root[data-theme="institucional"] .btn.cta{box-shadow:none}
.eb-form-root .btn.cta:not(:disabled):active{transform:translate(2px,2px);box-shadow:none}
.eb-form-root .powered{margin-top:24px;text-align:center;font:500 11.5px/1 ui-monospace,monospace;letter-spacing:.06em;color:var(--muted)}
.eb-form-root .sheet.done{padding:48px 30px;text-align:center}
.eb-form-root .sheet.done .check{width:56px;height:56px;margin:0 auto 18px;border-radius:50%;background:var(--ok);color:#fff;display:flex;align-items:center;justify-content:center;font-size:28px;font-weight:800}
.eb-form-root .sheet.done h1{font-family:var(--head-font);font-weight:var(--head-weight);font-size:22px;margin:0 0 8px;text-wrap:balance}
.eb-form-root .muted{color:var(--muted)}
@media (prefers-reduced-motion:reduce){.eb-form-root *{transition:none!important}}
`;
