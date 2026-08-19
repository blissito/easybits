/**
 * Publica un HTML local en un Website servido por `/s/<slug>/`.
 *
 * Estos sitios NO son landings: son un File plano (`sites/<websiteId>/<path>`)
 * cuyo contenido vive en Tigris. No hay editor ni deploy — se actualizan
 * subiendo un objeto nuevo y repuntando el File.
 *
 * Uso:
 *   npx tsx scripts/publish-site-html.ts <slug> <archivo.html> [ruta-en-el-sitio]
 *   npx tsx scripts/publish-site-html.ts colina-fulgurante docs/sites/fotos-infantiles/index.html
 *
 * OJO — llave NUEVA en cada publicación: el CDN cachea por URL, así que
 * sobrescribir el mismo objeto deja a los visitantes con la versión vieja.
 */
import { readFileSync } from "fs";
import { db } from "../app/.server/db";
import { getPlatformPublicClient, buildPublicAssetUrl } from "../app/.server/storage";
import { getContentType } from "../app/utils/mime";

const [slug, localPath, sitePath = "index.html"] = process.argv.slice(2);
if (!slug || !localPath) {
  console.error("uso: publish-site-html.ts <slug> <archivo> [ruta-en-el-sitio]");
  process.exit(1);
}

const website = await db.website.findFirst({ where: { slug, status: { not: "DELETED" } } });
if (!website) throw new Error(`No hay Website vivo con slug "${slug}"`);

const body = readFileSync(localPath);
const contentType = getContentType(sitePath);
const key = `${website.ownerId}/${slug}-${Date.now().toString(36)}`;
await getPlatformPublicClient().putObject(key, body, contentType);

const name = `sites/${website.id}/${sitePath}`;
const file = await db.file.findFirst({ where: { name } });
if (!file) throw new Error(`No existe el File "${name}" — este script actualiza, no crea.`);

await db.file.update({
  where: { id: file.id },
  data: { storageKey: key, url: buildPublicAssetUrl(key), size: body.length },
});

console.log(`✔ https://www.easybits.cloud/s/${slug}/${sitePath === "index.html" ? "" : sitePath}`);
console.log(`  objeto: ${buildPublicAssetUrl(key)}`);
await db.$disconnect();
