import type { Route } from "./+types/llms.$section.txt";
import { getDocsMarkdown, VALID_SECTIONS } from "~/.server/docs/reference";

// GET /llms/<section>.txt — UNA sección de la referencia (público, sin auth).
//
// La maquinaria ya existía (`getDocsMarkdown(section)`, usada por la tool `get_docs`);
// lo que faltaba era exponerla por HTTP. Cada sección pesa 1-12 KB, así que un agente
// resuelve su tarea sin cargar los ~100 KB completos.
export async function loader({ params }: Route.LoaderArgs) {
  const section = (params.section ?? "").replace(/\.txt$/, "");
  const known = VALID_SECTIONS.some((s) => s.toLowerCase() === section.toLowerCase());
  if (!known) {
    // 404 de verdad: un agente debe poder distinguir "no existe" de "aquí no hay nada".
    return new Response(
      `Unknown section "${section}".\n\nAvailable:\n${VALID_SECTIONS.map((s) => `- ${s}`).join("\n")}\n`,
      { status: 404, headers: { "Content-Type": "text/plain; charset=utf-8" } }
    );
  }
  return new Response(await getDocsMarkdown(section), {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "public, max-age=3600",
    },
  });
}
