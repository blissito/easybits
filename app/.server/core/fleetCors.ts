import type { FleetAuthResult } from "../apiAuth";

/**
 * CORS para las superficies de mensajería de un FleetAgent.
 *
 * Por qué no es siempre `*`: un token publishable (`flt_pk_`) vive en el navegador de
 * los usuarios del integrador, así que la única barrera práctica contra que alguien lo
 * copie y lo use desde otro sitio es el origen. Cuando el token declara
 * `allowedOrigins`, se refleja el origen SÓLO si está en la lista.
 *
 * Los tokens server-to-server (legacy, `flt_sk_`, formmySecret) no declaran orígenes y
 * conservan `*` — el navegador nunca los ve y restringirlos rompería a Formmy/Baileys.
 */
export function corsForFleetAuth(
  request: Request,
  auth: Pick<FleetAuthResult, "allowedOrigins">,
  base: Record<string, string>
): Record<string, string> {
  const allowed = auth.allowedOrigins ?? [];
  if (!allowed.length) return base;
  const origin = request.headers.get("Origin") || "";
  return {
    ...base,
    // Sin match, se omite el header: el navegador bloquea la respuesta.
    ...(origin && allowed.includes(origin)
      ? { "Access-Control-Allow-Origin": origin, Vary: "Origin" }
      : { "Access-Control-Allow-Origin": "null" }),
  };
}

/** ¿El origen del request está permitido? Para rechazar ANTES de ejecutar el turno. */
export function originAllowed(
  request: Request,
  auth: Pick<FleetAuthResult, "allowedOrigins">
): boolean {
  const allowed = auth.allowedOrigins ?? [];
  if (!allowed.length) return true;
  const origin = request.headers.get("Origin");
  // Sin Origin = no es un navegador (curl, server-to-server). El token publishable
  // igual está acotado a MESSAGE, así que no se gana nada bloqueando aquí.
  if (!origin) return true;
  return allowed.includes(origin);
}
