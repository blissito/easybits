import { db } from "../db";
import { sqldQuery, sqldCreateNamespace } from "../sqld";
import { dispatchWebhooks } from "../webhooks";
import type { AuthContext } from "../apiAuth";
import { requireScope } from "../apiAuth";

interface FormField {
  name: string;
  type: "text" | "email" | "tel" | "textarea" | "select";
  label: string;
  required?: boolean;
  placeholder?: string;
  options?: string[];
}

// ─── MCP: Create form config ───────────────────────────────────
export async function createFormConfig(
  ctx: AuthContext,
  opts: {
    websiteId: string;
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

  // Validate website belongs to user
  const website = await db.website.findUnique({ where: { id: opts.websiteId } });
  if (!website || website.ownerId !== ctx.user.id) {
    throw new Response(JSON.stringify({ error: "Website not found" }), {
      status: 404,
      headers: { "Content-Type": "application/json" },
    });
  }

  const formName = opts.name || "Contacto";

  // Check if a form with the same name already exists on this website — reuse its DB
  const existingForm = await db.formConfig.findFirst({
    where: { websiteId: opts.websiteId, name: formName, ownerId: ctx.user.id },
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

  const formConfig = await db.formConfig.create({
    data: {
      websiteId: opts.websiteId,
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
      if (field.type === "select" && field.options?.length && !field.options.includes(strValue)) {
        errors[field.name] = "Opción inválida";
        continue;
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

  // Dispatch webhook
  dispatchWebhooks(formConfig.ownerId, "form.submitted", {
    formId,
    websiteId: formConfig.websiteId,
    data: cleanData,
  });

  const result: { ok: true; deliveryUrl?: string } = { ok: true };
  if (formConfig.deliveryUrl) {
    result.deliveryUrl = formConfig.deliveryUrl;
  }
  return result;
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

// ─── Helpers ───────────────────────────────────────────────────
export function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function escapeAttr(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
