const BASE_URL = "https://api.machines.dev/v1/apps/easybits/certificates";

function headers() {
  return {
    Authorization: `Bearer ${process.env.FLY_API_TOKEN}`,
    "Content-Type": "application/json",
  };
}

export async function removeHost(hostname: string) {
  try {
    const res = await fetch(`${BASE_URL}/${hostname}`, {
      method: "DELETE",
      headers: headers(),
    });
    if (!res.ok) throw new Error(`${res.status} ${await res.text()}`);
    console.info("::CERT_DELETION_SUCCESS::", hostname);
    return { ok: true };
  } catch (e: unknown) {
    if (e instanceof Error)
      console.error("::ERROR_ON_CERT_DELETION::", e.message);
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
  try {
    const res = await fetch(`${BASE_URL}/acme`, {
      method: "POST",
      headers: headers(),
      body: JSON.stringify({ hostname }),
    });
    if (!res.ok) throw new Error(`${res.status} ${await res.text()}`);
    console.info("::CERT_CREATION_SUCCESS::", hostname);
    return await res.json();
  } catch (e: unknown) {
    if (e instanceof Error)
      console.error("::ERROR_ON_CERT_CREATION::", e.message);
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
