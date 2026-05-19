import type { Route } from "./+types/agent-upload";
import { createHash } from "crypto";
import { findAgentByEmbedToken } from "~/.server/core/sandboxOperations";
import { getPlatformPublicClient, buildPublicAssetUrl } from "~/.server/storage";

// CORS abierto: este endpoint se llama desde dentro del container del agente
// (red distinta a la del browser/dashboard) pero mantenemos el patrón por
// consistencia con agent-message.ts.
const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Authorization, Content-Type",
  "Access-Control-Max-Age": "86400",
};

const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
const ALLOWED_IMAGE_TYPES: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
  "image/gif": "gif",
};

function plainTextResponse(body: string, status = 200): Response {
  return new Response(body, {
    status,
    headers: { ...CORS_HEADERS, "Content-Type": "text/plain; charset=utf-8" },
  });
}

export async function loader({ request }: Route.LoaderArgs) {
  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: CORS_HEADERS });
  }
  return plainTextResponse("method_not_allowed", 405);
}

// POST /api/v2/agent-upload
//
// Sube una imagen al bucket público y devuelve la URL como texto plano
// (no JSON — el agente la pipea directo a un $URL sin necesidad de parser).
//
// Auth: Bearer agt_* (NANOCLAW_ADMIN_TOKEN dentro del container = embedToken
// del agente). No requiere agentId en la URL — el token resuelve al agente.
//
// Body: imagen binaria. Content-Type debe ser image/{png,jpeg,webp,gif},
// tamaño máximo 5MB.
//
// Diseñado para el flujo del agente:
//   URL=$(curl -sS -X POST \
//          -H "Authorization: Bearer $NANOCLAW_ADMIN_TOKEN" \
//          -H "Content-Type: image/png" \
//          --data-binary @/tmp/screenshot.png \
//          https://www.easybits.cloud/api/v2/agent-upload)
//   echo "![screenshot]($URL)"
//
// Los objetos se guardan en el bucket público bajo
// `agent-uploads/<agentId>/<sha256-16>.<ext>` para que un job futuro pueda
// limpiar uploads de agentes destruidos.
export async function action({ request }: Route.ActionArgs) {
  const authHeader = request.headers.get("Authorization");
  const embedToken = authHeader?.startsWith("Bearer ")
    ? authHeader.slice("Bearer ".length).trim()
    : null;
  if (!embedToken?.startsWith("agt_")) {
    return plainTextResponse("unauthorized", 401);
  }

  const agent = await findAgentByEmbedToken(embedToken);
  if (!agent) {
    return plainTextResponse("invalid_token", 401);
  }

  const rawContentType = request.headers.get("Content-Type") || "";
  const baseContentType = rawContentType.split(";")[0].trim();
  const fileExtension = ALLOWED_IMAGE_TYPES[baseContentType];
  if (!fileExtension) {
    return plainTextResponse(
      `unsupported_type: ${baseContentType || "(none)"}; allowed: ${Object.keys(ALLOWED_IMAGE_TYPES).join(", ")}`,
      415,
    );
  }

  const imageBytes = Buffer.from(await request.arrayBuffer());
  if (imageBytes.length === 0) return plainTextResponse("empty_body", 400);
  if (imageBytes.length > MAX_IMAGE_BYTES) {
    return plainTextResponse(`too_large_max_${MAX_IMAGE_BYTES}_bytes`, 413);
  }

  const contentHash = createHash("sha256").update(imageBytes).digest("hex").slice(0, 16);
  const storageKey = `agent-uploads/${agent.agentId}/${contentHash}.${fileExtension}`;
  await getPlatformPublicClient().putObject(storageKey, imageBytes, baseContentType);
  return plainTextResponse(buildPublicAssetUrl(storageKey));
}
