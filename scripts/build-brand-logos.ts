import sharp from "sharp";
import { readFile, writeFile } from "node:fs/promises";

const BRAND_DIR = "public/brand";
const OUT_W = 1800;
const OUT_H = 520;
const GLASSES_H = 360;
const TEXT_H = 200;
const GAP = 60;
const PAD_X = 100;

async function readSvg(path: string) {
  return await readFile(path, "utf8");
}

function recolorIsotipo(svg: string, mode: "color" | "light" | "mono-black" | "mono-white") {
  if (mode === "color" || mode === "light") return svg;
  if (mode === "mono-black") {
    return svg
      .replace(/fill="#9870ED"/g, 'fill="black"')
      .replace(/stroke="#9870ED"/g, 'stroke="black"');
  }
  return svg
    .replace(/fill="#9870ED"/g, 'fill="white"')
    .replace(/stroke="#9870ED"/g, 'stroke="white"')
    .replace(/fill="black" stroke="black"/g, 'fill="white" stroke="white"');
}

function recolorWordmark(svg: string, mode: "color" | "light" | "mono-black" | "mono-white") {
  if (mode === "color" || mode === "mono-black") return svg;
  return svg.replace(/fill="black"/g, 'fill="white"');
}

async function build(mode: "color" | "light" | "mono-black" | "mono-white", outFile: string) {
  const isoSvgRaw = await readSvg(`${BRAND_DIR}/isotipo.svg`);
  const wordSvgRaw = await readSvg(`${BRAND_DIR}/wordmark.svg`);

  const isoSvg = recolorIsotipo(isoSvgRaw, mode);
  const wordSvg = recolorWordmark(wordSvgRaw, mode);

  const isoBuf = await sharp(Buffer.from(isoSvg), { density: 400 })
    .resize({ height: GLASSES_H, fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png()
    .toBuffer();
  const isoMeta = await sharp(isoBuf).metadata();

  const wordBuf = await sharp(Buffer.from(wordSvg), { density: 400 })
    .resize({ height: TEXT_H, fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png()
    .toBuffer();
  const wordMeta = await sharp(wordBuf).metadata();

  const totalContent = (isoMeta.width ?? 0) + GAP + (wordMeta.width ?? 0);
  const finalW = Math.max(OUT_W, totalContent + PAD_X * 2);

  const xIso = Math.round((finalW - totalContent) / 2);
  const xWord = xIso + (isoMeta.width ?? 0) + GAP;
  const yIso = Math.round((OUT_H - GLASSES_H) / 2);
  const yWord = Math.round((OUT_H - TEXT_H) / 2);

  const canvas = sharp({
    create: {
      width: finalW,
      height: OUT_H,
      channels: 4,
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    },
  });

  await canvas
    .composite([
      { input: isoBuf, top: yIso, left: xIso },
      { input: wordBuf, top: yWord, left: xWord },
    ])
    .png()
    .toFile(`${BRAND_DIR}/${outFile}`);

  const meta = await sharp(`${BRAND_DIR}/${outFile}`).metadata();
  console.log(`${outFile}: ${meta.width}x${meta.height}`);
}

async function main() {
  await build("color", "logo.png");
  await build("light", "logo-light.png");
  await build("mono-black", "logo-mono-black.png");
  await build("mono-white", "logo-mono-white.png");
  console.log("Done.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
