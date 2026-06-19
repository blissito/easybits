import { describe, it, expect, vi } from "vitest";
import { ok, fail, paginate, failService } from "../app/.server/mcp/responses";

// Stub the sandbox ops so the sandbox_list handler can run end-to-end without a
// live host or auth context — we only care that it wraps the result in the
// unified ok(paginate(...)) envelope, not where the data comes from.
vi.mock("../app/.server/core/sandboxOperations", async (importActual) => ({
  ...(await importActual<object>()),
  listSandboxes: vi.fn(async () => [
    { sandboxId: "sb_1", template: "python", status: "running" },
    { sandboxId: "sb_2", template: "node", status: "running" },
  ]),
}));

import { createMcpServer, getRegisteredTools, wrapHandler } from "../app/.server/mcp/server";

// ─────────────────────────────────────────────────────────────────────────────
// Contract tests for the MCP layer. These freeze the unified response/error/
// pagination shapes so a refactor can't silently break the 158 tools agents
// consume. In-process (no HTTP) — see getRegisteredTools().
// ─────────────────────────────────────────────────────────────────────────────

function parseText(res: any): any {
  expect(res.content?.[0]?.type).toBe("text");
  return JSON.parse(res.content[0].text);
}

describe("response helpers — single shape", () => {
  it("ok() wraps data as text + structuredContent, no isError", () => {
    const res = ok({ a: 1 });
    expect(res.isError).toBeUndefined();
    expect(res.structuredContent).toEqual({ a: 1 });
    expect(parseText(res)).toEqual({ a: 1 });
  });

  it("fail() always { error, ...extra } + isError:true", () => {
    const res = fail("boom", { code: "X", status: 400 });
    expect(res.isError).toBe(true);
    expect(parseText(res)).toEqual({ error: "boom", code: "X", status: 400 });
  });

  it("fail() with no extra is just { error }", () => {
    expect(parseText(fail("nope"))).toEqual({ error: "nope" });
  });
});

describe("paginate — single envelope for every list_*", () => {
  it("empty list → nextCursor null, hasMore false", () => {
    expect(paginate([])).toEqual({ items: [], nextCursor: null, hasMore: false });
  });

  it("with cursor → hasMore true", () => {
    expect(paginate([1, 2], { nextCursor: "c1" })).toEqual({
      items: [1, 2],
      nextCursor: "c1",
      hasMore: true,
    });
  });

  it("total is included only when passed", () => {
    expect(paginate([1], { total: 9 })).toEqual({
      items: [1],
      nextCursor: null,
      hasMore: false,
      total: 9,
    });
    expect("total" in paginate([1])).toBe(false);
  });
});

describe("wrapHandler — every thrown error becomes the fail() shape", () => {
  it("plain Error → { error: message } + isError", async () => {
    const h = wrapHandler(async () => {
      throw new Error("kaboom");
    });
    const res = await h({}, {});
    expect(res.isError).toBe(true);
    expect(parseText(res).error).toBe("kaboom");
  });

  it("thrown Response → { error, status } + isError", async () => {
    const h = wrapHandler(async () => {
      throw new Response(JSON.stringify({ error: "bad input" }), { status: 400 });
    });
    const res = await h({}, {});
    expect(res.isError).toBe(true);
    const body = parseText(res);
    expect(body.error).toBe("bad input");
    expect(body.status).toBe(400);
  });

  it("success passes through untouched", async () => {
    const h = wrapHandler(async () => ok({ done: true }));
    const res = await h({}, {});
    expect(res.isError).toBeUndefined();
    expect(parseText(res)).toEqual({ done: true });
  });
});

describe("failService — service errors map to fail(); unknown returns null", () => {
  it("returns null for a non-service error so the handler re-throws", () => {
    expect(failService(new Error("random"), "x")).toBeNull();
  });
});

describe("registry smoke — createMcpServer('all')", () => {
  it("registers a healthy set of tools, each with a callable handler", () => {
    const server = createMcpServer(["all"]);
    const tools = getRegisteredTools(server);
    const names = Object.keys(tools);

    // No duplicate names: the SDK throws on double-registration, so simply
    // reaching here means names are unique. Assert a sane lower bound.
    expect(names.length).toBeGreaterThan(100);

    for (const name of names) {
      expect(typeof tools[name].handler).toBe("function");
    }
  });

  it("a real list_* tool returns the unified envelope end-to-end", async () => {
    // list_themes needs no DB nor auth context — exercises the full
    // wrapHandler → ok(paginate(...)) path against the live registry.
    const tools = getRegisteredTools(createMcpServer(["all"]));
    const res = await tools["list_themes"].handler({}, {});
    const body = parseText(res);
    expect(Array.isArray(body.items)).toBe(true);
    expect(body).toHaveProperty("nextCursor");
    expect(typeof body.hasMore).toBe("boolean");
    expect(res.isError).toBeUndefined();
  });

  it("sandbox_list returns the unified paginate envelope (not a raw array)", async () => {
    // sandbox_list is in the 'sandbox' group; its underlying op is mocked above
    // so this exercises the handler's ok(paginate(...)) wrapping in isolation.
    const tools = getRegisteredTools(createMcpServer(["sandbox"]));
    const res = await tools["sandbox_list"].handler({}, { authInfo: { user: { id: "u1" }, scopes: ["READ"] } });
    const body = parseText(res);
    expect(Array.isArray(body.items)).toBe(true);
    expect(body.items).toHaveLength(2);
    expect(body).toHaveProperty("nextCursor");
    expect(typeof body.hasMore).toBe("boolean");
    expect(res.isError).toBeUndefined();
  });
});
