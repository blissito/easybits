import { describe, it, expect } from "vitest";
import { addressIdFor } from "~/.server/integrations/whatsapp/formmyOrderActions";
import {
  hasContactData,
  shouldFireStage,
  stageLabelFor,
  DEFAULT_PAYMENT_STAGES,
  DEFAULT_CANCEL_STAGE,
  DEFAULT_INVOICE_STAGE,
  DEFAULT_CLOSED_STAGE,
  DEFAULT_HUMAN_STAGE,
  STAGE_REFIRE_MS,
} from "~/.server/integrations/whatsapp/wabaOrderStage";
import type { PaymentSignal } from "~/.server/integrations/whatsapp/wabaOrderStage";
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

const SIN_CONTACTO: PaymentSignal["contacto"] = {
  email: null,
  rfc: null,
  razonSocial: null,
  direccion: null,
};
const avanzar = (forma: PaymentSignal["forma"]): PaymentSignal => ({
  accion: "avanzar",
  forma,
  monto: null,
  contacto: SIN_CONTACTO,
});
const cancelar: PaymentSignal = {
  accion: "cancelar",
  forma: "desconocida",
  monto: null,
  contacto: SIN_CONTACTO,
};

describe("stageLabelFor — señal del turno → columna del tablero", () => {
  it("mapea las tres formas conocidas a las etiquetas de TOTEQUIM", () => {
    expect(stageLabelFor(avanzar("transferencia"))).toBe("Pago con transferencia");
    expect(stageLabelFor(avanzar("tarjeta"))).toBe("Pago con tarjeta");
    expect(stageLabelFor(avanzar("contra_entrega"))).toBe("Pago a contra entrega");
  });

  it("'desconocida' no mueve nada — mejor no tocar que mover mal", () => {
    expect(stageLabelFor(avanzar("desconocida"))).toBeNull();
  });

  it("'ninguna' no mueve nada aunque venga con una forma", () => {
    expect(
      stageLabelFor({ accion: "ninguna", forma: "transferencia", monto: 100, contacto: SIN_CONTACTO })
    ).toBeNull();
  });

  it("cancelar va a su columna, sin importar la forma", () => {
    expect(stageLabelFor(cancelar)).toBe(DEFAULT_CANCEL_STAGE);
    expect(stageLabelFor({ ...cancelar, forma: "tarjeta" })).toBe(DEFAULT_CANCEL_STAGE);
  });

  it("las columnas que no dependen del pago tienen cada una la suya", () => {
    const sig = (accion: PaymentSignal["accion"]): PaymentSignal => ({
      accion,
      forma: "desconocida",
      monto: null,
      contacto: SIN_CONTACTO,
    });
    expect(stageLabelFor(sig("facturar"))).toBe(DEFAULT_INVOICE_STAGE);
    expect(stageLabelFor(sig("entregar"))).toBe(DEFAULT_CLOSED_STAGE);
    expect(stageLabelFor(sig("escalar"))).toBe(DEFAULT_HUMAN_STAGE);
    // Las 8 columnas del tablero quedan cubiertas y sin colisión entre sí.
    const labels = ["facturar", "entregar", "escalar", "cancelar"].map((a) =>
      stageLabelFor(sig(a as PaymentSignal["accion"]))
    );
    expect(new Set(labels).size).toBe(4);
  });

  it("el tenant puede sobreescribir las etiquetas sin tocar código", () => {
    const org = {
      paymentStages: { transferencia: "SPEI recibido" },
      cancelStage: "Perdido",
    } as WabaOrg;
    expect(stageLabelFor(avanzar("transferencia"), org)).toBe("SPEI recibido");
    // Las no-sobreescritas siguen con el default.
    expect(stageLabelFor(avanzar("tarjeta"), org)).toBe("Pago con tarjeta");
    expect(stageLabelFor(cancelar, org)).toBe("Perdido");
  });

  it("un override vacío o parcial cae al default, no a null", () => {
    const org = { paymentStages: { transferencia: "" }, cancelStage: "" } as WabaOrg;
    expect(stageLabelFor(avanzar("transferencia"), org)).toBe(DEFAULT_PAYMENT_STAGES.transferencia);
    expect(stageLabelFor(cancelar, org)).toBe(DEFAULT_CANCEL_STAGE);
  });
});

describe("hasContactData — gate barato antes de escribir la ficha", () => {
  it("false cuando el turno no trajo nada (el caso normal)", () => {
    expect(hasContactData(SIN_CONTACTO)).toBe(false);
    expect(hasContactData(undefined)).toBe(false);
    expect(hasContactData({ ...SIN_CONTACTO, direccion: { direccion: null, cp: null, ciudad: null } })).toBe(false);
  });

  it("true con cualquier dato, incluso una dirección parcial", () => {
    expect(hasContactData({ ...SIN_CONTACTO, rfc: "XAXX010101000" })).toBe(true);
    expect(hasContactData({ ...SIN_CONTACTO, direccion: { direccion: null, cp: "42000", ciudad: null } })).toBe(true);
  });
});

describe("stableAddressId — la misma dirección NO se duplica en la ficha", () => {
  it("mismo domicilio → mismo id, aunque cambien acentos, mayúsculas o puntuación", () => {
    const a = addressIdFor({ direccion: "Av. Juárez 210", cp: "42000", ciudad: "Pachuca" });
    const b = addressIdFor({ direccion: "AV JUAREZ 210", cp: "42000", ciudad: "pachuca" });
    expect(a).toBe(b);
  });

  it("domicilios distintos → ids distintos", () => {
    const a = addressIdFor({ direccion: "Av. Juárez 210", cp: "42000", ciudad: "Pachuca" });
    const b = addressIdFor({ direccion: "Av. Juárez 211", cp: "42000", ciudad: "Pachuca" });
    expect(a).not.toBe(b);
  });
});

// La precisión del extractor se valida contra conversaciones reales con
//   npx tsx scripts/check-waba-payment-signal.ts
// No vive aquí porque `test/setup.ts` reemplaza `process.env` entero: bajo vitest no hay
// API key de Gemini. Correr ese script SIEMPRE que se toque el prompt o el schema.
