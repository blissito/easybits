import { describe, it, expect, vi } from "vitest";

// «Detener» del piloto: routeMessage({ signal }) corta la lectura del worker y regresa lo que
// alcanzó a decir. Sin signal (WhatsApp/WABA/Teams) nada cambia.
vi.mock("~/.server/db", () => ({ db: {} }));
import { collectStream } from "~/.server/core/fleetAgentOperations";

function hangingStream(first: string) {
  const enc = new TextEncoder();
  return new ReadableStream<Uint8Array>({
    start(c) {
      c.enqueue(enc.encode(`data: ${JSON.stringify({ type: "chunk", value: first })}\n`));
      // y luego nada: el worker sigue pensando
    },
  });
}

describe("collectStream con signal", () => {
  it("abortar corta la lectura y regresa lo dicho", async () => {
    const ctrl = new AbortController();
    const chunks: string[] = [];
    const p = collectStream(hangingStream("Hola, reviso "), (s) => chunks.push(s), undefined, undefined, undefined, ctrl.signal);
    await new Promise((r) => setTimeout(r, 20));
    ctrl.abort();
    expect(await p).toBe("Hola, reviso");
    expect(chunks).toEqual(["Hola, reviso "]);
  });

  it("un signal ya abortado no lee nada más", async () => {
    const ctrl = new AbortController();
    ctrl.abort();
    expect(await collectStream(hangingStream("x"), undefined, undefined, undefined, undefined, ctrl.signal)).toBe("");
  });
});
