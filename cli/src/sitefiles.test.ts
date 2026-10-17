import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { mimeOf, sitePath, walkSite } from "./sitefiles.ts";

test("mimeOf: lo de un sitio (css/js/fuentes) y desconocido = octet-stream", () => {
  assert.equal(mimeOf("css/app.css"), "text/css");
  assert.equal(mimeOf("JS/Main.JS"), "text/javascript");
  assert.equal(mimeOf("fonts/x.woff2"), "font/woff2");
  assert.equal(mimeOf("index.html"), "text/html");
  assert.equal(mimeOf("LICENSE"), "application/octet-stream");
});

test("sitePath: relativa, sin .. ni / inicial", () => {
  assert.equal(sitePath("/img/hero.jpg"), "img/hero.jpg");
  assert.equal(sitePath("img\\hero.jpg"), "img/hero.jpg");
  assert.equal(sitePath("../secreto"), null);
  assert.equal(sitePath("a//b"), null);
  assert.equal(sitePath(""), null);
});

test("walkSite: rutas con /, ordenadas; salta ocultos, .git y node_modules", () => {
  const dir = mkdtempSync(join(tmpdir(), "eb-site-"));
  mkdirSync(join(dir, "css"));
  mkdirSync(join(dir, "node_modules", "x"), { recursive: true });
  mkdirSync(join(dir, ".git"));
  writeFileSync(join(dir, "index.html"), "<h1>hola</h1>");
  writeFileSync(join(dir, "css", "app.css"), "body{}");
  writeFileSync(join(dir, ".env"), "SECRET=1");
  writeFileSync(join(dir, "node_modules", "x", "i.js"), "x");
  writeFileSync(join(dir, ".git", "HEAD"), "ref");
  writeFileSync(join(dir, "vacio.txt"), "");
  const files = walkSite(dir);
  assert.deepEqual(files.map((f) => f.path), ["css/app.css", "index.html", "vacio.txt"]);
  assert.equal(files.find((f) => f.path === "index.html")!.size, 13);
  assert.equal(files.find((f) => f.path === "vacio.txt")!.size, 0);
});
