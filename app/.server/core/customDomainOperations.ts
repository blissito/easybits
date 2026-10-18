import { db } from "~/.server/db";
import { randomBytes } from "crypto";
import { resolve } from "dns/promises";
import { registerAppHostname, unregisterAppHostname } from "~/.server/appHostDomains";
import {
  easybitsDnsRecords,
  mailmaskUndoRecords,
  mailmaskWriteRecords,
  type DnsManaged,
} from "./mailmaskOperations";

export async function addCustomDomain(userId: string, domain: string) {
  // Normalize and validate
  const d = domain.toLowerCase().trim();
  if (!d || d.includes(" ") || !d.includes(".")) {
    throw new Error("Invalid domain");
  }
  if (d.endsWith(".easybits.cloud")) {
    throw new Error("Cannot use easybits.cloud subdomains");
  }

  const existing = await db.customDomain.findUnique({ where: { domain: d } });
  if (existing) {
    throw new Error("Domain already registered");
  }

  const txtToken = `easybits-verify-${randomBytes(16).toString("hex")}`;

  return db.customDomain.create({
    data: {
      domain: d,
      ownerId: userId,
      txtToken,
      verified: false,
    },
  });
}

export async function verifyCustomDomain(domainId: string, userId: string) {
  const domain = await db.customDomain.findFirst({
    where: { id: domainId, ownerId: userId },
  });
  if (!domain) throw new Error("Domain not found");

  // Check DNS TXT record at _easybits-verify.{domain}
  const lookupHost = `_easybits-verify.${domain.domain}`;
  let records: string[][] = [];
  try {
    records = await resolve(lookupHost, "TXT");
  } catch {
    throw new Error(
      `DNS lookup failed for ${lookupHost}. Add a TXT record with value: ${domain.txtToken}`
    );
  }

  const flat = records.flat();
  if (!flat.includes(domain.txtToken)) {
    throw new Error(
      `TXT record not found. Expected value: ${domain.txtToken} at ${lookupHost}`
    );
  }

  // Alta del comodín en la caja de EasyBits: sin esto el Caddy del fierro no emite el cert y
  // <slug>.<dominio> no llega a la app (ver .server/appHostDomains).
  const ok = await registerAppHostname(`*.${domain.domain}`);
  if (!ok) throw new Error("No se pudo dar de alta el dominio en el servidor. Intenta de nuevo en un momento.");

  return db.customDomain.update({
    where: { id: domainId },
    data: { verified: true },
  });
}

export async function removeCustomDomain(domainId: string, userId: string) {
  const domain = await db.customDomain.findFirst({
    where: { id: domainId, ownerId: userId },
  });
  if (!domain) throw new Error("Domain not found");

  // Registros que EasyBits escribió en Mailmask: se deshacen (restaurando lo que había).
  if (domain.dnsProvider === "mailmask" && domain.dnsManaged) {
    await mailmaskUndoRecords(userId, domain.dnsManaged as unknown as DnsManaged).catch((e) =>
      console.error("[removeCustomDomain] mailmask undo:", e?.message ?? e)
    );
  }

  // Unlink all websites using this domain
  await db.website.updateMany({
    where: { customDomainId: domainId },
    data: { customDomainId: null },
  });

  // Baja en la caja de EasyBits (comodín + apex/www si los había): el Caddy deja de emitir.
  await unregisterAppHostname(`*.${domain.domain}`);
  if (domain.apexWebsiteId) await removeApexCerts(domain.domain);

  return db.customDomain.delete({ where: { id: domainId } });
}

export function apexHostnames(domain: string): [string, string] {
  return [domain, `www.${domain}`];
}

async function createApexCerts(domain: string) {
  for (const h of apexHostnames(domain)) await registerAppHostname(h);
}

async function removeApexCerts(domain: string) {
  for (const h of apexHostnames(domain)) await unregisterAppHostname(h);
}

/**
 * Asigna (o quita, con websiteId=null) el sitio que se sirve en el dominio raíz
 * (midominio.com y www.midominio.com). La ruta <slug>.<dominio> no cambia.
 */
export async function setDomainApex(
  domainId: string,
  userId: string,
  websiteId: string | null
) {
  const domain = await db.customDomain.findFirst({
    where: { id: domainId, ownerId: userId },
  });
  if (!domain) throw new Error("Domain not found");
  if (!domain.verified) throw new Error("Domain not verified yet");

  if (websiteId) {
    const website = await db.website.findFirst({
      where: { id: websiteId, ownerId: userId, status: { not: "DELETED" } },
      select: { id: true },
    });
    if (!website) throw new Error("Website not found");
  }

  const updated = await db.customDomain.update({
    where: { id: domainId },
    data: { apexWebsiteId: websiteId },
    include: { apexWebsite: { select: { id: true, name: true, slug: true } } },
  });

  // Certs no fatales: si fallan, el siguiente set los reintenta.
  try {
    if (websiteId) await createApexCerts(domain.domain);
    else if (domain.apexWebsiteId) await removeApexCerts(domain.domain);
  } catch (e) {
    console.error("[setDomainApex] cert error:", e);
  }

  // DNS administrado por Mailmask: la raíz y www también se escriben (o se deshacen) solos.
  if (domain.dnsProvider === "mailmask" && domain.dnsManaged) {
    try {
      const managed = domain.dnsManaged as unknown as DnsManaged;
      const apexNames = new Set([domain.domain, `www.${domain.domain}`]);
      const next = websiteId
        ? await mailmaskWriteRecords(userId, domain.domain, easybitsDnsRecords(domain.domain, domain.txtToken, true).filter((r) => apexNames.has(r.name)), managed)
        : (await mailmaskUndoRecords(userId, managed, (r) => apexNames.has(r.name))).rest;
      await db.customDomain.update({ where: { id: domainId }, data: { dnsManaged: (next ?? null) as any, dnsProvider: next ? "mailmask" : null } });
    } catch (e) {
      console.error("[setDomainApex] mailmask:", (e as Error)?.message ?? e);
    }
  }

  return updated;
}

/**
 * «Configurar con Mailmask»: escribe en la zona de Mailmask del usuario los registros que pide
 * EasyBits (guardando lo que había) y verifica. La conexión OAuth ya debe existir.
 * Route 53 propaga en segundos, pero el resolver puede tardar: si aún no verifica, queda
 * escrito y basta con «Verificar» después.
 */
export async function autoConfigureDomainDns(domainId: string, userId: string) {
  const domain = await db.customDomain.findFirst({ where: { id: domainId, ownerId: userId } });
  if (!domain) throw new Error("Domain not found");
  const want = easybitsDnsRecords(domain.domain, domain.txtToken, !!domain.apexWebsiteId);
  const managed = await mailmaskWriteRecords(
    userId,
    domain.domain,
    want,
    domain.dnsProvider === "mailmask" ? (domain.dnsManaged as unknown as DnsManaged) : null
  );
  await db.customDomain.update({ where: { id: domainId }, data: { dnsProvider: "mailmask", dnsManaged: managed as any } });
  let verified = domain.verified;
  for (const wait of verified ? [] : [0, 4000, 8000]) {
    if (wait) await new Promise((r) => setTimeout(r, wait));
    try {
      await verifyCustomDomain(domainId, userId);
      verified = true;
      break;
    } catch {
      // DNS aún propagando.
    }
  }
  if (verified && domain.verified) await registerAppHostname(`*.${domain.domain}`);
  return { verified, zone: managed.zone, records: want.map((r) => `${r.type} ${r.name}`) };
}

/** Deshace lo que EasyBits escribió en Mailmask para este dominio (sin borrar el dominio). */
export async function undoDomainDns(domainId: string, userId: string) {
  const domain = await db.customDomain.findFirst({ where: { id: domainId, ownerId: userId } });
  if (!domain) throw new Error("Domain not found");
  if (domain.dnsProvider !== "mailmask" || !domain.dnsManaged) return { ok: true, nothing: true, skipped: [] as string[] };
  const { rest, skipped } = await mailmaskUndoRecords(userId, domain.dnsManaged as unknown as DnsManaged);
  await db.customDomain.update({ where: { id: domainId }, data: { dnsProvider: rest ? "mailmask" : null, dnsManaged: (rest ?? null) as any } });
  return { ok: true, nothing: false, skipped };
}

export async function listCustomDomains(userId: string) {
  return db.customDomain.findMany({
    where: { ownerId: userId },
    include: {
      websites: { select: { id: true, name: true, slug: true } },
      apexWebsite: { select: { id: true, name: true, slug: true } },
    },
    orderBy: { createdAt: "desc" },
  });
}
