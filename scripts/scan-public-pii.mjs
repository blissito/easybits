// Scan every still-public site for PII: fetch the live HTML and grep for
// emails, MX phones, RFC, CURP. Reports only sites with hits (excluding noise).
import "dotenv/config";
import { PrismaClient } from "@prisma/client";

const OWNER_ID = "699f35cbc8ad86037eda62b1";
const prisma = new PrismaClient();

const sites = await prisma.website.findMany({
  where: { ownerId: OWNER_ID, status: "ACTIVE" },
  select: { slug: true, name: true, subdomainEnabled: true },
});
console.log(`Scanning ${sites.length} active sites...\n`);

const EMAIL = /[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/gi;
const PHONE = /(?:\+?52[ -]?)?(?:\(?\d{2,3}\)?[ -]?)\d{3,4}[ -]?\d{4}/g;
const RFC = /\b[A-ZÑ&]{3,4}\d{6}[A-Z0-9]{3}\b/g;
const CURP = /\b[A-Z]{4}\d{6}[HM][A-Z]{5}[A-Z0-9]\d\b/g;
// noise emails to ignore
const NOISE = /(easybits|example\.com|sentry|googleapis|gstatic|w3\.org|schema\.org|fixter|formmy|tigris|placeholder|noreply|domain\.com|email\.com|tu-?correo|yourname)/i;

const conc = 8;
const hits = [];
let i = 0;
async function worker() {
  while (i < sites.length) {
    const s = sites[i++];
    const url = s.subdomainEnabled
      ? `https://${s.slug}.easybits.cloud/`
      : `https://www.easybits.cloud/s/${s.slug}/`;
    try {
      const r = await fetch(url, { redirect: "follow" });
      if (!r.ok) continue;
      const html = await r.text();
      const emails = [...new Set((html.match(EMAIL) || []).filter((e) => !NOISE.test(e)))];
      const phones = [...new Set(html.match(PHONE) || [])].filter((p) => p.replace(/\D/g, "").length >= 10);
      const rfc = [...new Set(html.match(RFC) || [])];
      const curp = [...new Set(html.match(CURP) || [])];
      if (emails.length || rfc.length || curp.length || phones.length) {
        hits.push({ slug: s.slug, name: s.name, emails, phones: phones.slice(0, 4), rfc, curp });
      }
    } catch (e) {
      console.log(`  fetch error ${s.slug}: ${e.message}`);
    }
  }
}
await Promise.all(Array.from({ length: conc }, worker));

hits.sort((a, b) => a.name.localeCompare(b.name));
console.log(`\n=== ${hits.length} sites with possible PII ===`);
for (const h of hits) {
  const parts = [];
  if (h.emails.length) parts.push(`email:${h.emails.join(",")}`);
  if (h.phones.length) parts.push(`tel:${h.phones.join(",")}`);
  if (h.rfc.length) parts.push(`RFC:${h.rfc.join(",")}`);
  if (h.curp.length) parts.push(`CURP:${h.curp.join(",")}`);
  console.log(`• ${h.slug} — ${h.name}\n    ${parts.join("  |  ")}`);
}
await prisma.$disconnect();
