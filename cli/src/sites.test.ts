import { test } from "node:test";
import assert from "node:assert/strict";
import { siteRows } from "./commands/sites.ts";

const base = { id: "aaaaaaaaaaaaaaaaaaaaaaaa", name: "Mi sitio", engine: "easybits", createdAt: "2026-10-15T03:00:00.000Z" };

test("una web app muestra su stack junto al tipo", () => {
  const [r] = siteRows([{ ...base, kind: "webapp", stack: "tanstack", url: "https://sb-x-3000.sandboxes.easybits.cloud" }]);
  assert.equal(r.kind, "webapp (tanstack)");
  assert.equal(r.url, "https://sb-x-3000.sandboxes.easybits.cloud");
});

test("un estático sin URL dice que no está publicado", () => {
  const [r] = siteRows([{ ...base, kind: "static", stack: null, url: null }]);
  assert.equal(r.kind, "static");
  assert.match(r.url, /publish|publicar/);
});
