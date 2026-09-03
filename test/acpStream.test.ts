import { describe, it, expect } from "vitest";
import { transformAcpStream } from "~/.server/core/sandboxOperations";

/**
 * El traductor ACP → SSE del widget. Se prueba aquí porque es el punto donde se PERDÍA el
 * consumo: sólo se miraba `agent_message_chunk` y el `done` ignoraba `result` entero, así
 * que el `usage` que el agente reporta (feature ACP unstable_end_turn_token_usage) nunca
 * salía. El handshake completo no se puede testear sin un host, esto sí.
 */
function acpStream(lines: string[]): ReadableStream<Uint8Array> {
  const enc = new TextEncoder();
  return new ReadableStream({
    start(c) {
      for (const l of lines) c.enqueue(enc.encode(`data: ${l}\n\n`));
      c.close();
    },
  });
}

async function drain(s: ReadableStream<Uint8Array>): Promise<any[]> {
  const reader = s.getReader();
  const dec = new TextDecoder();
  let buf = "";
  const out: any[] = [];
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += dec.decode(value, { stream: true });
    let nl: number;
    while ((nl = buf.indexOf("\n\n")) !== -1) {
      const evt = buf.slice(0, nl).replace(/^data: /, "");
      buf = buf.slice(nl + 2);
      if (evt.trim()) out.push(JSON.parse(evt));
    }
  }
  return out;
}

const chunk = (text: string) =>
  JSON.stringify({
    jsonrpc: "2.0",
    method: "session/update",
    params: { update: { sessionUpdate: "agent_message_chunk", content: { type: "text", text } } },
  });

describe("transformAcpStream", () => {
  it("emite usage antes del done y arrastra el stopReason", async () => {
    const events = await drain(
      transformAcpStream(
        acpStream([
          chunk("Hola"),
          JSON.stringify({
            jsonrpc: "2.0",
            id: 7,
            result: {
              stopReason: "end_turn",
              usage: { totalTokens: 6936, inputTokens: 6815, outputTokens: 121 },
            },
          }),
        ]),
        7
      )
    );
    expect(events).toEqual([
      { type: "chunk", value: "Hola" },
      { type: "usage", inputTokens: 6815, outputTokens: 121, totalTokens: 6936 },
      { type: "done", stopReason: "end_turn" },
    ]);
  });

  it("sin usage no inventa el evento", async () => {
    const events = await drain(
      transformAcpStream(
        acpStream([chunk("hey"), JSON.stringify({ jsonrpc: "2.0", id: 1, result: {} })]),
        1
      )
    );
    expect(events.some((e) => e.type === "usage")).toBe(false);
    expect(events.at(-1)).toEqual({ type: "done", stopReason: undefined });
  });

  it("un usage en cero se descarta: cobrar 0 tokens no es un dato, es ruido", async () => {
    const events = await drain(
      transformAcpStream(
        acpStream([
          JSON.stringify({
            jsonrpc: "2.0",
            id: 3,
            result: { usage: { totalTokens: 0, inputTokens: 0, outputTokens: 0 } },
          }),
        ]),
        3
      )
    );
    expect(events.some((e) => e.type === "usage")).toBe(false);
  });

  it("un error del agente sale como error, no como done", async () => {
    const events = await drain(
      transformAcpStream(
        acpStream([JSON.stringify({ jsonrpc: "2.0", id: 2, error: { message: "boom" } })]),
        2
      )
    );
    expect(events).toEqual([{ type: "error", message: "boom" }]);
  });

  it("ignora las notificaciones que no son chunks de mensaje", async () => {
    const events = await drain(
      transformAcpStream(
        acpStream([
          JSON.stringify({
            jsonrpc: "2.0",
            method: "session/update",
            params: { update: { sessionUpdate: "tool_call", content: { text: "no sale" } } },
          }),
          chunk("sí sale"),
          JSON.stringify({ jsonrpc: "2.0", id: 9, result: {} }),
        ]),
        9
      )
    );
    expect(events.filter((e) => e.type === "chunk")).toEqual([{ type: "chunk", value: "sí sale" }]);
  });
});
