import { describe, it, expect } from "vitest";

// The routing itself lives inside sandboxOperations (module-level env + a
// cache), so rather than booting that module we pin the two rules the design
// depends on. Getting either wrong sends an exec/suspend/destroy to the wrong
// box: a 404 with no way to recover the binding, on a machine a customer pays
// for.

/** Mirrors sandboxIdFromPath in sandboxOperations.ts. */
function sandboxIdFromPath(path: string): string | null {
  const m = path.match(/\/v1\/sandbox\/([^/?]+)/);
  return m ? decodeURIComponent(m[1]) : null;
}

describe("host routing — deriving the box from the request path", () => {
  it("finds the sandbox id in every shape of host path", () => {
    const cases: [string, string][] = [
      ["/v1/sandbox/sb_abc", "sb_abc"],
      ["/v1/sandbox/sb_abc/exec", "sb_abc"],
      ["/v1/sandbox/sb_abc/files/write", "sb_abc"],
      ["/v1/sandbox/sb_abc/suspend", "sb_abc"],
      ["/v1/sandbox/sb_abc/domain-add", "sb_abc"],
      ["/v1/sandbox/sb_abc?owner=u1", "sb_abc"],
    ];
    for (const [path, expected] of cases) {
      expect(sandboxIdFromPath(path), path).toBe(expected);
    }
  });

  it("returns null for paths with no sandbox — those go to the default host", () => {
    // Creation and listing have no id yet: the caller picks the box explicitly
    // (hosting passes HOSTING_HOST_URL) and records it on the row.
    expect(sandboxIdFromPath("/v1/sandbox")).toBeNull();
    expect(sandboxIdFromPath("/v1/stats")).toBeNull();
    expect(sandboxIdFromPath("/v1/snapshots")).toBeNull();
  });

  it("does not mistake /v1/snapshot/<id> for a sandbox", () => {
    // Snapshot ids are a different namespace; matching them would route a
    // snapshot call by a sandbox binding that doesn't exist.
    expect(sandboxIdFromPath("/v1/snapshot/snap_123/fork")).toBeNull();
  });
});
