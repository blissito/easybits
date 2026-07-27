import { describe, it, expect } from "vitest";
import { stripInternal } from "~/.server/core/fleetAgentOperations";

// Regresión de una fuga REAL a clientes de WABA (2026-07-27): el agente marcaba su
// deliberación con <internal> —como le pide su prompt— pero nadie las quitaba, así que
// «Simple "Gracias" — no está dirigido a mí. Me quedo callada.» se le mandó al cliente.
describe("stripInternal", () => {
  it("no toca una respuesta normal (y no paga el regex de más)", () => {
    const r = "¡Hola! Tu pedido sale mañana 👍";
    expect(stripInternal(r)).toBe(r);
  });

  it("vacía un turno que era PURO razonamiento → silencio real", () => {
    expect(stripInternal('<internal> Simple "Gracias" — no va dirigido a mí. Me quedo callada. </internal>')).toBe("");
  });

  it("conserva lo visible y quita el bloque interno", () => {
    const r = "<internal>El cliente ya pagó, no repito.</internal>\n\nListo, tu pedido sale mañana 👍";
    expect(stripInternal(r)).toBe("Listo, tu pedido sale mañana 👍");
  });

  it("maneja razonamiento multilínea", () => {
    const r = "<internal>\nPaso 1: reviso el folio\nPaso 2: confirmo\n</internal>\nConfirmado ✅";
    expect(stripInternal(r)).toBe("Confirmado ✅");
  });

  it("quita varios bloques", () => {
    expect(stripInternal("<internal>a</internal>Hola<internal>b</internal> mundo")).toBe("Hola mundo");
  });

  it("apertura sin cierre: tira hasta el final (el modelo se quedó a medias)", () => {
    expect(stripInternal("Voy a revisarlo.\n<internal>me quedo callada porque")).toBe("Voy a revisarlo.");
  });

  it("cierre huérfano: lo borra sin comerse el texto", () => {
    expect(stripInternal("Todo en orden</internal>")).toBe("Todo en orden");
  });

  it("tolera espacios y mayúsculas en la etiqueta", () => {
    expect(stripInternal("< INTERNAL >secreto< / Internal >Hola")).toBe("Hola");
  });

  it("colapsa el hueco de líneas que deja el bloque", () => {
    expect(stripInternal("Uno\n\n<internal>x</internal>\n\n\n\nDos")).toBe("Uno\n\nDos");
  });

  it("pasa vacíos sin romperse", () => {
    expect(stripInternal("")).toBe("");
  });
});
