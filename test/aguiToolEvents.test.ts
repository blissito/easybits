// El piloto de crons pintaba un paso fantasma «tool ×N» y dejaba los pasos girando: el stream del
// worker perdía `phase`/`id` al pasar por mapSSETokenToChunk, y el cierre de cada tool (que llega con
// `name: ""`) se leía como OTRA tool que empezaba sin nombre.
import { describe, expect, it } from "vitest";
import { createTurnTranslator } from "../app/.server/core/agui";
import { mapSSETokenToChunk } from "../app/.server/core/sandboxOperations";

const sse = (events: object[]) =>
  new ReadableStream<Uint8Array>({
    start(c) {
      for (const e of events) c.enqueue(new TextEncoder().encode(`data: ${JSON.stringify(e)}\n\n`));
      c.close();
    },
  });

async function read(stream: ReadableStream<Uint8Array>) {
  const text = await new Response(stream).text();
  return text
    .split("\n\n")
    .filter((f) => f.startsWith("data: "))
    .map((f) => JSON.parse(f.slice(6)));
}

describe("eventos de tool del worker", () => {
  it("mapSSETokenToChunk conserva id, phase y ok", async () => {
    const out = await read(
      mapSSETokenToChunk(
        sse([
          { type: "tool", name: "mcp_easybits_get_cron_runs", id: "tu_1", phase: "start", detail: "job: backup-agents" },
          { type: "tool", name: "", id: "tu_1", phase: "end", ok: true },
        ])
      )
    );
    expect(out).toEqual([
      { type: "tool", name: "mcp_easybits_get_cron_runs", id: "tu_1", phase: "start", detail: "job: backup-agents" },
      { type: "tool", name: "", id: "tu_1", phase: "end", ok: true },
    ]);
  });

  it("el traductor AG-UI: un paso por tool, cerrado por su id aunque terminen en otro orden", () => {
    const events: Record<string, unknown>[] = [];
    const t = createTurnTranslator({ threadId: "th", runId: "r", emit: (e) => events.push(e as Record<string, unknown>) });
    t.onTurnEvent({ type: "tool", name: "get_cron_runs", id: "w1", phase: "start" } as never);
    t.onTurnEvent({ type: "tool", name: "get_cron_runs", id: "w2", phase: "start" } as never);
    t.onTurnEvent({ type: "tool", name: "", id: "w2", phase: "end", ok: false } as never);
    t.onTurnEvent({ type: "tool", name: "", id: "w1", phase: "end", ok: true } as never);
    const starts = events.filter((e) => e.type === "TOOL_CALL_START");
    expect(starts.map((e) => e.toolCallName)).toEqual(["get_cron_runs", "get_cron_runs"]);
    const results = events.filter((e) => e.type === "TOOL_CALL_RESULT").map((e) => [e.toolCallId, e.content]);
    expect(results).toEqual([
      [starts[1].toolCallId, "error"],
      [starts[0].toolCallId, "ok"],
    ]);
  });
});
