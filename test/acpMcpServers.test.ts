import { describe, it, expect } from "vitest";
import { normalizeAcpMcpServers } from "~/.server/core/sandboxOperations";

describe("normalizeAcpMcpServers", () => {
  it("normaliza env de objeto a la lista {name,value} del protocolo", () => {
    expect(
      normalizeAcpMcpServers([
        { name: "memoria", command: "npx", args: ["-y", "tsx", "x.ts"], env: { DB: "/data/m.db" } },
      ])
    ).toEqual([
      {
        name: "memoria",
        command: "npx",
        args: ["-y", "tsx", "x.ts"],
        env: [{ name: "DB", value: "/data/m.db" }],
      },
    ]);
  });

  it("acepta la lista del protocolo tal cual", () => {
    const out = normalizeAcpMcpServers([
      { name: "m", command: "node", env: [{ name: "A", value: "1" }] },
    ]);
    expect(out[0]).toMatchObject({ env: [{ name: "A", value: "1" }] });
  });

  it("acepta http/sse con headers", () => {
    const out = normalizeAcpMcpServers([
      { type: "http", name: "eb", url: "https://x.dev/mcp", headers: { Authorization: "Bearer 1" } },
    ]);
    expect(out[0]).toEqual({
      type: "http",
      name: "eb",
      url: "https://x.dev/mcp",
      headers: [{ name: "Authorization", value: "Bearer 1" }],
    });
  });

  it("rechaza lo que un dedo escribe mal, con el campo culpable", () => {
    expect(() => normalizeAcpMcpServers({} as unknown)).toThrow(/array/);
    expect(() => normalizeAcpMcpServers([{ command: "node" }])).toThrow(/\[0\]\.name/);
    expect(() => normalizeAcpMcpServers([{ name: "a b", command: "node" }])).toThrow(/name/);
    expect(() => normalizeAcpMcpServers([{ name: "a" }])).toThrow(/command/);
    expect(() => normalizeAcpMcpServers([{ name: "a", command: "node", args: "x" }])).toThrow(/args/);
    expect(() => normalizeAcpMcpServers([{ type: "http", name: "a", url: "ftp://x" }])).toThrow(/url/);
    expect(() => normalizeAcpMcpServers([{ type: "grpc", name: "a", command: "x" }])).toThrow(/type/);
    expect(() =>
      normalizeAcpMcpServers(Array.from({ length: 21 }, (_, i) => ({ name: `m${i}`, command: "node" })))
    ).toThrow(/20/);
  });
});
