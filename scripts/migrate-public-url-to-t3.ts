/**
 * One-shot migration: rewrite stored public asset URLs from the broken legacy
 * Tigris Acceleration Gateway domain `*.fly.storage.tigris.dev` to the working
 * direct endpoint `*.t3.storage.dev`.
 *
 * Why: Tigris' legacy `fly.storage.tigris.dev` public-serving gateway started
 * returning `200` + correct `content-length` but streaming ZERO bytes for the
 * `easybits-public` bucket (data intact at origin — the same objects serve
 * fine via `easybits-public.t3.storage.dev`). Every public `File.url` stamped
 * with the old domain now yields empty downloads (broken images in agents,
 * deployed sites, OG tags, etc.).
 *
 * The code is fixed going forward (`buildPublicAssetUrl` in
 * `app/.server/storage.ts` now emits `t3.storage.dev`). This script repairs
 * the historical rows. It is a pure string rewrite — the objects are NOT moved
 * (same bucket, same key), only the host in the stored URL changes.
 *
 * Defaults to dry-run. Pass `--apply` to execute.
 *
 * Run:
 *   npx tsx scripts/migrate-public-url-to-t3.ts            # dry-run
 *   npx tsx scripts/migrate-public-url-to-t3.ts --apply    # execute
 */
import "dotenv/config";
import { PrismaClient } from "@prisma/client";

const APPLY = process.argv.includes("--apply");
const LEGACY_HOST = ".fly.storage.tigris.dev";
const NEW_HOST = ".t3.storage.dev";

const db = new PrismaClient();

async function main() {
  console.log(`Mode: ${APPLY ? "APPLY" : "DRY-RUN"}`);
  console.log(`Rewrite: *${LEGACY_HOST}  ->  *${NEW_HOST}\n`);

  // Every File whose stored public URL still points at the broken gateway.
  const files = await db.file.findMany({
    where: { url: { contains: LEGACY_HOST } },
    select: { id: true, url: true, name: true },
  });

  console.log(`Found ${files.length} File rows with a legacy URL\n`);

  let updated = 0;
  let failed = 0;
  for (const file of files) {
    const oldUrl = file.url || "";
    const newUrl = oldUrl.split(LEGACY_HOST).join(NEW_HOST);
    if (newUrl === oldUrl) continue;

    if (!APPLY) {
      console.log(`[dry-run] ${file.id}`);
      console.log(`          ${oldUrl}`);
      console.log(`          ${newUrl}\n`);
      continue;
    }

    try {
      await db.file.update({ where: { id: file.id }, data: { url: newUrl } });
      updated++;
    } catch (err) {
      console.error(`[db-fail] ${file.id}: ${(err as Error)?.message || err}`);
      failed++;
    }
  }

  console.log("\n— Summary —");
  console.log(JSON.stringify({ scanned: files.length, updated, failed }, null, 2));
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
