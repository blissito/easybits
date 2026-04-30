import sharp from "sharp";
import { readdir } from "node:fs/promises";
import { join } from "node:path";

const BRAND_DIR = "public/brand";

const TARGETS = [
  { file: "logo.png", bg: { r: 255, g: 255, b: 255, alpha: 0 } },
  { file: "logo-light.png", bg: { r: 0, g: 0, b: 0, alpha: 0 } },
  { file: "logo-mono-black.png", bg: { r: 255, g: 255, b: 255, alpha: 0 } },
  { file: "logo-mono-white.png", bg: { r: 0, g: 0, b: 0, alpha: 0 } },
];

const TOP_PCT = 0.12;
const BOTTOM_PCT = 0.18;
const SIDE_PCT = 0.04;

async function pad(file: string, bg: sharp.Color) {
  const path = join(BRAND_DIR, file);
  const img = sharp(path);
  const meta = await img.metadata();
  const w = meta.width!;
  const h = meta.height!;

  const top = Math.round(h * TOP_PCT);
  const bottom = Math.round(h * BOTTOM_PCT);
  const left = Math.round(w * SIDE_PCT);
  const right = Math.round(w * SIDE_PCT);

  const buf = await img
    .extend({ top, bottom, left, right, background: bg })
    .png()
    .toBuffer();

  await sharp(buf).toFile(path);
  const newMeta = await sharp(path).metadata();
  console.log(`${file}: ${w}x${h} → ${newMeta.width}x${newMeta.height}`);
}

async function main() {
  for (const t of TARGETS) await pad(t.file, t.bg);
  console.log("Done.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
