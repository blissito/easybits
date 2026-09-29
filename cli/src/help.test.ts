import { test } from "node:test";
import assert from "node:assert/strict";
import { COMMANDS } from "./commands/index.ts";
import { HELP_ES } from "./help.es.ts";
import { setLang } from "./i18n.ts";
import { commandHelp, globalHelp, leafHelp } from "./help.ts";

/** Todos los textos de la ayuda en inglés: grupos, resúmenes, flags y comentarios de ejemplos. */
function helpStrings(): string[] {
  const out = new Set<string>();
  for (const c of COMMANDS) {
    out.add(c.group);
    out.add(c.summary);
    const leaves = c.leaf ? [c.leaf] : Object.values(c.subs ?? {});
    for (const l of leaves) {
      out.add(l.summary);
      for (const o of Object.values(l.options ?? {})) if (o.description) out.add(o.description);
      for (const e of l.examples ?? []) {
        const i = e.indexOf("# ");
        if (i !== -1) out.add(e.slice(i + 2).trim());
      }
    }
  }
  return [...out];
}

test("paridad: cada texto de la ayuda tiene su traducción al español", () => {
  const missing = helpStrings().filter((s) => !(s in HELP_ES));
  assert.deepEqual(missing, [], "agrégalos a src/help.es.ts");
});

test("sin traducciones huérfanas (textos que ya no existen)", () => {
  const live = new Set(helpStrings());
  assert.deepEqual(Object.keys(HELP_ES).filter((k) => !live.has(k)), []);
});

test("la ayuda cambia de idioma; los comandos y flags no", () => {
  setLang("en");
  const en = globalHelp("1.0.0");
  const leafEn = leafHelp(COMMANDS.find((c) => c.name === "apply")!.leaf!);
  setLang("es");
  const es = globalHelp("1.0.0");
  const leafEs = leafHelp(COMMANDS.find((c) => c.name === "apply")!.leaf!);
  assert.match(en, /Global flags:/);
  assert.match(es, /Flags globales:/);
  assert.match(es, /Cómputo:/);
  assert.match(leafEs, /Uso: easybits apply <file\|dir>/);
  assert.match(leafEs, /--prune +Quita también/);
  assert.match(leafEs, /--create --name helper-2 +# una copia/);
  assert.notEqual(leafEn, leafEs);
  assert.match(commandHelp(COMMANDS.find((c) => c.name === "db")!), /Subcomandos:/);
  setLang("en");
});
