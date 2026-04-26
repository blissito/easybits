/**
 * One-shot migration: relocate public assets from `easybits-public/mcp/<key>`
 * to `easybits-public/<key>` and rewrite their `File.url` rows.
 *
 * Why: the Tigris bucket policy on `easybits-public` only exposes the root
 * prefix. Anything under `mcp/` returns 403 even though the bucket name says
 * "public". For months, every public asset (PDFs, OG images, deployed
 * landings/docs/presentations, screenshots, logos, video uploads, website
 * file deploys) was being written to `mcp/<key>` and stamped with a URL that
 * always 404'd in browsers.
 *
 * The code is now fixed (see `getPlatformPublicClient` /
 * `buildPublicAssetUrl` in `app/.server/storage.ts`) — new uploads land at
 * the bucket root and resolve publicly. This script repairs the historical
 * objects.
 *
 * Strategy:
 *   1. Find every File where `access = "public"` AND `url LIKE '%/mcp/%'`.
 *   2. CopyObject from `easybits-public/mcp/<storageKey>` → `easybits-public/<storageKey>`.
 *   3. Update `File.url` to drop `/mcp/`.
 *   4. (Optional, with --delete-source) DeleteObject the legacy `mcp/<storageKey>`.
 *
 * Defaults to dry-run. Pass `--apply` to execute. Pass `--delete-source` to
 * also remove the legacy object after a successful copy + DB update.
 *
 * Run:
 *   npx tsx scripts/migrate-mcp-public-prefix.ts            # dry-run
 *   npx tsx scripts/migrate-mcp-public-prefix.ts --apply    # execute (keeps legacy objects)
 *   npx tsx scripts/migrate-mcp-public-prefix.ts --apply --delete-source
 */
import { PrismaClient } from "@prisma/client";
import {
  S3Client,
  CopyObjectCommand,
  DeleteObjectCommand,
  HeadObjectCommand,
} from "@aws-sdk/client-s3";

const APPLY = process.argv.includes("--apply");
const DELETE_SOURCE = process.argv.includes("--delete-source");
const PUBLIC_BUCKET = process.env.PUBLIC_BUCKET_NAME || "easybits-public";
const ENDPOINT = process.env.AWS_ENDPOINT_URL_S3;
const REGION = process.env.AWS_REGION || "auto";
const ACCESS_KEY_ID = process.env.AWS_ACCESS_KEY_ID || "";
const SECRET_ACCESS_KEY = process.env.AWS_SECRET_ACCESS_KEY || "";

if (!ENDPOINT) {
  console.error("Missing AWS_ENDPOINT_URL_S3");
  process.exit(1);
}

const s3 = new S3Client({
  endpoint: ENDPOINT,
  region: REGION,
  credentials: { accessKeyId: ACCESS_KEY_ID, secretAccessKey: SECRET_ACCESS_KEY },
  forcePathStyle: true,
});

const db = new PrismaClient();

type Result = { copied: number; updated: number; skipped: number; deleted: number; failed: number };

async function objectExists(key: string): Promise<boolean> {
  try {
    await s3.send(new HeadObjectCommand({ Bucket: PUBLIC_BUCKET, Key: key }));
    return true;
  } catch {
    return false;
  }
}

async function main() {
  console.log(`Mode: ${APPLY ? "APPLY" : "DRY-RUN"}${DELETE_SOURCE ? " + delete-source" : ""}`);
  console.log(`Bucket: ${PUBLIC_BUCKET}`);

  // MongoDB: use raw filter — Prisma's `contains` on `url` is fine.
  const files = await db.file.findMany({
    where: {
      access: "public",
      url: { contains: "/mcp/" },
      status: { not: "DELETED" },
    },
    select: { id: true, url: true, storageKey: true, name: true },
  });

  console.log(`Found ${files.length} public File rows with /mcp/ in url\n`);

  const r: Result = { copied: 0, updated: 0, skipped: 0, deleted: 0, failed: 0 };

  for (const file of files) {
    const url = file.url || "";
    // Extract the storage key from the URL — robust against rows where
    // storageKey already includes mcp/ vs. doesn't.
    const m = url.match(/\/mcp\/(.+)$/);
    if (!m) {
      console.warn(`[skip] ${file.id} — could not parse mcp/ from url: ${url}`);
      r.skipped++;
      continue;
    }
    const legacyKey = `mcp/${m[1]}`;
    const newKey = m[1];
    const newUrl = url.replace("/mcp/", "/");

    if (!APPLY) {
      console.log(`[dry-run] ${legacyKey}  ->  ${newKey}`);
      console.log(`          url: ${url}`);
      console.log(`          new: ${newUrl}\n`);
      continue;
    }

    // Idempotency: if dest already exists and url already correct, just normalize DB.
    const destExists = await objectExists(newKey);
    if (!destExists) {
      try {
        await s3.send(
          new CopyObjectCommand({
            Bucket: PUBLIC_BUCKET,
            Key: newKey,
            CopySource: `/${PUBLIC_BUCKET}/${legacyKey}`,
          })
        );
        r.copied++;
      } catch (err: any) {
        console.error(`[copy-fail] ${legacyKey}: ${err?.message || err}`);
        r.failed++;
        continue;
      }
    } else {
      console.log(`[exists] ${newKey} already in bucket — skipping copy`);
    }

    try {
      await db.file.update({ where: { id: file.id }, data: { url: newUrl } });
      r.updated++;
    } catch (err: any) {
      console.error(`[db-fail] ${file.id}: ${err?.message || err}`);
      r.failed++;
      continue;
    }

    if (DELETE_SOURCE) {
      try {
        await s3.send(new DeleteObjectCommand({ Bucket: PUBLIC_BUCKET, Key: legacyKey }));
        r.deleted++;
      } catch (err: any) {
        console.error(`[delete-fail] ${legacyKey}: ${err?.message || err}`);
        // Don't count as full failure — copy and DB update succeeded.
      }
    }
  }

  console.log("\n— Summary —");
  console.log(JSON.stringify(r, null, 2));
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
