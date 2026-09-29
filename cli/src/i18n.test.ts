import { test } from "node:test";
import assert from "node:assert/strict";
import { detectLang, langFlag, serverText } from "./i18n.ts";

test("el idioma: --lang, luego EASYBITS_LANG, luego el locale; inglés por default", () => {
  assert.equal(detectLang(undefined, { LANG: "es_MX.UTF-8" }), "es");
  assert.equal(detectLang(undefined, { LANG: "en_US.UTF-8" }), "en");
  assert.equal(detectLang(undefined, {}), "en");
  assert.equal(detectLang(undefined, { LANG: "C" }), "en");
  assert.equal(detectLang("en", { LANG: "es_MX" }), "en");
  assert.equal(detectLang(undefined, { EASYBITS_LANG: "es", LANG: "en_US" }), "es");
  assert.equal(detectLang(undefined, { LC_ALL: "es_ES.UTF-8", LANG: "en_US" }), "es");
  assert.equal(detectLang("fr", { LANG: "es_MX" }), "es");
});

test("--lang del argv crudo, antes de --", () => {
  assert.equal(langFlag(["db", "ls", "--lang", "es"]), "es");
  assert.equal(langFlag(["--lang=en", "db", "ls"]), "en");
  assert.equal(langFlag(["sb", "exec", "x", "--", "echo", "--lang", "es"]), undefined);
});

test("mensajes de la API al idioma de la corrida", () => {
  assert.equal(serverText("ruta inválida", "en"), "invalid path");
  assert.equal(serverText("ruta inválida", "es"), "ruta inválida");
  assert.equal(serverText("agent not found", "es"), "agente no encontrado");
  assert.equal(serverText("frontmatter sin `name:`", "en"), "frontmatter has no `name:`");
  assert.equal(serverText("algo nuevo", "en"), "algo nuevo");
});
