import { describe, it, expect } from "vitest";
import { runspecSchema } from "~/.server/core/releaseOperations";

// setRunspec mezcla el patch sobre el runspec guardado. La trampa es de JS,
// no de zod: `{...{a:1}, ...{a:undefined}}` deja `a` en undefined, o sea que
// un patch parcial BORRA lo que no menciona. Y los patches parciales son la
// norma: launchApp arma el suyo con params opcionales, así que relanzar una
// caja se llevaba por delante sus secretNames — y la app arrancaba sin
// secretos aunque estuvieran cargados.
//
// Este es el filtro que setRunspec aplica antes de mezclar.
const sinUndefined = (patch: Record<string, unknown>) =>
  Object.fromEntries(Object.entries(patch).filter(([, v]) => v !== undefined));

describe("merge del runspec", () => {
  const guardado = runspecSchema.parse({
    appDir: "/srv/store",
    buildCommand: "npm run build",
    secretNames: ["DATABASE_URL", "JWT_SECRET"],
  });

  it("un patch parcial no borra lo que no menciona", () => {
    // Justo lo que manda launchApp: appDir sí, secretNames ni se nombra.
    const patch = { appDir: "/srv/store", secretNames: undefined, unit: undefined };
    const merged = runspecSchema.parse({ ...guardado, ...sinUndefined(patch) });
    expect(merged.secretNames).toEqual(["DATABASE_URL", "JWT_SECRET"]);
    expect(merged.buildCommand).toBe("npm run build");
  });

  it("sin el filtro, se perderían — que es el fallo que esto cubre", () => {
    const patch = { appDir: "/srv/store", secretNames: undefined };
    const roto = { ...guardado, ...patch };
    expect(roto.secretNames).toBeUndefined();
  });

  it("un valor explícito sí pisa al guardado", () => {
    const merged = runspecSchema.parse({
      ...guardado,
      ...sinUndefined({ secretNames: ["OTRO"] }),
    });
    expect(merged.secretNames).toEqual(["OTRO"]);
  });

  it("una lista vacía es una intención, no un olvido: sí pisa", () => {
    const merged = runspecSchema.parse({
      ...guardado,
      ...sinUndefined({ secretNames: [] }),
    });
    expect(merged.secretNames).toEqual([]);
  });
});
