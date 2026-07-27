import { describe, it, expect } from "vitest";
import { computeConcurrency } from "~/.server/core/sandboxSessions";

// El sweep-line que responde "¿cuántas cajas tuvo este owner en paralelo el lunes
// a las 11am?". Es la única parte con matemática real de la telemetría de
// microVMs, y es la que sostiene el reporte de uso — de ahí que se congele aquí.
// computeConcurrency es puro (recibe `now` inyectado) justo para poder probarlo.

const T = (iso: string) => new Date(iso);
const iv = (start: string, end: string | null) => ({
  startedAt: T(start),
  endedAt: end ? T(end) : null,
});

const DAY_FROM = T("2026-07-27T00:00:00Z");
const DAY_TO = T("2026-07-28T00:00:00Z");
const NOW = T("2026-07-27T23:00:00Z").getTime();

describe("computeConcurrency", () => {
  it("sin sesiones, el pico es 0 y la serie va vacía", () => {
    const r = computeConcurrency([], DAY_FROM, DAY_TO, NOW);
    expect(r.peak).toBe(0);
    expect(r.peakAt).toBeNull();
    expect(r.series).toEqual([]);
  });

  it("cuenta el máximo de intervalos solapados, no el total de sesiones", () => {
    // 4 cajas vivas a la vez entre 11:15 y 11:30 — el caso del reporte.
    const r = computeConcurrency(
      [
        iv("2026-07-27T10:00:00Z", "2026-07-27T12:00:00Z"),
        iv("2026-07-27T11:00:00Z", "2026-07-27T11:30:00Z"),
        iv("2026-07-27T11:15:00Z", "2026-07-27T13:00:00Z"),
        iv("2026-07-27T11:15:00Z", "2026-07-27T11:45:00Z"),
        // Esta NO solapa con las otras: sube el total, no el pico.
        iv("2026-07-27T20:00:00Z", "2026-07-27T21:00:00Z"),
      ],
      DAY_FROM,
      DAY_TO,
      NOW
    );
    expect(r.peak).toBe(4);
    expect(r.peakAt).toEqual(T("2026-07-27T11:15:00Z"));
    expect(r.totalSessions).toBe(5);
  });

  it("una caja que muere en el instante en que nace otra NO infla el pico", () => {
    // El motivo del desempate cierres-antes-de-aperturas en el sort. Sin él esto
    // daría 2 y el reporte prometería capacidad que nunca existió.
    const r = computeConcurrency(
      [
        iv("2026-07-27T10:00:00Z", "2026-07-27T11:00:00Z"),
        iv("2026-07-27T11:00:00Z", "2026-07-27T12:00:00Z"),
      ],
      DAY_FROM,
      DAY_TO,
      NOW
    );
    expect(r.peak).toBe(1);
  });

  it("una sesión abierta (endedAt null) cuenta hasta ahora", () => {
    const r = computeConcurrency(
      [iv("2026-07-27T22:00:00Z", null)],
      DAY_FROM,
      DAY_TO,
      NOW
    );
    expect(r.peak).toBe(1);
    // Se cierra en `now` (23:00), no en el fin del rango (24:00).
    expect(r.series.at(-1)).toEqual({ at: T("2026-07-27T23:00:00Z"), count: 0 });
  });

  it("recorta los intervalos al rango pedido", () => {
    // Caja que vivió toda la semana; preguntamos solo por el lunes.
    const r = computeConcurrency(
      [iv("2026-07-20T00:00:00Z", "2026-08-01T00:00:00Z")],
      DAY_FROM,
      DAY_TO,
      NOW
    );
    expect(r.peak).toBe(1);
    expect(r.series[0]).toEqual({ at: DAY_FROM, count: 1 });
    expect(r.series.at(-1)).toEqual({ at: DAY_TO, count: 0 });
  });

  it("ignora las sesiones que no tocan el rango", () => {
    const r = computeConcurrency(
      [iv("2026-07-25T00:00:00Z", "2026-07-26T00:00:00Z")],
      DAY_FROM,
      DAY_TO,
      NOW
    );
    expect(r.peak).toBe(0);
  });

  it("colapsa los eventos del mismo instante en un solo punto de la serie", () => {
    // 3 cajas nacen juntas (un fork, o un topUpWarmSpares): un punto, no tres.
    const r = computeConcurrency(
      [
        iv("2026-07-27T11:00:00Z", "2026-07-27T12:00:00Z"),
        iv("2026-07-27T11:00:00Z", "2026-07-27T12:00:00Z"),
        iv("2026-07-27T11:00:00Z", "2026-07-27T12:00:00Z"),
      ],
      DAY_FROM,
      DAY_TO,
      NOW
    );
    expect(r.peak).toBe(3);
    expect(r.series).toEqual([
      { at: T("2026-07-27T11:00:00Z"), count: 3 },
      { at: T("2026-07-27T12:00:00Z"), count: 0 },
    ]);
  });

  it("la serie vuelve a 0 al final: ningún intervalo queda abierto", () => {
    const r = computeConcurrency(
      [
        iv("2026-07-27T01:00:00Z", "2026-07-27T05:00:00Z"),
        iv("2026-07-27T02:00:00Z", "2026-07-27T09:00:00Z"),
        iv("2026-07-27T08:00:00Z", null),
      ],
      DAY_FROM,
      DAY_TO,
      NOW
    );
    expect(r.series.at(-1)?.count).toBe(0);
    expect(r.peak).toBe(2);
  });
});
