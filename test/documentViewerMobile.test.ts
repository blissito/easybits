import { describe, it, expect } from "vitest";
import { buildDocumentHtml } from "../app/lib/documents/buildHtml";

const sections = [1, 2, 3].map((n) => ({ id: `p${n}`, order: n, label: `P${n}`, html: `<section>Página ${n}</section>` })) as any;

describe("visor de documentos: celular", () => {
  const html = buildDocumentHtml(sections, { title: "Prueba" } as any);
  it("trae la barra inferior de navegación y el viewport con safe-area", () => {
    expect(html).toContain('class="mobile-nav"');
    expect(html).toContain('id="m-indicator">1 / 3');
    expect(html).toContain("viewport-fit=cover");
  });
  it("en celular va de una página a la vez y mide el alto real, no 120 px fijos", () => {
    expect(html).toContain("usePortrait: !IS_LANDSCAPE || IS_MOBILE");
    expect(html).toContain("visualViewport");
    expect(html).not.toContain("window.innerHeight - 120");
  });
  it("centra portada/contraportada en vista de libro abierto", () => {
    expect(html).toContain("function centerBook()");
  });
});
