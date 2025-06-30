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

  constructor(options = rateLimitConfig) {
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
