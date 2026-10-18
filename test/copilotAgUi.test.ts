import { describe, it, expect, vi, beforeEach } from "vitest";
import { HttpAgent } from "@ag-ui/client";
import { fakeAgentActionTable } from "./fakeAgentActions";

// El piloto del panel de crons habla AG-UI puro: lo prueba un cliente AG-UI ajeno
// (`HttpAgent` de @ag-ui/client, que valida la secuencia de eventos) contra la ruta real.
// Turno con propuesta → RUN_FINISHED con interrupt; resume aprueba UNA vez; reconectar da
// MESSAGES_SNAPSHOT; y la aprobación sigue siendo sólo con la sesión del superusuario.

const h = vi.hoisted(() => ({
  db: {} as any,
  routeMessage: vi.fn(),
  startManualRun: vi.fn(async (job: string) => ({ started: true, job })),
  sessionUser: null as any,
}));
vi.mock("~/.server/db", () => ({ db: h.db }));
vi.mock("~/.server/core/fleetAgentOperations", () => ({
  routeMessage: h.routeMessage,
  FleetAgentAtCapacity: class extends Error {},
  createFleetAgent: vi.fn(),
  recycleFleetAgentBoxes: vi.fn(),
}));
vi.mock("~/.server/core/fleetAdmitHold", () => ({ withAdmitRetry: (fn: () => unknown) => fn() }));
vi.mock("~/.server/core/siteOperations", () => ({}));
vi.mock("~/.server/core/fleetUsage", () => ({ recordFleetTurnUsage: vi.fn() }));
vi.mock("~/.server/lifecycle.server", () => ({ isDraining: () => false, registerDrain: vi.fn() }));
vi.mock("~/.server/cron", async (orig) => ({ ...(await orig<object>()), startManualRun: h.startManualRun }));
vi.mock("~/.server/getters", async (orig) => ({ ...(await orig<object>()), getUserOrNull: vi.fn(async () => h.sessionUser) }));
vi.mock("~/.server/core/adminCopilot", async (orig) => ({
  ...(await orig<object>()),
  ensureAdminCopilot: vi.fn(async () => ({ id: "f".repeat(24) })),
}));

import { action } from "~/routes/api/v2/admin.copilot.chat";
import { proposeAction } from "~/.server/core/agentActions";

const URL_ = "https://www.easybits.cloud/api/v2/admin/copilot/chat";
const admin = { id: "a".repeat(24), email: "root@easybits.cloud", roles: ["Admin"] } as any;
const mortal = { id: "b".repeat(24), email: "x@y.z", roles: [] } as any;

let messages: { id: string; fleetAgentId: string; groupId: string; role: string; text: string; createdAt: Date }[];
beforeEach(() => {
  h.db.agentAction = fakeAgentActionTable();
  messages = [];
  h.db.fleetTurn = {
    findUnique: vi.fn(async () => null),
    findFirst: vi.fn(async () => null),
    findMany: vi.fn(async () => []),
    create: vi.fn(async () => ({})),
    update: vi.fn(async () => ({})),
    updateMany: vi.fn(async () => ({ count: 0 })),
  };
  h.db.fleetAgent = { findFirst: vi.fn(async () => ({ id: "f".repeat(24) })) };
  h.db.userCron = { findMany: vi.fn(async () => []) };
  h.db.fleetAgentMessage = {
    create: vi.fn(async ({ data }: any) => {
      const row = { id: `m${messages.length + 1}`, createdAt: new Date(), ...data };
      messages.push(row);
      return row;
    }),
    findMany: vi.fn(async () => [...messages].reverse()),
    createMany: vi.fn(async ({ data }: any) => {
      for (const d of data) messages.push({ id: `m${messages.length + 1}`, createdAt: new Date(), ...d });
      return { count: data.length };
    }),
    findFirst: vi.fn(async () => null),
    update: vi.fn(),
  };
  h.routeMessage.mockReset();
  h.startManualRun.mockClear();
  h.sessionUser = admin;
  // El cliente AG-UI hace `fetch`: aquí cae directo en la ruta.
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    try {
      return await action({ request: new Request(String(input), init), params: {}, context: {} } as any);
    } catch (e) {
      if (e instanceof Response) return e;
      throw e;
    }
  }) as typeof fetch;
});

const agent = (threadId = "th-crons") => new HttpAgent({ url: URL_, threadId, headers: { Origin: "https://www.easybits.cloud" } });

async function run(a: HttpAgent, params: Parameters<HttpAgent["runAgent"]>[0]) {
  const events: any[] = [];
  await a.runAgent(params, { onEvent: ({ event }) => void events.push(event) });
  return events;
}

const post = async (body: unknown, headers: Record<string, string> = {}) => {
  try {
    return await action({
      request: new Request(URL_, { method: "POST", headers: { "Content-Type": "application/json", ...headers }, body: JSON.stringify(body) }),
      params: {},
      context: {},
    } as any);
  } catch (e) {
    if (e instanceof Response) return e;
    throw e;
  }
};

/** El agente propone correr la purga: deja la fila `pending` a media herramienta. */
function agentProposes() {
  h.routeMessage.mockImplementation(async (_id: string, _msg: unknown, opts: any) => {
    opts.onChunk("Reviso la tarea. ");
    opts.onTool("mcp__easybits__run_cron", { phase: "start" });
    await proposeAction(admin.id, "run_cron", { job: "purge-notifications" });
    opts.onTool("", { phase: "end", ok: true });
    opts.onChunk("Te dejo la tarjeta.");
    return "Reviso la tarea. Te dejo la tarjeta.";
  });
}

describe("piloto de crons por AG-UI", () => {
  it("un turno con propuesta termina en RUN_FINISHED con interrupt (y HttpAgent lo acepta)", async () => {
    agentProposes();
    const a = agent();
    // No es orden directa (pide revisar antes): va al modelo.
    a.addMessage({ id: "u1", role: "user", content: "revisa cómo va la purga de notificaciones y córrela si hace falta" });
    const events = await run(a, {
      runId: "run-0000001",
      context: [{ description: "screen", value: JSON.stringify({ page: "crons", job: "purge-notifications" }) }],
    });
    const types = events.map((e) => e.type);
    expect(types[0]).toBe("RUN_STARTED");
    expect(types).toEqual(expect.arrayContaining(["TEXT_MESSAGE_START", "TEXT_MESSAGE_CONTENT", "TOOL_CALL_START", "TOOL_CALL_END", "TOOL_CALL_RESULT"]));
    const last = events.at(-1);
    expect(last.type).toBe("RUN_FINISHED");
    expect(last.outcome.type).toBe("interrupt");
    const [int] = last.outcome.interrupts;
    expect(int).toMatchObject({
      id: h.db.agentAction.rows[0].id,
      reason: "confirmation",
      message: "Ejecutar ahora «Purga de notificaciones» (purge-notifications)",
      metadata: { tool: "run_cron" },
    });
    expect(events.find((e) => e.type === "TOOL_CALL_START" && e.toolCallId === int.toolCallId)?.toolCallName).toBe("mcp__easybits__run_cron");
    // El agente recibió el contexto de pantalla.
    expect(h.routeMessage.mock.calls[0][1].text).toContain("tarea seleccionada: purge-notifications");
    expect(h.startManualRun).not.toHaveBeenCalled();
  });

  it("con una tarjeta abierta, otro mensaje da 409 interrupt_pending", async () => {
    await proposeAction(admin.id, "run_cron", { job: "purge-notifications" });
    const res = await post({ threadId: "th-crons", runId: "run-0000002", messages: [{ id: "u2", role: "user", content: "hola" }] });
    expect(res.status).toBe(409);
    expect((await res.json()).error).toBe("interrupt_pending");
  });

  it("resume aprobado ejecuta UNA vez; repetirlo es inocuo; rechazar no corre nada", async () => {
    const p = await proposeAction(admin.id, "run_cron", { job: "purge-notifications" });
    const a = agent();
    const resume = [{ interruptId: p.id, status: "resolved" as const, payload: { approved: true } }];
    const first = await run(a, { runId: "run-0000003", resume });
    expect(first.at(-1)).toMatchObject({ type: "RUN_FINISHED", outcome: { type: "success" } });
    expect(first.find((e) => e.type === "TOOL_CALL_RESULT").content).toContain('"executed"');
    const again = await run(a, { runId: "run-0000004", resume });
    expect(again.at(-1).type).toBe("RUN_FINISHED");
    expect(h.startManualRun).toHaveBeenCalledTimes(1);

    const q = await proposeAction(admin.id, "pause_cron", { job: "purge-keys", paused: true });
    const no = await run(a, { runId: "run-0000005", resume: [{ interruptId: q.id, status: "resolved", payload: { approved: false } }] });
    expect(no.find((e) => e.type === "TOOL_CALL_RESULT").content).toContain('"rejected"');
    expect(h.db.agentAction.rows.find((r: any) => r.id === q.id).status).toBe("rejected");
  });

  it("una tarjeta vencida contesta RUN_ERROR interrupt_expired y no ejecuta", async () => {
    const p = await proposeAction(admin.id, "run_cron", { job: "purge-notifications" });
    h.db.agentAction.rows[0].createdAt = new Date(Date.now() - 16 * 60_000);
    const res = await post({ threadId: "th-crons", runId: "run-0000006", messages: [], resume: [{ interruptId: p.id, status: "resolved", payload: { approved: true } }] });
    const body = await res.text();
    expect(body).toContain('"RUN_ERROR"');
    expect(body).toContain('"interrupt_expired"');
    expect(h.startManualRun).not.toHaveBeenCalled();
  });

  it("reconectar sin mensaje da MESSAGES_SNAPSHOT (sin el prefijo de contexto) y las tarjetas abiertas", async () => {
    messages.push(
      { id: "m1", fleetAgentId: "f".repeat(24), groupId: `admin-crons:${admin.id}`, role: "user", text: "[Contexto del panel — pantalla: crons]\n¿qué falló?", createdAt: new Date() },
      { id: "m2", fleetAgentId: "f".repeat(24), groupId: `admin-crons:${admin.id}`, role: "agent", text: "Nada falló hoy.", createdAt: new Date() }
    );
    const p = await proposeAction(admin.id, "run_cron", { job: "purge-notifications" });
    const events = await run(agent(), { runId: "run-0000007" });
    const snap = events.find((e) => e.type === "MESSAGES_SNAPSHOT");
    expect(snap.messages).toEqual([
      { id: "m1", role: "user", content: "¿qué falló?" },
      { id: "m2", role: "assistant", content: "Nada falló hoy." },
    ]);
    expect(events.at(-1)).toMatchObject({ type: "RUN_FINISHED", outcome: { type: "interrupt", interrupts: [{ id: p.id }] } });
  });

  it("sólo con la sesión del superusuario: Bearer 403, otro origen 403, sin sesión 401, mortal 403", async () => {
    const p = await proposeAction(admin.id, "run_cron", { job: "purge-notifications" });
    const body = { threadId: "t", runId: "run-0000008", messages: [], resume: [{ interruptId: p.id, status: "resolved", payload: { approved: true } }] };
    const bearer = await post(body, { Authorization: "Bearer eb_sk_live_agente", Cookie: "__session=x" });
    expect(bearer.status).toBe(403);
    expect((await bearer.json()).error).toBe("session_required");
    expect((await post(body, { Origin: "https://evil.example" })).status).toBe(403);
    h.sessionUser = null;
    expect((await post(body)).status).toBe(401);
    h.sessionUser = mortal;
    expect((await post(body)).status).toBe(403);
    expect(h.startManualRun).not.toHaveBeenCalled();
    expect(h.db.agentAction.rows[0].status).toBe("pending");
  });

  it("el contexto por llave (lo que manda Piloto) llega al agente; un cancelled vencido no estorba al mensaje nuevo", async () => {
    const old = await proposeAction(admin.id, "run_cron", { job: "purge-keys" });
    h.db.agentAction.rows[0].createdAt = new Date(Date.now() - 16 * 60_000);
    h.routeMessage.mockImplementation(async (_id: string, _msg: unknown, opts: any) => {
      opts.onChunk("Listo.");
      return "Listo.";
    });
    const a = agent();
    a.addMessage({ id: "u9", role: "user", content: "¿cómo va la purga?" });
    const events = await run(a, {
      runId: "run-0000009",
      context: [
        { description: "page", value: JSON.stringify("crons") },
        { description: "job", value: JSON.stringify("purge-notifications") },
      ],
      resume: [{ interruptId: old.id, status: "cancelled" }],
    });
    expect(events.at(-1)).toMatchObject({ type: "RUN_FINISHED", outcome: { type: "success" } });
    expect(h.routeMessage.mock.calls[0][1].text).toContain("tarea seleccionada: purge-notifications");
  });

  it("cerrar la conexión NO detiene el turno; forwardedProps.cancel sí (RUN_FINISHED cancelled, idempotente)", async () => {
    let signal: AbortSignal | undefined;
    let release!: () => void;
    const reachedTool = new Promise<void>((r) => (release = r));
    h.routeMessage.mockImplementation(async (_id: string, _msg: unknown, opts: any) => {
      signal = opts.signal;
      opts.onChunk("Empiezo… ");
      release();
      // Un turno largo: sólo termina si lo detienen.
      await new Promise<void>((r) => opts.signal.addEventListener("abort", () => r()));
      return "Empiezo…";
    });
    const reader = new AbortController();
    const res = await post({ threadId: "th-crons", runId: "run-0000010", messages: [{ id: "u", role: "user", content: "algo largo" }] });
    const body = res.body!.getReader();
    await reachedTool;
    reader.abort();
    await body.cancel(); // el navegador se fue
    await new Promise((r) => setTimeout(r, 20));
    expect(signal!.aborted).toBe(false);

    const stop = await post({ threadId: "th-crons", runId: "run-0000011", messages: [], forwardedProps: { cancel: "run-0000010" } });
    const text = await stop.text();
    expect(text).toContain('"RUN_FINISHED"');
    expect(text).toContain('"cancelled"');
    expect(signal!.aborted).toBe(true);
    // Repetirlo es inocuo.
    const again = await (await post({ threadId: "th-crons", runId: "run-0000012", messages: [], forwardedProps: { cancel: "run-0000010" } })).text();
    expect(again).toContain('"cancelled"');
  });

  it("orden directa: tarjeta sin modelo, y aprobarla ejecuta sin modelo", async () => {
    const a = agent();
    a.addMessage({ id: "u", role: "user", content: "ejecuta purga de notificaciones" });
    const t0 = Date.now();
    const events = await run(a, { runId: "run-0000020" });
    expect(Date.now() - t0).toBeLessThan(1000);
    expect(h.routeMessage).not.toHaveBeenCalled();
    expect(events.find((e) => e.type === "TEXT_MESSAGE_CONTENT").delta).toBe("¿Corro «Purga de notificaciones» ahora?");
    const last = events.at(-1);
    expect(last).toMatchObject({ type: "RUN_FINISHED", outcome: { type: "interrupt" } });
    expect(typeof last.timestamp).toBe("number");
    const id = last.outcome.interrupts[0].id;
    // HttpAgent reenvía todo su historial; Piloto sólo lo nuevo (protocol.md): resume con uno limpio.
    const done = await run(agent(), { runId: "run-0000021", resume: [{ interruptId: id, status: "resolved", payload: { approved: true } }] });
    expect(done.at(-1)).toMatchObject({ type: "RUN_FINISHED", outcome: { type: "success" } });
    expect(h.startManualRun).toHaveBeenCalledWith("purge-notifications");
    expect(h.routeMessage).not.toHaveBeenCalled();
  });

  it("RunAgentInput sin threadId/runId: 400", async () => {
    expect((await post({ messages: [] })).status).toBe(400);
  });
});
