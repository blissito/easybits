import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { parse } from "yaml";

// public/openapi.yaml es fuente de verdad A MANO. Este test la ata al router:
// cada path/método declarado debe existir en app/routes.ts (prefix api/v2, o
// /api/tools.json fuera) y su archivo de ruta debe exportar loader (GET) o
// action (resto). Además: todo $ref resuelve y cada operationId es único.

const ROOT = resolve(__dirname, "..");
const spec = parse(readFileSync(resolve(ROOT, "public/openapi.yaml"), "utf8"));
const routesSrc = readFileSync(resolve(ROOT, "app/routes.ts"), "utf8");

const METHODS = ["get", "post", "put", "patch", "delete", "head", "options"];

// Rutas del bloque `prefix("api/v2", [...])` + las top-level que empiezan por api/.
function collectRoutes(): { pattern: string; file: string }[] {
  const out: { pattern: string; file: string }[] = [];
  const re = /route\(\s*"([^"]+)",\s*"([^"]+)"/g;
  const v2Start = routesSrc.indexOf('prefix("api/v2"');
  const v1Start = routesSrc.indexOf('prefix("api/v1"');
  let m: RegExpExecArray | null;
  while ((m = re.exec(routesSrc))) {
    const [, pattern, file] = m;
    const inV2 = m.index > v2Start && m.index < v1Start;
    const full = inV2
      ? `/api/v2/${pattern}`
      : pattern.startsWith("/")
        ? pattern
        : `/${pattern}`;
    out.push({ pattern: full, file });
  }
  return out;
}

const routes = collectRoutes();

// `{x}` → `:x`, y luego compara segmento a segmento: un segmento `:param` del
// router casa con cualquier segmento (incluidos `:action`/`:op` y otro nombre).
function matchRoute(specPath: string): { pattern: string; file: string } | null {
  const want = specPath.split("/").filter(Boolean);
  const candidates = routes.filter((r) => {
    const segs = r.pattern.split("/").filter(Boolean);
    // `:jobId?` opcional: acepta longitud igual o una menos.
    const optional = segs[segs.length - 1]?.endsWith("?");
    // `*` (splat) al final casa con uno o más segmentos: `agents/:id/files/*` ↔ `/agents/{id}/files/{path}`.
    const splat = segs[segs.length - 1] === "*";
    if (splat) {
      if (want.length < segs.length) return false;
    } else if (segs.length !== want.length && !(optional && segs.length === want.length + 1))
      return false;
    return want.every((w, i) => {
      if (splat && i >= segs.length - 1) return true;
      const s = segs[i].replace(/\?$/, "");
      if (s.startsWith(":")) return true;
      return s === w.replace(/^\{(.+)\}$/, ":$1");
    });
  });
  if (!candidates.length) return null;
  // Preferir la más literal (menos comodines): `sandboxes/:id/bg` gana a `sandboxes/:id/:action`.
  candidates.sort(
    (a, b) => (a.pattern.match(/:/g)?.length ?? 0) - (b.pattern.match(/:/g)?.length ?? 0)
  );
  return candidates[0];
}

function resolveRef(ref: string): unknown {
  if (!ref.startsWith("#/")) throw new Error(`$ref externo no soportado: ${ref}`);
  return ref
    .slice(2)
    .split("/")
    .map((s) => s.replace(/~1/g, "/").replace(/~0/g, "~"))
    .reduce<any>((acc, key) => (acc == null ? undefined : acc[key]), spec);
}

function walkRefs(node: unknown, path: string, out: { ref: string; at: string }[]) {
  if (Array.isArray(node)) node.forEach((n, i) => walkRefs(n, `${path}[${i}]`, out));
  else if (node && typeof node === "object") {
    for (const [k, v] of Object.entries(node)) {
      if (k === "$ref" && typeof v === "string") out.push({ ref: v, at: path });
      else walkRefs(v, `${path}.${k}`, out);
    }
  }
}

describe("public/openapi.yaml", () => {
  it("es OpenAPI 3.1 con servidor y seguridad global", () => {
    expect(spec.openapi).toMatch(/^3\.1\./);
    expect(spec.servers?.[0]?.url).toBe("https://www.easybits.cloud");
    expect(spec.components.securitySchemes.apiKey.type).toBe("http");
    expect(spec.components.securitySchemes.oauth2.type).toBe("oauth2");
    expect(spec.security).toEqual([{ apiKey: [] }, { oauth2: [] }]);
  });

  it("todo $ref resuelve", () => {
    const refs: { ref: string; at: string }[] = [];
    walkRefs(spec, "$", refs);
    expect(refs.length).toBeGreaterThan(50);
    const broken = refs.filter((r) => resolveRef(r.ref) === undefined);
    expect(broken, JSON.stringify(broken, null, 2)).toEqual([]);
  });

  it("cada operación tiene operationId único", () => {
    const seen = new Map<string, string>();
    const dupes: string[] = [];
    for (const [p, item] of Object.entries<any>(spec.paths)) {
      for (const m of METHODS) {
        const op = item[m];
        if (!op) continue;
        expect(op.operationId, `${m.toUpperCase()} ${p} sin operationId`).toBeTruthy();
        if (seen.has(op.operationId)) dupes.push(`${op.operationId} (${seen.get(op.operationId)} y ${m} ${p})`);
        seen.set(op.operationId, `${m} ${p}`);
      }
    }
    expect(dupes).toEqual([]);
  });

  const ops: { method: string; path: string }[] = [];
  for (const [p, item] of Object.entries<any>(spec.paths)) {
    for (const m of METHODS) if (item[m]) ops.push({ method: m, path: p });
  }

  it.each(ops)("$method $path existe en app/routes.ts y exporta loader/action", ({ method, path }) => {
    const hit = matchRoute(path);
    expect(hit, `sin route() para ${path}`).not.toBeNull();
    const src = readFileSync(resolve(ROOT, "app", hit!.file), "utf8");
    const want = method === "get" ? "loader" : "action";
    expect(
      new RegExp(`export\\s+(async\\s+)?(function|const)\\s+${want}\\b`).test(src),
      `${hit!.file} no exporta ${want} (para ${method.toUpperCase()} ${path})`
    ).toBe(true);
  });
});
