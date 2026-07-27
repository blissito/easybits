import { describe, it, expect } from "vitest";
import {
  shouldFireStage,
  stageLabelFor,
  DEFAULT_PAYMENT_STAGES,
  STAGE_REFIRE_MS,
} from "~/.server/integrations/whatsapp/wabaOrderStage";
import type { WabaOrg } from "~/.server/integrations/whatsapp/waba.server";

const NOW = Date.parse("2026-07-27T18:00:00.000Z");
const ago = (ms: number) => new Date(NOW - ms).toISOString();

describe("shouldFireStage — guarda anti-eco", () => {
  it("dispara la primera vez (sin estado previo)", () => {
    expect(shouldFireStage(undefined, "Pago con transferencia", NOW)).toBe(true);
  });

  it("NO re-dispara el mismo estatus dentro de 24h (el eco 'gracias por tu pago')", () => {
    const prev = { estatus: "Pago con transferencia", at: ago(60 * 60 * 1000) }; // 1h
    expect(shouldFireStage(prev, "Pago con transferencia", NOW)).toBe(false);
  });

  it("re-dispara el mismo estatus pasadas 24h (orden nueva, cliente recurrente)", () => {
    const prev = { estatus: "Pago con transferencia", at: ago(STAGE_REFIRE_MS + 1000) };
    expect(shouldFireStage(prev, "Pago con transferencia", NOW)).toBe(true);
  });

  it("dispara si el estatus es DISTINTO aunque sea inmediato (transferencia → tarjeta)", () => {
    const prev = { estatus: "Pago con transferencia", at: ago(1000) };
    expect(shouldFireStage(prev, "Pago con tarjeta", NOW)).toBe(true);
  });

  it("dispara si el timestamp previo está corrupto (falla hacia registrar, no hacia perder)", () => {
    const prev = { estatus: "Pago con transferencia", at: "no-es-fecha" };
    expect(shouldFireStage(prev, "Pago con transferencia", NOW)).toBe(true);
  });
});

describe("stageLabelFor — forma de pago → columna del tablero", () => {
  it("mapea las tres formas conocidas a las etiquetas de TOTEQUIM", () => {
    expect(stageLabelFor("transferencia")).toBe("Pago con transferencia");
    expect(stageLabelFor("tarjeta")).toBe("Pago con tarjeta");
    expect(stageLabelFor("contra_entrega")).toBe("Pago a contra entrega");
  });

  it("'desconocida' no mueve nada — mejor no tocar que mover mal", () => {
    expect(stageLabelFor("desconocida")).toBeNull();
  });

  it("el tenant puede sobreescribir las etiquetas sin tocar código", () => {
    const org = { paymentStages: { transferencia: "SPEI recibido" } } as WabaOrg;
    expect(stageLabelFor("transferencia", org)).toBe("SPEI recibido");
    // Las no-sobreescritas siguen con el default.
    expect(stageLabelFor("tarjeta", org)).toBe("Pago con tarjeta");
  });

  it("un override vacío o parcial cae al default, no a null", () => {
    const org = { paymentStages: { transferencia: "" } } as WabaOrg;
    expect(stageLabelFor("transferencia", org)).toBe(DEFAULT_PAYMENT_STAGES.transferencia);
  });
});

// La precisión del extractor se valida contra conversaciones reales con
//   npx tsx scripts/check-waba-payment-signal.ts
// No vive aquí porque `test/setup.ts` reemplaza `process.env` entero: bajo vitest no hay
// API key de Gemini. Correr ese script SIEMPRE que se toque el prompt o el schema.
