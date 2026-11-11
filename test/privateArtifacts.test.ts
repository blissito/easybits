import { readFileSync } from "node:fs";
import path from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";

// clone_pdf y compare_render guardan el contenido del documento del usuario (el HTML
// del clon y el PNG de comparación). Iban al bucket PÚBLICO sin avisar. Ahora van a
// almacenamiento privado y se devuelve una liga firmada que caduca.

const { uploadFile, getReadUrl, getClientForFile, getReadClientForPlatformFile } = vi.hoisted(() => {
  const getReadUrl = vi.fn(async (key: string, ttl: number) => `https://private.example/${key}?X-Amz-Expires=${ttl}`);
  return {
    uploadFile: vi.fn(),
    getReadUrl,
    getClientForFile: vi.fn(async () => ({ getReadUrl })),
    getReadClientForPlatformFile: vi.fn(() => ({ getReadUrl })),
  };
});

vi.mock("~/.server/core/operations", () => ({ uploadFile }));
vi.mock("~/.server/storage", () => ({ getClientForFile, getReadClientForPlatformFile }));
vi.mock("~/.server/db", () => ({ db: {} }));

import { PRIVATE_ARTIFACT_URL_TTL_S, storeRender } from "~/.server/core/fleetRender";

const ctx = { user: { id: "u1" }, scopes: ["READ", "WRITE"] } as never;

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal("fetch", vi.fn(async () => new Response(null, { status: 200 })));
});

describe("storeRender", () => {
  it("por defecto sigue siendo público (render_pdf, screenshot_url no cambian)", async () => {
    uploadFile.mockResolvedValue({
      file: { id: "f1", url: "https://easybits-public.t3.storage.dev/u1/x", storageKey: "u1/x", storageProviderId: null },
      putUrl: "https://put.example/x",
    });
    const out = await storeRender(ctx, Buffer.from("pdf"), "application/pdf", "reporte", "pdf");
    expect(uploadFile.mock.calls[0][1].access).toBe("public");
    expect(out).toEqual({ fileId: "f1", url: "https://easybits-public.t3.storage.dev/u1/x" });
    expect(getReadUrl).not.toHaveBeenCalled();
  });

  it("privado: sube como private y devuelve liga firmada de 24 h con su caducidad", async () => {
    uploadFile.mockResolvedValue({
      file: { id: "f2", url: "", access: "private", storageKey: "u1/y", storageProviderId: null },
      putUrl: "https://put.example/y",
    });
    const before = Date.now();
    const out = await storeRender(ctx, Buffer.from("<html>"), "text/html", "clone-p1", "html", { access: "private" });

    expect(uploadFile.mock.calls[0][1]).toMatchObject({ access: "private", fileName: "clone-p1.html", source: "render" });
    expect(PRIVATE_ARTIFACT_URL_TTL_S).toBe(24 * 60 * 60);
    expect(getReadUrl).toHaveBeenCalledWith("u1/y", PRIVATE_ARTIFACT_URL_TTL_S);
    expect(out.fileId).toBe("f2");
    expect(out.url).toBe("https://private.example/u1/y?X-Amz-Expires=86400");
    expect(out.url).not.toContain("easybits-public");
    const exp = Date.parse(out.urlExpiresAt!);
    expect(exp).toBeGreaterThanOrEqual(before + 86_400_000);
    expect(exp).toBeLessThanOrEqual(Date.now() + 86_400_000);
  });

  it("privado con proveedor propio del usuario: firma con el cliente de ese proveedor", async () => {
    uploadFile.mockResolvedValue({
      file: { id: "f3", url: "", access: "private", storageKey: "u1/z", storageProviderId: "prov1" },
      putUrl: "https://put.example/z",
    });
    await storeRender(ctx, Buffer.from("png"), "image/png", "compare-p1", "png", { access: "private" });
    expect(getClientForFile).toHaveBeenCalledWith("prov1", "u1");
    expect(getReadClientForPlatformFile).not.toHaveBeenCalled();
  });
});

describe("quién guarda en privado", () => {
  const src = (f: string) => readFileSync(path.join(__dirname, "..", f), "utf8");
  const calls = (code: string) => code.split("\n").filter((l) => /await storeRender\(/.test(l));

  it("clone_pdf y compare_render pasan access: private en cada subida", () => {
    for (const f of ["app/.server/core/pdfClone.ts", "app/.server/core/renderCompare.ts"]) {
      const found = calls(src(f));
      expect(found.length, f).toBeGreaterThan(0);
      for (const c of found) expect(c, f).toContain('access: "private"');
    }
  });

  it("las descripciones de las tools dicen que el artefacto es privado y cómo borrarlo", async () => {
    const { CLONE_PDF_DESC, clonePdfHint } = await import("~/.server/mcp/clonePdfTool");
    const { COMPARE_RENDER_DESC } = await import("~/.server/mcp/compareRenderTool");
    for (const d of [CLONE_PDF_DESC, COMPARE_RENDER_DESC]) {
      expect(d).toContain("PRIVADO");
      expect(d).toContain("24 h");
      expect(d).toContain("permanent: true");
    }
    const hint = clonePdfHint({
      pages: [{
        page: 1, url: "https://private.example/x", urlExpiresAt: "2026-11-12T00:00:00.000Z", fileId: "f", pageCss: { width: 816, height: 1056 },
        words: 10, scanned: false, fonts: [], substitutedFonts: ["Lato-Medium → Lato (Google Fonts): la fuente incrustada no trae tabla cmap"],
      }],
      verify: null,
    });
    expect(hint).toContain("Fuentes NO incrustadas");
    expect(hint).toContain("Lato-Medium → Lato");
    expect(hint).toContain("caduca en 24 h");
  });
});
