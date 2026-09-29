import { describe, it, expect } from "vitest";
import { buildBaileysExport, countKeys, decideHealth, phoneOfCreds, STALE_AFTER_MS } from "~/.server/core/baileysExport";

const NOW = Date.parse("2026-09-29T12:00:00Z");
const creds = { noiseKey: {}, signedIdentityKey: {}, registered: true, me: { id: "5215512345678:7@s.whatsapp.net" } };
const keys = { "pre-key": { "1": { a: 1 }, "2": { a: 2 } }, session: { "x@s.whatsapp.net": {} } };
const base = {
  id: "fa1",
  name: "tania-0",
  baileys: { status: "connected", at: "2026-07-15T10:00:00Z" },
  authCreds: creds,
  authKeys: keys,
  enabledGroups: ["111@g.us"],
  mainGroupJid: "111@g.us",
  seenGroups: { "111@g.us": "Ventas", "222@g.us": "Familia", "333@g.us": "333@g.us" },
  lastInboundAt: new Date(NOW - 60_000),
};

describe("baileysExport", () => {
  it("phone y conteo de llaves", () => {
    expect(phoneOfCreds(creds)).toBe("5215512345678");
    expect(phoneOfCreds(null)).toBeNull();
    expect(countKeys(keys)).toBe(3);
  });

  it("health", () => {
    expect(decideHealth(base, NOW)).toBe("alive");
    // connected pero sin actividad en más de 7 días → stale (el caso tania-0)
    expect(decideHealth({ ...base, lastInboundAt: new Date(NOW - STALE_AFTER_MS - 1) }, NOW)).toBe("stale");
    expect(decideHealth({ ...base, lastInboundAt: null }, NOW)).toBe("stale");
    expect(decideHealth({ ...base, baileys: { status: "failed", reason: "max_reconnect" } }, NOW)).toBe("stale");
    expect(decideHealth({ ...base, baileys: { status: "failed", reason: "logged_out" }, authCreds: null }, NOW)).toBe("logged_out");
    expect(decideHealth({ ...base, baileys: null, authCreds: null }, NOW)).toBe("never_paired");
    expect(decideHealth({ ...base, authCreds: { noiseKey: {} } }, NOW)).toBe("never_paired");
  });

  it("dryRun no trae llaves; groups es el mapa de gs", () => {
    const dry = buildBaileysExport(base, { dryRun: true }, NOW) as Record<string, unknown>;
    expect(dry.authCreds).toBeUndefined();
    expect(dry.authKeys).toBeUndefined();
    expect(dry.groups).toEqual({ "111@g.us": "Ventas" });
    expect(dry.groupDetails).toEqual([
      { jid: "111@g.us", name: "Ventas", enabled: true, main: true },
      { jid: "333@g.us", name: null, enabled: false, main: false },
      { jid: "222@g.us", name: "Familia", enabled: false, main: false },
    ]);
    const full = buildBaileysExport(base, { dryRun: false }, NOW) as Record<string, unknown>;
    expect(full.authCreds).toBe(creds); // tal cual, sin re-serializar
    expect(full.authKeys).toBe(keys);
    expect(full.phone).toBe("5215512345678");
  });
});
