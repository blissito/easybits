import type { ApiKey, ApiKeyScope, User } from "@prisma/client";
import { getUserOrNull } from "./getters";
import { validateApiKey, hasScope } from "./iam";
import { db } from "./db";

export type AuthContext = {
  user: User;
  apiKey?: ApiKey;
  scopes: ApiKeyScope[];
};

export async function authenticateRequest(
  request: Request
): Promise<AuthContext | null> {
  // 1. Try Bearer token (API key)
  const authHeader = request.headers.get("Authorization");
  if (authHeader?.startsWith("Bearer ")) {
    const raw = authHeader.slice(7);
    const apiKey = await validateApiKey(raw);
    if (!apiKey) return null;
    const user = await db.user.findUnique({ where: { id: apiKey.userId } });
    if (!user) return null;
    return { user, apiKey, scopes: apiKey.scopes };
  }

  // 2. Fallback to session cookie
  const user = await getUserOrNull(request);
  if (!user) return null;
  // Session users get all scopes on their own resources
  return { user, scopes: ["ADMIN"] };
}

export function requireScope(ctx: AuthContext, scope: ApiKeyScope): void {
  if (!hasScope(ctx.scopes, scope)) {
    throw new Response(JSON.stringify({ error: "Forbidden", requiredScope: scope }), {
      status: 403,
      headers: { "Content-Type": "application/json" },
    });
  }
}

export function requireAuth(ctx: AuthContext | null): AuthContext {
  if (!ctx) {
    throw new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }
  return ctx;
}
