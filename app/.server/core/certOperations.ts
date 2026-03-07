import { db } from "../db";
import { listHosts, removeHost } from "~/lib/fly_certs/certs_getters";

// Hostnames that should NEVER be removed
const PROTECTED_HOSTNAMES = new Set([
  "easybits.cloud",
  "www.easybits.cloud",
  "easybits.fly.dev",
]);

interface FlyCert {
  createdAt: string;
  hostname: string;
  clientStatus: string;
}

interface CertAuditResult {
  totalFlyCerts: number;
  validCerts: string[];
  orphanedCerts: FlyCert[];
  protectedCerts: string[];
}

/**
 * Get all valid hostnames that should have Fly certificates.
 * Sources: Websites, CustomDomains, Users (legacy host.domain)
 */
async function getValidHostnames(): Promise<Set<string>> {
  const valid = new Set(PROTECTED_HOSTNAMES);

  // Active websites → slug.easybits.cloud
  const websites = await db.website.findMany({
    where: { status: "ACTIVE" },
    select: { slug: true, customDomainId: true, customDomain: { select: { domain: true } } },
  });
  for (const w of websites) {
    valid.add(`${w.slug}.easybits.cloud`);
    if (w.customDomain) {
      valid.add(`${w.slug}.${w.customDomain.domain}`);
    }
  }

  // Verified custom domains → *.domain
  const customDomains = await db.customDomain.findMany({
    where: { verified: true },
    select: { domain: true },
  });
  for (const d of customDomains) {
    valid.add(`*.${d.domain}`);
  }

  // Legacy user domains → host.domain
  const usersWithDomain = await db.user.findMany({
    where: { host: { not: null }, domain: { not: null } },
    select: { host: true, domain: true },
  });
  for (const u of usersWithDomain) {
    if (u.host && u.domain) {
      valid.add(`${u.host}.${u.domain}`);
    }
  }

  return valid;
}

/**
 * Audit Fly certificates against DB records.
 * Returns which certs are valid, orphaned, or protected.
 */
export async function auditCerts(): Promise<CertAuditResult> {
  const [flyData, validHostnames] = await Promise.all([
    listHosts() as Promise<{ app: { certificates: { nodes: FlyCert[] } } }>,
    getValidHostnames(),
  ]);

  const allCerts = flyData.app.certificates.nodes;
  const validCerts: string[] = [];
  const orphanedCerts: FlyCert[] = [];
  const protectedCerts: string[] = [];

  for (const cert of allCerts) {
    if (PROTECTED_HOSTNAMES.has(cert.hostname)) {
      protectedCerts.push(cert.hostname);
    } else if (validHostnames.has(cert.hostname)) {
      validCerts.push(cert.hostname);
    } else {
      orphanedCerts.push(cert);
    }
  }

  return { totalFlyCerts: allCerts.length, validCerts, orphanedCerts, protectedCerts };
}

/**
 * Delete specific orphaned certificates from Fly.
 * Returns results for each deletion attempt.
 */
export async function deleteOrphanedCerts(
  hostnames: string[]
): Promise<{ deleted: string[]; failed: { hostname: string; error: string }[] }> {
  const deleted: string[] = [];
  const failed: { hostname: string; error: string }[] = [];

  for (const hostname of hostnames) {
    if (PROTECTED_HOSTNAMES.has(hostname)) {
      failed.push({ hostname, error: "Protected hostname" });
      continue;
    }
    try {
      await removeHost(hostname);
      deleted.push(hostname);
    } catch (e: any) {
      failed.push({ hostname, error: e.message || "Unknown error" });
    }
  }

  return { deleted, failed };
}

/**
 * Auto-purge: audit and delete ALL orphaned certs in one step.
 */
export async function purgeOrphanedCerts() {
  const audit = await auditCerts();
  if (audit.orphanedCerts.length === 0) {
    return { ...audit, purged: 0, deleted: [], failed: [] };
  }

  const hostnames = audit.orphanedCerts.map((c) => c.hostname);
  const result = await deleteOrphanedCerts(hostnames);

  return {
    ...audit,
    purged: result.deleted.length,
    deleted: result.deleted,
    failed: result.failed,
  };
}
