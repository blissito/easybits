import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

// EasyBits ya no vive en Fly (2026-10-08): la app de Fly está borrada y los certs los emite el
// Caddy de sandbox-host. Cualquier llamada a la API de Fly falla en silencio; esto evita que
// vuelva un import de los módulos viejos o una llamada directa.
const FORBIDDEN = [
  /fly_certs/,
  /flyGQLClient/,
  /api\.machines\.dev/,
  /api\.fly\.io/,
  /FLY_API_TOKEN/,
];

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (/\.(ts|tsx|mts|mjs|js)$/.test(name)) out.push(p);
  }
  return out;
}

describe("sin API de Fly", () => {
  it("ningún archivo de app/ la importa ni la llama", () => {
    const hits: string[] = [];
    for (const file of walk(join(__dirname, "..", "app"))) {
      const src = readFileSync(file, "utf8");
      for (const re of FORBIDDEN) if (re.test(src)) hits.push(`${file}: ${re}`);
    }
    expect(hits).toEqual([]);
  });
});
