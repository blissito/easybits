import { test } from "node:test";
import assert from "node:assert/strict";
import { findNameRefs, replaceName } from "./db-name-refs.ts";

test("encuentra la base como palabra suelta, con su renglón", () => {
  const text = "Eres el agente de ventas.\nUsa la base totequim para cotizar.\nLa tabla totequim.productos manda.";
  assert.deepEqual(findNameRefs(text, "totequim"), [{ line: 2, text: "Usa la base totequim para cotizar." }]);
});

test("no toca dominios, menciones, sufijos ni la marca en mayúsculas", () => {
  const text = "Visita totequim.com, escribe a @totequim, prueba en totequim_prueba o totequim-dev. TOTEQUIM es la marca. ruta/totequim";
  assert.deepEqual(findNameRefs(text, "totequim"), []);
  assert.equal(replaceName(text, "totequim", "catalogo"), text);
});

test("reemplaza todas las apariciones sueltas y respeta la puntuación", () => {
  const text = "base: totequim\n(totequim), «totequim»; `totequim`";
  assert.equal(replaceName(text, "totequim", "catalogo"), "base: catalogo\n(catalogo), «catalogo»; `catalogo`");
});

test("los caracteres especiales del nombre no rompen la expresión", () => {
  assert.equal(replaceName("usa a+b hoy", "a+b", "ab"), "usa ab hoy");
});
