// One-off: delete the public Tigris PDF objects for the websites we just unpublished.
// Reads DB to find `sites/<websiteId>/document.pdf` File records, derives the S3 key
// from the public URL, and DeleteObject from PUBLIC_BUCKET. Targeted; nothing else touched.
import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { S3Client, DeleteObjectCommand } from "@aws-sdk/client-s3";

const OWNER_ID = "699f35cbc8ad86037eda62b1";
const PUBLIC_BUCKET = process.env.PUBLIC_BUCKET_NAME || "easybits-public";

// The 44 websiteIds we unpublished (13 critical + 31 client cotizaciones).
const websiteIds = [
  // critical
  "6a271435106e94ef41f559e1","6a206f07f318cf9d726c304b","6a2c740273959faeecb32a65",
  "6a22faa01eb774b2f93c4161","6a230cbb1eb774b2f93c45a3","6a13306edddfa0307ad8f3bf",
  "6a062e58ab21e257fc2be8b4","6a11dcf55609a925744c3173","69f0f5747a740374f68149b1",
  "69f0e1dc7a740374f681496c","69f0d0ce7a740374f681495f","69f04bd6c4cc735e353298e8",
  "69f0259ab11dc0efe6b6228d",
  // cotizaciones / propuestas
  "69f102af7a740374f6814a24","69f23302a7a23deea106f9f8","69f0039d82363c23f858ff67",
  "69effd2e82363c23f858ff54","69efef6cb3be21a8083d0cf6","69efedca03608f627dd3479b",
  "69efeaeb49fae51140081837","69efb571ad74435521a74b04","69f2a241a7a23deea106fa7d",
  "69f29f63aacde61267835397","69f29dadaacde6126783538f","69f29bf6a7a23deea106fa40",
  "69f3e5cc07d14094c4f1fb3b","69db1db108de318467086d29","69e26c32929ae635b6368c32",
  "69e261e6708214d418573038","69c311cc5595725c974a2a34","69c2c61b5595725c974a1bdc",
  "69c2c3695595725c974a184c","69c2c1025595725c974a162e","69c1b131fd527603b2af3bb5",
  "69bb5d7463f7bcb26c0e6d44","69c5f6bad9775e1d35d34c4e","69c61589d6c1827150b86617",
  "69c609e6d9775e1d35d351c2","69bf1d7ef94f03a2284eaabd","69bec207dc4a4838423d2240",
  "69cc70ac86b0c9e409e8ebb0","69cea36f19c4452c897a2699","69cea4f419c4452c897a289c",
  "69ebcae29cd9325efc9c5b22",
  // segunda ronda (escaneo de contenido)
  "69c1b486fd527603b2af3fef","6a29c3f2734d21fb46c5afa2","69d8904dae6739b6bdc3967f",
  "69d88b95ae6739b6bdc391ff","69f3cdc86934c4da9a7d9deb","69cb057f86b0c9e409e8b101",
  "69cbe61c86b0c9e409e8d0f1","69cbec9e86b0c9e409e8d527","69cb04b186b0c9e409e8af5c",
  "69d7ac4eae6739b6bdc3871c","69d952126970b33e8538ce16","69b9d4e19e4c7c6ae90bbbf1",
  "69ae0b5f286af58804867027",
];

const prisma = new PrismaClient();
const s3 = new S3Client({
  region: process.env.AWS_REGION || "auto",
  endpoint: process.env.AWS_ENDPOINT_URL_S3,
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  },
});

const keyFromUrl = (url) => {
  if (!url) return null;
  // Handle both the legacy `*.fly.storage.tigris.dev/<key>` host and the
  // current `*.t3.storage.dev/<key>` host: take the path after the bucket host.
  const m = url.split(/\.(?:fly\.storage\.tigris|t3\.storage)\.dev\//)[1];
  return m || null;
};

const pdfFiles = await prisma.file.findMany({
  where: {
    ownerId: OWNER_ID,
    name: { in: websiteIds.map((id) => `sites/${id}/document.pdf`) },
  },
  select: { id: true, name: true, url: true, status: true },
});

console.log(`Found ${pdfFiles.length} PDF file records for ${websiteIds.length} sites.`);

let deleted = 0, skipped = 0;
for (const f of pdfFiles) {
  const key = keyFromUrl(f.url);
  if (!key) { console.log(`SKIP (no public url): ${f.name}`); skipped++; continue; }
  try {
    await s3.send(new DeleteObjectCommand({ Bucket: PUBLIC_BUCKET, Key: key }));
    console.log(`DELETED ${PUBLIC_BUCKET}/${key}  <- ${f.name}`);
    deleted++;
  } catch (e) {
    console.log(`ERROR deleting ${key}: ${e.message}`);
    skipped++;
  }
}
console.log(`\nDone. Deleted ${deleted}, skipped ${skipped}.`);
await prisma.$disconnect();
