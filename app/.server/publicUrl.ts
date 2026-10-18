// Guarda SSRF para URLs que pone un usuario y que el SERVIDOR de EasyBits va a pedir
// (crons de usuario). Resuelve el host y rechaza loopback, privadas, link-local (metadata
// 169.254.169.254), CGNAT/Tailscale y la subred de las microVMs. Es mitigación: entre este
// lookup y el fetch hay otra resolución (rebinding); la defensa de fondo es el firewall de
// egress de la caja app-host (SBX-GUEST-FWD en sandbox-host).
import { lookup } from "node:dns/promises";
import net from "node:net";

export function isPrivateIp(ip: string): boolean {
  if (net.isIPv4(ip)) {
    const [a, b] = ip.split(".").map(Number);
    return (
      a === 0 || a === 10 || a === 127 || (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) ||
      (a === 100 && b >= 64 && b <= 127) || a >= 224
    );
  }
  const v = ip.toLowerCase();
  if (v.startsWith("::ffff:")) return isPrivateIp(v.slice(7));
  return v === "::1" || v === "::" || /^f[cd]/.test(v) || /^fe[89ab]/.test(v);
}

export class PublicUrlError extends Error {}

/** Lanza `PublicUrlError` si la URL no es https pública. Devuelve la URL parseada. */
export async function assertPublicUrl(raw: string): Promise<URL> {
  let u: URL;
  try {
    u = new URL(raw);
  } catch {
    throw new PublicUrlError("URL inválida");
  }
  if (u.protocol !== "https:") throw new PublicUrlError("La URL debe ser https");
  if (u.username || u.password) throw new PublicUrlError("La URL no puede llevar usuario ni contraseña");
  const host = u.hostname.replace(/^\[|\]$/g, "");
  if (host === "localhost" || host.endsWith(".localhost") || host.endsWith(".internal")) {
    throw new PublicUrlError("La URL apunta a una dirección no pública");
  }
  if (net.isIP(host)) {
    if (isPrivateIp(host)) throw new PublicUrlError("La URL apunta a una dirección no pública");
    return u;
  }
  const addrs = await lookup(host, { all: true }).catch(() => []);
  if (!addrs.length) throw new PublicUrlError(`No se pudo resolver ${host}`);
  if (addrs.some((a) => isPrivateIp(a.address))) throw new PublicUrlError("La URL apunta a una dirección no pública");
  return u;
}
