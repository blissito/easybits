import { describe, it, expect, vi, afterEach } from "vitest";
import { sqldQuery, SqldError } from "~/.server/sqld";
import { sqldErrorResponse } from "~/.server/core/databaseOperations";

// `db query` contestaba 500 "Unexpected Server Error" para TODO error de sqld: un SQL mal
// escrito, una base cuyo namespace no existe y una caída se veían igual.
afterEach(() => vi.unstubAllGlobals());

const reply = (status: number, body: unknown) =>
  vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify(body), { status })));

describe("errores de sqld", () => {
  it("namespace inexistente → namespace_missing → 409", async () => {
    reply(404, { error: "Namespace `abc` doesn't exist" });
    const err = await sqldQuery("abc", "SELECT 1").catch((e) => e);
    expect(err).toBeInstanceOf(SqldError);
    expect(err.kind).toBe("namespace_missing");
    const res = sqldErrorResponse(err) as Response;
    expect(res.status).toBe(409);
    expect((await res.json()).code).toBe("DATABASE_STORAGE_MISSING");
  });

  it("SQL inválido → sql → 400 con el mensaje de sqld", async () => {
    reply(200, { results: [{ type: "error", error: { message: "near \"SELEC\": syntax error", code: "SQLITE_ERROR" } }, { type: "ok" }] });
    const err = await sqldQuery("abc", "SELEC 1").catch((e) => e);
    expect(err.kind).toBe("sql");
    const res = sqldErrorResponse(err) as Response;
    expect(res.status).toBe(400);
    expect((await res.json()).error).toContain("syntax error");
  });

  it("otro error HTTP → upstream → 502", async () => {
    reply(500, { error: "boom" });
    const err = await sqldQuery("abc", "SELECT 1").catch((e) => e);
    expect(err.kind).toBe("upstream");
    expect((sqldErrorResponse(err) as Response).status).toBe(502);
  });

  it("un error que no es de sqld pasa tal cual", () => {
    const e = new Error("otra cosa");
    expect(sqldErrorResponse(e)).toBe(e);
  });
});
