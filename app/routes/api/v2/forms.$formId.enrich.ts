import type { Route } from "./+types/forms.$formId.enrich";
import { enrichRecentFormSubmission } from "~/.server/core/formOperations";
import { RateLimiter } from "~/.server/rateLimiter";

const enrichRateLimiter = new RateLimiter({
  windowMs: 15 * 60 * 1000,
  maxRequests: 30,
});

const ALLOWED_FIELDS = new Set(["website", "business", "description"]);

function corsHeaders(request: Request): Record<string, string> {
  const origin = request.headers.get("Origin") || "";
  const allowed =
    /^https:\/\/[\w-]+\.easybits\.cloud$/.test(origin) ||
    /^https:\/\/[\w-]+\.t3\.storage\.dev$/.test(origin);
  return {
    "Access-Control-Allow-Origin": allowed ? origin : "",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Max-Age": "86400",
  };
}

function normalizeWebsite(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) return "";
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  return `https://${trimmed}`;
}

export async function loader({ request }: Route.LoaderArgs) {
  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders(request) });
  }
  return new Response("Method not allowed", { status: 405 });
}

export async function action({ request, params }: Route.ActionArgs) {
  const headers = corsHeaders(request);
  const ip =
    request.headers.get("X-Forwarded-For")?.split(",")[0]?.trim() ||
    request.headers.get("CF-Connecting-IP") ||
    "unknown";
  const { allowed } = await enrichRateLimiter.checkRateLimit(
    `form-enrich:${params.formId}:${ip}`
  );
  if (!allowed) {
    return new Response(
      JSON.stringify({ ok: false, error: "Too many requests" }),
      { status: 429, headers: { ...headers, "Content-Type": "application/json" } }
    );
  }

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return new Response(
      JSON.stringify({ ok: false, error: "Invalid JSON" }),
      { status: 400, headers: { ...headers, "Content-Type": "application/json" } }
    );
  }

  const email = typeof body.email === "string" ? body.email.trim() : "";
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return new Response(
      JSON.stringify({ ok: false, error: "Invalid email" }),
      { status: 400, headers: { ...headers, "Content-Type": "application/json" } }
    );
  }

  const patch: Record<string, string> = {};
  for (const key of ALLOWED_FIELDS) {
    const v = body[key];
    if (typeof v !== "string") continue;
    const trimmed = v.trim();
    if (!trimmed) continue;
    if (key === "website") {
      const normalized = normalizeWebsite(trimmed);
      if (!/\.\w{2,}/.test(normalized)) {
        return new Response(
          JSON.stringify({ ok: false, error: "Invalid website" }),
          {
            status: 400,
            headers: { ...headers, "Content-Type": "application/json" },
          }
        );
      }
      patch[key] = normalized;
    } else {
      patch[key] = trimmed.slice(0, 500);
    }
  }

  if (Object.keys(patch).length === 0) {
    return new Response(
      JSON.stringify({ ok: false, error: "No fields to enrich" }),
      { status: 400, headers: { ...headers, "Content-Type": "application/json" } }
    );
  }

  try {
    const result = await enrichRecentFormSubmission(
      params.formId,
      email,
      patch
    );
    const status = result.ok ? 200 : result.reason === "form-not-found" ? 404 : 410;
    return new Response(JSON.stringify(result), {
      status,
      headers: { ...headers, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("Form enrich error:", err);
    return new Response(
      JSON.stringify({ ok: false, error: "Internal error" }),
      { status: 500, headers: { ...headers, "Content-Type": "application/json" } }
    );
  }
}
