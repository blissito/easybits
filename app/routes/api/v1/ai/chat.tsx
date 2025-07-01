import { fetchOpenRouter } from "~/.server/llms/openRouter";

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

export const action = async ({ request }: { request: Request }) => {
  try {
    const {
      message,
      history = [],
      systemPrompt = "Eres un asistente de IA amigable y útil. Responde de manera clara, concisa y en español. Ayuda a los usuarios con sus preguntas y tareas de la mejor manera posible.",
    } = await request.json();

    if (!message || typeof message !== "string") {
      return new Response(JSON.stringify({ error: "Mensaje requerido" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    // --- SOLO OPENROUTER ---
    try {
      // Preparamos el historial para OpenRouter
      const openRouterMessages = [
        { role: "system", content: systemPrompt },
        ...history.slice(-10).map((msg: ChatMessage) => ({
          role: msg.role,
          content: msg.content,
        })),
        { role: "user", content: message },
      ];
      const {
        response,
        success,
        error: openRouterError,
      } = await fetchOpenRouter({
        messages: openRouterMessages,
        stream: true,
      });
      if (!success || !response) {
        throw new Error(openRouterError || "Error desconocido en OpenRouter");
      }
      // Adaptar el stream de OpenRouter al formato SSE
      const stream = new ReadableStream({
        async start(controller) {
          controller.enqueue(`data: ${JSON.stringify({ type: "start" })}\n\n`);
          const reader = response.body?.getReader();
          const decoder = new TextDecoder();
          let accumulated = "";
          if (!reader) {
            controller.enqueue(
              `data: ${JSON.stringify({
                type: "error",
                error: "No se pudo leer el stream de OpenRouter",
              })}\n\n`
            );
            controller.close();
            return;
          }
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            const chunk = decoder.decode(value);
            // OpenRouter devuelve SSE con 'data: ...' por línea
            const lines = chunk.split("\n");
            for (const line of lines) {
              if (line.startsWith("data: ")) {
                try {
                  const data = JSON.parse(line.slice(6));
                  if (data.choices && data.choices[0]?.delta?.content) {
                    accumulated += data.choices[0].delta.content;
                    controller.enqueue(
                      `data: ${JSON.stringify({
                        type: "chunk",
                        content: data.choices[0].delta.content,
                      })}\n\n`
                    );
                  }
                  if (data.choices && data.choices[0]?.finish_reason) {
                    controller.enqueue(
                      `data: ${JSON.stringify({ type: "end" })}\n\n`
                    );
                    controller.close();
                  }
                } catch (err) {
                  // Puede ser keepalive u otro formato
                }
              }
            }
          }
          // Si termina sin finish_reason
          controller.enqueue(`data: ${JSON.stringify({ type: "end" })}\n\n`);
          controller.close();
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
      console.error("Error en OpenRouter:", error);
      return new Response(
        JSON.stringify({ error: "Error interno del servidor (OpenRouter)" }),
        {
          status: 500,
          headers: { "Content-Type": "application/json" },
        }
      );
    }
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
