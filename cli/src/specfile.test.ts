import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { readUploads, secretsFor, specId } from "./specfile.ts";

test("sólo viajan los ${X} que el archivo nombra y existen en el entorno", () => {
  const text = "env:\n  A: ${ANTHROPIC_API_KEY}\nmcp:\n  - headers:\n      Authorization: Bearer ${CRM}\n";
  const r = secretsFor(text, { ANTHROPIC_API_KEY: "sk", HOME: "/x", OTHER: "no" });
  assert.deepEqual(r.secrets, { ANTHROPIC_API_KEY: "sk" });
  assert.deepEqual(r.missing, ["CRM"]);
});

test("el id del archivo, en YAML o JSON", () => {
  assert.equal(specId("# c\nkind: easybits-agent\nid: 6650f0c2a1b2c3d4e5f60718\nname: x\n"), "6650f0c2a1b2c3d4e5f60718");
  assert.equal(specId('{\n  "kind": "easybits-agent",\n  "id": "abc"\n}'), "abc");
  assert.equal(specId("name: x\nmcp:\n  - id: nope\n"), undefined);
});

test("un directorio sube skills/<slug>/… y files/…, sin ocultos", () => {
  const d = mkdtempSync(join(tmpdir(), "ebspec-"));
  mkdirSync(join(d, "skills", "pdf", "assets"), { recursive: true });
  writeFileSync(join(d, "skills", "pdf", "SKILL.md"), "md");
  writeFileSync(join(d, "skills", "pdf", "assets", "logo.svg"), "<svg/>");
  mkdirSync(join(d, "files", "docs"), { recursive: true });
  writeFileSync(join(d, "files", "docs", "a.md"), "a");
  writeFileSync(join(d, "files", ".DS_Store"), "x");
  const u = readUploads(d);
  assert.deepEqual(Object.keys(u.skills!), ["pdf"]);
  assert.deepEqual(u.skills!.pdf.map((f) => f.path).sort(), ["SKILL.md", "assets/logo.svg"]);
  assert.deepEqual(Object.keys(u.files!), ["docs/a.md"]);
  assert.deepEqual(readUploads(join(d, "nada")), {});
});
