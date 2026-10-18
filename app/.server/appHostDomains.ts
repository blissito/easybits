import { resolve4 } from "node:dns/promises";
import { APP_HOST_DNS } from "~/lib/appHostDns";

/*
 * Dominios propios que sirve la app. Un hostname se da de alta como `domain:` de la caja
 * app-host: con eso el router lo enruta a la app y el Caddy del fierro A emite el cert
 * on-demand (su `/_caddy/ask` sólo aprueba dominios registrados; `*.<dominio>` también cubre
 * cualquier `<slug>.<dominio>`). `*.easybits.cloud` ya tiene cert comodín: no se registra.
 */
const APP_HOST_SANDBOX_ID = process.env.APP_HOST_SANDBOX_ID || "sb_f36bc34d-c554-427c-836d-ab911cfa1016";
// Dueño de la caja app-host en el host (la cuenta de la plataforma).
const APP_HOST_OWNER_ID = process.env.APP_HOST_OWNER_ID || "699f35cbc8ad86037eda62b1";
const APP_HOST_PORT = Number(process.env.APP_HOST_PORT || 3000);

export function coveredByWildcard(hostname: string): boolean {
  const h = hostname.toLowerCase();
  return h === "easybits.cloud" || h.endsWith(".easybits.cloud");
}

function appHostCtx() {
  return { user: { id: APP_HOST_OWNER_ID }, scopes: ["READ", "WRITE"] } as any;
}

/** Registra el hostname en la caja app-host. `true` si quedó (o ya estaba) registrado. */
export async function registerAppHostname(hostname: string): Promise<boolean> {
  const host = hostname.toLowerCase().trim();
  if (coveredByWildcard(host)) return true;
  try {
    const { addSandboxDomain } = await import("~/.server/core/sandboxOperations");
    await addSandboxDomain(appHostCtx(), APP_HOST_SANDBOX_ID, host, APP_HOST_PORT);
    console.info("::HOST_CREATED::", host);
    return true;
  } catch (e: unknown) {
    // Ya registrado (re-verificar / re-asignar) no es error.
    if (e instanceof Error && /already|exists|409/i.test(e.message)) return true;
    console.error("::ERROR_ON_HOST_CREATION::", host, e instanceof Error ? e.message : e);
    return false;
  }
}

export async function unregisterAppHostname(hostname: string): Promise<boolean> {
  const host = hostname.toLowerCase().trim();
  if (coveredByWildcard(host)) return true;
  try {
    const { removeSandboxDomain } = await import("~/.server/core/sandboxOperations");
    await removeSandboxDomain(appHostCtx(), APP_HOST_SANDBOX_ID, host);
    console.info("::HOST_REMOVED::", host);
    return true;
  } catch (e: unknown) {
    console.error("::ERROR_ON_HOST_REMOVAL::", host, e instanceof Error ? e.message : e);
    return false;
  }
}

/**
 * ¿El DNS del hostname ya llega al fierro? Sigue la cadena CNAME (resolve4) y compara con la
 * IP de app-host. Es lo que antes decía el estado del cert de Fly: con DNS correcto y el
 * hostname registrado, el Caddy emite el cert en el primer acceso.
 */
export async function pointsToAppHost(hostname: string): Promise<boolean> {
  const ips = await resolve4(hostname.toLowerCase().trim()).catch(() => [] as string[]);
  return ips.includes(APP_HOST_DNS.v4);
}
