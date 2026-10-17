import type { Route } from "./+types/documents";
import { authenticateRequest, requireAuth, requireScope } from "~/.server/apiAuth";
import {
  listDocuments,
  createDocument,
} from "~/.server/core/documentOperations";
import { resolveFormat, type FormatInput } from "~/.server/core/socialPresets";

// GET /api/v2/documents?limit=&offset=&search=
export async function loader({ request }: Route.LoaderArgs) {
  const ctx = requireAuth(await authenticateRequest(request));
  const url = new URL(request.url);
  const num = (k: string) => {
    const n = Number(url.searchParams.get(k));
    return Number.isInteger(n) && n >= 0 && url.searchParams.has(k) ? n : undefined;
  };
  const result = await listDocuments(ctx, {
    limit: num("limit"),
    offset: num("offset"),
    search: url.searchParams.get("search") || undefined,
  });
  return Response.json(result);
}

// POST /api/v2/documents
export async function action({ request }: Route.ActionArgs) {
  if (request.method !== "POST") {
    return Response.json({ error: "Method not allowed" }, { status: 405 });
  }

  const ctx = requireAuth(await authenticateRequest(request));
  requireScope(ctx, "WRITE");

  const body = await request.json();
  // Mismo `format` que la tool create_document: { preset } o { width, height } (100-10000 px).
  const { format, intent } = resolveFormat(body.format as FormatInput | undefined);
  const document = await createDocument(ctx, {
    name: String(body.name || ""),
    prompt: body.prompt,
    sections: body.sections,
    theme: body.theme,
    customColors: body.customColors,
    brandKitId: typeof body.brandKitId === "string" ? body.brandKitId : undefined,
    format,
    intent,
  });
  return Response.json({ document });
}
