import { describe, it, expect, vi } from "vitest";

// Crons de una sola vez (`at`/`in`) y recurrentes que terminan solos (`until`/`times`).
const rows = new Map<string, any>();
const mockDb = {
  userCron: {
    updateMany: vi.fn(async ({ where, data }: any) => {
      const r = rows.get(where.id);
      if (!r || r.enabled !== where.enabled || r.nextRunAt?.getTime() !== where.nextRunAt?.getTime()) return { count: 0 };
      Object.assign(r, data);
      return { count: 1 };
    }),
  },
};
vi.mock("~/.server/db", () => ({ db: mockDb }));

const { parseWhen, parseDuration, humanIn, formatLocal, claimData, upcomingRuns, normalizeUpdate } = await import(
  "~/.server/core/userCronOperations"
);

const TZ = "America/Mexico_City";
const NOW = new Date("2026-10-18T18:00:00Z"); // 12:00 en CDMX
const status = (fn: () => unknown) => {
  try {
    fn();
    return null;
  } catch (e) {
    return (e as Response).status;
  }
};

describe("at: fechas en la zona del cron", () => {
  it("«23:00» es hoy a las 23:00 de CDMX", () => {
    expect(parseWhen("23:00", TZ, NOW).toISOString()).toBe("2026-10-19T05:00:00.000Z");
  });
  it("ISO sin zona se lee en la zona del cron; con zona, tal cual", () => {
    expect(parseWhen("2026-10-18T23:00", TZ, NOW).toISOString()).toBe("2026-10-19T05:00:00.000Z");
    expect(parseWhen("2026-10-18T23:00:00Z", TZ, NOW).toISOString()).toBe("2026-10-18T23:00:00.000Z");
  });
  it("rechaza basura", () => {
    expect(status(() => parseWhen("mañana", TZ, NOW))).toBe(400);
    expect(status(() => parseWhen("25:00", TZ, NOW))).toBe(400);
  });
  it("in y hora local legibles", () => {
    expect(parseDuration("1h30m")).toBe(90 * 60_000);
    expect(parseDuration("2 h")).toBe(2 * 3_600_000);
    expect(parseDuration("ya")).toBeNull();
    expect(humanIn(12 * 3_600_000 + 54 * 60_000)).toBe("12h 54m");
    expect(formatLocal(new Date("2026-10-19T05:00:00Z"), TZ)).toBe("2026-10-18 23:00");
  });
});

describe("validación del horario", () => {
  const base = { ownerId: "u1", cron: "", at: null, until: null, timesLeft: null, timezone: TZ, enabled: true } as any;
  it("at en el pasado → 400", async () => {
    await expect(normalizeUpdate(base, { at: "11:00" }, NOW)).rejects.toMatchObject({ status: 400 });
  });
  it("cron y at juntos → 400; until/times con at → 400", async () => {
    await expect(normalizeUpdate({ ...base, cron: "0 9 * * *" }, { cron: "0 9 * * *", at: "23:00" }, NOW)).rejects.toMatchObject({ status: 400 });
    await expect(normalizeUpdate(base, { at: "23:00", times: 2 }, NOW)).rejects.toMatchObject({ status: 400 });
  });
  it("reanudar uno de una sola vez que ya pasó → 400", async () => {
    await expect(normalizeUpdate({ ...base, at: new Date("2026-10-18T10:00:00Z"), enabled: false }, { enabled: true }, NOW)).rejects.toMatchObject({ status: 400 });
  });
  it("in programa relativo a ahora", async () => {
    const p = await normalizeUpdate({ ...base, cron: "0 9 * * *" }, { in: "10m" }, NOW);
    expect(p.at?.toISOString()).toBe("2026-10-18T18:10:00.000Z");
    expect(p.cron).toBe("");
  });
});

describe("corridas", () => {
  it("las próximas respetan times y until", () => {
    const s = { cron: "0 9 * * *", at: null, until: null, timesLeft: 2, timezone: TZ };
    expect(upcomingRuns(s, 3, NOW)).toHaveLength(2);
    const u = { ...s, timesLeft: null, until: new Date("2026-10-20T16:00:00Z") };
    expect(upcomingRuns(u, 3, NOW).map((d) => d.toISOString())).toEqual(["2026-10-19T15:00:00.000Z", "2026-10-20T15:00:00.000Z"]);
  });
  it("el reclamo de uno de una sola vez lo apaga", () => {
    expect(claimData({ cron: "", at: NOW, until: null, timesLeft: null, timezone: TZ }, NOW).data).toEqual({ nextRunAt: null, enabled: false });
  });
  it("la última de times lo apaga", () => {
    expect(claimData({ cron: "0 9 * * *", at: null, until: null, timesLeft: 1, timezone: TZ }, NOW).data).toEqual({ timesLeft: 0, nextRunAt: null, enabled: false });
  });
  it("con dos réplicas, uno de una sola vez corre una vez", async () => {
    const at = new Date("2026-10-18T17:59:00Z");
    rows.set("c1", { id: "c1", cron: "", at, until: null, timesLeft: null, timezone: TZ, enabled: true, nextRunAt: at });
    const { dispatchDueUserCrons } = await import("~/.server/core/userCronOperations");
    const c = { ...rows.get("c1") };
    const claim = (r: any) => mockDb.userCron.updateMany({ where: { id: r.id, enabled: true, nextRunAt: r.nextRunAt }, data: claimData(r, NOW).data });
    const [a, b] = await Promise.all([claim(c), claim(c)]);
    expect(a.count + b.count).toBe(1);
    expect(rows.get("c1")).toMatchObject({ enabled: false, nextRunAt: null });
    expect(typeof dispatchDueUserCrons).toBe("function");
  });
});
