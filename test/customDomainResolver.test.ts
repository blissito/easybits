import { describe, it, expect } from "vitest";
import { parseCustomHost } from "~/.server/subdomainWebsite";

// Clasificación pura del host de un dominio custom (sin DB). La ruta <slug>.<dominio>
// existía antes del apex y debe seguir clasificándose igual.
describe("parseCustomHost", () => {
  it("apex de 2 partes", () => {
    expect(parseCustomHost("midominio.com")).toEqual({ kind: "apex", domain: "midominio.com" });
  });
  it("www de un dominio de 2 partes", () => {
    expect(parseCustomHost("www.midominio.com")).toEqual({ kind: "www", domain: "midominio.com" });
  });
  it("slug de subdominio (ruta previa intacta)", () => {
    expect(parseCustomHost("tienda.midominio.com")).toEqual({
      kind: "slug",
      domain: "midominio.com",
      slug: "tienda",
    });
  });
  it("www sobre dominio de 3 partes es slug (midominio.com.mx no tiene apex de 2 partes)", () => {
    expect(parseCustomHost("www.midominio.com.mx")).toEqual({
      kind: "slug",
      domain: "midominio.com.mx",
      slug: "www",
    });
  });
  it("host sin punto no es nada", () => {
    expect(parseCustomHost("localhost")).toEqual({ kind: "none" });
  });
});
