import type { Route } from "./+types/forms.$formId.submit";
import { handleFormSubmission } from "~/.server/core/formOperations";
import { RateLimiter } from "~/.server/rateLimiter";

const formRateLimiter = new RateLimiter({
  windowMs: 15 * 60 * 1000,
  maxRequests: 20,
});

function corsHeaders(_request: Request): Record<string, string> {
  // Form widgets are public (no cookies/credentials) and meant to be embedded
  // on arbitrary customer domains — including sandbox custom domains. Allow any
  // origin so the snippet works wherever it's pasted.
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Max-Age": "86400",
  };
}

// Preflight
export async function loader({ request }: Route.LoaderArgs) {
  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders(request) });
  }
  return new Response("Method not allowed", { status: 405 });
}

export async function action({ request, params }: Route.ActionArgs) {
  const headers = corsHeaders(request);

  // Rate limit
  const ip =
    request.headers.get("X-Forwarded-For")?.split(",")[0]?.trim() ||
    request.headers.get("CF-Connecting-IP") ||
    "unknown";
  const rateLimitKey = `form:${params.formId}:${ip}`;
  const { allowed } = await formRateLimiter.checkRateLimit(rateLimitKey);
  if (!allowed) {
    return new Response(
      JSON.stringify({ ok: false, error: "Too many submissions" }),
      { status: 429, headers: { ...headers, "Content-Type": "application/json" } }
    );
  }

  // Parse body
  let data: Record<string, unknown>;
  try {
    data = await request.json();
  } catch {
    return new Response(
      JSON.stringify({ ok: false, error: "Invalid JSON" }),
      { status: 400, headers: { ...headers, "Content-Type": "application/json" } }
    );
  }

  // Honeypot check
  if (data._hp) {
    // Silently accept to not tip off bots
    return new Response(
      JSON.stringify({ ok: true }),
      { status: 200, headers: { ...headers, "Content-Type": "application/json" } }
    );
  }

  // Remove honeypot from data
  delete data._hp;

  try {
    const result = await handleFormSubmission(params.formId, data, ip);
    return new Response(JSON.stringify(result), {
      status: 200,
      headers: { ...headers, "Content-Type": "application/json" },
    });
  } catch (err) {
    if (err instanceof Response) {
      // Re-throw with CORS headers
      const body = await err.text();
      return new Response(body, {
        status: err.status,
        headers: { ...headers, "Content-Type": "application/json" },
      });
    }
    console.error("Form submission error:", err);
    return new Response(
      JSON.stringify({ ok: false, error: "Internal error" }),
      { status: 500, headers: { ...headers, "Content-Type": "application/json" } }
    );
  }
}
