import type { Route } from "./+types/key";
import { getUserOrNull } from "~/.server/getters";
import { revokeApiKey } from "~/.server/iam";

// DELETE /api/v2/keys/:keyId
export async function action({ request, params }: Route.ActionArgs) {
  const user = await getUserOrNull(request);
  if (!user) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (request.method === "DELETE") {
    await revokeApiKey(params.keyId!, user.id);
    return Response.json({ success: true });
  }

  return Response.json({ error: "Method not allowed" }, { status: 405 });
}
