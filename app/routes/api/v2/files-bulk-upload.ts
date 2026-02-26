import type { Route } from "./+types/files-bulk-upload";
import { authenticateRequest, requireAuth } from "~/.server/apiAuth";
import { bulkUploadFiles } from "~/.server/core/operations";

// POST /api/v2/files/bulk-upload
export async function action({ request }: Route.ActionArgs) {
  const ctx = requireAuth(await authenticateRequest(request));

  if (request.method === "POST") {
    const body = await request.json();
    const result = await bulkUploadFiles(ctx, body.items);
    return Response.json(result, { status: 201 });
  }

  return Response.json({ error: "Method not allowed" }, { status: 405 });
}
