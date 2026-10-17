import { test } from "node:test";
import assert from "node:assert/strict";
import { SITE_STACKS, SITE_TEMPLATES, TEMPLATE_STACKS, createBody, siteRows } from "./commands/sites.ts";

const base = { id: "aaaaaaaaaaaaaaaaaaaaaaaa", name: "Mi sitio", engine: "easybits", createdAt: "2026-10-15T03:00:00.000Z", websiteId: null, sandboxId: null, archivedAt: null };

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

test("un sitio archivado lo dice en vez de «sin publicar»", () => {
  const [r] = siteRows([{ ...base, kind: "webapp", stack: "next", url: null, archivedAt: "2026-10-10T00:00:00.000Z" }]);
  assert.match(r.url, /archived|archivada/);
});

test("create: arma el cuerpo y valida kind, stack y plantilla antes de llamar a la API", () => {
  const u = "usage";
  assert.deepEqual(createBody({ prompt: "Landing de mi dentista" }, u), { kind: "webapp", prompt: "Landing de mi dentista" });
  assert.deepEqual(createBody({ name: "Promo", kind: "static" }, u), { kind: "static", name: "Promo" });
  assert.deepEqual(createBody({ prompt: "x", stack: "react-router", template: "portafolio" }, u), {
    kind: "webapp",
    prompt: "x",
    stack: "react-router",
    template: "portafolio",
  });
  assert.throws(() => createBody({}, u), /--prompt/);
  assert.throws(() => createBody({ prompt: "x", kind: "spa" }, u), /--kind/);
  assert.throws(() => createBody({ prompt: "x", stack: "rails" }, u), /rails/);
  assert.throws(() => createBody({ prompt: "x", kind: "static", stack: "next" }, u), /webapp/);
  assert.throws(() => createBody({ prompt: "x", template: "tienda" }, u), /tienda/);
  // Next no trae plantillas en su caja: el servidor la ignoraría en silencio.
  assert.throws(() => createBody({ prompt: "x", stack: "next", template: "portafolio" }, u), /tanstack/);
});

test("stacks y plantillas del CLI = los del servidor", async () => {
  const { SITE_STACKS: serverStacks } = await import("../../app/lib/siteStacks.ts");
  const { SITE_TEMPLATES: serverTemplates, TEMPLATE_STACKS: serverTplStacks } = await import("../../app/lib/siteTemplates.ts");
  assert.deepEqual([...SITE_STACKS], serverStacks.map((s: { id: string }) => s.id));
  assert.deepEqual([...SITE_TEMPLATES], serverTemplates.map((s: { key: string }) => s.key));
  assert.deepEqual([...TEMPLATE_STACKS], [...serverTplStacks]);
});
