// Audit (and optionally purge) objects left ALIVE in the public bucket by the
// silent-delete bug: `deleteObjectFromBucket` used to route public deletes through
// the retired Tigris gateway (`fly.storage.tigris.dev`, now 403 on everything) and
// every caller swallowed the failure. The DB flipped to private/DELETED while the
// object kept serving 200 to anyone with the link.
//
// Finds two classes of orphan:
//   1. File rows that claim to be private/deleted but whose object still answers
//      in `easybits-public`.
//   2. (--sites) `sites/<websiteId>/*` deploy artifacts whose Website is gone or
//      DELETED — i.e. landings that were "unpublished" but never stopped serving.
//
// Usage:
//   node scripts/audit-orphan-public-objects.mjs                 # dry-run, report only
//   node scripts/audit-orphan-public-objects.mjs --sites         # + scan sites/ prefix
//   node scripts/audit-orphan-public-objects.mjs --fix           # actually delete
//   node scripts/audit-orphan-public-objects.mjs --owner=<id> --limit=500
//
// Never touches the private bucket, and never touches a live `access:"public"` row.
import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import {
  S3Client,
  HeadObjectCommand,
  DeleteObjectCommand,
  ListObjectsV2Command,
} from "@aws-sdk/client-s3";

const args = process.argv.slice(2);
const has = (f) => args.includes(f);
const val = (f) => args.find((a) => a.startsWith(`${f}=`))?.split("=")[1];

const FIX = has("--fix");
const SCAN_SITES = has("--sites");
const OWNER = val("--owner");
const LIMIT = Number(val("--limit") || 5000);
const PUBLIC_BUCKET = process.env.PUBLIC_BUCKET_NAME || "easybits-public";
const CONCURRENCY = 10;

const prisma = new PrismaClient();
const s3 = new S3Client({
  region: process.env.AWS_REGION || "auto",
  endpoint: process.env.AWS_ENDPOINT_URL_S3, // direct endpoint — the gateway is dead
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  },
});

const isNotFound = (e) =>
  e?.name === "NotFound" || e?.name === "NoSuchKey" || e?.$metadata?.httpStatusCode === 404;

const keyFromUrl = (url) => {
  if (!url) return null;
  return url.split(/\.(?:fly\.storage\.tigris|t3\.storage)\.dev\//)[1] || null;
};

/** Does this key still answer in the public bucket? Returns metadata or null. */
async function headPublic(key) {
  try {
    const r = await s3.send(new HeadObjectCommand({ Bucket: PUBLIC_BUCKET, Key: key }));
    return { size: r.ContentLength, modified: r.LastModified };
  } catch (e) {
    if (isNotFound(e)) return null;
    throw e;
  }
}

async function purge(key) {
  await s3.send(new DeleteObjectCommand({ Bucket: PUBLIC_BUCKET, Key: key }));
  const still = await headPublic(key);
  return !still;
}

/** Run `fn` over `items` with a bounded number in flight. */
async function mapLimit(items, fn) {
  const out = [];
  for (let i = 0; i < items.length; i += CONCURRENCY) {
    out.push(...(await Promise.all(items.slice(i, i + CONCURRENCY).map(fn))));
  }
  return out;
}

const stats = { checked: 0, orphans: 0, deleted: 0, failed: 0 };
const findings = [];

// --- 1. File rows that shouldn't be public anymore ---------------------------

const rows = await prisma.file.findMany({
  where: {
    storageProviderId: null,
    ...(OWNER ? { ownerId: OWNER } : {}),
    OR: [{ access: "private" }, { status: "DELETED" }, { deletedAt: { not: null } }],
  },
  select: {
    id: true, name: true, ownerId: true, access: true, status: true,
    deletedAt: true, storageKey: true, url: true,
  },
  take: LIMIT,
});

console.log(`Revisando ${rows.length} filas File (private/DELETED) contra ${PUBLIC_BUCKET}…`);

await mapLimit(rows, async (f) => {
  // The public key varies by which caller wrote it: root key, `mcp/` prefixed, or
  // whatever the stored url points at. Check every candidate.
  const candidates = [...new Set([f.storageKey, `mcp/${f.storageKey}`, keyFromUrl(f.url)].filter(Boolean))];
  for (const key of candidates) {
    stats.checked++;
    let alive;
    try {
      alive = await headPublic(key);
    } catch (e) {
      stats.failed++;
      console.error(`  ! HEAD ${key}: ${e.message}`);
      continue;
    }
    if (!alive) continue;
    stats.orphans++;
    findings.push({ kind: "file", fileId: f.id, name: f.name, access: f.access, status: f.status, key, size: alive.size });
    console.log(`  ORPHAN ${key}  (${f.access}/${f.status})  ${alive.size}B  ${f.name}`);
    if (FIX) {
      try {
        (await purge(key)) ? stats.deleted++ : (stats.failed++, console.error(`  ! sigue vivo: ${key}`));
      } catch (e) {
        stats.failed++;
        console.error(`  ! DELETE ${key}: ${e.message}`);
      }
    }
  }
});

// --- 2. Deploy artifacts of unpublished sites --------------------------------

if (SCAN_SITES) {
  console.log(`\nBarriendo el prefijo sites/ en ${PUBLIC_BUCKET}…`);
  const liveWebsiteIds = new Set(
    (await prisma.website.findMany({ where: { status: { not: "DELETED" } }, select: { id: true } })).map((w) => w.id)
  );

  let token;
  const stale = [];
  do {
    const page = await s3.send(
      new ListObjectsV2Command({ Bucket: PUBLIC_BUCKET, Prefix: "sites/", ContinuationToken: token })
    );
    for (const o of page.Contents ?? []) {
      const websiteId = o.Key.split("/")[1];
      if (websiteId && !liveWebsiteIds.has(websiteId)) stale.push({ key: o.Key, size: o.Size, websiteId });
    }
    token = page.IsTruncated ? page.NextContinuationToken : undefined;
  } while (token);

  console.log(`  ${stale.length} objeto(s) de sitios borrados/inexistentes siguen publicados`);
  for (const s of stale) {
    stats.orphans++;
    findings.push({ kind: "site", websiteId: s.websiteId, key: s.key, size: s.size });
    console.log(`  ORPHAN ${s.key}  ${s.size}B  (website ${s.websiteId})`);
    if (FIX) {
      try {
        (await purge(s.key)) ? stats.deleted++ : (stats.failed++, console.error(`  ! sigue vivo: ${s.key}`));
      } catch (e) {
        stats.failed++;
        console.error(`  ! DELETE ${s.key}: ${e.message}`);
      }
    }
  }
}

console.log("\n" + (FIX ? "— PURGA —" : "— DRY RUN (usa --fix para borrar) —"));
console.table(stats);
if (!FIX && stats.orphans) {
  console.log(`\n${stats.orphans} objeto(s) siguen públicos pese a estar borrados/privados en la DB.`);
}

await prisma.$disconnect();
