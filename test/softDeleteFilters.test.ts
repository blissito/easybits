import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

// En Mongo, `deletedAt: null` NO casa con el campo AUSENTE: los sitios que nunca se borraron
// no lo tienen. `usage` contaba websites=0 mientras `websites ls` (que usa el OR con
// `isSet: false`) sí los devolvía. Ningún filtro de website puede usar `deletedAt: null` solo.
function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((f) => {
    const p = join(dir, f);
    return statSync(p).isDirectory() ? walk(p) : /\.tsx?$/.test(f) ? [p] : [];
  });
}

describe("filtros de borrado suave de Website", () => {
  it("ningún website.* filtra con `deletedAt: null` sin el caso `isSet: false`", () => {
    const bad: string[] = [];
    for (const file of walk(join(__dirname, "..", "app"))) {
      const src = readFileSync(file, "utf8");
      for (const m of src.matchAll(/db\.website\.\w+\(\{[^;]*?\}\)/gs)) {
        if (/deletedAt: null/.test(m[0]) && !/isSet: false/.test(m[0])) bad.push(`${file}: ${m[0].slice(0, 80)}`);
      }
    }
    expect(bad).toEqual([]);
  });
});
