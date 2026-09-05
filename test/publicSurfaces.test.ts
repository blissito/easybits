import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { BlogSEOService } from "~/.server/blog/seo";

/**
 * Superficies públicas: lo que ve un crawler o un modelo que llega sin contexto.
 *
 * Estos tests existen por dos fallos reales que estuvieron vivos en producción:
 *
 *  1. `/robots.txt` y `/sitemap.xml` servían el shell de la SPA con un 301 al
 *     slash, porque tenían `export default` y estaban en la lista de prerender.
 *     El sitemap NUNCA se consumió. `/calculadora` tenía el mismo bug y llevaba
 *     días sirviendo una página en blanco sin que nadie lo notara.
 *  2. El posicionamiento viejo ("agentic-first file storage") sobrevivía justo
 *     en las puertas de entrada, así que un modelo que nos leía respondía que
 *     EasyBits sirve "para guardar archivos".
 */

const ROUTES_DIR = join(process.cwd(), "app/routes");

/** Rutas públicas de marketing que deben ser descubribles y coherentes. */
const PILLAR_PAGES = [
  "/sandboxes",
  "/hosting",
  "/web",
  "/flota",
  "/bases-de-datos",
];

describe("robots.txt", () => {
  const robots = BlogSEOService.generateRobotsTxt();

  it("apunta al sitemap", () => {
    expect(robots).toContain("Sitemap: https://www.easybits.cloud/sitemap.xml");
  });

  it("anuncia la documentación en texto plano para agentes", () => {
    expect(robots).toContain("/llms.txt");
    expect(robots).toContain("/api/tools.json");
  });

  it("mantiene el panel fuera del índice", () => {
    expect(robots).toMatch(/Disallow:\s*\/dash\//);
  });
});

describe("sitemap.xml", () => {
  it("incluye cada página de pilar", async () => {
    const xml = await BlogSEOService.generateSitemap();
    for (const path of PILLAR_PAGES) {
      expect(xml).toContain(`<loc>https://www.easybits.cloud${path}</loc>`);
    }
  });

  it("no lista /precios, que es un redirect, sino /planes", async () => {
    const xml = await BlogSEOService.generateSitemap();
    expect(xml).not.toContain("<loc>https://www.easybits.cloud/precios</loc>");
    expect(xml).toContain("<loc>https://www.easybits.cloud/planes</loc>");
  });

  it("no repite ninguna URL", async () => {
    const xml = await BlogSEOService.generateSitemap();
    const locs = [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]);
    expect(new Set(locs).size).toBe(locs.length);
  });
});

/**
 * El bug estructural: una ruta que devuelve texto plano NO puede tener un
 * componente. Si lo tiene, React Router la trata como documento y sirve la SPA
 * — silenciosamente, con status 200.
 */
describe("rutas de recurso", () => {
  const walk = (dir: string): string[] =>
    readdirSync(dir).flatMap((entry) => {
      const full = join(dir, entry);
      return statSync(full).isDirectory() ? walk(full) : [full];
    });

  const routeFiles = walk(ROUTES_DIR).filter(
    (f) => f.endsWith(".ts") || f.endsWith(".tsx")
  );

  it("ninguna ruta sirve texto plano Y exporta un componente", () => {
    const offenders: string[] = [];
    for (const file of routeFiles) {
      const src = readFileSync(file, "utf8");
      const servesPlainBody =
        /Content-Type"?\s*:\s*"(text\/plain|application\/xml|text\/xml)/.test(src);
      // `export default function` / `export default (` — una definición real,
      // no la palabra dentro de un comentario.
      const hasComponent = /^export default\s/m.test(src);
      if (servesPlainBody && hasComponent) {
        offenders.push(file.replace(process.cwd() + "/", ""));
      }
    }
    expect(offenders).toEqual([]);
  });
});

describe("posicionamiento", () => {
  const walk = (dir: string): string[] =>
    readdirSync(dir).flatMap((entry) => {
      const full = join(dir, entry);
      return statSync(full).isDirectory() ? walk(full) : [full];
    });

  // Solo código de rutas y paquetes publicados. El blog es archivo con fecha:
  // reescribir un post de 2025 sería falsear el registro, así que queda fuera.
  const files = [
    ...walk(ROUTES_DIR).filter((f) => f.endsWith(".tsx") || f.endsWith(".ts")),
    join(process.cwd(), "README.md"),
    join(process.cwd(), "packages/sdk/README.md"),
    join(process.cwd(), "packages/mcp/README.md"),
    join(process.cwd(), "packages/sdk/package.json"),
    join(process.cwd(), "packages/mcp/package.json"),
  ];

  it("no queda el posicionamiento viejo de almacenamiento de archivos", () => {
    const offenders: string[] = [];
    for (const file of files) {
      const src = readFileSync(file, "utf8");
      if (/agentic[- ]first|file storage/i.test(src)) {
        offenders.push(file.replace(process.cwd() + "/", ""));
      }
    }
    expect(offenders).toEqual([]);
  });

  it("nadie escribe el conteo de tools a mano", () => {
    // La única fuente es getToolCatalog(); ver app/.server/docs/toolCatalog.ts.
    const offenders: string[] = [];
    for (const file of files) {
      const src = readFileSync(file, "utf8");
      const match = src.match(/\b\d{2,4}\+?\s*(tools|herramientas)\b/i);
      if (match) offenders.push(`${file.replace(process.cwd() + "/", "")}: ${match[0]}`);
    }
    expect(offenders).toEqual([]);
  });
});
