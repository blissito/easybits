import { describe, expect, test } from "vitest";
import { createMcpServer, getRegisteredTools } from "~/.server/mcp/server";

// El directorio de Claude exige `title` + readOnly/destructive en cada tool.
describe("MCP tool annotations", () => {
  const tools = getRegisteredTools(createMcpServer(["all"])) as Record<string, any>;

  test("toda tool trae title y hints explícitos", () => {
    const missing = Object.entries(tools)
      .filter(
        ([, t]) =>
          !t.title ||
          typeof t.annotations?.readOnlyHint !== "boolean" ||
          typeof t.annotations?.destructiveHint !== "boolean"
      )
      .map(([n]) => n);
    expect(missing).toEqual([]);
  });

  test("una tool de sólo lectura nunca es destructiva", () => {
    const bad = Object.entries(tools)
      .filter(([, t]) => t.annotations.readOnlyHint && t.annotations.destructiveHint)
      .map(([n]) => n);
    expect(bad).toEqual([]);
  });

  test.each([
    ["list_files", true, false],
    ["get_document", true, false],
    ["delete_file", false, true],
    ["sandbox_destroy", false, true],
    ["sandbox_exec", false, true],
    ["db_query", false, true],
    ["db_select", true, false],
    ["update_document", false, true],
    ["create_document", false, false],
    ["upload_file", false, false],
  ])("%s → readOnly=%s destructive=%s", (name, ro, de) => {
    expect(tools[name].annotations.readOnlyHint).toBe(ro);
    expect(tools[name].annotations.destructiveHint).toBe(de);
  });
});
