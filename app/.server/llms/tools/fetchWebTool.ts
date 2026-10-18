import { assertPublicUrl, PublicUrlError } from "~/.server/publicUrl";

// Web fetch del chat: lo pide el servidor de EasyBits, así que pasa por la guarda SSRF en cada
// salto de redirección. Antes iba a una toolbox externa en Fly que dejó de responder.
const MAX_CHARS = 20_000;
const MAX_REDIRECTS = 5;

function htmlToText(html: string): string {
  return html
    .replace(/<(script|style|noscript|svg|head)[\s\S]*?<\/\1>/gi, " ")
    .replace(/<br\s*\/?>|<\/(p|div|li|h[1-6]|tr|section|article)>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/[ \t]+/g, " ")
    .replace(/\s*\n\s*/g, "\n")
    .trim();
}

export async function handleWebFetch(args: { url: string; format?: string; timeout?: number }) {
  try {
    const signal = AbortSignal.timeout(Math.min(args.timeout || 15, 30) * 1000);
    let url = (await assertPublicUrl(args.url)).toString();
    let res: Response | null = null;
    for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
      res = await fetch(url, {
        redirect: "manual",
        signal,
        headers: { "user-agent": "EasyBits-Bittor/1.0 (+https://www.easybits.cloud)" },
      });
      const location = res.status >= 300 && res.status < 400 ? res.headers.get("location") : null;
      if (!location) break;
      url = (await assertPublicUrl(new URL(location, url).toString())).toString();
      res = null;
    }
    if (!res) return "La página redirige demasiadas veces.";
    if (!res.ok) return `La página respondió ${res.status}.`;
    const body = await res.text();
    const isHtml = (res.headers.get("content-type") || "").includes("html");
    const out = args.format === "html" || !isHtml ? body : htmlToText(body);
    return out.length > MAX_CHARS ? out.slice(0, MAX_CHARS) + "\n[…recortado]" : out;
  } catch (error) {
    if (error instanceof PublicUrlError) return `No se puede abrir esa URL: ${error.message}.`;
    console.error("Error en web_fetch:", error);
    return "No se pudo obtener el contenido de la página web solicitada.";
  }
}

  /** TOOL DEFINITION FOR OPENROUTER 🧐 */
  export const webFetchToolDefinition = {
    type: "function" as const,
    function: {
      name: "web_fetch",
      description: "Obtiene el contenido de una página web. Útil para obtener información actualizada de internet.",
      parameters: {
        type: "object",
        properties: {
          url: {
            type: "string",
            description: "URL completa de la página web a consultar"
          },
          format: {
            type: "string",
            enum: ["markdown", "text", "html"],
            default: "markdown",
            description: "Formato en el que se devolverá el contenido"
          },
          timeout: { 
            type: "number",
            description: "Tiempo máximo de espera en segundos",
            default: 30
          }
        },
        required: ["url"]
      }
    }
  };