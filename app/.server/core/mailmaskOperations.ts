/**
 * EasyBits como CLIENTE OAuth de Mailmask (estilo conector de Claude): el usuario conecta su
 * cuenta una vez y, desde ahí, EasyBits escribe solo los registros DNS de sus dominios propios
 * cuando el DNS vive en Mailmask (Route 53), y los deshace al borrar el dominio.
 *
 * Piezas (servidor de Mailmask: OAuth 2.1, DCR abierto, PKCE S256 obligatorio):
 *  - Registro dinámico perezoso del cliente (uno por redirect_uri), guardado en AppConfig.
 *  - Scope "dns" si Mailmask lo anuncia (sólo dominios y DNS); si no, "mailmask".
 *  - Tokens `mo_` (1 h) / `mr_` (60 d) cifrados en ProviderConnection. ⚠️ Mailmask ROTA el
 *    refresh y revoca toda la familia si uno se reusa: el refresh va en un solo vuelo por usuario.
 *  - Antes de escribir se guarda lo que había en cada (name,type) → deshacer restaura eso y
 *    nunca pisa un registro que el usuario cambió después.
 */
import { db } from "../db";
import { encryptSecret, decryptSecret } from "../crypto";
import { base64UrlSha256, randomToken } from "../oauth";
import { APP_HOST_DNS } from "~/lib/appHostDns";

export const MAILMASK_ORIGIN = (process.env.MAILMASK_ORIGIN || "https://www.mailmask.studio").replace(/\/$/, "");
const APP_URL = (process.env.APP_URL || "https://www.easybits.cloud").replace(/\/$/, "");
export const MAILMASK_REDIRECT_URI = `${APP_URL}/dash/integrations/mailmask/callback`;
const PROVIDER = "mailmask";

type AsMeta = {
  issuer: string;
  authorization_endpoint: string;
  token_endpoint: string;
  registration_endpoint: string;
  revocation_endpoint?: string;
  scopes_supported?: string[];
};

async function asMetadata(): Promise<AsMeta> {
  const r = await fetch(`${MAILMASK_ORIGIN}/.well-known/oauth-authorization-server`, { signal: AbortSignal.timeout(10_000) });
  if (!r.ok) throw new Error(`Mailmask no respondió su metadata OAuth (${r.status})`);
  return (await r.json()) as AsMeta;
}

/** Cliente registrado por DCR (uno por redirect_uri), reusado entre deploys vía AppConfig. */
async function oauthClient(meta: AsMeta): Promise<{ clientId: string }> {
  const key = `mailmask-oauth-client:${MAILMASK_REDIRECT_URI}`;
  const cached = await db.appConfig.findUnique({ where: { key } });
  const v = cached?.value as { clientId?: string; issuer?: string } | undefined;
  if (v?.clientId && v.issuer === meta.issuer) return { clientId: v.clientId };
  const r = await fetch(meta.registration_endpoint, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      client_name: "EasyBits",
      client_uri: APP_URL,
      logo_uri: `${APP_URL}/logo-purple.svg`,
      redirect_uris: [MAILMASK_REDIRECT_URI],
      token_endpoint_auth_method: "none", // cliente público + PKCE
      grant_types: ["authorization_code", "refresh_token"],
      response_types: ["code"],
    }),
  });
  if (!r.ok) throw new Error(`Mailmask no registró a EasyBits como cliente (${r.status})`);
  const j = (await r.json()) as { client_id: string };
  await db.appConfig.upsert({
    where: { key },
    create: { key, value: { clientId: j.client_id, issuer: meta.issuer } },
    update: { value: { clientId: j.client_id, issuer: meta.issuer } },
  });
  return { clientId: j.client_id };
}

/** URL de consentimiento + lo que el callback necesita (va en la cookie firmada del state). */
export async function mailmaskAuthorize(): Promise<{ url: string; state: string; verifier: string; scope: string }> {
  const meta = await asMetadata();
  const { clientId } = await oauthClient(meta);
  const verifier = randomToken(48);
  const state = randomToken(24);
  // Sólo DNS cuando Mailmask lo ofrece: no hace falta leer el correo de nadie para esto.
  const scope = meta.scopes_supported?.includes("dns") ? "dns" : "mailmask";
  const q = new URLSearchParams({
    response_type: "code",
    client_id: clientId,
    redirect_uri: MAILMASK_REDIRECT_URI,
    code_challenge: base64UrlSha256(verifier),
    code_challenge_method: "S256",
    state,
    scope,
    resource: `${meta.issuer}/mcp`,
  });
  return { url: `${meta.authorization_endpoint}?${q}`, state, verifier, scope };
}

type TokenSet = { access_token: string; refresh_token?: string; expires_in?: number; scope?: string };

async function tokenRequest(meta: AsMeta, body: Record<string, string>): Promise<TokenSet> {
  const r = await fetch(meta.token_endpoint, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ ...body, resource: `${meta.issuer}/mcp` }),
    signal: AbortSignal.timeout(15_000),
  });
  const j = (await r.json().catch(() => ({}))) as TokenSet & { error?: string };
  if (!r.ok || !j.access_token) throw new Error(`Mailmask rechazó el token (${j.error ?? r.status})`);
  return j;
}

async function saveTokens(userId: string, t: TokenSet, keepRefresh?: string | null) {
  const data = {
    accessToken: encryptSecret(t.access_token),
    refreshToken: t.refresh_token ? encryptSecret(t.refresh_token) : keepRefresh ?? null,
    expiresAt: new Date(Date.now() + (t.expires_in ?? 3600) * 1000),
    scope: t.scope ?? null,
  };
  await db.providerConnection.upsert({
    where: { userId_provider: { userId, provider: PROVIDER } },
    create: { userId, provider: PROVIDER, ...data },
    update: data,
  });
}

/** Callback: canjea el code (una sola vez) y guarda la conexión. */
export async function mailmaskExchange(userId: string, code: string, verifier: string) {
  const meta = await asMetadata();
  const { clientId } = await oauthClient(meta);
  const t = await tokenRequest(meta, {
    grant_type: "authorization_code",
    code,
    redirect_uri: MAILMASK_REDIRECT_URI,
    client_id: clientId,
    code_verifier: verifier,
  });
  await saveTokens(userId, t);
}

export async function mailmaskConnection(userId: string) {
  const c = await db.providerConnection.findUnique({
    where: { userId_provider: { userId, provider: PROVIDER } },
    select: { scope: true, createdAt: true, updatedAt: true },
  });
  return c ? { connected: true as const, scope: c.scope, since: c.createdAt } : { connected: false as const };
}

export async function disconnectMailmask(userId: string) {
  const c = await db.providerConnection.findUnique({ where: { userId_provider: { userId, provider: PROVIDER } } });
  if (!c) return { ok: true };
  try {
    const meta = await asMetadata();
    const { clientId } = await oauthClient(meta);
    if (meta.revocation_endpoint && c.refreshToken) {
      await fetch(meta.revocation_endpoint, {
        method: "POST",
        headers: { "content-type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({ token: decryptSecret(c.refreshToken), client_id: clientId }),
      }).catch(() => undefined);
    }
  } catch {
    // Revocar es cortesía: la conexión local se borra igual.
  }
  await db.providerConnection.delete({ where: { id: c.id } });
  return { ok: true };
}

// Un solo refresh en vuelo por usuario: dos en paralelo reusarían el mismo `mr_` y Mailmask
// revocaría la familia entera (el usuario tendría que reconectar).
const refreshing = new Map<string, Promise<string>>();

async function accessToken(userId: string): Promise<string> {
  const c = await db.providerConnection.findUnique({ where: { userId_provider: { userId, provider: PROVIDER } } });
  if (!c) throw new MailmaskNotConnected();
  if (c.expiresAt && c.expiresAt.getTime() - Date.now() > 60_000) return decryptSecret(c.accessToken);
  if (!c.refreshToken) throw new MailmaskNotConnected();
  const inflight = refreshing.get(userId);
  if (inflight) return inflight;
  const p = (async () => {
    try {
      const meta = await asMetadata();
      const { clientId } = await oauthClient(meta);
      const t = await tokenRequest(meta, { grant_type: "refresh_token", refresh_token: decryptSecret(c.refreshToken!), client_id: clientId });
      await saveTokens(userId, t, c.refreshToken);
      return t.access_token;
    } catch (e) {
      // Refresh muerto = la persona revocó o cambió su contraseña: hay que reconectar.
      await db.providerConnection.delete({ where: { id: c.id } }).catch(() => undefined);
      throw new MailmaskNotConnected();
    } finally {
      refreshing.delete(userId);
    }
  })();
  refreshing.set(userId, p);
  return p;
}

export class MailmaskNotConnected extends Error {
  code = "MailmaskNotConnected";
  constructor() {
    super("Conecta tu cuenta de Mailmask primero.");
  }
}

async function mm<T>(userId: string, path: string, init?: RequestInit): Promise<T> {
  const token = await accessToken(userId);
  const r = await fetch(`${MAILMASK_ORIGIN}${path}`, {
    ...init,
    headers: { Authorization: `Bearer ${token}`, "content-type": "application/json", ...(init?.headers ?? {}) },
    signal: AbortSignal.timeout(20_000),
  });
  if (r.status === 401) {
    await db.providerConnection.deleteMany({ where: { userId, provider: PROVIDER } });
    throw new MailmaskNotConnected();
  }
  const j = (await r.json().catch(() => ({}))) as T & { error?: string };
  if (!r.ok) throw new Error(`Mailmask: ${(j as any)?.error ?? r.status}`);
  return j;
}

// --- DNS ---

export type RRSet = { name: string; type: string; ttl?: number; values: string[] };
type MmDomain = { id: string; domain: string; hostedZoneId?: string | null; dnsZoneStatus?: string };

/** La zona de Mailmask que cubre `domain` (custom.fancyfiles.app → zona fancyfiles.app), o null. */
export async function mailmaskZoneFor(userId: string, domain: string): Promise<MmDomain | null> {
  const r = await mm<MmDomain[] | { domains: MmDomain[] }>(userId, "/api/domains");
  const list = Array.isArray(r) ? r : r.domains ?? [];
  const d = domain.toLowerCase();
  const matches = list
    .filter((z) => z.hostedZoneId && (d === z.domain.toLowerCase() || d.endsWith(`.${z.domain.toLowerCase()}`)))
    .sort((a, b) => b.domain.length - a.domain.length);
  return matches[0] ?? null;
}

async function currentRecords(userId: string, zoneId: string): Promise<RRSet[]> {
  const r = await mm<{ records: RRSet[] }>(userId, `/api/domains/${zoneId}/dns`);
  return r.records ?? [];
}

/** Los registros que EasyBits necesita para `domain` (comodín + verificación; raíz y www si hay apex). */
export function easybitsDnsRecords(domain: string, txtToken: string, apex: boolean): RRSet[] {
  const d = domain.toLowerCase();
  const out: RRSet[] = [
    { name: `_easybits-verify.${d}`, type: "TXT", ttl: 300, values: [`"${txtToken}"`] },
    { name: `*.${d}`, type: "CNAME", ttl: 300, values: [APP_HOST_DNS.cnameTarget] },
  ];
  if (apex) {
    out.push(
      { name: d, type: "A", ttl: 300, values: [APP_HOST_DNS.v4] },
      { name: `www.${d}`, type: "CNAME", ttl: 300, values: [APP_HOST_DNS.cnameTarget] }
    );
  }
  return out;
}

const keyOf = (r: { name: string; type: string }) => `${r.name.toLowerCase()}|${r.type.toUpperCase()}`;
const sameValues = (a?: string[], b?: string[]) =>
  JSON.stringify([...(a ?? [])].map((x) => x.toLowerCase().replace(/\.$/, "")).sort()) ===
  JSON.stringify([...(b ?? [])].map((x) => x.toLowerCase().replace(/\.$/, "")).sort());

export type DnsManaged = {
  zoneId: string;
  zone: string;
  written: RRSet[];
  /** Lo que había ANTES en cada (name|type); null = no había nada. La primera foto manda. */
  previous: Record<string, RRSet | null>;
};

/**
 * Plan de escritura: qué UPSERTear y la foto previa a guardar. Pura (se prueba sin red).
 * `prior` = la foto de una configuración anterior: se conserva para no perder el estado original.
 */
export function planDnsWrite(want: RRSet[], current: RRSet[], prior?: Record<string, RRSet | null>) {
  const now = new Map(current.map((r) => [keyOf(r), r]));
  const previous: Record<string, RRSet | null> = { ...(prior ?? {}) };
  for (const r of want) {
    const k = keyOf(r);
    if (!(k in previous)) previous[k] = now.get(k) ?? null;
  }
  const upserts = want.filter((r) => !sameValues(now.get(keyOf(r))?.values, r.values));
  return { upserts, previous };
}

/**
 * Plan de deshacer: restaurar lo previo SÓLO donde sigue lo que escribimos (si el usuario lo
 * cambió después, se deja y se reporta como `skipped`). Pura.
 */
export function planDnsUndo(managed: DnsManaged, current: RRSet[], only?: (r: RRSet) => boolean) {
  const now = new Map(current.map((r) => [keyOf(r), r]));
  const restore: RRSet[] = [];
  const remove: RRSet[] = [];
  const skipped: string[] = [];
  for (const w of managed.written.filter(only ?? (() => true))) {
    const k = keyOf(w);
    const cur = now.get(k);
    if (!cur) continue;
    if (!sameValues(cur.values, w.values)) {
      skipped.push(k);
      continue;
    }
    const prev = managed.previous[k];
    if (prev) restore.push(prev);
    else remove.push(w);
  }
  return { restore, remove, skipped };
}

async function putRecord(userId: string, zoneId: string, r: RRSet) {
  await mm(userId, `/api/domains/${zoneId}/dns/records`, { method: "PUT", body: JSON.stringify({ name: r.name, type: r.type, ttl: r.ttl ?? 300, values: r.values }) });
}
async function deleteRecord(userId: string, zoneId: string, r: { name: string; type: string }) {
  await mm(userId, `/api/domains/${zoneId}/dns/records`, { method: "DELETE", body: JSON.stringify({ name: r.name, type: r.type }) });
}

/** Escribe `want` en la zona de Mailmask del dominio, guardando la foto previa. */
export async function mailmaskWriteRecords(userId: string, domain: string, want: RRSet[], prior?: DnsManaged | null): Promise<DnsManaged> {
  const zone = prior?.zoneId ? { id: prior.zoneId, domain: prior.zone } : await mailmaskZoneFor(userId, domain);
  if (!zone) throw new Error(`El DNS de ${domain} no está en tu cuenta de Mailmask.`);
  const current = await currentRecords(userId, zone.id);
  const { upserts, previous } = planDnsWrite(want, current, prior?.previous);
  for (const r of upserts) await putRecord(userId, zone.id, r);
  const written = [...(prior?.written ?? []).filter((w) => !want.some((x) => keyOf(x) === keyOf(w))), ...want];
  return { zoneId: zone.id, zone: zone.domain, written, previous };
}

/** Deshace (todo o lo que cumpla `only`). Devuelve el managed restante (o null si ya no queda nada). */
export async function mailmaskUndoRecords(userId: string, managed: DnsManaged, only?: (r: RRSet) => boolean) {
  const current = await currentRecords(userId, managed.zoneId);
  const { restore, remove, skipped } = planDnsUndo(managed, current, only);
  for (const r of restore) await putRecord(userId, managed.zoneId, r);
  for (const r of remove) await deleteRecord(userId, managed.zoneId, r);
  const left = managed.written.filter((w) => !(only ?? (() => true))(w));
  const rest: DnsManaged | null = left.length ? { ...managed, written: left } : null;
  return { rest, skipped };
}
