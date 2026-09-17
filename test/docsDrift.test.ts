import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync, existsSync } from "node:fs";
import { join, resolve } from "node:path";
import { execFileSync } from "node:child_process";
import { parse } from "yaml";
import { SANDBOX_ACTIONS, SANDBOX_TEMPLATES } from "~/.server/sandbox/schemas";
import { TEMPLATE_CATALOG, publicTemplates } from "~/.server/sandbox/templateCatalog";
import { TOOL_GROUPS, GROUP_ALLOWLISTS } from "~/.server/mcp/toolGroups";
import { getToolCatalog } from "~/.server/docs/toolCatalog";
import { getDocsMarkdown, VALID_SECTIONS, EN_SECTION_KEYS } from "~/.server/docs/reference";

// Desfase entre las FUENTES ÚNICAS del servidor (templates, acciones, tools, versiones)
// y las superficies de prosa pública. La regla: nada de esto se escribe a mano; si una
// superficie lo copia, aquí se cruza contra la fuente. Ver scripts/docs-sync.mts.
const ROOT = resolve(__dirname, "..");
const read = (rel: string) => readFileSync(join(ROOT, rel), "utf8");
const walk = (dir: string): string[] =>
  readdirSync(dir).flatMap((e) => {
    const f = join(dir, e);
    return statSync(f).isDirectory() ? walk(f) : [f];
  });

const spec = parse(read("public/openapi.yaml"));
const routesSrc = read("app/routes.ts");

describe("bloques generados (scripts/docs-sync.mts)", () => {
  it("ningún bloque <!-- generated --> está desfasado", () => {
    // Ejecuta el generador en modo check: falla si algún archivo cambiaría.
    expect(() =>
      execFileSync("npx", ["tsx", "scripts/docs-sync.mts"], { cwd: ROOT, stdio: "pipe" }),
    ).not.toThrow();
  }, 60_000);
});

describe("OpenAPI ↔ servidor", () => {
  it("el enum {action} de /sandboxes/{id}/{action} es exactamente SANDBOX_ACTIONS", () => {
    const param = spec.paths["/api/v2/sandboxes/{id}/{action}"].parameters.find((p: any) => p.name === "action");
    expect(param.schema.enum).toEqual([...SANDBOX_ACTIONS]);
  });

  it("el enum de template de SandboxCreate es exactamente el catálogo público", () => {
    expect(spec.components.schemas.SandboxCreate.properties.template.enum).toEqual(publicTemplates());
  });

  it("toda ruta /api/v2 con loader/action está en el spec (o excluida a propósito)", () => {
    // Superficie interna o no pública: admin, callbacks de proveedores, plumbing de la flota.
    const EXCLUDE = [/^\/api\/v2\/admin\//, /webhook/, /callback/, /^\/api\/v2\/fleet-/, /internal/, /\/stream$/, /^\/api\/v2\/oauth/];
    const v2Start = routesSrc.indexOf('prefix("api/v2"');
    const v1Start = routesSrc.indexOf('prefix("api/v1"');
    const re = /route\(\s*"([^"]+)",\s*"([^"]+)"/g;
    const specPaths: string[] = Object.keys(spec.paths);
    const toSpecShape = (p: string) => p.replace(/:([a-zA-Z]+)\??/g, "{$1}");
    const covered = (pattern: string) => {
      const want = toSpecShape(pattern).split("/").filter(Boolean);
      return specPaths.some((sp) => {
        const segs = sp.split("/").filter(Boolean);
        if (segs.length !== want.length) return false;
        // Un `{param}` del spec casa cualquier segmento y viceversa: `/{action}` cubre `/idle`.
        return want.every((w, i) => segs[i] === w || segs[i].startsWith("{") || w.startsWith("{"));
      });
    };
    // Trinquete: lo que YA estaba sin documentar vive en la baseline. Una ruta NUEVA sin
    // OpenAPI falla aquí; una ruta de la baseline que se documenta también falla (para
    // que se quite de la lista y no vuelva a crecer).
    const baseline: string[] = JSON.parse(read("test/openapi-undocumented.json"));
    const undocumented: string[] = [];
    let m: RegExpExecArray | null;
    while ((m = re.exec(routesSrc))) {
      if (!(m.index > v2Start && m.index < v1Start)) continue;
      const full = `/api/v2/${m[1]}`;
      if (EXCLUDE.some((x) => x.test(full))) continue;
      if (!covered(full)) undocumented.push(full);
    }
    const nuevas = undocumented.filter((r) => !baseline.includes(r));
    const yaDocumentadas = baseline.filter((r) => !undocumented.includes(r));
    expect(nuevas, "rutas nuevas sin OpenAPI (documéntalas en public/openapi.yaml)").toEqual([]);
    expect(yaDocumentadas, "ya documentadas: quítalas de test/openapi-undocumented.json").toEqual([]);
  });
});

describe("templates", () => {
  it("TEMPLATE_CATALOG describe cada template del enum (y nada más)", () => {
    expect(Object.keys(TEMPLATE_CATALOG).sort()).toEqual([...SANDBOX_TEMPLATES].sort());
  });
  it("la referencia ES y EN listan todos los templates públicos", async () => {
    const es = await getDocsMarkdown("agents", "es");
    const en = await getDocsMarkdown("agents", "en");
    for (const t of publicTemplates()) {
      expect(es, `ES sin ${t}`).toContain(`\`${t}\``);
      expect(en, `EN sin ${t}`).toContain(`\`${t}\``);
    }
  });
});

describe("tools mencionadas existen", () => {
  const catalog = new Set(getToolCatalog().map((t) => t.name));
  // Tools ocultas del catálogo público pero reales (dinámicas / scripting).
  const ALSO_OK = new Set(["discover_tools", "run_tool"]);
  const PREFIX = /`((?:sandbox|db|web|launch|create|list|get|delete|update|upload|deploy|agent|fleet|service|structured|research|secret|machine|render|audit)_[a-z_]+)(?:\(|`)/g;
  const surfaces = [
    "app/routes/docs.tsx",
    "app/routes/developers.tsx",
    "app/routes/funcionalidades.tsx",
    "app/routes/mcp-apps.tsx",
    "app/routes/llms.txt.ts",
    "packages/sdk/README.md",
    "packages/mcp/README.md",
    "packages/eve-sandbox/README.md",
    "packages/eve-world/README.md",
    ...walk(join(ROOT, "public/skills")).filter((f) => f.endsWith(".md")).map((f) => f.replace(ROOT + "/", "")),
    ...walk(join(ROOT, "app/.server/docs")).filter((f) => /reference.*\.ts$/.test(f)).map((f) => f.replace(ROOT + "/", "")),
  ];
  it.each(surfaces)("%s no cita tools inexistentes", (rel) => {
    const src = read(rel);
    const bad = new Set<string>();
    for (const m of src.matchAll(PREFIX)) {
      const name = m[1];
      if (!catalog.has(name) && !ALSO_OK.has(name)) bad.add(name);
    }
    expect([...bad]).toEqual([]);
  });

  it("toda tool del grupo sandbox aparece en la referencia ES", async () => {
    // Es lo que habría atrapado sandbox_set_idle el día que nació sin docs.
    const md = await getDocsMarkdown(undefined, "es");
    const missing = [...(GROUP_ALLOWLISTS["sandbox" as keyof typeof GROUP_ALLOWLISTS] ?? [])].filter((t) => catalog.has(t) && !md.includes(`\`${t}(`) && !md.includes(`\`${t}\``));
    expect(missing).toEqual([]);
  });
});

describe("grupos MCP", () => {
  it("los grupos citados en los skills existen y ningún grupo público falta en easybits-mcp", () => {
    const skill = read("public/skills/easybits-mcp/SKILL.md");
    const known = new Set<string>(TOOL_GROUPS.map((g) => g.key));
    for (const m of skill.matchAll(/^\| `([a-z-]+)`/gm)) expect(known.has(m[1]), `grupo desconocido ${m[1]}`).toBe(true);
    const mentioned = new Set([...skill.matchAll(/`([a-z-]+)`/g)].map((m) => m[1]));
    // Perfiles por audiencia (no dominios) no van en la tabla del skill.
    const PROFILES = new Set(["publico", "ghosty", "ghostyapp", "public-safe"]);
    const missing = TOOL_GROUPS.filter((g) => g.toolCount && !PROFILES.has(g.key) && !mentioned.has(g.key)).map((g) => g.key);
    expect(missing).toEqual([]);
  });
});

describe("versiones", () => {
  const mcpPkg = JSON.parse(read("packages/mcp/package.json"));
  it("server.json apunta a la versión npm del proxy MCP", () => {
    const server = JSON.parse(read("server.json"));
    expect(server.packages[0].version).toBe(mcpPkg.version);
  });
  it("la server card MCP lleva la versión del paquete", async () => {
    const { loader } = await import("~/routes/api/wellknown/mcp-server-card");
    const res = await (loader as () => Response)();
    expect((await res.json()).version).toBe(mcpPkg.version);
  });
});

describe("secciones y hints", () => {
  const llms = read("app/routes/llms.txt.ts");
  it("cada sección de la referencia ES tiene hint en llms.txt", () => {
    const missing = VALID_SECTIONS.filter((s) => !new RegExp(`^\\s*"?${s}"?:`, "m").test(llms.split("SECTION_HINTS_EN")[0]));
    expect(missing).toEqual([]);
  });
  it("cada sección EN tiene hint en /en/llms.txt", () => {
    const en = llms.split("SECTION_HINTS_EN")[1] ?? "";
    const missing = EN_SECTION_KEYS.filter((s) => !new RegExp(`^\\s*"?${s}"?:`, "m").test(en));
    expect(missing).toEqual([]);
  });
  it("las secciones EN existen en ES", () => {
    for (const s of EN_SECTION_KEYS) expect(VALID_SECTIONS).toContain(s);
  });
});

describe("skills", () => {
  it("cada references/*.md citado en un SKILL.md existe", () => {
    for (const dir of readdirSync(join(ROOT, "public/skills"))) {
      const skill = join(ROOT, "public/skills", dir, "SKILL.md");
      if (!existsSync(skill)) continue;
      const src = readFileSync(skill, "utf8");
      for (const m of src.matchAll(/references\/([a-z0-9-]+\.md)/g)) {
        expect(existsSync(join(ROOT, "public/skills", dir, "references", m[1])), `${dir}: falta references/${m[1]}`).toBe(true);
      }
    }
  });
});
