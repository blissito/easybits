import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { sentryOptions } from "~/.server/sentry";

describe("sentryOptions", () => {
  // v11 cambió sendDefaultPii por dataCollection y su default es más permisivo:
  // sin fijar cada categoría se mandan userInfo, cookies, bodies, queries de DB
  // y prompts de IA. Este bloque es el de la guía de migración para conservar v10.
  it("conserva el default de v10 en todas las categorías de dataCollection", () => {
    const { dataCollection } = sentryOptions("https://public@o0.ingest.sentry.io/0");
    const scrubbed = { deny: ["forwarded", "-ip", "remote-", "via", "-user"] };

    expect(dataCollection).toEqual({
      userInfo: false,
      cookies: false,
      httpHeaders: { request: scrubbed, response: scrubbed },
      httpBodies: [],
      urlQueryParams: scrubbed,
      genAI: { inputs: false, outputs: false },
      databaseQueryData: false,
      queues: false,
      graphQL: { document: false, variables: false },
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
