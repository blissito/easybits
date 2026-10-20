import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { sentryOptions } from "~/.server/sentry";

describe("sentryOptions", () => {
  // v11 cambió sendDefaultPii por dataCollection: sin este bloque userInfo, cookies
  // y headers se mandan a Sentry. Preservamos el default de v10.
  it("no recolecta PII por default: userInfo, cookies y headers sensibles quedan fuera", () => {
    const { dataCollection } = sentryOptions("https://public@o0.ingest.sentry.io/0");

    expect(dataCollection).toEqual({
      userInfo: false,
      cookies: false,
      httpHeaders: { deny: ["forwarded", "-ip", "remote-", "via", "-user"] },
    });
  });
});

describe("Dockerfile", () => {
  // @sentry/node 11 exige Node >=20.19.0; un tag flotante `node:20-slim` no lo garantiza.
  it("fija Node >=20.19 en todas las etapas", () => {
    const dockerfile = readFileSync(join(process.cwd(), "Dockerfile"), "utf8");
    const froms = dockerfile.match(/^FROM node:\S+/gm) ?? [];
    expect(froms).toHaveLength(3);
    for (const from of froms) {
      expect(from).toMatch(/^FROM node:20\.(19|[2-9]\d)(\.\d+)?-slim$/);
    }
  });
});
