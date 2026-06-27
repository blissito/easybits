import { LRUCache } from "lru-cache";

// Configuración del rate limiter
const rateLimitConfig = {
  windowMs: 15 * 60 * 1000, // 15 minutos
  maxRequests: 100, // máximo 100 requests por IP en 15 minutos
  message: "Too many requests from this IP, please try again later.",
  standardHeaders: true,
  legacyHeaders: false,
};

// Configuración específica para eventos de Stripe
const stripeEventLimits = {
  "payment_intent.succeeded": { maxRequests: 50, windowMs: 5 * 60 * 1000 }, // 50 por 5 min
  "charge.succeeded": { maxRequests: 50, windowMs: 5 * 60 * 1000 },
  "customer.subscription.created": {
    maxRequests: 20,
    windowMs: 10 * 60 * 1000,
  }, // 20 por 10 min
  "checkout.session.completed": { maxRequests: 30, windowMs: 5 * 60 * 1000 },
  default: { maxRequests: 100, windowMs: 15 * 60 * 1000 },
};

// Cache para almacenar las IPs y sus requests
const ipCache = new LRUCache<string, number[]>({
  max: 500, // máximo 500 IPs en cache
  ttl: rateLimitConfig.windowMs,
});

// Cache específico para eventos de Stripe
const eventCache = new LRUCache<string, number[]>({
  max: 1000,
  ttl: 15 * 60 * 1000, // TTL más largo para cubrir todas las ventanas
});

export class RateLimiter {
  private windowMs: number;
  private maxRequests: number;

  constructor(options: { windowMs: number; maxRequests: number } = rateLimitConfig) {
    this.windowMs = options.windowMs;
    this.maxRequests = options.maxRequests;
  }

  async checkRateLimit(identifier: string): Promise<{
    allowed: boolean;
    remaining: number;
    resetTime: number;
  }> {
    // Validar que el identificador no sea "unknown"
    if (identifier === "unknown") {
      console.warn("Rate limiting skipped for unknown IP");
      return {
        allowed: true,
        remaining: -1,
        resetTime: Date.now(),
      };
    }

    const now = Date.now();
    const windowStart = now - this.windowMs;

    // Obtener requests existentes para esta IP
    const requests = ipCache.get(identifier) || [];

    // Filtrar requests dentro de la ventana de tiempo
    const recentRequests = requests.filter(
      (timestamp: number) => timestamp > windowStart
    );

    // Verificar si excede el límite
    const isAllowed = recentRequests.length < this.maxRequests;

    if (isAllowed) {
      // Agregar el request actual
      recentRequests.push(now);
      ipCache.set(identifier, recentRequests);
    }

    return {
      allowed: isAllowed,
      remaining: Math.max(0, this.maxRequests - recentRequests.length),
      resetTime: windowStart + this.windowMs,
    };
  }

  // Rate limiting específico para eventos de Stripe
  async checkStripeEventRateLimit(
    eventType: string,
    identifier: string
  ): Promise<{
    allowed: boolean;
    remaining: number;
    resetTime: number;
  }> {
    // Validar que el identificador no sea "unknown"
    if (identifier === "unknown") {
      console.warn("Stripe event rate limiting skipped for unknown IP");
      return {
        allowed: true,
        remaining: -1,
        resetTime: Date.now(),
      };
    }

    const config =
      stripeEventLimits[eventType as keyof typeof stripeEventLimits] ||
      stripeEventLimits.default;
    const now = Date.now();
    const windowStart = now - config.windowMs;

    const cacheKey = `${identifier}:${eventType}`;
    const requests = eventCache.get(cacheKey) || [];
    const recentRequests = requests.filter(
      (timestamp: number) => timestamp > windowStart
    );

    const isAllowed = recentRequests.length < config.maxRequests;

    if (isAllowed) {
      recentRequests.push(now);
      eventCache.set(cacheKey, recentRequests);
    }

    return {
      allowed: isAllowed,
      remaining: Math.max(0, config.maxRequests - recentRequests.length),
      resetTime: windowStart + config.windowMs,
    };
  }

  // Método específico para webhooks de Stripe
  async checkStripeWebhookRateLimit(request: Request): Promise<{
    allowed: boolean;
    remaining: number;
    resetTime: number;
  }> {
    const clientIP = this.getClientIP(request);
    return this.checkRateLimit(clientIP);
  }

  public getClientIP(request: Request): string {
    // Obtener IP real considerando proxies
    const forwarded = request.headers.get("x-forwarded-for");
    const realIP = request.headers.get("x-real-ip");

    if (forwarded) {
      const firstIP = forwarded.split(",")[0].trim();
      // Validar que sea una IP válida
      if (this.isValidIP(firstIP)) {
        return firstIP;
      }
    }

    if (realIP) {
      if (this.isValidIP(realIP)) {
        return realIP;
      }
    }

    // Si no se puede obtener una IP válida, usar un identificador único
    // basado en headers para evitar agrupar todas las IPs desconocidas
    const userAgent = request.headers.get("user-agent") || "unknown-ua";
    const accept = request.headers.get("accept") || "unknown-accept";
    return `unknown-${userAgent.substring(0, 10)}-${accept.substring(0, 10)}`;
  }

  private isValidIP(ip: string): boolean {
    // Validación básica de IP
    const ipv4Regex =
      /^(?:(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.){3}(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)$/;
    const ipv6Regex = /^(?:[0-9a-fA-F]{1,4}:){7}[0-9a-fA-F]{1,4}$/;

    return ipv4Regex.test(ip) || ipv6Regex.test(ip);
  }
}

// Instancia global del rate limiter
export const webhookRateLimiter = new RateLimiter();

// ─── Sandbox rate limiting (per API key / user) ──────────────────
// Sandbox spawn es la operación cara (microVM nueva) → tope estricto.
const sandboxCreateLimiter = new RateLimiter({
  windowMs: 60_000,
  maxRequests: 10,
});
// Resto de ops (exec, run-cell, files, bg, expose…) → tope holgado.
const sandboxOpsLimiter = new RateLimiter({
  windowMs: 60_000,
  maxRequests: 120,
});

// Fuente de verdad compartida (REST + MCP). Limita por identificador del caller
// (API key id o user id), no por IP. La ventana es de 60s; resetTime del
// RateLimiter colapsa a ~now, así que devolvemos el tamaño de ventana como hint
// de reintento (cota superior honesta). Fail-open en caso de error interno.
export async function checkSandboxRateLimit(
  identifier: string,
  kind: "create" | "op"
): Promise<{
  allowed: boolean;
  remaining: number;
  max: number;
  retryAfterS: number;
}> {
  const max = kind === "create" ? 10 : 120;
  try {
    const limiter =
      kind === "create" ? sandboxCreateLimiter : sandboxOpsLimiter;
    // checkRateLimit usa un cache global keyed por identificador — namespacear
    // por kind para que los buckets de "create" y "op" no se mezclen.
    const rateLimit = await limiter.checkRateLimit(`sb:${kind}:${identifier}`);
    return {
      allowed: rateLimit.allowed,
      remaining: rateLimit.remaining,
      max,
      retryAfterS: 60,
    };
  } catch (error) {
    console.error("Sandbox rate limiting error:", error);
    return { allowed: true, remaining: max, max, retryAfterS: 60 };
  }
}

// ─── Burbuja pública del FleetAgent (canal web) ──────────────────
// El groupId lo controla el cliente, así que el tope per-(agent,group) de
// routeMessage es saltable rotando el uuid. Este guard limita por IP la
// superficie pública (message / message-stream) para que rotar groupId no
// multiplique el cupo. Ventana 60s. Fail-open en error.
const fleetAgentWebIpLimiter = new RateLimiter({ windowMs: 60_000, maxRequests: 30 });

export async function checkFleetAgentWebIp(request: Request): Promise<boolean> {
  try {
    const ip = fleetAgentWebIpLimiter.getClientIP(request);
    const rl = await fleetAgentWebIpLimiter.checkRateLimit(`fleetweb:${ip}`);
    return rl.allowed;
  } catch (error) {
    console.error("FleetAgent web IP rate limiting error:", error);
    return true;
  }
}

// Adaptador REST: devuelve un 429 Response si excede, o null para continuar.
export async function applySandboxRateLimit(
  identifier: string,
  kind: "create" | "op"
): Promise<Response | null> {
  const rl = await checkSandboxRateLimit(identifier, kind);
  if (rl.allowed) return null;

  const resetIso = new Date(Date.now() + rl.retryAfterS * 1000).toISOString();
  return new Response(
    JSON.stringify({
      error: "Rate limit exceeded",
      message:
        kind === "create"
          ? "Too many sandboxes created, please slow down."
          : "Too many sandbox requests, please slow down.",
      resetTime: resetIso,
    }),
    {
      status: 429,
      headers: {
        "Content-Type": "application/json",
        "X-RateLimit-Limit": rl.max.toString(),
        "X-RateLimit-Remaining": rl.remaining.toString(),
        "X-RateLimit-Reset": resetIso,
        "Retry-After": rl.retryAfterS.toString(),
      },
    }
  );
}

// Middleware para aplicar rate limiting
export async function applyRateLimit(
  request: Request
): Promise<Response | null> {
  try {
    const rateLimit = await webhookRateLimiter.checkStripeWebhookRateLimit(
      request
    );

    if (!rateLimit.allowed) {
      return new Response(
        JSON.stringify({
          error: "Rate limit exceeded",
          message: "Too many requests, please try again later.",
          resetTime: new Date(rateLimit.resetTime).toISOString(),
        }),
        {
          status: 429,
          headers: {
            "Content-Type": "application/json",
            "X-RateLimit-Limit": rateLimitConfig.maxRequests.toString(),
            "X-RateLimit-Remaining": rateLimit.remaining.toString(),
            "X-RateLimit-Reset": new Date(rateLimit.resetTime).toISOString(),
            "Retry-After": Math.ceil(
              (rateLimit.resetTime - Date.now()) / 1000
            ).toString(),
          },
        }
      );
    }

    return null; // Continúa con el procesamiento normal
  } catch (error) {
    console.error("Rate limiting error:", error);
    // En caso de error, permitir el request para evitar bloqueos
    return null;
  }
}

// Middleware para rate limiting específico de eventos de Stripe
export async function applyStripeEventRateLimit(
  eventType: string,
  request: Request
): Promise<Response | null> {
  try {
    const clientIP = webhookRateLimiter.getClientIP(request);
    const rateLimit = await webhookRateLimiter.checkStripeEventRateLimit(
      eventType,
      clientIP
    );

    if (!rateLimit.allowed) {
      const config =
        stripeEventLimits[eventType as keyof typeof stripeEventLimits] ||
        stripeEventLimits.default;
      return new Response(
        JSON.stringify({
          error: "Stripe event rate limit exceeded",
          message: `Too many ${eventType} events, please try again later.`,
          resetTime: new Date(rateLimit.resetTime).toISOString(),
        }),
        {
          status: 429,
          headers: {
            "Content-Type": "application/json",
            "X-RateLimit-Limit": config.maxRequests.toString(),
            "X-RateLimit-Remaining": rateLimit.remaining.toString(),
            "X-RateLimit-Reset": new Date(rateLimit.resetTime).toISOString(),
            "Retry-After": Math.ceil(
              (rateLimit.resetTime - Date.now()) / 1000
            ).toString(),
          },
        }
      );
    }

    return null;
  } catch (error) {
    console.error("Stripe event rate limiting error:", error);
    // En caso de error, permitir el request para evitar bloqueos
    return null;
  }
}
