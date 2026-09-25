import { db } from "./db";
import { randomToken, sha256 } from "./oauth";

// Clientes de casa (first-party) del servidor OAuth. Hoy uno: el CLI `easybits`.
//
// Es PÚBLICO: un binario que se reparte no puede guardar un secreto, lo protege PKCE. La
// fila se crea sola la primera vez que alguien lo usa (upsert idempotente), así no hay
// paso manual de despliegue que olvidar. Su `clientSecretHash` es de un secreto aleatorio
// que nadie conoce: /oauth/token sólo valida secreto si se manda, así que un cliente que
// intente autenticarse "confidencialmente" con este id falla.
export const FIRST_PARTY_CLIENTS: Record<string, { clientName: string; redirectUris: string[] }> = {
  "easybits-cli": {
    clientName: "EasyBits CLI",
    // Loopback con cualquier puerto (RFC 8252 §7.3): ver isRedirectAllowed.
    redirectUris: ["http://127.0.0.1:*/cb", "http://[::1]:*/cb"],
  },
};

/** El cliente registrado, creando la fila si es de casa y todavía no existe. */
export async function findOAuthClient(clientId: string) {
  const found = await db.oAuthClient.findUnique({ where: { clientId } });
  if (found) return found;
  const builtIn = FIRST_PARTY_CLIENTS[clientId];
  if (!builtIn) return null;
  return db.oAuthClient.upsert({
    where: { clientId },
    update: {},
    create: { clientId, clientSecretHash: sha256(randomToken(32)), ...builtIn },
  });
}

/**
 * ¿`redirectUri` está permitido para este cliente?
 *
 * Match EXACTO contra lo registrado, con una sola excepción: el loopback de una app nativa
 * (RFC 8252 §7.3). Ahí el puerto lo elige la app al vuelo, así que se registra con `*`
 * (`http://127.0.0.1:*\/cb`) y se compara todo MENOS el puerto. Sólo 127.0.0.1 / [::1]
 * (`localhost` puede resolverse a otra cosa), mismo path y sin query ni fragmento: un
 * match más laxo convierte el authorize en un open-redirect que entrega el code.
 */
export function isRedirectAllowed(registered: string[], redirectUri: string): boolean {
  if (!redirectUri) return false;
  if (registered.includes(redirectUri)) return true;
  let u: URL;
  try {
    u = new URL(redirectUri);
  } catch {
    return false;
  }
  if (u.protocol !== "http:" || (u.hostname !== "127.0.0.1" && u.hostname !== "[::1]")) return false;
  if (u.search || u.hash || u.username || u.password) return false;
  return registered.includes(`http://${u.hostname}:*${u.pathname}`);
}
