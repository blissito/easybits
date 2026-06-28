import { describe, it, expect } from "vitest";
import { createMcpServer, getRegisteredTools } from "../app/.server/mcp/server";
import { profileToToolsParam, TOOL_PROFILES } from "../app/.server/mcp/toolGroups";

// Dispatch run_tool the way the SDK would, reading its handler off the registry.
async function callRunTool(groups: string[], name: string, params: Record<string, unknown> = {}) {
  const server = createMcpServer(groups);
  const tools = getRegisteredTools(server) as Record<string, { handler: (a: any, e: any) => Promise<any> }>;
  return tools["run_tool"].handler({ name, params }, {});
}
async function discoverNames(groups: string[]): Promise<string[]> {
  const server = createMcpServer(groups);
  const tools = getRegisteredTools(server) as Record<string, { handler: (a: any, e: any) => Promise<any> }>;
  const res = await tools["discover_tools"].handler({ limit: 200 }, {});
  return JSON.parse(res.content[0].text).items.map((i: { name: string }) => i.name);
}

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

// The lock that makes profiles real: in strict mode (scripting present), run_tool
// and discover_tools are BOUNDED to the active allowlist — out-of-profile tools
// are unreachable even though they're registered. Without scripting, the
// escape-hatch (full catalog) is preserved for Claude.ai / legacy clients.
describe("run_tool enforcement — profile boundary", () => {
  it("REFUSES an out-of-profile tool in strict mode (scripting only)", async () => {
    const res = await callRunTool(["scripting"], "db_create", { name: "x" });
    expect(res.isError).toBe(true);
    expect(res.content[0].text).toMatch(/no está permitida en el perfil/i);
  });

  it("REFUSES sandbox tools for a creative profile (scripting + core)", async () => {
    const res = await callRunTool(["scripting", "core"], "sandbox_create", {});
    expect(res.isError).toBe(true);
  });

  it("does NOT bound run_tool without scripting (escape-hatch preserved)", async () => {
    // core alone has an allowlist but no scripting → strict=false → db_create is
    // reachable via run_tool (it tries to dispatch; error here is auth/runtime,
    // NOT the profile refusal).
    const res = await callRunTool(["core"], "db_create", {});
    const text = res?.content?.[0]?.text ?? "";
    expect(text).not.toMatch(/no está permitida en el perfil/i);
  });

  it("discover_tools only lists in-profile tools in strict mode", async () => {
    const names = await discoverNames(["scripting"]);
    expect(names).toContain("upload_file");
    expect(names).not.toContain("db_create");
    expect(names).not.toContain("sandbox_create");
  });
});

// End-to-end of the "Público" profile: the agent CAN create images/documents but
// CANNOT touch DBs, sandboxes, secrets or sites — enforced through run_tool.
describe("perfil Público — creativo sin administración", () => {
  const groups = () => profileToToolsParam("publico").split(",");

  it("resolves to scripting + creative buckets", () => {
    expect(profileToToolsParam("publico")).toBe("scripting,imagenes,documentos,investigacion");
    expect(TOOL_PROFILES.publico.label).toBe("Público");
  });

  it("ALLOWS creative tools (image, document, research)", async () => {
    for (const t of ["create_or_edit_image", "create_document", "research_search"]) {
      const res = await callRunTool(groups(), t, {});
      // Not the profile refusal — it may still fail on auth/args downstream.
      expect(res?.content?.[0]?.text ?? "").not.toMatch(/no está permitida en el perfil/i);
    }
  });

  it("REFUSES administrative tools (db, sandbox, secret, website)", async () => {
    for (const t of ["db_create", "sandbox_create", "secret_set", "create_website"]) {
      const res = await callRunTool(groups(), t, {});
      expect(res.isError).toBe(true);
      expect(res.content[0].text).toMatch(/no está permitida en el perfil/i);
    }
  });
});
