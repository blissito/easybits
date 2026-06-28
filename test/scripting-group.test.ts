import { describe, it, expect } from "vitest";
import { createMcpServer, getRegisteredTools } from "../app/.server/mcp/server";

// The `scripting` (Code Mode) group must expose only the lean file-IO surface in
// tools/list, while keeping discover_tools + run_tool always reachable so the
// agent can find/execute any of the ~140 tools without reconnecting.
describe("scripting tool group — Code Mode surface", () => {
  const enabled = () => {
    const tools = getRegisteredTools(createMcpServer(["scripting"]));
    return Object.entries(tools)
      .filter(([, t]) => (t as { enabled?: boolean }).enabled !== false)
      .map(([name]) => name)
      .sort();
  };

  it("leaves only file IO + always-on meta-tools visible", () => {
    const visible = new Set(enabled());
    // File IO stays visible (multipart upload is awkward from a script).
    expect(visible.has("list_files")).toBe(true);
    expect(visible.has("get_file")).toBe(true);
    expect(visible.has("upload_file")).toBe(true);
    // Meta-tools survive any disable pass.
    expect(visible.has("discover_tools")).toBe(true);
    expect(visible.has("run_tool")).toBe(true);
    // The heavy catalog is hidden from tools/list (the whole point).
    expect(visible.has("create_document")).toBe(false);
    expect(visible.has("sandbox_create")).toBe(false);
    expect(visible.has("create_or_edit_image")).toBe(false);
  });

  it("is dramatically smaller than the full catalog", () => {
    const scripting = enabled().length;
    const all = Object.entries(getRegisteredTools(createMcpServer(["all"])))
      .filter(([, t]) => (t as { enabled?: boolean }).enabled !== false).length;
    // Lean surface: a handful, not ~140.
    expect(scripting).toBeLessThanOrEqual(8);
    expect(all).toBeGreaterThan(scripting * 5);
  });

  it("can still dispatch a hidden tool via run_tool (reachable in registry)", () => {
    const tools = getRegisteredTools(createMcpServer(["scripting"]));
    // create_document is registered (so run_tool can reach it) but disabled.
    expect(tools["create_document"]).toBeDefined();
    expect((tools["create_document"] as { enabled?: boolean }).enabled).toBe(false);
  });
});
