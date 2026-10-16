import { describe, it, expect } from "vitest";

// Los starters se escriben tal cual en /app: si uno pierde su script de start o el
// selector de EasyBits, la vista previa o el picker mueren en silencio.
describe("starters de /dash/sitios", async () => {
  const { STARTER_FILES } = await import("~/.server/starters/files");
  const { SITE_STACKS } = await import("~/lib/siteStacks");
  for (const { id } of SITE_STACKS) {
    it(`${id}: package.json con build/start y deps exactas, picker y data-eb-id`, () => {
      const files = STARTER_FILES[id];
      const pkg = JSON.parse(files["package.json"]);
      expect(pkg.scripts.build).toBeTruthy();
      expect(pkg.scripts.start).toBeTruthy();
      expect(pkg.devDependencies).toBeUndefined();
      for (const v of Object.values(pkg.dependencies) as string[]) expect(v).toMatch(/^\d+\.\d+\.\d+$/);
      const all = Object.values(files).join("\n");
      expect(all).toContain("eb-picker.js");
      expect(all).toContain("data-eb-id");
    });
  }
});

describe("vista previa en vivo", () => {
  it("cada stack levanta su dev en el puerto de preview, idempotente y sin tocar /app", async () => {
    const { previewInstallScript, PREVIEW_PORT, PREVIEW_UNIT } = await import("~/.server/starters");
    const { SITE_STACKS } = await import("~/lib/siteStacks");
    for (const s of SITE_STACKS) {
      const cmd = previewInstallScript(s.id, "/app");
      expect(cmd).toContain(`test -f /etc/systemd/system/${PREVIEW_UNIT}.service && echo HAD || {`);
      expect(cmd).toContain(`PORT=${PREVIEW_PORT}`);
      expect(cmd).toContain("__VITE_ADDITIONAL_SERVER_ALLOWED_HOSTS=.easybits.cloud");
      expect(cmd).not.toContain("/app/.easybits-preview");
    }
  });
});

describe("base y login de las web apps", () => {
  it("tanstack trae Better Auth montado sobre la base del sitio, con deps exactas", async () => {
    const { starterFiles, stackHasAuth } = await import("~/.server/starters");
    expect(stackHasAuth("tanstack")).toBe(true);
    expect(stackHasAuth("next")).toBe(false);
    const files = starterFiles("tanstack");
    const deps = JSON.parse(files["package.json"]).dependencies;
    for (const d of ["better-auth", "@libsql/client", "@libsql/kysely-libsql", "kysely"]) expect(deps[d]).toMatch(/^\d+\.\d+\.\d+$/);
    expect(files["src/lib/db.ts"]).toContain("EASYBITS_DB_URL");
    expect(files["src/lib/auth.ts"]).toContain("runMigrations");
    expect(files["src/routes/api/auth/$.ts"]).toContain("auth.handler");
    expect(files[".gitignore"]).toContain("local.db");
  });

  it("meshNamespace = ownerPrefix + nsReal del host (sha256 del owner, 8 bytes)", async () => {
    const { meshNamespace } = await import("~/.server/core/databaseOperations");
    // printf '64f1a2b3c4d5e6f708192a3b' | shasum -a 256 | cut -c1-16
    expect(meshNamespace("64f1a2b3c4d5e6f708192a3b", "site-abc")).toBe("oaff1139deaecbb5d__site-abc");
    expect(() => meshNamespace("x", "a__b")).toThrow();
    expect(() => meshNamespace("x", "a/b")).toThrow();
  });
});
