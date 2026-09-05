import { getDocsMarkdown } from "~/.server/docs/reference";

// GET /llms-full.txt — el documento COMPLETO (público, sin auth).
//
// Es lo que /llms.txt servía antes de convertirse en índice. Se conserva porque el
// estándar llms.txt lo espera aquí y porque hay agentes que prefieren un solo fetch;
// pero pesa ~100 KB, así que el índice recomienda las secciones sueltas.
export async function loader() {
  return new Response(await getDocsMarkdown(), {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "public, max-age=3600",
    },
  });
}
