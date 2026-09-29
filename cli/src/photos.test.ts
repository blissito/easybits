import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { defaultPhotoColumn, imageTypeOf, linkKind, linkStatsSql, parseLinkStats, photoFiles, planPhotos } from "./photos.ts";

const JPG = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3]);
const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0]);
const WEBP = Buffer.from([0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x45, 0x42, 0x50]);

test("el tipo por los bytes, no por la extensión", () => {
  assert.deepEqual(imageTypeOf(JPG), { mime: "image/jpeg", ext: "jpg" });
  assert.deepEqual(imageTypeOf(PNG)?.ext, "png");
  assert.deepEqual(imageTypeOf(WEBP)?.ext, "webp");
  assert.equal(imageTypeOf(Buffer.from("<svg xmlns='…'/>")), null);
});

test("SKU-123.jpg → llave SKU-123; lo que no es foto se explica", () => {
  const d = mkdtempSync(join(tmpdir(), "ebphotos-"));
  writeFileSync(join(d, "SKU-123.jpg"), JPG);
  writeFileSync(join(d, "SKU-9.PNG"), PNG);
  writeFileSync(join(d, "falsa.jpg"), "hola");
  writeFileSync(join(d, "vacia.webp"), "");
  writeFileSync(join(d, ".DS_Store"), "x");
  const r = photoFiles(d);
  assert.deepEqual(r.photos.map((p) => [p.key, p.ext]), [["SKU-123", "jpg"], ["SKU-9", "png"]]);
  assert.deepEqual(r.rejected, [{ file: "falsa.jpg", reason: "not_an_image" }, { file: "vacia.webp", reason: "empty" }]);
});

test("clase de liga", () => {
  assert.equal(linkKind("https://easybits-public.t3.storage.dev/u/abc"), "permanent");
  assert.equal(linkKind("https://www.easybits.cloud/f/x"), "permanent");
  assert.equal(linkKind("https://bucket.s3.amazonaws.com/x.jpg?X-Amz-Signature=abc"), "expiring");
  assert.equal(linkKind("https://cliente.com/foto.jpg"), "external");
  assert.equal(linkKind(""), "empty");
  assert.equal(linkKind(null), "empty");
  assert.equal(linkKind("sin liga"), "other");
});

test("columna por default y plan", () => {
  assert.equal(defaultPhotoColumn(["sku", "Nombre", "Image_URL"]), "Image_URL");
  assert.equal(defaultPhotoColumn(["sku", "precio"]), undefined);
  const photos = photoFiles(mkdtempSync(join(tmpdir(), "ebphotos-"))).photos;
  assert.deepEqual(photos, []);
  const p = [
    { key: "A", file: "A.jpg" },
    { key: "B", file: "B.jpg" },
    { key: "C", file: "C.jpg" },
  ] as never;
  const cur = new Map<string, unknown>([["A", "https://easybits-public.t3.storage.dev/x"], ["B", "https://cliente.com/b.jpg"]]);
  assert.deepEqual(planPhotos(p, cur, false).map((x) => x.action), ["keep", "update", "no_row"]);
  assert.deepEqual(planPhotos(p, cur, true).map((x) => x.action), ["update", "update", "no_row"]);
});

test("conteo de ligas en SQL", () => {
  const sql = linkStatsSql("productos", ["foto", "web"]);
  assert.match(sql, /FROM "productos"$/);
  assert.equal((sql.match(/SUM\(/g) ?? []).length, 8);
  assert.deepEqual(parseLinkStats(["foto", "web", "nombre"], [3, 1, 2, 4, 0, 0, 0, 7, 0, 0, 0, 0]), [
    { column: "foto", permanent: 3, expiring: 1, external: 2, empty: 4 },
  ]);
});
