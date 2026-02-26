import type { Route } from "./+types/websites-collection";
import { authenticateRequest, requireAuth, requireScope } from "~/.server/apiAuth";
import { db } from "~/.server/db";

function slugify(text: string): string {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

// POST /api/v2/websites — create a website
export async function action({ request }: Route.ActionArgs) {
  if (request.method !== "POST") {
    return Response.json({ error: "Method not allowed" }, { status: 405 });
  }

  const ctx = requireAuth(await authenticateRequest(request));
  requireScope(ctx, "WRITE");

  const body = await request.json();
  const name = String(body.name || "").trim();
  if (!name) {
    return Response.json({ error: "Name required" }, { status: 400 });
  }

  let slug = slugify(name);
  const existing = await db.website.findUnique({ where: { slug } });
  if (existing) {
    slug = `${slug}-${Date.now().toString(36).slice(-4)}`;
  }

  const website = await db.website.create({
    data: {
      name,
      slug,
      ownerId: ctx.user.id,
      prefix: "",
    },
  });

  const updated = await db.website.update({
    where: { id: website.id },
    data: { prefix: `sites/${website.id}/` },
  });

  return Response.json({ website: updated });
}
