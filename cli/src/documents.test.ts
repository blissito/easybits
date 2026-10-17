import { test } from "node:test";
import assert from "node:assert/strict";
import { DOC_PRESETS, blankPageHtml, docFormat, pageRef, pageRows, pagesOf, parseSize, reorderIds, safeName } from "./commands/documents.ts";
import { REF_ARGS } from "./refs.ts";

const u = "usage";
const doc = {
  sections: [
    { id: "p-b", order: 1, html: "<section>b</section>", label: "Precios" },
    { id: "p-a", order: 0, html: "<section>a</section>", label: "Portada" },
    { id: "p-c", order: 2, html: "", name: "Anexo" },
  ],
};

test("las páginas van en orden y se piden por número (1 = la primera) o por id", () => {
  const pages = pagesOf(doc);
  assert.deepEqual(pages.map((p) => p.id), ["p-a", "p-b", "p-c"]);
  assert.equal(pageRef(pages, "1", u).id, "p-a");
  assert.equal(pageRef(pages, "p-c", u).id, "p-c");
  assert.throws(() => pageRef(pages, "0", u), /1-3/);
  assert.throws(() => pageRef(pages, "4", u), /1-3/);
  assert.throws(() => pageRef(pages, "nope", u), /nope/);
  assert.deepEqual(pageRows(pages).map((r) => [r.n, r.label]), [[1, "Portada"], [2, "Precios"], [3, "Anexo"]]);
});

test("reorder exige cada página exactamente una vez", () => {
  const pages = pagesOf(doc);
  assert.deepEqual(reorderIds(pages, ["1", "3", "2"], u), ["p-a", "p-c", "p-b"]);
  assert.deepEqual(reorderIds(pages, ["p-c", "1", "2"], u), ["p-c", "p-a", "p-b"]);
  assert.throws(() => reorderIds(pages, ["1", "2"], u), /3/);
  assert.throws(() => reorderIds(pages, ["1", "1", "2"], u), /once|vez/);
});

test("--format: preset o WxH dentro de 100-10000 px; la página en blanco toma ese tamaño", () => {
  assert.deepEqual(docFormat(undefined, u), { dims: null });
  assert.deepEqual(docFormat("ig-feed", u), { body: { preset: "ig-feed" }, dims: { width: 1080, height: 1350 } });
  assert.deepEqual(docFormat("letter", u), { body: { preset: "letter" }, dims: null });
  assert.deepEqual(docFormat("800x600", u), { body: { width: 800, height: 600 }, dims: { width: 800, height: 600 } });
  assert.throws(() => docFormat("a4", u), /a4/);
  assert.throws(() => docFormat("50x600", u), /100/);
  assert.deepEqual(parseSize("1080X1920"), { width: 1080, height: 1920 });
  assert.equal(blankPageHtml(null), undefined);
  assert.match(blankPageHtml({ width: 1080, height: 1350 })!, /w-\[1080px\] h-\[1350px\]/);
});

test("presets del CLI = los del servidor (socialPresets.ts)", async () => {
  const { SOCIAL_PRESETS } = await import("../../app/.server/core/socialPresets.ts");
  const server = Object.fromEntries(Object.entries(SOCIAL_PRESETS).map(([k, v]) => [k, v ?? null]));
  assert.deepEqual(DOC_PRESETS, server);
});

test("nombres de archivo seguros para el PDF/PNG", () => {
  assert.equal(safeName("Cotización: ACME/2026"), "Cotizaci_n_ ACME_2026");
  assert.equal(safeName("///"), "_");
  assert.equal(safeName(""), "document");
});

test("el documento se acepta por nombre en cada subcomando que lo toma", () => {
  for (const k of ["documents get", "documents add-page", "documents rm-page", "documents reorder", "documents deploy", "documents rm"]) {
    assert.deepEqual(REF_ARGS[k], { index: 0, kind: "document" }, k);
  }
  assert.deepEqual(REF_ARGS["documents pages"], { index: 1, kind: "document" });
  assert.deepEqual(REF_ARGS["documents export"], { index: 1, kind: "document" });
});
