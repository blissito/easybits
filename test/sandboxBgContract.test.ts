import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";

// Dos posts vivos y el SDK compilado fijan esta forma:
//   app/content/blog/2026-06-04-tu-agente-corre-codigo-sandboxes-easybits.mdx
//   app/content/blog/2026-06-05-migra-tus-pipelines-sandboxes-easybits.mdx
// El segundo publica el bucle `while (st.status === "running")` leyendo
// `st.stdout.slice(seen)`. Si un refactor tira uno de estos campos o renombra un
// método, esos ejemplos dejan de funcionar en silencio. Este test es el seguro.

const sdk = readFileSync("packages/sdk/src/index.ts", "utf8");
const core = readFileSync("app/.server/core/sandboxOperations.ts", "utf8");
const mcp = readFileSync("app/.server/mcp/server.ts", "utf8");
const routes = readFileSync("app/routes.ts", "utf8");

describe("contrato publicado de background exec", () => {
  it("el SDK conserva los tres métodos que los posts nombran", () => {
    for (const m of ["execBackground(", "bgStatus(", "bgKill("]) {
      expect(sdk).toContain(m);
    }
  });

  it("BgStatusResult conserva los campos que el post lee", () => {
    const shape = sdk.slice(sdk.indexOf("export interface BgStatusResult"));
    for (const f of ["status", "exitCode", "stdout", "stderr", "startedAt"]) {
      expect(shape.slice(0, 400)).toContain(f);
    }
    // Los dos únicos valores de status que el bucle publicado distingue.
    expect(shape.slice(0, 400)).toContain('"running" | "exited"');
  });

  it("las tres ops del core siguen existiendo con sus nombres", () => {
    for (const f of [
      "export async function execBackground(",
      "export async function execBackgroundStatus(",
      "export async function execBackgroundKill(",
    ]) {
      expect(core).toContain(f);
    }
  });

  it("las tres tools MCP siguen registradas con sus nombres", () => {
    for (const t of [
      '"sandbox_exec_background"',
      '"sandbox_exec_status"',
      '"sandbox_exec_kill"',
    ]) {
      expect(mcp).toContain(t);
    }
  });

  it("las rutas REST publicadas siguen registradas", () => {
    expect(routes).toContain('route("sandboxes/:id/bg"');
    expect(routes).toContain('route("sandboxes/:id/bg/:execId"');
  });

  it("y lo añadido está ahí: listado y alias del kill", () => {
    expect(sdk).toContain("bgList(");
    expect(core).toContain("export async function execBackgroundList(");
    expect(mcp).toContain('"sandbox_exec_list"');
    expect(routes).toContain("sandboxes/:id/bg/:execId/kill");
  });
});
