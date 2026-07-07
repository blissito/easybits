import type { Route } from "./+types/forms.$formId.upload";
import { uploadFormFile } from "~/.server/core/formOperations";
import { RateLimiter } from "~/.server/rateLimiter";

const uploadRateLimiter = new RateLimiter({
  windowMs: 15 * 60 * 1000,
  maxRequests: 30,
});

function corsHeaders(): Record<string, string> {
  // Hosted/embeddable form — allow any origin (no cookies/credentials).
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Max-Age": "86400",
  };
}

export async function loader({ request }: Route.LoaderArgs) {
  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders() });
  }
  return new Response("Method not allowed", { status: 405 });
}

export async function action({ request, params }: Route.ActionArgs) {
  const headers = { ...corsHeaders(), "Content-Type": "application/json" };

  const ip =
    request.headers.get("X-Forwarded-For")?.split(",")[0]?.trim() ||
    request.headers.get("CF-Connecting-IP") ||
    "unknown";
  const { allowed } = await uploadRateLimiter.checkRateLimit(`upload:${params.formId}:${ip}`);
  if (!allowed) {
    return new Response(JSON.stringify({ ok: false, error: "Too many uploads" }), {
      status: 429,
      headers,
    });
  }

  let file: File | null = null;
  try {
    const form = await request.formData();
    const f = form.get("file");
    if (f instanceof File) file = f;
  } catch {
    return new Response(JSON.stringify({ ok: false, error: "Invalid upload" }), {
      status: 400,
      headers,
    });
  }

  if (!file) {
    return new Response(JSON.stringify({ ok: false, error: "No file provided" }), {
      status: 400,
      headers,
    });
  }

  try {
    const bytes = Buffer.from(await file.arrayBuffer());
    const result = await uploadFormFile(params.formId, {
      name: file.name,
      contentType: file.type,
      bytes,
    });
    return new Response(JSON.stringify({ ok: true, ...result }), { status: 200, headers });
  } catch (err) {
    if (err instanceof Response) {
      const body = await err.text();
      return new Response(body, { status: err.status, headers });
    }
    console.error("Form file upload error:", err);
    return new Response(JSON.stringify({ ok: false, error: "Internal error" }), {
      status: 500,
      headers,
    });
  }
}
