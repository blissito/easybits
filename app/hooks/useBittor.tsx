import type { Message } from "~/components/ai/BittorChat";
import { use, useEffect, useState } from "react";
import { nanoid } from "nanoid";

export const useBittor = ({
  onMessages,
  history = [],
  model,
  systemPrompt = `   Eres un asistente de IA amigable de Easybits, experto en la plataforma, que responde en español mexicano. Importante: nunca menciones a Google ni a DeepMind o Gemma. 
  Si te preguntan sobre ti, di que eres un asistente experto en easybits.cloud y en assets digitales.
   `,
}: {
  systemPrompt?: string;
  history: Message[];
  model?: string;
  onMessages: (messages: Message[]) => void;
}): {
  messages: Message[];
  isLoading: boolean;
  isStreaming: boolean;
  error: string | null;
  sendMessage: (message: string, history?: Message[]) => Promise<Message>;
} => {
  const [messages, setMessages] = useState<Message[]>([
    {
      role: "system",
      content: systemPrompt,
    },
    ...history,
  ]);
  const [isLoading, setIsLoading] = useState(false);
  const [isStreaming, setIsStreaming] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const assistantMessageId = nanoid(4);

  useEffect(() => {
    onMessages(messages);
  }, []);

  const sendMessage = async (
    userMessage: string,
    historyOverride?: Message[]
  ): Promise<Message> => {
    let finalMessage: Message = {
      id: assistantMessageId,
      role: "assistant",
      content: "",
      timestamp: new Date(),
      isStreaming: false,
    };
    try {
      const response = await fetch("/api/v1/ai/chat", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          message: userMessage,
          history: (historyOverride || messages).slice(-10).map((msg) => ({
            role: msg.role,
            content: msg.content,
            model,
          })),
          systemPrompt:
            "Eres un asistente de IA amigable y útil. Responde de manera clara, concisa y en español. Ayuda a los usuarios con sus preguntas y tareas de la mejor manera posible.",
        }),
      });

      if (!response.ok) {
        throw new Error("Error en la respuesta del servidor");
      }

      // Procesar el stream de respuesta (compatible con OpenRouter)
      const reader = response.body?.getReader();
      const decoder = new TextDecoder();

      if (!reader) {
        throw new Error("No se pudo leer el stream");
      }

      let accumulatedContent = "";
      let streamEnded = false;

      while (!streamEnded) {
        const { done, value } = await reader.read();
        if (done) break;
        const chunk = decoder.decode(value);
        const lines = chunk.split("\n");

        for (const line of lines) {
          if (line.startsWith("data: ")) {
            try {
              const data = JSON.parse(line.slice(6));

              // Soporte para formato OpenRouter
              if (data.choices && data.choices[0]) {
                const delta = data.choices[0].delta;
                // @todo make it a hook
                if (delta && delta.content) {
                  accumulatedContent += delta.content;
                  setMessages((prev) =>
                    prev.map((msg) =>
                      msg.id === assistantMessageId
                        ? { ...msg, content: accumulatedContent }
                        : msg
                    )
                  );
                  finalMessage = {
                    ...finalMessage,
                    content: accumulatedContent,
                    isStreaming: true,
                  };
                }
                if (data.choices[0].finish_reason) {
                  setMessages((prev) =>
                    prev.map((msg) =>
                      msg.id === assistantMessageId
                        ? { ...msg, isStreaming: false }
                        : msg
                    )
                  );
                  finalMessage = {
                    ...finalMessage,
                    isStreaming: false,
                  };
                  streamEnded = true;
                }
              }
              // Soporte para formato antiguo (por compatibilidad)
              else if (data.type) {
                switch (data.type) {
                  case "start":
                    break;
                  case "chunk":
                    accumulatedContent += data.content;
                    setMessages((prev) =>
                      prev.map((msg) =>
                        msg.id === assistantMessageId
                          ? { ...msg, content: accumulatedContent }
                          : msg
                      )
                    );
                    finalMessage = {
                      ...finalMessage,
                      content: accumulatedContent,
                      isStreaming: true,
                    };
                    break;
                  case "end":
                    setMessages((prev) =>
                      prev.map((msg) =>
                        msg.id === assistantMessageId
                          ? { ...msg, isStreaming: false }
                          : msg
                      )
                    );
                    finalMessage = {
                      ...finalMessage,
                      isStreaming: false,
                    };
                    streamEnded = true;
                    break;
                  case "error":
                    throw new Error(data.error);
                }
              }
            } catch (parseError) {
              console.error("Error parsing SSE data:", parseError);
            }
          }
        }
      }
      return finalMessage;
    } catch (error) {
      console.error("Error al enviar mensaje:", error);
      const errorMessage: Message = {
        id: assistantMessageId,
        role: "assistant",
        content:
          "Lo siento, hubo un error al procesar tu mensaje. Por favor, intenta de nuevo.",
        timestamp: new Date(),
        isStreaming: false,
      };
      setMessages((prev) =>
        prev.map((msg) => (msg.id === assistantMessageId ? errorMessage : msg))
      );
      return errorMessage;
    }
  };

  return { sendMessage, messages, isLoading, isStreaming, error };
};
