import { describe, it, expect } from "vitest";
import { WEBHOOK_EVENTS, WEBHOOK_EVENT_DOCS } from "~/.server/webhooks";
import { getDocsMarkdown } from "~/.server/docs/reference";
import { createMcpServer, getRegisteredTools } from "~/.server/mcp/server";

// Los nombres de evento vivían escritos a mano en CUATRO sitios (la unión de tipos, el
// validador del REST, dos `z.enum` del MCP y la lista de los docs) y ya habían divergido:
// `workspace.created`/`workspace.deleted` se DESPACHABAN desde el código pero no se podían
// suscribir por ninguna superficie, y los docs además se saltaban `broadcast.sent`.
//
// Un evento que se emite y nadie puede escuchar no falla: simplemente no pasa nada. Estos
// tests existen para que la próxima desincronización se caiga en CI.

describe("catálogo de eventos de webhook derivado de una fuente única", () => {
  it("todo evento tiene una línea de documentación", () => {
    const sinDoc = WEBHOOK_EVENTS.filter((e) => !WEBHOOK_EVENT_DOCS[e]?.trim());
    expect(sinDoc).toEqual([]);
  });

  it("no hay documentación huérfana de un evento que ya no existe", () => {
    const vivos = new Set<string>(WEBHOOK_EVENTS);
    expect(Object.keys(WEBHOOK_EVENT_DOCS).filter((e) => !vivos.has(e))).toEqual([]);
  });

  it("los docs públicos listan TODOS los eventos", async () => {
    const md = await getDocsMarkdown("webhooks");
    const ausentes = WEBHOOK_EVENTS.filter((e) => !md.includes(e));
    expect(ausentes).toEqual([]);
  });

  it("las tools MCP aceptan TODOS los eventos", () => {
    const tools = getRegisteredTools(createMcpServer(["all"]));
    for (const nombre of ["create_webhook", "update_webhook"]) {
      const schema = tools[nombre]?.inputSchema;
      expect(schema, `${nombre} no está registrada`).toBeTruthy();
      // El shape de zod se inspecciona por su parser: si un evento nuevo no entra en el
      // `z.enum`, esto falla con el nombre del evento en la mano.
      for (const evento of WEBHOOK_EVENTS) {
        const res = (schema as any).safeParse({ url: "https://x.test", webhookId: "x", events: [evento] });
        expect(res.success, `${nombre} rechaza ${evento}`).toBe(true);
      }
    }
  });

  it("los eventos que la app móvil necesita están presentes", () => {
    // Sin `turn.failed` un cliente móvil no distingue «sigue pensando» de «se murió».
    expect(WEBHOOK_EVENTS).toContain("turn.completed");
    expect(WEBHOOK_EVENTS).toContain("turn.failed");
  });

  it("los eventos que se despachan pero no se podían suscribir siguen suscribibles", () => {
    // Regresión concreta: `workspace.*` estaba en la unión de tipos y en `dispatchWebhooks`,
    // pero fuera del validador del REST y del MCP.
    expect(WEBHOOK_EVENTS).toContain("workspace.created");
    expect(WEBHOOK_EVENTS).toContain("workspace.deleted");
  });
});
