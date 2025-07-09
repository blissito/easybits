import { handleWebFetch } from "./fetchWebTool";

  interface ToolCall {
    function: {
      name: string;
      arguments: string;
    };
  }
  
export const toolCatcher = async (
    toolCalls: ToolCall[],
    controller: ReadableStreamDefaultController<string>
  ) => {
    try {
      for (const toolCall of toolCalls) {
        const { name, arguments: args } = toolCall.function;
        const parsedArgs = JSON.parse(args);
        
        let result: string;
        switch (name) {
          case 'web_fetch':
            result = await handleWebFetch(parsedArgs);
            break;
          // Agrega más herramientas aquí según sea necesario
          default:
            throw new Error(`Herramienta no soportada: ${name}`);
        }
  
        controller.enqueue(
          `data: ${JSON.stringify({
            type: "chunk",
            content: result,
          })}\n\n`
        );
      }
    } catch (err:unknown) {
      const error = err instanceof Error ? err : new Error(String(err))
      console.error('Error en toolCatcher:', error.message);
      controller.enqueue(
        `data: ${JSON.stringify({
          type: "error",
          content: `Error al procesar herramienta: ${error.message}`
        })}\n\n`
      );
    }
  };