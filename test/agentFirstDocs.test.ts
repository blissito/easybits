// Docs agent-first: skills por well-known, /docs/<sección>.md, MCP de docs y anclas de /docs.
// Congela las superficies que un agente de código consume sin scrapear.
import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { loader as skillsLoader } from "../app/routes/api/wellknown/skills";
import { skillsIndex } from "../app/.server/docs/skillsWellKnown";
import { loader as mdLoader } from "../app/routes/docs.$section.md";
import { DOCS_SECTION_ALIAS } from "../app/.server/docs/sectionAlias";
import { handle, TOOLS } from "../app/.server/docs/docsMcp";
import { VALID_SECTIONS } from "../app/.server/docs/reference";
import { loader as catalogLoader } from "../app/routes/api/wellknown/api-catalog";
import { loader as cardLoader } from "../app/routes/api/wellknown/mcp-server-card";
import { markdownForRequest } from "../app/.server/docs/acceptMarkdown";
import { execFileSync } from "node:child_process";

const SKILLS_DIR = join(__dirname, "../public/skills");

describe("skills por well-known", () => {
  const dirs = readdirSync(SKILLS_DIR, { withFileTypes: true }).filter((d) => d.isDirectory()).map((d) => d.name);

  it("hay al menos el skill easybits", () => {
    expect(dirs).toContain("easybits");
  });

  it.each(dirs)("SKILL.md de %s tiene frontmatter válido para la CLI de skills", (name) => {
    const md = readFileSync(join(SKILLS_DIR, name, "SKILL.md"), "utf8");
    const fm = md.match(/^---\n([\s\S]*?)\n---/)?.[1] ?? "";
    expect(fm.match(/^name:\s*(.+)$/m)?.[1]?.trim()).toBe(name);
    const description = fm.match(/^description:\s*(.+)$/m)?.[1] ?? "";
    expect(description.length).toBeGreaterThan(40);
    // Un `: ` dentro del valor hace que el parser YAML de Claude descarte la skill en silencio.
    expect(description).not.toMatch(/:\s/);
    expect(description).toMatch(/Use when/);
    // agentskills.io: licencia, compatibilidad y metadata.version (el packer lo exige).
    expect(fm).toMatch(/^license: /m);
    expect(fm).toMatch(/^compatibility: /m);
    expect(fm).toMatch(/^\s+version: "/m);
    expect(md.split("\n").length).toBeLessThan(500);
  });

  it("el packer valida y produce un índice v0.2.0 con digest (se EJECUTA, no se lee)", () => {
    const out = execFileSync("npx", ["tsx", "scripts/skills-pack.mts", "--write"], { cwd: join(__dirname, ".."), encoding: "utf8" });
    expect(out).toMatch(/skills: \d+ ok/);
    const idx = JSON.parse(readFileSync(join(SKILLS_DIR, "index.json"), "utf8"));
    expect(idx.$schema).toBe("https://schemas.agentskills.io/discovery/0.2.0/schema.json");
    for (const s of idx.skills) {
      expect(s.digest).toMatch(/^sha256:[0-9a-f]{64}$/);
      expect(["skill-md", "archive"]).toContain(s.type);
      expect(s.url).toMatch(/^https:\/\/www\.easybits\.cloud\/skills\//);
    }
    // El digest del archive es el del tar servido: un tar no reproducible rompería `skills update`.
    const { createHash } = require("node:crypto") as typeof import("node:crypto");
    const eb = idx.skills.find((x: any) => x.name === "easybits");
    expect(eb.type).toBe("archive");
    const tar = readFileSync(join(SKILLS_DIR, "easybits.tar.gz"));
    expect("sha256:" + createHash("sha256").update(tar).digest("hex")).toBe(eb.digest);
  });

  it("index.json lista el skill con sus archivos", () => {
    const idx = skillsIndex();
    const eb = idx.find((s) => s.name === "easybits")!;
    expect(eb).toBeTruthy();
    expect(eb.files).toContain("SKILL.md");
    expect(eb.files).toContain("references/api.md");
    expect(eb.description).toMatch(/EasyBits/);
  });

  it("el loader sirve index.json, cada archivo con su content-type, y 404 en lo que no existe", async () => {
    const req = (path: string) => ({ request: new Request(`https://www.easybits.cloud${path}`), params: { "*": path.split("/").slice(3).join("/") } }) as any;
    const idx = skillsLoader(req("/.well-known/skills/index.json")) as Response;
    expect(idx.status).toBe(200);
    const legacy = await idx.json();
    expect(legacy.skills.length).toBeGreaterThan(0);
    expect(legacy.skills[0].files).toContain("SKILL.md"); // legacy = files[]
    const md = skillsLoader(req("/.well-known/skills/easybits/SKILL.md")) as Response;
    expect(md.headers.get("Content-Type")).toMatch(/text\/markdown/);
    expect(await md.text()).toMatch(/^---\nname: easybits/);
    expect((skillsLoader(req("/.well-known/skills/nope/SKILL.md")) as Response).status).toBe(404);
    // El alias agent-skills sirve los mismos archivos.
    expect((skillsLoader(req("/.well-known/agent-skills/easybits-docs/SKILL.md")) as Response).status).toBe(200);
  });
});

describe("well-known de Agent Readiness", () => {
  it("api-catalog es un linkset RFC 9727", async () => {
    const res = catalogLoader();
    expect(res.headers.get("Content-Type")).toMatch(/application\/linkset\+json; profile=/);
    const body = await res.json();
    expect(body.linkset[0].item[0]["service-desc"][0].href).toMatch(/tools\.json$/);
  });
  it("la tarjeta MCP apunta al endpoint del producto", async () => {
    const card = await cardLoader().json();
    expect(card.$schema).toMatch(/server-card\.schema\.json$/);
    expect(card.remotes[0].url).toBe("https://www.easybits.cloud/api/mcp");
  });
  it("Accept: text/markdown en /docs devuelve markdown; sin Accept, nada", async () => {
    const md = await markdownForRequest(new Request("https://www.easybits.cloud/docs", { headers: { accept: "text/markdown" } }));
    expect(md?.headers.get("Content-Type")).toMatch(/text\/markdown/);
    expect(md?.headers.get("Vary")).toBe("Accept");
    expect(await markdownForRequest(new Request("https://www.easybits.cloud/docs", { headers: { accept: "text/html,*/*;q=0.8" } }))).toBeNull();
    expect(await markdownForRequest(new Request("https://www.easybits.cloud/planes", { headers: { accept: "text/markdown" } }))).toBeNull();
  });
});

describe("/docs/<sección>.md", () => {
  it("/docs.md es la referencia completa", async () => {
    const res = await mdLoader({ params: {} } as any);
    expect(res.status).toBe(200);
    expect(await res.text()).toMatch(/^# EasyBits API Reference/);
  });

  it.each(VALID_SECTIONS)("sirve %s como markdown", async (s) => {
    const res = await mdLoader({ params: { section: s } } as any);
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toMatch(/text\/markdown/);
  });

  it("los ids de las <section> de /docs resuelven (directo o por alias)", async () => {
    const tsx = readFileSync(join(__dirname, "../app/routes/docs.tsx"), "utf8");
    const ids = [...tsx.matchAll(/<section id="([a-z0-9-]+)"/g)].map((m) => m[1]);
    expect(ids.length).toBeGreaterThan(20);
    for (const id of ids) {
      const res = await mdLoader({ params: { section: id } } as any);
      expect(res.status, `/docs/${id}.md`).toBe(200);
    }
    for (const target of Object.values(DOCS_SECTION_ALIAS)) expect(VALID_SECTIONS).toContain(target);
  });

  it("404 real para una sección inventada", async () => {
    expect((await mdLoader({ params: { section: "nope" } } as any)).status).toBe(404);
  });
});

describe("MCP de docs (/mcp/docs)", () => {
  const rpc = (method: string, params?: unknown) => handle({ jsonrpc: "2.0", id: 1, method, params: params as any });

  it("initialize + tools/list", async () => {
    const init: any = await rpc("initialize");
    expect(init.result.serverInfo.name).toBe("easybits-docs");
    const list: any = await rpc("tools/list");
    expect(list.result.tools.map((t: any) => t.name)).toEqual(TOOLS.map((t) => t.name));
  });

  it("search_docs encuentra la sección de sandboxes", async () => {
    const r: any = await rpc("tools/call", { name: "search_docs", arguments: { query: "suspendOnIdle" } });
    expect(r.result.isError).toBe(false);
    expect(r.result.content[0].text).toMatch(/\/docs\/agents\.md/);
  });

  it("read_doc de una clave inexistente es error, notificación → null", async () => {
    const r: any = await rpc("tools/call", { name: "read_doc", arguments: { section: "nope" } });
    expect(r.result.isError).toBe(true);
    expect(await handle({ jsonrpc: "2.0", method: "notifications/initialized" })).toBeNull();
  });
});

describe("anclas internas de /docs", () => {
  it("todo href=\"#x\" apunta a un id existente", () => {
    const tsx = readFileSync(join(__dirname, "../app/routes/docs.tsx"), "utf8");
    const ids = new Set([...tsx.matchAll(/\bid="([a-z0-9-]+)"/g)].map((m) => m[1]));
    const hrefs = [...tsx.matchAll(/href="#([a-z0-9-]+)"/g)].map((m) => m[1]);
    const broken = hrefs.filter((h) => !ids.has(h));
    expect(broken).toEqual([]);
  });
});
