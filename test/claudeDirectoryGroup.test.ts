import { describe, it, expect } from "vitest";
import { createMcpServer, getRegisteredTools } from "../app/.server/mcp/server";
import { CLAUDE_DIRECTORY_ALLOWLIST } from "../app/.server/mcp/toolGroups";

// `/api/mcp/claude` es la URL del directorio de conectores de Claude. Lo que importa aquí
// es lo que NO está: el directorio prohíbe generar imagen/video/audio con IA, y por decisión
// propia tampoco van cobros, hosting, secretos, cajas ni flota. Strict: ni `run_tool` llega.
function visibles(groups: string[]): Set<string> {
  const tools = getRegisteredTools(createMcpServer(groups)) as Record<string, { enabled?: boolean }>;
  return new Set(
    Object.entries(tools)
      .filter(([, t]) => t.enabled !== false)
      .map(([name]) => name),
  );
}

async function enAlcance(name: string): Promise<boolean> {
  const tools = getRegisteredTools(createMcpServer(["claude"])) as Record<
    string,
    { handler: (a: unknown, e: unknown) => Promise<{ content: Array<{ text: string }> }> }
  >;
  const res = await tools["discover_tools"].handler({ query: name, limit: 200 }, {});
  const items = JSON.parse(res.content[0].text).items as Array<{ name: string }>;
  return items.some((i) => i.name === name);
}

const PROHIBIDAS = [
  // IA generativa de medios
  "create_or_edit_image", "image_generate", "edit_image", "video_create", "avatar_video_create",
  "voice_tts_create", "list_voices", "character_remember", "create_video_project", "render_video_project",
  "set_video_music", "generate_captions",
  // Dinero, hosting y cómputo facturado
  "create_payment_link", "list_payment_links", "create_machine", "launch_app", "make_permanent",
  "sandbox_create", "sandbox_exec", "agent_run", "agent_create", "agent_message", "call_create",
  "send_email", "send_broadcast", "add_domain",
  // Credenciales
  "secret_set", "secret_list", "set_ai_key", "list_ai_keys", "create_webhook", "set_machine_secrets",
];

describe("toolset claude — directorio de conectores", () => {
  it("toda tool del allowlist existe y se ve", () => {
    const v = visibles(["claude"]);
    const faltan = [...CLAUDE_DIRECTORY_ALLOWLIST].filter((t) => !v.has(t));
    expect(faltan).toEqual([]);
  });

  it("no expone nada prohibido", () => {
    const v = visibles(["claude"]);
    expect(PROHIBIDAS.filter((t) => v.has(t))).toEqual([]);
  });

  it("run_tool tampoco alcanza lo prohibido", async () => {
    for (const t of ["create_or_edit_image", "video_create", "voice_tts_create", "create_payment_link", "secret_list", "sandbox_exec"]) {
      expect(await enAlcance(t), `${t} alcanzable`).toBe(false);
    }
    expect(await enAlcance("list_documents")).toBe(true);
  });

  it("pedir `claude,all` no evapora el candado", () => {
    const v = visibles(["claude", "all"]);
    expect(v.has("create_or_edit_image")).toBe(false);
  });
});
