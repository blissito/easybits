import { describe, it, expect } from "vitest";
import { nextRunFor, validateSchedule } from "~/.server/core/userCronOperations";
import { isPrivateIp } from "~/.server/publicUrl";

const rejects = (cron: string, tz = "America/Mexico_City") => {
  try {
    validateSchedule(cron, tz);
    return null;
  } catch (e) {
    return (e as Response).status;
  }
};

describe("crons de usuario: horario", () => {
  it("acepta cada 5 min y diario", () => {
    expect(rejects("*/5 * * * *")).toBeNull();
    expect(rejects("30 8 * * *")).toBeNull();
    expect(rejects("30 8 * * 1-5")).toBeNull();
  });
  it("rechaza más seguido que cada 5 min, campos de más y zona inválida", () => {
    expect(rejects("* * * * *")).toBe(400);
    expect(rejects("*/2 * * * *")).toBe(400);
    expect(rejects("0,1 8 * * *")).toBe(400);
    expect(rejects("0 30 8 * * *")).toBe(400);
    expect(rejects("30 8 * * *", "Marte/Olympus")).toBe(400);
  });
  it("las 8:30 de CDMX son las 14:30 UTC", () => {
    const next = nextRunFor("30 8 * * *", "America/Mexico_City", new Date("2026-10-17T12:00:00Z"));
    expect(next.toISOString()).toBe("2026-10-17T14:30:00.000Z");
  });
});

describe("guarda SSRF", () => {
  it("marca privadas, metadata y CGNAT", () => {
    for (const ip of ["127.0.0.1", "10.1.2.3", "169.254.169.254", "172.20.0.1", "192.168.1.1", "100.64.0.1", "::1", "fd00::1", "::ffff:10.0.0.1"]) {
      expect(isPrivateIp(ip), ip).toBe(true);
    }
    expect(isPrivateIp("54.38.94.14")).toBe(false);
  });
});
