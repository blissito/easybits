import { describe, expect, it } from "vitest";
import { expiryDecision } from "~/.server/core/workBoxExpiry";
import { WORK_BOX_IDLE_DAYS, WORK_BOX_WARN_DAYS } from "~/lib/hostingCatalog";

const DAY = 86_400_000;
const now = new Date("2026-10-20T12:00:00Z");
const ago = (d: number) => new Date(now.getTime() - d * DAY);

describe("caducidad de cajas de trabajo", () => {
  it("no toca una app con actividad reciente", () => {
    expect(expiryDecision({ now, lastActivity: ago(1), warnedAt: null, turnRunning: false })).toBe("keep");
  });

  it("avisa al cumplir los días de aviso, una sola vez", () => {
    expect(expiryDecision({ now, lastActivity: ago(WORK_BOX_WARN_DAYS), warnedAt: null, turnRunning: false })).toBe("warn");
    expect(expiryDecision({ now, lastActivity: ago(WORK_BOX_WARN_DAYS + 0.5), warnedAt: ago(0.4), turnRunning: false })).toBe("keep");
  });

  it("un aviso anterior a la última actividad ya no cuenta", () => {
    expect(expiryDecision({ now, lastActivity: ago(WORK_BOX_WARN_DAYS), warnedAt: ago(WORK_BOX_WARN_DAYS + 3), turnRunning: false })).toBe("warn");
  });

  it("archiva al cumplir los días de inactividad, aunque ya se haya avisado", () => {
    expect(expiryDecision({ now, lastActivity: ago(WORK_BOX_IDLE_DAYS), warnedAt: ago(2), turnRunning: false })).toBe("archive");
  });

  it("nunca archiva con un turno en curso", () => {
    expect(expiryDecision({ now, lastActivity: ago(WORK_BOX_IDLE_DAYS + 10), warnedAt: null, turnRunning: true })).toBe("keep");
  });
});
