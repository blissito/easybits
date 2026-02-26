import type { Route } from "./+types/providers";
import { authenticateRequest, requireAuth } from "~/.server/apiAuth";
import { db } from "~/.server/db";

// GET /api/v2/providers
export async function loader({ request }: Route.LoaderArgs) {
  const ctx = requireAuth(await authenticateRequest(request));

  const providers = await db.storageProvider.findMany({
    where: { userId: ctx.user.id },
    select: {
      id: true,
      name: true,
      type: true,
      region: true,
      isDefault: true,
      createdAt: true,
    },
  });

  return Response.json({
    providers,
    defaultProvider:
      providers.length === 0
        ? { type: "TIGRIS", note: "Using platform default" }
        : undefined,
  });
}
