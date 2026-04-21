import type { Route } from "./+types/characters";
import { authenticateRequest, requireAuth } from "~/.server/apiAuth";
import {
  listCharacters,
  createCharacter,
} from "~/.server/core/characterOperations";
import { uploadLogoToStorage } from "~/.server/core/documentOperations";

export async function loader({ request }: Route.LoaderArgs) {
  const ctx = requireAuth(await authenticateRequest(request));
  const rows = await listCharacters(ctx.user.id);
  return Response.json({ characters: rows });
}

export async function action({ request }: Route.ActionArgs) {
  const ctx = requireAuth(await authenticateRequest(request));
  if (request.method !== "POST") {
    return Response.json({ error: "Method not allowed" }, { status: 405 });
  }
  const body = await request.json().catch(() => ({})) as {
    name?: string;
    photos?: string[]; // HTTPS URLs OR data: URIs
    description?: string;
  };
  if (!body.name?.trim()) {
    return Response.json({ error: "name is required" }, { status: 400 });
  }
  if (!Array.isArray(body.photos) || body.photos.length < 1) {
    return Response.json({ error: "At least one photo is required" }, { status: 400 });
  }
  if (body.photos.length > 3) {
    return Response.json({ error: "Maximum 3 photos allowed" }, { status: 400 });
  }

  // Convert any data: URIs to public Tigris URLs so Runway can fetch them.
  const urls: string[] = [];
  for (const photo of body.photos) {
    if (typeof photo !== "string") continue;
    if (photo.startsWith("data:")) {
      const url = await uploadLogoToStorage(photo, ctx.user.id);
      urls.push(url);
    } else if (/^https:\/\//i.test(photo)) {
      urls.push(photo);
    } else {
      return Response.json({ error: "Photos must be HTTPS URLs or data: URIs" }, { status: 400 });
    }
  }

  try {
    const character = await createCharacter(ctx.user.id, {
      name: body.name,
      referenceImageUrls: urls,
      description: body.description,
    });
    return Response.json({ character });
  } catch (err: any) {
    return Response.json({ error: err?.message || "Failed to create character" }, { status: 400 });
  }
}
