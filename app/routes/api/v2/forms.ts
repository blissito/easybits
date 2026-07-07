import type { Route } from "./+types/forms";
import { authenticateRequest, requireAuth } from "~/.server/apiAuth";
import { createFormConfig, listForms } from "~/.server/core/formOperations";

// GET /api/v2/forms — list your forms with submission counts
export async function loader({ request }: Route.LoaderArgs) {
  const ctx = requireAuth(await authenticateRequest(request));
  const result = await listForms(ctx);
  return Response.json(result);
}

// POST /api/v2/forms — create a standalone hosted form (served at /f/:slug)
export async function action({ request }: Route.ActionArgs) {
  const ctx = requireAuth(await authenticateRequest(request));
  if (request.method !== "POST") {
    return Response.json({ error: "Method not allowed" }, { status: 405 });
  }
  const body = await request.json();
  const form = await createFormConfig(ctx, {
    name: body.name,
    fields: body.fields,
    theme: body.theme,
    slug: body.slug,
    successMessage: body.successMessage,
    deliveryUrl: body.deliveryUrl,
  });
  return Response.json(
    {
      id: form.id,
      slug: form.slug,
      theme: form.theme,
      name: form.name,
      url: form.slug ? `https://www.easybits.cloud/f/${form.slug}` : null,
    },
    { status: 201 }
  );
}
