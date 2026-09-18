import { db } from "~/.server/db";
import { randomBytes } from "crypto";
import { resolve } from "dns/promises";
import { createHost, removeHost } from "~/lib/fly_certs/certs_getters";

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

  // Create wildcard cert on Fly
  try {
    await createHost(`*.${domain.domain}`);
  } catch (e) {
    console.error("Failed to create wildcard cert:", e);
    // Non-fatal — cert may already exist or take time to provision
  }

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

  // Unlink all websites using this domain
  await db.website.updateMany({
    where: { customDomainId: domainId },
    data: { customDomainId: null },
  });

  // Remove Fly certs (wildcard + apex/www si los había)
  try {
    await removeHost(`*.${domain.domain}`);
    if (domain.apexWebsiteId) await removeApexCerts(domain.domain);
  } catch (e) {
    console.error("Failed to remove cert:", e);
  }

  return db.customDomain.delete({ where: { id: domainId } });
}

export function apexHostnames(domain: string): [string, string] {
  return [domain, `www.${domain}`];
}

async function createApexCerts(domain: string) {
  if (!process.env.FLY_API_TOKEN) return;
  for (const h of apexHostnames(domain)) await createHost(h);
}

async function removeApexCerts(domain: string) {
  if (!process.env.FLY_API_TOKEN) return;
  for (const h of apexHostnames(domain)) await removeHost(h);
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

  return updated;
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
