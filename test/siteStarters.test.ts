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
