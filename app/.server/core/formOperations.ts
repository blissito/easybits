import { db } from "../db";
import { sqldQuery, sqldCreateNamespace } from "../sqld";
import { dispatchWebhooks } from "../webhooks";
import type { AuthContext } from "../apiAuth";
import { requireScope } from "../apiAuth";
import { getSesTransport } from "../emails/sendgridTransport";
import { getPlatformDefaultClient, getReadClientForPlatformFile } from "../storage";
import { nanoid } from "nanoid";

export type FormFieldType =
  | "text"
  | "email"
  | "tel"
  | "textarea"
  | "select"
  | "date"
  | "number"
  | "checkbox" // consent / boolean — stored "true"/""
  | "radio" // single choice from options (or Sí/No if none)
  | "file" // uploaded via /api/v2/forms/:id/upload → value is the fileId
  | "matrix"; // grid: rows × columns (options), one choice per row. Value = JSON {row: choice}

export interface FormField {
  name: string;
  type: FormFieldType;
  label: string;
  required?: boolean;
  placeholder?: string;
  options?: string[];
  /** Show this field only when another field currently equals `equals`. */
  showIf?: { field: string; equals: string };
  /** For `file`: accepted MIME/extension hint shown to the user (e.g. ".pdf,image/*"). */
  accept?: string;
  /** For `matrix`: the row labels. Columns come from `options`. Value is a JSON
   *  object string mapping each row label to the chosen column. */
  rows?: string[];
  /** Section this field belongs to. Consecutive fields sharing a section render
   *  as one step in the hosted form (with the section name as the step title). */
  section?: string;
}

/** Whether a field is visible given the current answers (single-condition showIf). */
export function isFieldVisible(field: FormField, data: Record<string, unknown>): boolean {
  if (!field.showIf) return true;
  const dep = data[field.showIf.field];
  return typeof dep === "string" && dep === field.showIf.equals;
}

// ─── MCP: Create form config ───────────────────────────────────
export async function createFormConfig(
  ctx: AuthContext,
  opts: {
    websiteId?: string; // raw-HTML Website, OR...
    landingId?: string; // ...a Landing (editor landings/documents), OR...
    standalone?: boolean; // ...neither → hosted at /f/:slug
    slug?: string; // hosted slug (standalone only); auto-derived from name if omitted
    theme?: string; // hosted template: formal | brutalista | institucional | editorial
    name?: string;
    fields: FormField[];
    submitLabel?: string;
    successMessage?: string;
    deliveryUrl?: string;
    dbId?: string;
    tableName?: string;
  }
) {
  requireScope(ctx, "WRITE");

  // A form lives on a website OR a landing OR standalone (hosted at /f/:slug).
  // At most one parent — never both.
  if (opts.websiteId && opts.landingId) {
    throw new Response(
      JSON.stringify({ error: "Provide at most one of websiteId or landingId" }),
      { status: 400, headers: { "Content-Type": "application/json" } }
    );
  }
  const isStandalone = !opts.websiteId && !opts.landingId;

  // Validate parent belongs to user
  if (opts.websiteId) {
    const website = await db.website.findUnique({ where: { id: opts.websiteId } });
    if (!website || website.ownerId !== ctx.user.id) {
      throw new Response(JSON.stringify({ error: "Website not found" }), {
        status: 404,
        headers: { "Content-Type": "application/json" },
      });
    }
  } else if (opts.landingId) {
    const landing = await db.landing.findUnique({ where: { id: opts.landingId } });
    if (!landing || landing.ownerId !== ctx.user.id) {
      throw new Response(JSON.stringify({ error: "Landing not found" }), {
        status: 404,
        headers: { "Content-Type": "application/json" },
      });
    }
  }

  const formName = opts.name || "Contacto";

  // Check if a form with the same name already exists on this parent — reuse its DB
  const existingForm = await db.formConfig.findFirst({
    where: opts.websiteId
      ? { websiteId: opts.websiteId, name: formName, ownerId: ctx.user.id }
      : { landingId: opts.landingId, name: formName, ownerId: ctx.user.id },
  });

  let dbId: string;
  const tableName = "submissions";

  if (existingForm?.dbId) {
    // Reuse existing DB
    dbId = existingForm.dbId;
    // Ensure new columns exist (ALTER TABLE ADD COLUMN for any new fields)
    const database = await db.database.findUnique({ where: { id: dbId } });
    if (database) {
      for (const f of opts.fields) {
        try {
          await sqldQuery(database.namespace, `ALTER TABLE "${tableName}" ADD COLUMN "${f.name}" TEXT`, []);
        } catch {
          // Column already exists — ignore
        }
      }
    }
  } else {
    // Create a dedicated DB for this form
    const dbName = `form-${formName.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")}-${Date.now().toString(36)}`;
    const database = await db.database.create({
      data: {
        name: dbName,
        namespace: "",
        description: `Submissions for form: ${formName}`,
        userId: ctx.user.id,
      },
    });
    const namespace = database.id;
    await sqldCreateNamespace(namespace);
    await db.database.update({ where: { id: database.id }, data: { namespace } });

    const columns = opts.fields
      .map((f) => `"${f.name}" TEXT`)
      .join(", ");
    const createSql = `CREATE TABLE IF NOT EXISTS "${tableName}" (id INTEGER PRIMARY KEY AUTOINCREMENT, ${columns}, submitted_at TEXT DEFAULT (datetime('now')))`;
    await sqldQuery(namespace, createSql, []);

    dbId = database.id;
    dispatchWebhooks(ctx.user.id, "database.created", { id: database.id, name: dbName });
  }

  // Standalone hosted forms get a unique slug (served at /f/:slug).
  let slug: string | null = null;
  if (isStandalone) {
    const base =
      (opts.slug || formName)
        .toLowerCase()
        .normalize("NFD")
        .replace(/[̀-ͯ]/g, "")
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-|-$/g, "") || "form";
    slug = base;
    // Ensure uniqueness — append a short suffix on collision. (findFirst, not
    // findUnique: slug is not a DB unique index — see schema note.)
    for (let i = 0; i < 5; i++) {
      const taken = await db.formConfig.findFirst({ where: { slug } });
      if (!taken) break;
      slug = `${base}-${Math.random().toString(36).slice(2, 6)}`;
    }
  }

  const formConfig = await db.formConfig.create({
    data: {
      websiteId: opts.websiteId ?? null,
      landingId: opts.landingId ?? null,
      slug,
      theme: isStandalone ? (opts.theme || "formal") : null,
      name: formName,
      fields: opts.fields as any,
      successMessage: opts.successMessage || "¡Gracias! Te contactaremos pronto.",
      deliveryUrl: opts.deliveryUrl || null,
      dbId,
      tableName,
      ownerId: ctx.user.id,
    },
  });

  return formConfig;
}

// ─── Public: Generate form HTML ────────────────────────────────
export function generateFormHtml(
  formConfig: { id: string; fields: any; successMessage: string; deliveryUrl?: string | null },
  opts: { submitLabel?: string } = {}
): string {
  const fields = formConfig.fields as FormField[];
  const submitLabel = opts.submitLabel || "Enviar";
  const formId = formConfig.id;
  const successMsg = formConfig.successMessage;
  const deliveryUrl = formConfig.deliveryUrl;

  const fieldHtml = fields
    .map((f) => {
      const req = f.required ? " required" : "";
      const ph = f.placeholder ? ` placeholder="${escapeAttr(f.placeholder)}"` : "";

      if (f.type === "textarea") {
        return `  <label><span>${escapeHtml(f.label)}</span><textarea name="${escapeAttr(f.name)}"${ph}${req} rows="4"></textarea></label>`;
      }
      if (f.type === "select" && f.options?.length) {
        const optHtml = f.options
          .map((o) => `<option value="${escapeAttr(o)}">${escapeHtml(o)}</option>`)
          .join("");
        return `  <label><span>${escapeHtml(f.label)}</span><select name="${escapeAttr(f.name)}"${req}><option value="">Seleccionar...</option>${optHtml}</select></label>`;
      }
      const inputType = f.type === "tel" ? "tel" : f.type === "email" ? "email" : "text";
      return `  <label><span>${escapeHtml(f.label)}</span><input type="${inputType}" name="${escapeAttr(f.name)}"${ph}${req} /></label>`;
    })
    .join("\n");

  // Success handler: redirect to delivery URL or show success message
  const successHandler = deliveryUrl
    ? `if(d.ok&&d.deliveryUrl)window.location.href=d.deliveryUrl;else if(d.ok)this.innerHTML='<p style=\\'text-align:center;padding:2rem;color:#16a34a\\'>${escapeHtml(successMsg)}</p>'`
    : `if(d.ok)this.innerHTML='<p style=\\'text-align:center;padding:2rem;color:#16a34a\\'>${escapeHtml(successMsg)}</p>'`;

  return `<!-- Powered by Formmy — https://formmy.app -->
<form data-formmy="${formId}" onsubmit="event.preventDefault();var b=this.querySelector('[type=submit]'),hp=this.querySelector('[name=_hp]');if(hp&&hp.value)return;b.disabled=true;b.textContent='Enviando...';fetch('https://www.easybits.cloud/api/v2/forms/${formId}/submit',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(Object.fromEntries(new FormData(this)))}).then(function(r){return r.json()}).then(function(d){${successHandler};if(!d.ok){b.disabled=false;b.textContent='Error, intenta de nuevo'}}.bind(this)).catch(function(){b.disabled=false;b.textContent='Error, intenta de nuevo'})">
${fieldHtml}
  <input name="_hp" style="display:none" tabindex="-1" autocomplete="off" />
  <button type="submit">${escapeHtml(submitLabel)}</button>
  <p style="margin-top:12px;text-align:center;font-size:11px;color:#999">
    Powered by <a href="https://formmy.app" target="_blank" style="color:#6366f1;text-decoration:none">Formmy</a>
  </p>
</form>`;
}

// ─── Public: Handle submission ─────────────────────────────────
export async function handleFormSubmission(
  formId: string,
  data: Record<string, unknown>,
  ip?: string
) {
  const formConfig = await db.formConfig.findUnique({ where: { id: formId } });
  if (!formConfig) {
    throw new Response(JSON.stringify({ error: "Form not found" }), {
      status: 404,
      headers: { "Content-Type": "application/json" },
    });
  }

  const fields = formConfig.fields as unknown as FormField[];

  // Validate required fields and types
  const errors: Record<string, string> = {};
  const cleanData: Record<string, string> = {};

  for (const field of fields) {
    const value = data[field.name];
    const strValue = typeof value === "string" ? value.trim() : "";

    // Skip validation entirely for fields hidden by their showIf condition —
    // a hidden required field must not block the submission.
    if (!isFieldVisible(field, data)) {
      continue;
    }

    if (field.required && !strValue) {
      errors[field.name] = `${field.label} es requerido`;
      continue;
    }

    if (strValue) {
      if (field.type === "email" && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(strValue)) {
        errors[field.name] = "Email inválido";
        continue;
      }
      if (field.type === "tel" && !/^[\d\s\-+()]{7,20}$/.test(strValue)) {
        errors[field.name] = "Teléfono inválido";
        continue;
      }
      if (field.type === "number" && !/^-?\d+(\.\d+)?$/.test(strValue)) {
        errors[field.name] = "Número inválido";
        continue;
      }
      if (field.type === "date" && !/^\d{4}-\d{2}-\d{2}$/.test(strValue)) {
        errors[field.name] = "Fecha inválida";
        continue;
      }
      if ((field.type === "select" || field.type === "radio") && field.options?.length && !field.options.includes(strValue)) {
        errors[field.name] = "Opción inválida";
        continue;
      }
      if (field.type === "matrix") {
        let parsed: Record<string, string> | null = null;
        try {
          parsed = JSON.parse(strValue);
        } catch {
          parsed = null;
        }
        if (!parsed || typeof parsed !== "object") {
          errors[field.name] = "Respuesta inválida";
          continue;
        }
        const cols = field.options || [];
        const badCol = Object.values(parsed).some((v) => cols.length && !cols.includes(v as string));
        if (badCol) {
          errors[field.name] = "Opción inválida";
          continue;
        }
        if (field.required && (field.rows || []).some((r) => !parsed![r])) {
          errors[field.name] = `${field.label}: responde todas las filas`;
          continue;
        }
      }
    }

    cleanData[field.name] = strValue;
  }

  if (Object.keys(errors).length > 0) {
    throw new Response(JSON.stringify({ ok: false, errors }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  // Save submission
  await db.formSubmission.create({
    data: {
      formConfigId: formId,
      data: cleanData,
      ip,
    },
  });

  // Insert into user's DB if configured
  if (formConfig.dbId && formConfig.tableName) {
    try {
      const database = await db.database.findUnique({ where: { id: formConfig.dbId } });
      if (database) {
        const fieldNames = Object.keys(cleanData);
        const placeholders = fieldNames.map(() => "?").join(", ");
        const columns = fieldNames.map((n) => `"${n}"`).join(", ");
        const values = fieldNames.map((n) => cleanData[n]);
        await sqldQuery(
          database.namespace,
          `INSERT INTO "${formConfig.tableName}" (${columns}) VALUES (${placeholders})`,
          values
        );
      }
    } catch (err) {
      console.error("Form DB insert failed:", err);
      // Don't fail the submission if DB insert fails
    }
  }

  // Hosted (standalone) forms → crea una FICHA: un Documento EasyBits real (v4)
  // por respuesta, para que el consumidor (GTeams) la muestre como ARTEFACTO con
  // visor + Descargar PDF/Word (reusa el loop de documentos, NO reinventa export).
  // Best-effort: nunca bloquea el submit.
  let fichaDocumentId: string | null = null;
  if (formConfig.slug) {
    try {
      const { createDocument } = await import("./documentOperations");
      const ctx = { user: { id: formConfig.ownerId }, scopes: ["WRITE"] } as unknown as AuthContext;
      const html = renderSubmissionFichaHtml(formConfig.name, fields, cleanData);
      const empresa = cleanData.razon_social || cleanData.empresa || cleanData.nombre || "";
      const doc = await createDocument(ctx, {
        name: `${formConfig.name}${empresa ? " — " + empresa : ""}`.slice(0, 120),
        intent: "document",
        sections: [{ id: nanoid(), order: 0, html, type: "content", name: "Ficha" }],
      });
      fichaDocumentId = doc.id;
    } catch (err) {
      console.error("Ficha document creation failed:", err);
    }
  }

  // Dispatch webhook — self-describing: include field metadata + the ficha doc id
  // so consumers (GTeams) render labels/matrices AND attach the document artifact.
  dispatchWebhooks(formConfig.ownerId, "form.submitted", {
    formId,
    formName: formConfig.name,
    fichaDocumentId,
    fichaUrl: fichaDocumentId ? `https://www.easybits.cloud/documents/${fichaDocumentId}` : null,
    websiteId: formConfig.websiteId,
    landingId: formConfig.landingId,
    data: cleanData,
    fields: fields.map((f) => ({
      name: f.name,
      label: f.label,
      type: f.type,
      ...(f.options ? { options: f.options } : {}),
      ...(f.rows ? { rows: f.rows } : {}),
    })),
  });

  // Notify the form owner by email (fire-and-forget — never fails the submission)
  notifyOwnerOfSubmission(formConfig.ownerId, formConfig.name, cleanData, fields).catch(
    (err) => console.error("Form owner email failed:", err)
  );

  const result: { ok: true; deliveryUrl?: string } = { ok: true };
  if (formConfig.deliveryUrl) {
    result.deliveryUrl = formConfig.deliveryUrl;
  }
  return result;
}

// ─── List forms + submissions (REST API v2 + SDK) ──────────────
export async function listForms(ctx: AuthContext) {
  requireScope(ctx, "READ");
  const forms = await db.formConfig.findMany({
    where: { ownerId: ctx.user.id },
    orderBy: { createdAt: "desc" },
  });
  const formIds = forms.map((f) => f.id);
  const counts = formIds.length
    ? await db.formSubmission.groupBy({
        by: ["formConfigId"],
        _count: true,
        where: { formConfigId: { in: formIds } },
      })
    : [];
  const countMap = Object.fromEntries(counts.map((c) => [c.formConfigId, c._count]));
  return {
    items: forms.map((f) => ({
      id: f.id,
      name: f.name,
      slug: f.slug,
      theme: f.theme,
      websiteId: f.websiteId,
      landingId: f.landingId,
      url: f.slug ? `https://www.easybits.cloud/f/${f.slug}` : null,
      submissionCount: countMap[f.id] ?? 0,
      createdAt: f.createdAt,
    })),
  };
}

export async function updateForm(
  ctx: AuthContext,
  formId: string,
  patch: { name?: string; theme?: string; successMessage?: string; deliveryUrl?: string | null; fields?: FormField[] }
) {
  requireScope(ctx, "WRITE");
  const form = await db.formConfig.findUnique({ where: { id: formId } });
  if (!form || form.ownerId !== ctx.user.id) {
    throw new Response(JSON.stringify({ error: "Form not found" }), {
      status: 404,
      headers: { "Content-Type": "application/json" },
    });
  }
  // NOTE: editing fields updates Mongo only; the per-form libSQL table keeps its
  // columns (new fields land in Mongo `data`, the libSQL mirror lags — acceptable).
  const updated = await db.formConfig.update({
    where: { id: formId },
    data: {
      ...(patch.name !== undefined ? { name: patch.name } : {}),
      ...(patch.theme !== undefined ? { theme: patch.theme } : {}),
      ...(patch.successMessage !== undefined ? { successMessage: patch.successMessage } : {}),
      ...(patch.deliveryUrl !== undefined ? { deliveryUrl: patch.deliveryUrl } : {}),
      ...(patch.fields !== undefined ? { fields: patch.fields as any } : {}),
    },
  });
  return {
    id: updated.id,
    slug: updated.slug,
    theme: updated.theme,
    name: updated.name,
    url: updated.slug ? `https://www.easybits.cloud/f/${updated.slug}` : null,
  };
}

export async function listFormSubmissions(ctx: AuthContext, formId?: string, limit = 50) {
  requireScope(ctx, "READ");
  const take = Math.min(Math.max(1, limit), 200);
  if (formId) {
    const formConfig = await db.formConfig.findUnique({ where: { id: formId } });
    if (!formConfig || formConfig.ownerId !== ctx.user.id) {
      throw new Response(JSON.stringify({ error: "Form not found" }), {
        status: 404,
        headers: { "Content-Type": "application/json" },
      });
    }
    const submissions = await db.formSubmission.findMany({
      where: { formConfigId: formId },
      orderBy: { createdAt: "desc" },
      take,
    });
    return {
      formName: formConfig.name,
      items: submissions.map((s) => ({ id: s.id, data: s.data, createdAt: s.createdAt })),
      total: submissions.length,
    };
  }
  const forms = await db.formConfig.findMany({
    where: { ownerId: ctx.user.id },
    select: { id: true },
  });
  if (!forms.length) return { items: [], total: 0 };
  const submissions = await db.formSubmission.findMany({
    where: { formConfigId: { in: forms.map((f) => f.id) } },
    orderBy: { createdAt: "desc" },
    take,
  });
  return {
    items: submissions.map((s) => ({ id: s.id, formId: s.formConfigId, data: s.data, createdAt: s.createdAt })),
    total: submissions.length,
  };
}

// ─── Ficha de intake: submission → HTML de documento (v4) ──────
// Renderiza una respuesta como una FICHA formateada (tabla label→valor, matrices
// como sub-tablas) para crear un Documento EasyBits real (visor + PDF/Word). NO
// reinventa export: es HTML de sección que consume el pipeline de documentos.
export function renderSubmissionFichaHtml(
  formName: string,
  fields: FormField[],
  data: Record<string, string>,
  submittedAt?: Date
): string {
  const simpleVal = (f: FormField): string => {
    const v = data[f.name] || "";
    if (f.type === "checkbox") return v === "true" ? "Sí" : "—";
    if (f.type === "file") return v ? "📎 Archivo adjunto" : "—";
    return escapeHtml(v) || "—";
  };
  // Flat table of non-matrix fields (BlockNote no soporta tablas anidadas → cada
  // matriz va como su PROPIA tabla debajo, nunca dentro de una celda).
  const simpleFields = fields.filter((f) => f.type !== "matrix");
  const matrixFields = fields.filter((f) => f.type === "matrix");

  // Nota: NADA de width en porcentaje en <td> — html-to-docx (export Word) genera
  // XML inválido ("@w") con anchos %. Se deja que Word/PDF auto-dimensionen.
  const td = (s: string, extra = "") => `<td style="padding:7px 12px;border:1px solid #e5e5e5;${extra}">${s}</td>`;
  const simpleRows = simpleFields
    .map((f) => `<tr>${td(escapeHtml(f.label), "font-weight:600;background:#faf9fb")}${td(simpleVal(f))}</tr>`)
    .join("");
  const simpleTable = simpleRows
    ? `<table style="border-collapse:collapse;width:100%;font-size:13.5px;line-height:1.5">${simpleRows}</table>`
    : "";

  // Matriz simplificada para lectura (patrón de checklist de cumplimiento):
  // símbolo + color por estado + línea de resumen. Sí/No → ✓ verde / ✗ rojo;
  // frecuencia → badge de color por severidad (opción 0 = más severa). Tabla plana.
  const YES = new Set(["sí", "si", "yes", "true"]);
  const matrixBlocks = matrixFields
    .map((f) => {
      let sel: Record<string, string> = {};
      try { sel = data[f.name] ? JSON.parse(data[f.name]) : {}; } catch { sel = {}; }
      const opts = f.options || [];
      const isBinary = opts.length === 2 && opts.some((o) => YES.has(o.toLowerCase())) && opts.some((o) => ["no"].includes(o.toLowerCase()));
      const sevColor = ["#c2410c", "#b45309", "#6b6575", "#6b6575"]; // por índice de opción
      const badge = (val: string): string => {
        if (!val) return `<span style="color:#c4c4c4">—</span>`;
        if (isBinary) {
          const yes = YES.has(val.toLowerCase());
          return `<span style="color:${yes ? "#15803d" : "#c2410c"};font-weight:600">${yes ? "✓" : "✗"} ${escapeHtml(val)}</span>`;
        }
        const i = opts.indexOf(val);
        return `<span style="color:${sevColor[i] ?? "#6b6575"};font-weight:600">${escapeHtml(val)}</span>`;
      };
      const answered = (f.rows || []).filter((r) => sel[r]);
      // Resumen: Sí/No → "12 sí · 8 no"; frecuencia → "N respondidas".
      let summary: string;
      if (isBinary) {
        const yes = answered.filter((r) => YES.has(sel[r].toLowerCase())).length;
        summary = `<span style="color:#15803d;font-weight:600">✓ ${yes}</span> · <span style="color:#c2410c;font-weight:600">✗ ${answered.length - yes}</span> de ${(f.rows || []).length}`;
      } else {
        summary = `${answered.length} de ${(f.rows || []).length} respondidas`;
      }
      const rows = (f.rows || [])
        .map((r) => `<tr>${td(escapeHtml(r))}${td(badge(sel[r] || ""), "text-align:right")}</tr>`)
        .join("");
      return `<h3 style="font-size:15px;margin:22px 0 4px">${escapeHtml(f.label)}</h3>
  <p style="font-size:12px;color:#6b6575;margin:0 0 8px">${summary}</p>
  <table style="border-collapse:collapse;width:100%;font-size:12.5px">${rows}</table>`;
    })
    .join("\n");

  const fecha = (submittedAt || new Date()).toLocaleDateString("es-MX", { year: "numeric", month: "long", day: "numeric" });
  return `<section style="max-width:760px;margin:0 auto;padding:40px 48px;font-family:'Helvetica Neue',Arial,sans-serif;color:#1a1a1a">
  <h1 style="font-size:22px;margin:0 0 4px;line-height:1.25">${escapeHtml(formName)}</h1>
  <p style="font-size:12px;color:#6b6575;margin:0 0 20px">Ficha de intake · Recibido el ${fecha}</p>
  ${simpleTable}
  ${matrixBlocks}
  <p style="margin-top:24px;font-size:11px;color:#999">Documento generado con EasyBits.cloud</p>
</section>`;
}

// ─── Public: file upload for a hosted form ─────────────────────
/**
 * Store a file uploaded by an (unauthenticated) form respondent. The file is
 * owned by the FORM OWNER and stored PRIVATE (labor/legal docs are sensitive).
 * The submission stores the returned `fileId`; a fresh signed URL is minted on
 * demand when the owner views it. Authorized by form ownership, not by a session.
 */
export async function uploadFormFile(
  formId: string,
  file: { name: string; contentType: string; bytes: Buffer }
): Promise<{ fileId: string; name: string; url: string; size: number }> {
  const formConfig = await db.formConfig.findUnique({ where: { id: formId } });
  if (!formConfig) {
    throw new Response(JSON.stringify({ ok: false, error: "Form not found" }), {
      status: 404,
      headers: { "Content-Type": "application/json" },
    });
  }

  const size = file.bytes.length;
  if (size <= 0 || size > 25 * 1024 * 1024) {
    throw new Response(JSON.stringify({ ok: false, error: "Archivo inválido (1 byte a 25MB)" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  const ownerId = formConfig.ownerId;
  const safeName = file.name.replace(/[^a-zA-Z0-9._-]+/g, "_").slice(0, 80) || "archivo";
  // Stored WITHOUT the `mcp/` prefix — the client prepends it; read path uses
  // getReadClientForPlatformFile (private → mcp/) to resolve the same key.
  const storageKey = `${ownerId}/form-uploads/${nanoid(8)}-${safeName}`;

  const client = getPlatformDefaultClient(); // private, prefix "mcp/"
  await client.putObject(storageKey, file.bytes, file.contentType || "application/octet-stream");

  const row = await db.file.create({
    data: {
      name: safeName,
      storageKey,
      slug: storageKey,
      size,
      contentType: file.contentType || "application/octet-stream",
      ownerId,
      access: "private",
      url: "",
      status: "DONE",
      source: "form-upload",
    },
  });

  const url = await client.getReadUrl(storageKey, 3600);
  return { fileId: row.id, name: safeName, url, size };
}

/**
 * Mint a fresh signed read URL for a file captured through a form upload.
 * Scoped to the form owner (defensive — only files owned by the form's owner).
 */
export async function resolveFormFileUrl(
  formOwnerId: string,
  fileId: string,
  expiresIn = 3600
): Promise<string | null> {
  const file = await db.file.findFirst({ where: { id: fileId, ownerId: formOwnerId } });
  if (!file) return null;
  const client = getReadClientForPlatformFile(file);
  return client.getReadUrl(file.storageKey, expiresIn);
}

/**
 * Enrich the most recent submission for a given email with extra fields.
 * Used to capture optional fields (e.g. website) after the user already
 * completed the lead form, without creating duplicate rows.
 *
 * Updates both the Mongo `formSubmission.data` field and the user's libSQL
 * row when configured. Only matches submissions from the last hour.
 */
export async function enrichRecentFormSubmission(
  formId: string,
  email: string,
  patch: Record<string, string>
): Promise<{ ok: true } | { ok: false; reason: string }> {
  const formConfig = await db.formConfig.findUnique({ where: { id: formId } });
  if (!formConfig) return { ok: false, reason: "form-not-found" };

  const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
  const recentBatch = await db.formSubmission.findMany({
    where: {
      formConfigId: formId,
      createdAt: { gte: oneHourAgo },
    },
    orderBy: { createdAt: "desc" },
    take: 50,
  });

  const recent = recentBatch.find((s) => {
    const d = s.data as Record<string, unknown>;
    return typeof d?.email === "string" && d.email === email;
  });

  if (!recent) return { ok: false, reason: "no-recent-submission" };

  const merged = { ...(recent.data as Record<string, string>), ...patch };
  await db.formSubmission.update({
    where: { id: recent.id },
    data: { data: merged },
  });

  if (formConfig.dbId && formConfig.tableName) {
    try {
      const database = await db.database.findUnique({
        where: { id: formConfig.dbId },
      });
      if (database) {
        const setClause = Object.keys(patch)
          .map((k) => `"${k}" = ?`)
          .join(", ");
        const values = [...Object.values(patch), email];
        await sqldQuery(
          database.namespace,
          `UPDATE "${formConfig.tableName}" SET ${setClause} WHERE id = (SELECT id FROM "${formConfig.tableName}" WHERE "email" = ? ORDER BY id DESC LIMIT 1)`,
          values
        );
      }
    } catch (err) {
      console.error("Form DB enrich failed:", err);
    }
  }

  return { ok: true };
}

// Render a submitted field value as readable HTML (matrices → mini-table,
// checkbox → Sí/—, everything else → text). Shared shape with the dashboard viewer.
function renderValueHtml(field: FormField, value: string): string {
  if (field.type === "matrix") {
    const rows = field.rows || [];
    let sel: Record<string, string> = {};
    try { sel = value ? JSON.parse(value) : {}; } catch { sel = {}; }
    const trs = rows
      .map(
        (r) =>
          `<tr><td style="padding:3px 8px;border-top:1px solid #f0f0f0;color:#444">${escapeHtml(r)}</td><td style="padding:3px 8px;border-top:1px solid #f0f0f0;text-align:right;font-weight:600;color:${sel[r] ? "#7c5ce0" : "#ccc"}">${escapeHtml(sel[r] || "—")}</td></tr>`
      )
      .join("");
    return `<table style="border-collapse:collapse;width:100%;font-size:12px">${trs}</table>`;
  }
  if (field.type === "checkbox") return value === "true" ? "Sí" : "—";
  if (field.type === "file") return value ? "📎 archivo adjunto" : "—";
  return escapeHtml(value || "—");
}

// ─── Owner notification ────────────────────────────────────────
async function notifyOwnerOfSubmission(
  ownerId: string,
  formName: string,
  data: Record<string, string>,
  fields?: FormField[]
): Promise<void> {
  const owner = await db.user.findUnique({ where: { id: ownerId } });
  if (!owner?.email) return;

  // Prefer field order + labels + pretty rendering; fall back to raw entries.
  const rows = (fields && fields.length)
    ? fields
        .map(
          (f) =>
            `<tr><td style="padding:6px 12px;border:1px solid #eee;font-weight:600;vertical-align:top">${escapeHtml(f.label)}</td><td style="padding:6px 12px;border:1px solid #eee">${renderValueHtml(f, data[f.name] || "")}</td></tr>`
        )
        .join("")
    : Object.entries(data)
        .map(
          ([k, v]) =>
            `<tr><td style="padding:6px 12px;border:1px solid #eee;font-weight:600">${escapeHtml(k)}</td><td style="padding:6px 12px;border:1px solid #eee">${escapeHtml(v)}</td></tr>`
        )
        .join("");

  await getSesTransport().sendMail({
    from: "EasyBits@easybits.cloud",
    subject: `📬 Nueva respuesta — ${formName}`,
    bcc: [owner.email],
    html: `<div style="font-family:system-ui,sans-serif;max-width:520px;margin:0 auto">
  <h2 style="font-size:18px">Nueva respuesta en "${escapeHtml(formName)}"</h2>
  <table style="border-collapse:collapse;width:100%;font-size:14px">${rows}</table>
  <p style="margin-top:16px;font-size:12px;color:#999">Documento generado con EasyBits.cloud</p>
</div>`,
  });
}

// ─── Helpers ───────────────────────────────────────────────────
export function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function escapeAttr(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
