import type { Route } from "./+types/forms.$formId";
import { authenticateRequest, requireAuth } from "~/.server/apiAuth";
import { db } from "~/.server/db";
import { updateForm } from "~/.server/core/formOperations";

// GET /api/v2/forms/:formId — get a form's config
export async function loader({ request, params }: Route.LoaderArgs) {
  const ctx = requireAuth(await authenticateRequest(request));
  const form = await db.formConfig.findUnique({ where: { id: params.formId } });
  if (!form || form.ownerId !== ctx.user.id) {
    return Response.json({ error: "Form not found" }, { status: 404 });
  }
  return Response.json({
    id: form.id,
    name: form.name,
    slug: form.slug,
    theme: form.theme,
    fields: form.fields,
    successMessage: form.successMessage,
    url: form.slug ? `https://www.easybits.cloud/f/${form.slug}` : null,
  });
}

// PATCH /api/v2/forms/:formId — update name/theme/fields/successMessage
export async function action({ request, params }: Route.ActionArgs) {
  const ctx = requireAuth(await authenticateRequest(request));
  if (request.method !== "PATCH") {
    return Response.json({ error: "Method not allowed" }, { status: 405 });
  }
  const body = await request.json();
  const result = await updateForm(ctx, params.formId, {
    name: body.name,
    theme: body.theme,
    successMessage: body.successMessage,
    deliveryUrl: body.deliveryUrl,
    fields: body.fields,
  });
  return Response.json(result);
}
