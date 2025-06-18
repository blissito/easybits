import { GoogleGenerativeAI } from "@google/generative-ai";

// Configuración del cliente de Gemini
const genAI = new GoogleGenerativeAI(process.env.GOOGLE_AI_API_KEY || "");

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

export const action = async ({ request }: { request: Request }) => {
  try {
    const {
      message,
      history = [],
      model = "gemini-1.5-flash",
    } = await request.json();

    if (!message || typeof message !== "string") {
      return new Response(JSON.stringify({ error: "Mensaje requerido" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    console.log("GOOGLE_AI_API_KEY::", process.env.GOOGLE_AI_API_KEY);

    if (!process.env.GOOGLE_AI_API_KEY) {
      console.error("GOOGLE_AI_API_KEY no está configurada");
      return new Response(
        JSON.stringify({ error: "Error de configuración del servidor" }),
        {
          status: 500,
          headers: { "Content-Type": "application/json" },
        }
      );
    }

    // Obtener el modelo Gemini con el modelo seleccionado
    const geminiModel = genAI.getGenerativeModel({ model });

    // Filtrar el historial para asegurar que no empiece con un mensaje del asistente
    const filteredHistory = history.filter(
      (msg: ChatMessage, index: number) => {
        // Si es el primer mensaje y es del asistente, lo omitimos
        if (index === 0 && msg.role === "assistant") {
          return false;
        }
        return true;
      }
    );

    // Construir el historial de chat para Gemini con los roles correctos
    const chat = geminiModel.startChat({
      history: filteredHistory.map((msg: ChatMessage) => ({
        role: msg.role === "assistant" ? "model" : "user", // Gemini usa 'model' en lugar de 'assistant'
        parts: [{ text: msg.content }],
      })),
      generationConfig: {
        maxOutputTokens: 1000,
        temperature: 0.7,
      },
    });

    // Crear un stream de respuesta
    const stream = new ReadableStream({
      async start(controller) {
        try {
          // Enviar el mensaje y obtener stream de respuesta
          const result = await chat.sendMessageStream(message);

          // Enviar evento de inicio
          controller.enqueue(`data: ${JSON.stringify({ type: "start" })}\n\n`);

          // Procesar el stream de respuesta
          for await (const chunk of result.stream) {
            const chunkText = chunk.text();
            if (chunkText) {
              controller.enqueue(
                `data: ${JSON.stringify({
                  type: "chunk",
                  content: chunkText,
                })}\n\n`
              );
            }
          }

          // Enviar evento de fin
          controller.enqueue(`data: ${JSON.stringify({ type: "end" })}\n\n`);
          controller.close();
        } catch (error) {
          console.error("Error en el stream:", error);
          controller.enqueue(
            `data: ${JSON.stringify({
              type: "error",
              error: "Error en el stream de respuesta",
            })}\n\n`
          );
          controller.close();
        }
      },
    });

    return new Response(stream, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type",
      },
    });
  } catch (error) {
    console.error("Error en el chat de IA:", error);

    return new Response(
      JSON.stringify({ error: "Error interno del servidor" }),
      {
        status: 500,
        headers: { "Content-Type": "application/json" },
      }
    );
  }
};
