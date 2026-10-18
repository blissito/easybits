// AG-UI (https://docs.ag-ui.com) sobre los turnos durables de la flota (siteTurns.server.ts).
// Contrato para los clientes: docs/protocol.md de ghostykit. Un `POST` con
// `RunAgentInput` contesta SSE de eventos AG-UI (`data: {json}\n\n`, sin `event:`).
//
// Aquí sólo vive la TRADUCCIÓN: eventos del turno (`chunk`, `tool`, `permission`, `done`…) →
// eventos AG-UI, y el hilo guardado → mensajes AG-UI. Quién puede qué lo decide la ruta.
import type { TurnEvent } from "./siteTurns.server";
import type { PendingActionView } from "./agentActions";

export type AgUiEvent = { type: string; [k: string]: unknown };

export type AgUiMessage =
  | { id: string; role: "user"; content: string }
  | { id: string; role: "assistant"; content?: string; toolCalls?: { id: string; type: "function"; function: { name: string; arguments: string } }[] }
  | { id: string; role: "tool"; toolCallId: string; content: string; error?: string };

export type AgUiInterrupt = {
  id: string;
  reason: "confirmation";
  message: string;
  toolCallId?: string;
  expiresAt: string;
  responseSchema: unknown;
  metadata: { tool: string };
};

/** Lo mínimo de `RunAgentInput` que usa EasyBits; lo demás (`tools`, `state`…) se ignora. */
export type RunAgentInput = {
  threadId: string;
  runId: string;
  messages: { id?: string; role: string; content?: unknown }[];
  context: { description: string; value: string }[];
  resume?: { interruptId: string; status: "resolved" | "cancelled"; payload?: { approved?: boolean } }[];
  /** `forwardedProps.cancel`: el `runId` del run a detener (§6 de docs/protocol.md). */
  cancel?: string;
};

/** Valida lo justo para no tropezar; `null` = 400. */
export function parseRunAgentInput(raw: unknown): RunAgentInput | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  if (typeof r.threadId !== "string" || !r.threadId || typeof r.runId !== "string" || !r.runId) return null;
  const messages = Array.isArray(r.messages) ? (r.messages as RunAgentInput["messages"]) : [];
  const context = Array.isArray(r.context)
    ? (r.context as unknown[]).filter(
        (c): c is { description: string; value: string } =>
          !!c && typeof (c as any).description === "string" && typeof (c as any).value === "string"
      )
    : [];
  const resume = Array.isArray(r.resume)
    ? (r.resume as unknown[]).filter(
        (x): x is NonNullable<RunAgentInput["resume"]>[number] =>
          !!x && typeof (x as any).interruptId === "string" && ((x as any).status === "resolved" || (x as any).status === "cancelled")
      )
    : undefined;
  const fp = r.forwardedProps as Record<string, unknown> | undefined;
  const cancel = fp && typeof fp.cancel === "string" && fp.cancel ? fp.cancel.slice(0, 120) : undefined;
  return { threadId: r.threadId.slice(0, 120), runId: r.runId.slice(0, 120), messages, context, resume, cancel };
}

/** El texto del último mensaje del usuario (`content` string o partes `{type:"text"}`). */
export function userText(input: RunAgentInput): string {
  const last = [...input.messages].reverse().find((m) => m.role === "user");
  if (!last) return "";
  if (typeof last.content === "string") return last.content;
  if (Array.isArray(last.content)) {
    return last.content
      .map((p) => (p && typeof p === "object" && (p as any).type === "text" ? String((p as any).text ?? "") : ""))
      .join("")
      .trim();
  }
  return "";
}

/** El `turnId` de la flota a partir del `runId` (mismo run → mismo turno: reintentos idempotentes). */
export function turnIdFromRunId(runId: string): string | undefined {
  const id = runId.replace(/[^a-zA-Z0-9-]/g, "-").slice(0, 64);
  return id.length >= 8 ? id : undefined;
}

export const APPROVAL_SCHEMA = {
  type: "object",
  properties: { approved: { type: "boolean" } },
  required: ["approved"],
};

export function interruptFrom(a: Pick<PendingActionView, "id" | "summary" | "tool" | "expiresAt">, toolCallId?: string): AgUiInterrupt {
  return {
    id: a.id,
    reason: "confirmation",
    message: a.summary,
    ...(toolCallId ? { toolCallId } : {}),
    expiresAt: a.expiresAt,
    responseSchema: APPROVAL_SCHEMA,
    metadata: { tool: a.tool },
  };
}

// `timestamp` (ms, reloj del servidor): con él la tarjeta cuenta su vencimiento con la hora del
// servidor y no con la del navegador (docs/protocol.md).
export const runFinished = (threadId: string, runId: string, interrupts: AgUiInterrupt[]): AgUiEvent => ({
  type: "RUN_FINISHED",
  threadId,
  runId,
  timestamp: Date.now(),
  outcome: interrupts.length ? { type: "interrupt", interrupts } : { type: "success" },
});

/**
 * Traduce los eventos de UN turno a AG-UI. Las herramientas del worker sólo traen nombre
 * (y `end` sin nombre): se les da un `toolCallId` propio y se emparejan en orden de llegada.
 * Una `permission` (propuesta pendiente) no corta el turno: se junta y sale como interrupt en
 * el `RUN_FINISHED`, que es donde AG-UI las espera.
 */
export function createTurnTranslator(opts: { threadId: string; runId: string; emit: (e: AgUiEvent) => void }) {
  const { threadId, runId, emit } = opts;
  let seq = 0;
  const nextId = (p: string) => `${p}-${runId}-${++seq}`;
  let textId: string | null = null;
  const open: string[] = [];
  let lastToolCallId: string | undefined;
  const interrupts: AgUiInterrupt[] = [];
  let closed = false;

  const text = (delta: string) => {
    if (!delta) return;
    if (!textId) {
      textId = nextId("msg");
      emit({ type: "TEXT_MESSAGE_START", messageId: textId, role: "assistant" });
    }
    emit({ type: "TEXT_MESSAGE_CONTENT", messageId: textId, delta });
  };
  const endText = () => {
    if (!textId) return;
    emit({ type: "TEXT_MESSAGE_END", messageId: textId });
    textId = null;
  };
  const toolStart = (name: string) => {
    endText();
    const id = nextId("tc");
    emit({ type: "TOOL_CALL_START", toolCallId: id, toolCallName: name || "tool" });
    emit({ type: "TOOL_CALL_END", toolCallId: id });
    open.push(id);
    lastToolCallId = id;
    return id;
  };
  const toolEnd = (ok: boolean, id = open.shift()) => {
    if (!id) return;
    emit({
      type: "TOOL_CALL_RESULT",
      messageId: nextId("tool"),
      toolCallId: id,
      role: "tool",
      content: ok ? "ok" : "error",
      ...(ok ? {} : { metadata: { error: true } }),
    });
  };
  const closeTools = () => {
    while (open.length) toolEnd(true);
  };
  const finish = (e: AgUiEvent) => {
    if (closed) return;
    endText();
    closeTools();
    closed = true;
    emit(e);
  };

  /** Para reconectar a medio turno: lo que ya se escribió (texto partido por herramienta). */
  const replay = (s: { text: string; tools: string[]; cortes: number[] }) => {
    let at = 0;
    s.tools.forEach((name, i) => {
      const cut = s.cortes[i] ?? at;
      text(s.text.slice(at, cut));
      at = Math.max(at, cut);
      toolStart(name);
      toolEnd(true);
    });
    text(s.text.slice(at));
  };

  return {
    get closed() {
      return closed;
    },
    onTurnEvent(e: TurnEvent) {
      if (closed) return;
      switch (e.type) {
        case "chunk":
          text(String(e.value ?? ""));
          return;
        case "tool": {
          const name = String(e.name ?? "");
          if (e.phase === "end") toolEnd(e.ok !== false);
          else if (e.phase === "start") toolStart(name);
          else {
            toolStart(name);
            toolEnd(e.ok !== false);
          }
          return;
        }
        case "snapshot":
          replay({
            text: String(e.text ?? ""),
            tools: (e.tools as string[]) ?? [],
            cortes: (e.cortes as number[]) ?? [],
          });
          return;
        case "permission":
          interrupts.push(
            interruptFrom(
              { id: String(e.id), summary: String(e.title ?? ""), tool: String(e.tool ?? ""), expiresAt: String(e.expiresAt ?? "") },
              lastToolCallId
            )
          );
          return;
        case "done":
          finish(runFinished(threadId, runId, interrupts));
          return;
        case "capacity":
          finish({ type: "RUN_ERROR", code: "capacity", message: String(e.message ?? "Sin capacidad; reintenta en unos segundos.") });
          return;
        case "cancelled":
          finish({ type: "RUN_FINISHED", threadId, runId, timestamp: Date.now(), outcome: { type: "cancelled" } });
          return;
        case "interrupted":
          finish({ type: "RUN_ERROR", code: "interrupted", message: "El turno se cortó por un reinicio de la plataforma." });
          return;
        case "error":
          finish({ type: "RUN_ERROR", code: "agent_error", message: String(e.message ?? "error") });
          return;
        case "idle":
          finish(runFinished(threadId, runId, interrupts));
          return;
      }
    },
    /** Cierra sin evento del turno (p. ej. el turno ya no vive): éxito o las tarjetas abiertas. */
    finishWith(pending: AgUiInterrupt[]) {
      finish(runFinished(threadId, runId, [...interrupts, ...pending.filter((p) => !interrupts.some((i) => i.id === p.id))]));
    },
  };
}

/**
 * El hilo guardado como mensajes AG-UI. `formatUser` limpia lo que el servidor le antepone al
 * texto del usuario (el contexto de pantalla) antes de mostrarlo.
 */
export function toAgUiMessages(
  rows: { id: string; role: string; text: string | null }[],
  formatUser: (t: string) => string = (t) => t
): AgUiMessage[] {
  return rows
    .filter((r) => typeof r.text === "string" && r.text.trim())
    .map((r) =>
      r.role === "user"
        ? { id: r.id, role: "user" as const, content: formatUser(r.text!) }
        : { id: r.id, role: "assistant" as const, content: r.text! }
    );
}

/** SSE de AG-UI: `data: {json}\n\n`, con `: ping` cada 15 s mientras no pasa nada. */
export function agUiStream(
  request: Request,
  run: (emit: (e: AgUiEvent) => void, onClose: (fn: () => void) => void) => Promise<void> | void
): Response {
  const encoder = new TextEncoder();
  const cleanups: (() => void)[] = [];
  let ping: ReturnType<typeof setInterval> | null = null;
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      let closed = false;
      const close = () => {
        if (closed) return;
        closed = true;
        if (ping) clearInterval(ping);
        for (const fn of cleanups.splice(0)) {
          try { fn(); } catch { /* ya cerrado */ }
        }
        try { controller.close(); } catch { /* ya cerrado */ }
      };
      const emit = (e: AgUiEvent) => {
        if (closed) return;
        try {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(e)}\n\n`));
        } catch {
          return close();
        }
        if (e.type === "RUN_FINISHED" || e.type === "RUN_ERROR") close();
      };
      ping = setInterval(() => {
        try { controller.enqueue(encoder.encode(`: ping\n\n`)); } catch { close(); }
      }, 15_000);
      request.signal.addEventListener("abort", close);
      try {
        await run(emit, (fn) => cleanups.push(fn));
      } catch (e) {
        emit({ type: "RUN_ERROR", code: "server_error", message: e instanceof Error ? e.message : "error" });
      }
    },
    cancel() {
      if (ping) clearInterval(ping);
      for (const fn of cleanups.splice(0)) {
        try { fn(); } catch { /* ya cerrado */ }
      }
    },
  });
  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
