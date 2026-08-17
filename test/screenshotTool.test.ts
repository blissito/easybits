import { describe, it, expect } from "vitest";
import { SCREENSHOT_PRESETS, auditViewportCount, DEFAULT_AUDIT_VIEWPORTS } from "../app/.server/core/fleetRender";
import {
  DESIGN_ALLOWLIST,
  CORE_ALLOWLIST,
  IMAGENES_ALLOWLIST,
  IMAGE_ALLOWLIST,
} from "../app/.server/mcp/toolGroups";

describe("screenshot_url / search_icon / audit_page", () => {
  it("el preset por defecto es móvil, que es el peor caso", () => {
    expect(SCREENSHOT_PRESETS.mobile.width).toBe(390);
    expect(SCREENSHOT_PRESETS.desktop.width).toBe(1440);
  });

  // El preset viaja a la caja como `emulate` (opciones de CONTEXTO de Playwright).
  // Si estos campos desaparecen, "modo móvil" vuelve a ser un viewport angosto y
  // nadie se entera: la captura sale igual de plausible, sólo que miente.
  it("los presets llevan emulación de dispositivo, no sólo un ancho", () => {
    expect(SCREENSHOT_PRESETS.mobile.deviceScaleFactor).toBeGreaterThan(1);
    expect(SCREENSHOT_PRESETS.mobile.isMobile).toBe(true);
    expect(SCREENSHOT_PRESETS.desktop.isMobile).toBe(false);
  });

  // Se cobra por viewport porque eso es lo que cuesta: la caja abre un contexto
  // nuevo y recarga la página una vez por cada uno, en serie.
  it("el costo de auditar se cuenta por viewport", () => {
    expect(auditViewportCount({})).toBe(DEFAULT_AUDIT_VIEWPORTS);
    expect(auditViewportCount({ viewports: [{ name: "mobile", width: 390, height: 844 }] })).toBe(1);
  });

  // Sin esto las tools son INVISIBLES para la flota: el worker corre en modo strict
  // por el grupo `scripting`, y el manifiesto por turno le dice al agente que no
  // ofrezca lo que no esté listado. Es el modo de fallo más silencioso del repo.
  it.each([
    ["DESIGN", DESIGN_ALLOWLIST],
    ["CORE", CORE_ALLOWLIST],
    ["IMAGENES", IMAGENES_ALLOWLIST],
    ["IMAGE", IMAGE_ALLOWLIST],
  ])("están en la allowlist %s", (_name, allowlist) => {
    expect(allowlist.has("screenshot_url")).toBe(true);
    expect(allowlist.has("search_icon")).toBe(true);
    expect(allowlist.has("audit_page")).toBe(true);
  });
});
