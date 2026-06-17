// ─────────────────────────────────────────────────────────────────────────────
// MCP response helpers — forma ÚNICA de éxito, error y paginación.
//
// Antes había 3 formas de error (texto plano + isError, JSON + isError,
// {ok:false} sin flag) y 3 de paginación (cursor, offset, array crudo). Estos
// helpers consolidan todo: un agente siempre parsea lo mismo.
//
//  • ok(data)            → éxito. { content:[text(JSON)], structuredContent }
//  • fail(message, extra)→ error. { content:[text({error,...extra})], isError:true }
//  • paginate(items, …)  → envelope de lista { items, nextCursor, hasMore, total? }
//                          (devuelve el objeto de datos; envolver con ok()).
// ─────────────────────────────────────────────────────────────────────────────

import {
  QuotaExceededError,
  ServiceConfigError,
  ServiceProviderError,
} from "../services/errors";

type McpTextResponse = {
  content: { type: "text"; text: string }[];
  structuredContent?: unknown;
  isError?: boolean;
};

/** Respuesta de éxito. Misma forma que ya usaban los ~134 handlers. */
export function ok(data: unknown): McpTextResponse {
  return {
    content: [{ type: "text", text: JSON.stringify(data, null, 2) }],
    structuredContent: data as object,
  };
}

/** Respuesta de error única: { error: string, ...extra } + isError:true. */
export function fail(
  message: string,
  extra?: Record<string, unknown>
): McpTextResponse {
  return {
    content: [
      {
        type: "text",
        text: JSON.stringify({ error: message, ...extra }, null, 2),
      },
    ],
    isError: true,
  };
}

/**
 * Envelope de paginación único para TODOS los list_*.
 * Devuelve el objeto de datos — envolver con ok(): `ok(paginate(items, {...}))`.
 * `hasMore` se deriva de `nextCursor`. `total` solo se incluye si se pasa.
 */
export function paginate<T>(
  items: T[],
  opts?: { nextCursor?: string | null; total?: number }
): { items: T[]; nextCursor: string | null; hasMore: boolean; total?: number } {
  const nextCursor = opts?.nextCursor ?? null;
  const envelope: {
    items: T[];
    nextCursor: string | null;
    hasMore: boolean;
    total?: number;
  } = {
    items,
    nextCursor,
    hasMore: !!nextCursor,
  };
  if (typeof opts?.total === "number") envelope.total = opts.total;
  return envelope;
}

/**
 * Mapea los errores del catálogo de servicios (créditos/config/provider) a la
 * forma única `fail()`. Devuelve null si `e` no es un error de servicio conocido,
 * para que el handler haga `throw e` y lo atrape wrapHandler.
 * `label` es el nombre del proveedor para el mensaje (p. ej. "gpt-image", "fal.ai").
 */
export function failService(
  e: unknown,
  label: string
): McpTextResponse | null {
  if (e instanceof QuotaExceededError) {
    return fail(
      `Faltan créditos: necesitas ${e.requiredCost}, tienes ${e.available}. Compra un pack para continuar.`,
      { code: e.code, requiredCost: e.requiredCost, available: e.available }
    );
  }
  if (e instanceof ServiceConfigError) {
    return fail(`Servicio no configurado (falta ${e.missing}).`, { code: e.code });
  }
  if (e instanceof ServiceProviderError) {
    return fail(`${label}: ${e.providerMessage}`, {
      code: e.code,
      providerStatus: e.providerStatus,
    });
  }
  return null;
}
