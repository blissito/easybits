import { EasybitsClient, resolveBaseUrl } from "@easybits.cloud/sdk";
import type { Ctx } from "./types.js";
import { CliError, EXIT, notLoggedIn } from "./errors.js";
import { interactive, oauthLogin, readRc, refreshSession } from "./auth.js";

/**
 * Una API key explícita: env EASYBITS_API_KEY > --token > `apiKey` del rc. Es lo que va
 * en configs de MCP (`easybits config`): un access token OAuth vence en una hora.
 */
export function resolveApiKey(ctx: Ctx): string | undefined {
  return process.env.EASYBITS_API_KEY || ctx.token || readRc().apiKey;
}

/**
 * Credencial para la API. Precedencia: env EASYBITS_API_KEY > --token > sesión OAuth del
 * rc > `apiKey` del rc. El env gana para que un agente con la variable puesta nunca opere
 * con la cuenta de otra persona que quedó en el rc de la máquina.
 *
 * Sin credencial: con una persona en la terminal arranca el login solo; sin TTY (un
 * agente, CI) sale con 3 y la pista, porque `easybits login` sí lo puede correr él.
 */
/** Si la credencial del comando en curso salió de la sesión OAuth (para reintentar un 401). */
let fromSession = false;
export const usedSession = () => fromSession;

/** Tras un 401 con sesión OAuth: fuerza el refresh. true si hay token nuevo. */
export async function forceRefresh(): Promise<boolean> {
  const s = readRc().oauth;
  return Boolean(s && (await refreshSession(s)));
}

export async function resolveCredential(ctx: Ctx): Promise<string> {
  fromSession = false;
  const explicit = process.env.EASYBITS_API_KEY || ctx.token;
  if (explicit) return explicit;
  const rc = readRc();
  if (rc.oauth?.accessToken) {
    fromSession = true;
    if (rc.oauth.expiresAt - Date.now() > 60_000) return rc.oauth.accessToken;
    const next = await refreshSession(rc.oauth);
    if (next) return next.accessToken;
    // Sesión muerta pero con key guardada: se sigue con la key en vez de detenerse.
    fromSession = false;
    if (rc.apiKey) return rc.apiKey;
    if (!interactive(ctx)) {
      throw new CliError("Your session expired.", EXIT.AUTH, "Run: easybits login   (or set EASYBITS_API_KEY)", "session_expired");
    }
  } else if (rc.apiKey) {
    return rc.apiKey;
  } else if (!interactive(ctx)) {
    throw notLoggedIn();
  }
  process.stderr.write("Not logged in yet — let's fix that.\n");
  fromSession = true;
  return (await oauthLogin(ctx)).accessToken;
}

export async function getClient(ctx: Ctx): Promise<EasybitsClient> {
  const apiKey = await resolveCredential(ctx);
  return new EasybitsClient({ apiKey, baseUrl: await resolveBaseUrl() });
}
