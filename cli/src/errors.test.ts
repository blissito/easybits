import { test } from "node:test";
import assert from "node:assert/strict";
import { EasybitsError } from "@easybits.cloud/sdk";
import { isGenericNotFound, toCliError } from "./errors.ts";
import { setLang } from "./i18n.ts";

test("isGenericNotFound: «Not found» a secas, vacío o HTML; con razón no", () => {
  assert.equal(isGenericNotFound(JSON.stringify({ error: "Not found" })), true);
  assert.equal(isGenericNotFound(JSON.stringify({ error: "not found." })), true);
  assert.equal(isGenericNotFound(""), true);
  assert.equal(isGenericNotFound("<html><body>404</body></html>"), true);
  assert.equal(isGenericNotFound("Not found"), true);
  assert.equal(isGenericNotFound(JSON.stringify({ error: "agent not found" })), false);
  assert.equal(isGenericNotFound(JSON.stringify({ error: "Section not found" })), false);
});

test("toCliError 404: la razón tal cual; el genérico avisa de falta de acceso", () => {
  setLang("en");
  const generic = toCliError(new EasybitsError(404, JSON.stringify({ error: "Not found" })));
  assert.equal(generic.message, "Not found — or you don't have access to it.");
  assert.equal(generic.exitCode, 1);
  assert.match(generic.hint ?? "", /whoami/);
  const reason = toCliError(new EasybitsError(404, JSON.stringify({ error: "agent not found" })));
  assert.equal(reason.message, "agent not found");
  setLang("es");
  assert.equal(toCliError(new EasybitsError(404, "")).message, "No se encontró, o no tienes acceso.");
  assert.equal(toCliError(new EasybitsError(404, JSON.stringify({ error: "agent not found" }))).message, "agente no encontrado");
  // Lo demás no cambia: 403 sigue siendo «API error».
  assert.match(toCliError(new EasybitsError(403, JSON.stringify({ error: "Forbidden" }))).message, /403/);
});
