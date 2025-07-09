// Servicio de web fetch



// Función que maneja la llamada a la herramienta
export async function handleWebFetch(args: { url: string; format?: string; timeout?: number }) {
    try {
      const response = await fetch('https://toolbox-api.fly.dev/api/tool', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${process.env.TOOLBOX_API_KEY}`
        },
        body: JSON.stringify({
          tool: 'webfetch',
          payload: { 
            url: args.url, 
            format: args.format || 'markdown',
            timeout: args.timeout || 15 
          }
        })
      });
      
      if (!response.ok) {
        throw new Error('Error al obtener el contenido web');
      }
      
      const data = await response.json();
      // @todo metadata could be useful for future features (data.metadata)
      return data.output; // The API returns the content in the 'output' field
    } catch (error) {
      console.error('Error en web_fetch:', error);
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