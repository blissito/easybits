import { describe, it, expect, vi, beforeEach } from "vitest";

// Buzones de eventos: seq atómico, poda, lectura con cursor y headers sin credenciales.
let inboxes: any[] = [];
let events: any[] = [];
const matchSeq = (e: any, w: any) => (w.seq?.gt === undefined || e.seq > w.seq.gt) && (w.seq?.lte === undefined || e.seq <= w.seq.lte);
const mockDb = {
  eventInbox: {
    findFirst: vi.fn(async ({ where }: any) => inboxes.find((b) => (!where.id || b.id === where.id) && (!where.name || b.name === where.name) && (!where.ownerId || b.ownerId === where.ownerId)) ?? null),
    findUnique: vi.fn(async ({ where }: any) => inboxes.find((b) => b.token === where.token) ?? null),
    update: vi.fn(async ({ where, data }: any) => {
      const b = inboxes.find((x) => x.id === where.id);
      if (data.nextSeq?.increment) b.nextSeq += data.nextSeq.increment;
      if (data.lastEventAt) b.lastEventAt = data.lastEventAt;
      return { ...b };
    }),
    updateMany: vi.fn(async ({ where, data }: any) => {
      const b = inboxes.find((x) => x.id === where.id && x.readSeq < where.readSeq.lt);
      if (b) b.readSeq = data.readSeq;
      return { count: b ? 1 : 0 };
    }),
  },
  inboxEvent: {
    create: vi.fn(async ({ data }: any) => {
      if (events.some((e) => e.inboxId === data.inboxId && e.seq === data.seq)) throw new Error("seq duplicado");
      events.push({ ...data });
      return data;
    }),
    findMany: vi.fn(async ({ where, take }: any) => events.filter((e) => e.inboxId === where.inboxId && matchSeq(e, where)).sort((a, b) => a.seq - b.seq).slice(0, take)),
    deleteMany: vi.fn(async ({ where }: any) => {
      const before = events.length;
      events = events.filter((e) => !(e.inboxId === where.inboxId && where.OR.some((o: any) => (o.receivedAt && e.receivedAt < o.receivedAt.lt) || (o.seq && e.seq <= o.seq.lte))));
      return { count: before - events.length };
    }),
  },
};
vi.mock("~/.server/db", () => ({ db: mockDb }));

const { appendInboxEvent, readInboxEvents, keepHeaders, toEventView, INBOX_KEEP_MAX } = await import("~/.server/core/inboxOperations");

const ctx = { user: { id: "u1" }, scopes: ["READ", "WRITE"] } as any;
const BOX = { id: "6a00000000000000000000b1", ownerId: "u1", name: "prueba", token: "ib_" + "x".repeat(32), nextSeq: 0, readSeq: 0, retentionDays: 7, lastEventAt: null, createdAt: new Date() };
const add = (body: string) => appendInboxEvent(inboxes[0], { source: "http", method: "POST", contentType: "application/json", headers: {}, body });

beforeEach(() => {
  inboxes = [{ ...BOX }];
  events = [];
});

describe("buzón", () => {
  it("dos escrituras simultáneas reciben seq distintos", async () => {
    const [a, b] = await Promise.all([add("{}"), add("{}")]);
    expect(new Set([a.seq, b.seq]).size).toBe(2);
  });
  it("read regresa sólo lo no leído y mueve el cursor", async () => {
    await add('{"n":1}');
    await add('{"n":2}');
    const r1 = await readInboxEvents(ctx, "prueba");
    expect(r1.items.map((e) => e.json)).toEqual([{ n: 1 }, { n: 2 }]);
    expect(r1.unread).toBe(0);
    await add('{"n":3}');
    const r2 = await readInboxEvents(ctx, "prueba");
    expect(r2.items.map((e) => e.seq)).toEqual([3]);
    expect((await readInboxEvents(ctx, "prueba")).items).toHaveLength(0);
  });
  it("ack:false sólo mira", async () => {
    await add("hola");
    expect((await readInboxEvents(ctx, "prueba", { ack: false })).items).toHaveLength(1);
    expect((await readInboxEvents(ctx, "prueba")).items).toHaveLength(1);
  });
  it("since=0 trae todo lo guardado aunque ya se haya leído", async () => {
    await add("a");
    await readInboxEvents(ctx, "prueba");
    expect((await readInboxEvents(ctx, "prueba", { since: 0, ack: false })).items).toHaveLength(1);
  });
  it("poda lo que pasa de INBOX_KEEP_MAX y lo más viejo que la retención", async () => {
    inboxes[0].nextSeq = INBOX_KEEP_MAX + 4;
    events.push({ inboxId: BOX.id, seq: 3, receivedAt: new Date() }, { inboxId: BOX.id, seq: 10, receivedAt: new Date(Date.now() - 8 * 86_400_000) });
    await add("nuevo");
    await new Promise((r) => setTimeout(r, 0));
    expect(events.map((e) => e.seq)).toEqual([INBOX_KEEP_MAX + 5]);
  });
  it("cuerpo de más de 256 KB → 413", async () => {
    await expect(add("x".repeat(256 * 1024 + 1))).rejects.toMatchObject({ status: 413 });
  });
  it("no guarda credenciales del que llama", () => {
    const h = keepHeaders(new Headers({ Authorization: "Bearer s", Cookie: "a=1", "X-Api-Key": "k", "Stripe-Signature": "t=1", "Content-Type": "application/json" }));
    expect(h).toEqual({ "stripe-signature": "t=1", "content-type": "application/json" });
  });
  it("un cuerpo que no es JSON viaja como texto", () => {
    const v = toEventView({ seq: 1, source: "http", method: "POST", contentType: "text/plain", headers: {}, body: "hola", receivedAt: new Date() } as any);
    expect(v.json).toBeUndefined();
    expect(v.body).toBe("hola");
  });
});
