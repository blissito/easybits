const BASE_URL = "https://api.machines.dev/v1/apps/easybits/certificates";

function headers() {
  return {
    Authorization: `Bearer ${process.env.FLY_API_TOKEN}`,
    "Content-Type": "application/json",
  };
}

/*
 * ⚠️ Desde 2026-10-08 EasyBits ya NO vive en Fly (caja app-host del fierro A de sandbox-host).
 * `createHost`/`removeHost` conservan su firma (los usan tiendas, landings, presentaciones y
 * dominios propios), pero ya no piden certificados a Fly: dan de alta el hostname como
 * `domain:` de la caja de EasyBits. Con eso el router lo enruta a la app y el Caddy del fierro
 * A emite el cert on-demand (su /_caddy/ask sólo aprueba dominios registrados).
 * `*.easybits.cloud` ya está en la caja con cert comodín: esos se ignoran.
 */
const APP_HOST_SANDBOX_ID = process.env.APP_HOST_SANDBOX_ID || "sb_f36bc34d-c554-427c-836d-ab911cfa1016";
// Dueño de la caja app-host en el host (la cuenta de la plataforma).
const APP_HOST_OWNER_ID = process.env.APP_HOST_OWNER_ID || "699f35cbc8ad86037eda62b1";
const APP_HOST_PORT = Number(process.env.APP_HOST_PORT || 3000);

function coveredByWildcard(hostname: string): boolean {
  const h = hostname.toLowerCase();
  return h === "easybits.cloud" || h.endsWith(".easybits.cloud");
}

async function appHostCtx() {
  return { user: { id: APP_HOST_OWNER_ID }, scopes: ["READ", "WRITE"] } as any;
}

export async function removeHost(hostname: string) {
  if (coveredByWildcard(hostname)) return { ok: true };
  try {
    const { removeSandboxDomain } = await import("~/.server/core/sandboxOperations");
    await removeSandboxDomain(await appHostCtx(), APP_HOST_SANDBOX_ID, hostname.toLowerCase());
    console.info("::HOST_REMOVED::", hostname);
    return { ok: true };
  } catch (e: unknown) {
    if (e instanceof Error) console.error("::ERROR_ON_HOST_REMOVAL::", hostname, e.message);
  }
}

export async function showHost(hostname: string) {
  try {
    const res = await fetch(`${BASE_URL}/${hostname}`, { headers: headers() });
    if (!res.ok) throw new Error(`${res.status} ${await res.text()}`);
    const cert = await res.json();
    // Match legacy GraphQL shape expected by callers
    return { app: { certificate: cert } };
  } catch (e: unknown) {
    if (e instanceof Error)
      console.error("::ERROR_ON_CERT_SHOW::", e.message);
  }
}

export async function createHost(hostname: string) {
  const host = hostname.toLowerCase();
  // Forma heredada de Fly (`addCertificate.certificate`): la leen las tiendas v1.
  const shape = (configured: boolean) => ({
    addCertificate: { certificate: { hostname: host, configured, clientStatus: configured ? "Ready" : "Pending" } },
  });
  if (coveredByWildcard(host)) return shape(true);
  try {
    const { addSandboxDomain } = await import("~/.server/core/sandboxOperations");
    await addSandboxDomain(await appHostCtx(), APP_HOST_SANDBOX_ID, host, APP_HOST_PORT);
    console.info("::HOST_CREATED::", host);
    return shape(true);
  } catch (e: unknown) {
    // Ya registrado (re-verificar / re-asignar) no es error.
    if (e instanceof Error && /already|exists|409/i.test(e.message)) return shape(true);
    if (e instanceof Error) console.error("::ERROR_ON_HOST_CREATION::", host, e.message);
  }
}

export async function listHosts() {
  const res = await fetch(BASE_URL, { headers: headers() });
  if (!res.ok) throw new Error(`${res.status} ${await res.text()}`);
  const raw = await res.json();
  // Fly has changed shapes historically — accept raw array or { certificates: [...] }
  const certs: any[] = Array.isArray(raw)
    ? raw
    : Array.isArray(raw?.certificates)
    ? raw.certificates
    : [];
  return {
    app: {
      certificates: {
        nodes: certs.map((c) => ({
          createdAt: c.created_at ?? c.createdAt ?? "",
          hostname: c.hostname,
          clientStatus: c.status ?? c.clientStatus ?? "",
        })),
      },
    },
  };
}

export async function getFlyAppData() {
  const res = await fetch("https://api.machines.dev/v1/apps/easybits", {
    headers: headers(),
  });
  if (!res.ok) throw new Error(`${res.status} ${await res.text()}`);
  return await res.json();
}
