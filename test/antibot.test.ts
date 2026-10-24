import { describe, it, expect } from "vitest";
import { looksBlocked } from "~/.server/core/renderClient";

// Textos reales que vio el navegador del agente el 23-oct (DuckDuckGo, Google) y uno normal.
describe("muro antibot", () => {
  it("reconoce captchas de buscadores y retos de Cloudflare", () => {
    expect(looksBlocked({ title: "DuckDuckGo", text: "Unfortunately, bots use DuckDuckGo too. Please complete the following challenge to confirm this search was made by a human." })).toBe(true);
    expect(looksBlocked({ title: "", text: "Nuestros sistemas han detectado tráfico inusual procedente de tu red de ordenadores." })).toBe(true);
    expect(looksBlocked({ title: "Just a moment...", text: "Checking your browser before accessing" })).toBe(true);
  });
  it("una página normal no", () => {
    expect(looksBlocked({ title: "tacos cholula puebla - Buscar con Google", text: "Ir al contenido principal Todo Imágenes Maps" })).toBe(false);
    expect(looksBlocked({ title: "Lucía Ortega", text: "Historias de boda contadas con luz natural" })).toBe(false);
  });
});
