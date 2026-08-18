import { describe, it, expect } from "vitest";
import { createMcpServer, applyCatalogCaching } from "~/.server/mcp/server";

describe("catalog caching", () => {
  it("tools/list declares ttlMs + cacheScope and is sorted", async () => {
    const server = createMcpServer(["core"]);
    applyCatalogCaching(server);
    const handlers = (server.server as any)._requestHandlers as Map<string, any>;
    const res = await handlers.get("tools/list")({ method: "tools/list", params: {} }, {});
    expect(res.ttlMs).toBe(300_000);
    expect(res.cacheScope).toBe("connection");
    const names = res.tools.map((t: any) => t.name);
    expect(names).toEqual([...names].sort((a, b) => a.localeCompare(b)));
    expect(names.length).toBeGreaterThan(3);
  });
});
