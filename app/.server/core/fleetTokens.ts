import { createHash } from "crypto";
import { nanoid } from "nanoid";
import type { FleetTokenScope } from "@prisma/client";
import { db } from "../db";

/**
 * Credenciales CON SCOPE para un FleetAgent.
 *
 * Por qué existe: `FleetAgent.token` es una sola credencial omnipotente — el mismo
 * bearer manda mensajes, cambia el prompt/modelo/secretos y BORRA el agente. Eso hace
 * imposible que un tercero embeba el agente en su app sin entregar el control total.
 *
 * Diseño calcado de `iam.ts` (mismo hash sha256, mismo "se muestra una sola vez"),
 * deliberadamente en su propia colección: esto no es permiso sobre la cuenta de
 * EasyBits, es permiso sobre UN agente.
 */

/** Publishable: sólo MESSAGE, admitida en `?token=`, sujeta a allowedOrigins. */
export const PUBLISHABLE_PREFIX = "flt_pk_";
/** Secreta: cualquier scope, PROHIBIDA en query string. */
export const SECRET_PREFIX = "flt_sk_";

function hashKey(raw: string): string {
  return createHash("sha256").update(raw).digest("hex");
}

export function isFleetToken(raw: string): boolean {
  return raw.startsWith(PUBLISHABLE_PREFIX) || raw.startsWith(SECRET_PREFIX);
}

export function isPublishable(raw: string): boolean {
  return raw.startsWith(PUBLISHABLE_PREFIX);
}

export function generateFleetToken(publishable: boolean): {
  raw: string;
  prefix: string;
  hashed: string;
} {
  const raw = `${publishable ? PUBLISHABLE_PREFIX : SECRET_PREFIX}${nanoid(32)}`;
  // prefijo visible en la UI para reconocer la llave sin revelarla
  return { raw, prefix: raw.slice(0, 15), hashed: hashKey(raw) };
}

export async function createFleetToken(
  fleetAgentId: string,
  opts: {
    name: string;
    scopes: FleetTokenScope[];
    /** Publishable (flt_pk_) sólo puede ser MESSAGE — se valida aquí. */
    publishable?: boolean;
    cfgId?: string | null;
    allowedOrigins?: string[];
    expiresAt?: Date | null;
  }
) {
  const publishable = opts.publishable ?? false;
  if (publishable && opts.scopes.some((s) => s !== "MESSAGE")) {
    throw new Error("Un token publishable (flt_pk_) sólo admite scope MESSAGE");
  }
  if (!opts.scopes.length) throw new Error("Se requiere al menos un scope");
  const { raw, prefix, hashed } = generateFleetToken(publishable);
  const row = await db.fleetAgentToken.create({
    data: {
      fleetAgentId,
      name: opts.name,
      hashedKey: hashed,
      prefix,
      scopes: opts.scopes,
      cfgId: opts.cfgId ?? null,
      allowedOrigins: opts.allowedOrigins ?? [],
      expiresAt: opts.expiresAt ?? null,
    },
  });
  // `raw` se devuelve UNA vez y no vuelve a ser recuperable.
  return { id: row.id, prefix, raw, scopes: row.scopes, name: row.name, cfgId: row.cfgId };
}

/**
 * Resuelve un token crudo. Devuelve null si no existe, fue revocado o expiró.
 * No decide permisos — eso lo hace `authFleetAgent` con el scope requerido.
 */
export async function validateFleetToken(raw: string) {
  if (!isFleetToken(raw)) return null;
  const row = await db.fleetAgentToken.findUnique({ where: { hashedKey: hashKey(raw) } });
  if (!row) return null;
  if (row.revokedAt) return null;
  if (row.expiresAt && row.expiresAt < new Date()) return null;
  return row;
}

// Un write por request sería caro y no aporta precisión: `lastUsedAt` sólo sirve para
// saber QUÉ integraciones siguen vivas antes de retirar el token legacy. Se refresca
// como mucho cada 5 min, fire-and-forget.
const TOUCH_MS = 5 * 60 * 1000;
export function touchFleetToken(row: { id: string; lastUsedAt: Date | null }): void {
  if (row.lastUsedAt && Date.now() - row.lastUsedAt.getTime() < TOUCH_MS) return;
  db.fleetAgentToken
    .update({ where: { id: row.id }, data: { lastUsedAt: new Date() } })
    .catch(() => {});
}

export async function revokeFleetToken(tokenId: string, fleetAgentId: string) {
  const r = await db.fleetAgentToken.updateMany({
    where: { id: tokenId, fleetAgentId },
    data: { revokedAt: new Date() },
  });
  // Si la revocada era la del worker, el caché la seguiría entregando hasta el TTL.
  forgetWorkerTokens(fleetAgentId);
  return r;
}

// ⚠️ Un token vivo NO tiene `revokedAt: null`: nunca se escribe el campo, así que en
// Mongo está AUSENTE — y un campo ausente no matchea `null` ni `{ not: ... }`, sólo
// `{ isSet: false }`. Filtrar por `revokedAt: null` devolvía SIEMPRE la lista vacía.
const NOT_REVOKED = { OR: [{ revokedAt: null }, { revokedAt: { isSet: false } }] };

export async function listFleetTokens(fleetAgentId: string) {
  return db.fleetAgentToken.findMany({
    where: { fleetAgentId, ...NOT_REVOKED },
    select: {
      id: true,
      name: true,
      prefix: true,
      scopes: true,
      cfgId: true,
      allowedOrigins: true,
      expiresAt: true,
      lastUsedAt: true,
      createdAt: true,
    },
    orderBy: { createdAt: "desc" },
  });
}

/** ADMIN implica MANAGE implica MESSAGE. */
export function hasFleetScope(scopes: FleetTokenScope[], required: FleetTokenScope): boolean {
  if (scopes.includes("ADMIN")) return true;
  if (required === "MESSAGE") return scopes.includes("MESSAGE") || scopes.includes("MANAGE");
  return scopes.includes(required);
}

// ─────────────────────────────────────────────────────────────────────────────
// Tokens que viven DENTRO del worker
// ─────────────────────────────────────────────────────────────────────────────
//
// El worker necesita una credencial para hablar de vuelta con EasyBits (los MCP
// render/artifact/vision y el callback de WhatsApp). Hasta ahora se le entregaba
// `fleetAgent.token`, que es omnipotente: una prompt injection en el turno de
// cualquier tenant podía usarlo para BORRAR el agente. Se sustituye por dos tokens
// acotados, cacheados cifrados en el vault del dueño (`app/.server/crypto.ts`):
//
//   FLEET_WORKER_TOKEN_<id>        scope MESSAGE — el que va en todo turno.
//   FLEET_WORKER_ADMIN_TOKEN_<id>  scope ADMIN   — sólo en turnos admin (el dueño
//                                  administrando desde su propia conversación).
//
// El raw se guarda porque no es recuperable del hash y hay que re-inyectarlo en cada
// spawn; el vault ya es el sitio correcto para eso (AES-256-GCM).

const secretNameFor = (fleetAgentId: string, admin: boolean) =>
  `FLEET_WORKER${admin ? "_ADMIN" : ""}_TOKEN_${fleetAgentId.toUpperCase()}`;

async function ensureWorkerToken(
  fleetAgentId: string,
  ownerId: string,
  admin: boolean
): Promise<string> {
  const { getSecretValue, createSecret } = await import("./secretOperations");
  const name = secretNameFor(fleetAgentId, admin);
  const cached = await getSecretValue(ownerId, name).catch(() => null);
  // Revalidar contra la tabla: si el token fue revocado, el secreto cacheado es basura.
  if (cached && (await validateFleetToken(cached))) return cached;
  const created = await createFleetToken(fleetAgentId, {
    name: admin ? "worker (admin)" : "worker",
    scopes: [admin ? "ADMIN" : "MESSAGE"],
  });
  await createSecret(ownerId, { name, value: created.raw });
  return created.raw;
}

// Esto corre en el CAMINO CALIENTE (una vez por turno), así que sin caché serían dos
// lecturas al vault + dos validaciones por mensaje. El TTL es corto a propósito: si se
// revoca un token, el worker deja de usarlo en minutos sin necesidad de reciclar la caja.
type WorkerTokens = { message: string; admin: string };
const workerTokenCache = new Map<string, { value: WorkerTokens; expiresAt: number }>();
const WORKER_TOKEN_TTL_MS = 5 * 60 * 1000;

/**
 * Tokens del worker para un turno o un spawn. Falla suave a `fleetAgent.token`: si el
 * vault o la DB no responden, es preferible un turno que funciona con la credencial
 * vieja a un agente mudo — el endurecimiento no debe convertirse en un modo de caída.
 */
export async function ensureWorkerTokens(fleetAgent: {
  id: string;
  ownerId: string;
  token: string;
}): Promise<WorkerTokens> {
  const cached = workerTokenCache.get(fleetAgent.id);
  if (cached && cached.expiresAt > Date.now()) return cached.value;
  try {
    const [message, admin] = await Promise.all([
      ensureWorkerToken(fleetAgent.id, fleetAgent.ownerId, false),
      ensureWorkerToken(fleetAgent.id, fleetAgent.ownerId, true),
    ]);
    const value = { message, admin };
    workerTokenCache.set(fleetAgent.id, { value, expiresAt: Date.now() + WORKER_TOKEN_TTL_MS });
    return value;
  } catch (e) {
    console.error(
      `[fleet-tokens] no se pudieron resolver los tokens del worker para ${fleetAgent.id}; usando el token legacy`,
      e
    );
    // El fallback NO se cachea: el siguiente turno vuelve a intentar el camino correcto.
    return { message: fleetAgent.token, admin: fleetAgent.token };
  }
}

/** Invalida el caché — al revocar un token del worker o al reciclar el agente. */
export function forgetWorkerTokens(fleetAgentId: string): void {
  workerTokenCache.delete(fleetAgentId);
}
