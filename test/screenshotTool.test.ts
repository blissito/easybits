import { describe, it, expect } from "vitest";
import { SCREENSHOT_PRESETS, BOX_HONORS_WAIT } from "../app/.server/core/fleetRender";
import {
  DESIGN_ALLOWLIST,
  CORE_ALLOWLIST,
  IMAGENES_ALLOWLIST,
  IMAGE_ALLOWLIST,
} from "../app/.server/mcp/toolGroups";

describe("screenshot_url / search_icon", () => {
  it("el preset por defecto es móvil, que es el peor caso", () => {
    expect(SCREENSHOT_PRESETS.mobile.width).toBe(390);
    expect(SCREENSHOT_PRESETS.desktop.width).toBe(1440);
  });

  it("declara que la caja NO honra la espera (si esto cambia, actualiza las descripciones)", () => {
    // Medido contra la caja: bytes idénticos con waitMs 0 y 3000.
    expect(BOX_HONORS_WAIT).toBe(false);
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
  });
});
