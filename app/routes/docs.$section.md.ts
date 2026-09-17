import type { Route } from "./+types/docs.$section.md";
import { getDocsMarkdown, VALID_SECTIONS } from "~/.server/docs/reference";
import { resolveDocsSection } from "~/.server/docs/sectionAlias";

// GET /docs/<section>.md — la misma sección que se ve en /docs#<section>, en markdown crudo
// (público, sin auth). Es lo que un agente de código lee sin scrapear la página: el menú
// «Copiar markdown / Abrir en Claude» de /docs apunta aquí.

export async function loader({ params }: Route.LoaderArgs) {
  const key = resolveDocsSection(params.section ?? "");
  if (!key) {
    return new Response(
      `Unknown section "${params.section}".\n\nAvailable:\n${VALID_SECTIONS.map((s) => `- /docs/${s}.md`).join("\n")}\n`,
      { status: 404, headers: { "Content-Type": "text/plain; charset=utf-8" } }
    );
  }
  return new Response(await getDocsMarkdown(key), {
    headers: {
      "Content-Type": "text/markdown; charset=utf-8",
      "Cache-Control": "public, max-age=3600",
      "Access-Control-Allow-Origin": "*",
    },
  });
}
