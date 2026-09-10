import { describe, it, expect, beforeEach, vi } from "vitest";

/**
 * El replay con cursor es lo que hace usable un agente desde una app móvil: el teléfono
 * se va al fondo, el sistema mata el socket, y al volver la app pide "dame lo que me
 * perdí" en vez de traerse el hilo entero.
 *
 * Dos cosas se fijan aquí y las dos son fallos silenciosos si se rompen:
 *   · el desempate por `id` — dos filas del mismo milisegundo (el par pregunta/respuesta
 *     de un turno rápido) se saltarían una si el cursor fuera solo la fecha;
 *   · `gap` — un hueco no declarado es pérdida de mensajes sin que nadie se entere.
 */

type Msg = {
  id: string;
  fleetAgentId: string;
  groupId: string;
  role: string;
  text: string;
  sender: string | null;
  senderName: string | null;
  mediaUrl: string | null;
  mediaType: string | null;
  mediaMime: string | null;
  createdAt: Date;
};

let messages: Msg[] = [];
let route: { contextResetAt: Date | null } | null = null;

/** Comparador (createdAt, id) — el mismo orden que pide la consulta real. */
const porOrden = (a: Msg, b: Msg) =>
  a.createdAt.getTime() - b.createdAt.getTime() || a.id.localeCompare(b.id);

const db = {
  fleetAgentMessage: {
    findMany: async ({ where, take, orderBy }: any) => {
      // ⚠️ Honrar `orderBy`: el replay del cursor pide asc y la reinyección desc. Un
      // falso que siempre ordena asc devolvería los mensajes MÁS VIEJOS donde el código
      // real toma los más nuevos, y el test pasaría estando al revés.
      const desc = Array.isArray(orderBy) && orderBy[0]?.createdAt === "desc";
      let filas = messages
        .filter((m) => m.fleetAgentId === where.fleetAgentId && m.groupId === where.groupId)
        .sort(desc ? (a, b) => porOrden(b, a) : porOrden);
      if (where.OR) {
        const [gt, tie] = where.OR;
        filas = filas.filter(
          (m) =>
            m.createdAt.getTime() > gt.createdAt.gt.getTime() ||
            (m.createdAt.getTime() === tie.createdAt.getTime() && m.id > tie.id.gt)
        );
      }
      return filas.slice(0, take);
    },
    findFirst: async ({ where }: any) =>
      messages
        .filter((m) => m.fleetAgentId === where.fleetAgentId && m.groupId === where.groupId)
        .sort(porOrden)[0] ?? null,
  },
  fleetAgentRoute: { findUnique: async () => route },
};

vi.mock("~/.server/db", () => ({ db }));
vi.mock("~/.server/core/sandboxOperations", () => ({
  resumeSandbox: vi.fn(), createAgent: vi.fn(), suspendSandbox: vi.fn(), destroySandbox: vi.fn(),
  openAgentChunkStream: vi.fn(), execCommand: vi.fn(), readFile: vi.fn(), writeFile: vi.fn(),
  listSandboxes: vi.fn(async () => []),
}));
vi.mock("~/.server/storage", () => ({
  getPlatformDefaultClient: () => ({ getReadUrl: async () => null }),
  buildPublicAssetUrl: (k: string) => k,
}));

const { listFleetMessages, encodeFleetCursor, decodeFleetCursor, buildContextReplayForTest } =
  await import("~/.server/core/fleetAgentOperations");

const T0 = new Date("2026-09-10T12:00:00.000Z");
const fila = (id: string, ms: number, role = "user"): Msg => ({
  id,
  fleetAgentId: "fa1",
  groupId: "web-1",
  role,
  text: `msg ${id}`,
  sender: null,
  senderName: null,
  mediaUrl: null,
  mediaType: null,
  mediaMime: null,
  createdAt: new Date(T0.getTime() + ms),
});

describe("cursor de conversación", () => {
  beforeEach(() => {
    route = null;
    messages = [fila("a", 0), fila("b", 1000, "agent"), fila("c", 2000)];
  });

  it("round-trip: lo que se codifica se decodifica igual", () => {
    const c = encodeFleetCursor({ id: "abc", createdAt: T0 });
    const d = decodeFleetCursor(c)!;
    expect(d.i).toBe("abc");
    expect(d.t.toISOString()).toBe(T0.toISOString());
  });

  it("un cursor corrupto se rechaza en vez de fingir que se entendió", () => {
    expect(decodeFleetCursor("no-es-base64-valido-{}")).toBeNull();
    expect(decodeFleetCursor(Buffer.from('{"t":"nope","i":"x"}').toString("base64url"))).toBeNull();
  });

  it("sin cursor devuelve el hilo desde el principio", async () => {
    const p = await listFleetMessages("fa1", "web-1");
    expect(p.items.map((i) => i.id)).toEqual(["a", "b", "c"]);
    expect(p.gap).toBe(false);
    expect(p.hasMore).toBe(false);
  });

  it("con cursor devuelve SOLO lo posterior", async () => {
    const p1 = await listFleetMessages("fa1", "web-1");
    const p2 = await listFleetMessages("fa1", "web-1", { since: p1.items[0].cursor });
    expect(p2.items.map((i) => i.id)).toEqual(["b", "c"]);
  });

  it("el cursor del último item no devuelve nada: es la promesa que le hacemos al push", async () => {
    // El webhook manda el cursor DE la respuesta; el cliente lo usa y no debe recibir
    // otra vez lo que el aviso ya le contó.
    const p1 = await listFleetMessages("fa1", "web-1");
    const p2 = await listFleetMessages("fa1", "web-1", { since: p1.cursor });
    expect(p2.items).toEqual([]);
    expect(p2.gap).toBe(false);
  });

  it("desempata por id dentro del mismo milisegundo", async () => {
    // Un turno rápido escribe pregunta y respuesta en el mismo ms. Con un cursor de
    // solo-fecha, una de las dos se perdería en silencio.
    messages = [fila("a1", 0), fila("a2", 0, "agent"), fila("a3", 0)];
    const p1 = await listFleetMessages("fa1", "web-1");
    expect(p1.items.map((i) => i.id)).toEqual(["a1", "a2", "a3"]);
    const p2 = await listFleetMessages("fa1", "web-1", { since: p1.items[0].cursor });
    expect(p2.items.map((i) => i.id)).toEqual(["a2", "a3"]);
  });

  it("pagina y dice que hay más", async () => {
    const p = await listFleetMessages("fa1", "web-1", { limit: 2 });
    expect(p.items.map((i) => i.id)).toEqual(["a", "b"]);
    expect(p.hasMore).toBe(true);
    const seg = await listFleetMessages("fa1", "web-1", { since: p.cursor, limit: 2 });
    expect(seg.items.map((i) => i.id)).toEqual(["c"]);
    expect(seg.hasMore).toBe(false);
  });

  it("conserva el cursor del cliente cuando no hay nada nuevo", async () => {
    const p1 = await listFleetMessages("fa1", "web-1");
    const p2 = await listFleetMessages("fa1", "web-1", { since: p1.cursor });
    // No se le puede devolver `null` a quien ya venía siguiendo el hilo: perdería el
    // sitio y tendría que recargar entero.
    expect(p2.cursor).toBe(p1.cursor);
  });
});

describe("gap — el hueco se declara, no se esconde", () => {
  beforeEach(() => {
    route = null;
    messages = [fila("a", 0), fila("b", 1000, "agent"), fila("c", 2000)];
  });

  it("cursor ilegible → gap", async () => {
    const p = await listFleetMessages("fa1", "web-1", { since: "basura" });
    expect(p.gap).toBe(true);
    expect(p.gapReason).toBe("cursor_too_old");
  });

  it("cursor anterior a lo que conservamos → gap", async () => {
    const viejo = encodeFleetCursor({ id: "000", createdAt: new Date(T0.getTime() - 60_000) });
    const p = await listFleetMessages("fa1", "web-1", { since: viejo });
    expect(p.gap).toBe(true);
    expect(p.gapReason).toBe("cursor_too_old");
  });

  it("el agente perdió la memoria después del cursor → gap con su fecha", async () => {
    // El historial se lee perfecto; el que no se acuerda es el modelo. Es la
    // distinción que la nota del cliente pedía y que antes no se podía contestar.
    route = { contextResetAt: new Date(T0.getTime() + 1500) };
    const p1 = await listFleetMessages("fa1", "web-1");
    const p = await listFleetMessages("fa1", "web-1", { since: p1.items[0].cursor });
    expect(p.gap).toBe(true);
    expect(p.gapReason).toBe("context_reset");
    expect(p.resetAt?.toISOString()).toBe(new Date(T0.getTime() + 1500).toISOString());
    // Y aun así entrega los mensajes: el hilo no se pierde, solo se avisa.
    expect(p.items.map((i) => i.id)).toEqual(["b", "c"]);
  });

  it("una pérdida ANTERIOR al cursor no es un hueco para este cliente", async () => {
    // Ya la vio y ya se recuperó; volver a marcarla sería ruido.
    route = { contextResetAt: new Date(T0.getTime() + 500) };
    const p1 = await listFleetMessages("fa1", "web-1");
    const p = await listFleetMessages("fa1", "web-1", { since: p1.items[2].cursor });
    expect(p.gap).toBe(false);
  });
});

/**
 * Auto-curación. Avisar del hueco no basta: si el modelo arranca en blanco, el usuario
 * escribe "sí, ese mismo" y el agente contesta "¿cuál?". Aquí se fija que lo que se le
 * devuelve al modelo esté ORDENADO, ACOTADO y ETIQUETADO como historial — sin la
 * etiqueta, el modelo lee el bloque como si el usuario acabara de mandarlo todo de
 * golpe y responde a la pregunta de hace tres días.
 */
describe("reinyección de contexto tras perder la memoria", () => {
  beforeEach(() => {
    route = null;
    messages = [];
  });

  it("no inventa nada si no hay historial", async () => {
    expect(await buildContextReplayForTest("fa1", "web-1")).toBeNull();
  });

  it("devuelve el hilo en el orden en que se dijo, etiquetado y sin pedir respuesta", async () => {
    messages = [fila("a", 0), fila("b", 1000, "agent"), fila("c", 2000)];
    const out = (await buildContextReplayForTest("fa1", "web-1"))!;
    expect(out).toContain("<contexto_previo>");
    expect(out).toMatch(/NO es un mensaje nuevo del usuario/);
    // Orden cronológico, no el inverso en que se consultan.
    expect(out.indexOf("msg a")).toBeLessThan(out.indexOf("msg b"));
    expect(out.indexOf("msg b")).toBeLessThan(out.indexOf("msg c"));
    // Quién dijo qué: sin esto el modelo se atribuye lo del usuario.
    expect(out).toContain("[el usuario] msg a");
    expect(out).toContain("[tú] msg b");
  });

  it("recorta por el mensaje más VIEJO, que es el que menos falta hace", async () => {
    // 12 mensajes de 1000 chars: el tope de 6000 deja los ~6 últimos.
    messages = Array.from({ length: 12 }, (_, i) => ({
      ...fila(`m${String(i).padStart(2, "0")}`, i * 1000),
      text: `${i}`.repeat(1000),
    }));
    const out = (await buildContextReplayForTest("fa1", "web-1"))!;
    expect(out.length).toBeLessThan(7000);
    // El más reciente sobrevive; el más viejo no.
    expect(out).toContain("11".repeat(10));
    expect(out).not.toContain("00".repeat(10));
  });

  it("conserva el adjunto: si no, el agente ignora la foto que ya había visto", async () => {
    messages = [{ ...fila("a", 0), mediaUrl: "https://cdn.test/foto.jpg" }];
    const out = (await buildContextReplayForTest("fa1", "web-1"))!;
    expect(out).toContain("https://cdn.test/foto.jpg");
  });
});
