import { getToolCatalog } from "~/.server/docs/toolCatalog";
import { TOOL_GROUPS } from "~/.server/mcp/toolGroups";

// GET /api/tools.json — catálogo PÚBLICO de tools (sin auth).
//
// `tools/list` del MCP exige API key, así que hasta ahora un agente no podía saber qué
// sabe hacer EasyBits sin abrir cuenta — y eso cuesta evaluaciones: quien compara
// plataformas no se registra en todas.
//
// Sólo metadatos: nombre, una línea de descripción y a qué grupo pertenece. No ejecuta
// nada, no toca datos de usuario y no expone los schemas de entrada (decisión explícita:
// para preparar una llamada hace falta cuenta).
export async function loader() {
  const tools = getToolCatalog();
  const counts = tools.reduce<Record<string, number>>((acc, t) => {
    acc[t.group] = (acc[t.group] ?? 0) + 1;
    return acc;
  }, {});

  return Response.json(
    {
      product: "EasyBits — la nube para expertos IA",
      mcp: "https://www.easybits.cloud/api/mcp",
      docs: "https://www.easybits.cloud/llms.txt",
      total: tools.length,
      groups: TOOL_GROUPS.filter((g) => counts[g.key]).map((g) => ({
        key: g.key,
        label: g.label,
        description: g.description,
        tools: counts[g.key],
      })),
      tools,
    },
    {
      headers: {
        "Cache-Control": "public, max-age=3600",
        "Access-Control-Allow-Origin": "*",
      },
    }
  );
}
