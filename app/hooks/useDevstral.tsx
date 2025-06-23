import { useRef, useState, type FormEvent } from "react";

export type ChatStructure = { role: string; content: string };
type Conversation = ChatStructure[];

const queryLLMStream = async (
  chat: Conversation,
  onChunk: (chunk: string) => void,
  signal?: AbortSignal
) => {
  const action = "/api/v1/ai/sugestions";
  try {
    const resp = await fetch(action, {
      method: "post",
      body: new URLSearchParams({
        intent: "generate_sugestion",
        chat: JSON.stringify(chat),
      }),
      signal,
    });

    if (!resp.ok) return false;

    const reader = resp.body?.getReader();
    const decoder = new TextDecoder();

    if (!reader) return false;

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      const chunk = decoder.decode(value);
      const lines = chunk.split("\n");

      for (const line of lines) {
        if (line.trim() && line.startsWith("{")) {
          try {
            const data = JSON.parse(line);
            if (data.response) {
              onChunk(data.response);
            }
          } catch (e) {
            // Ignore parse errors
          }
        }
      }
    }
    return true;
  } catch (e) {
    console.error("::ERROR_STREAM::", e);
    return false;
  }
};

export const useDevstral = <T extends string>() => {
  const queryLLM = async (prompt: string) => {
    const action = "/api/v1/llms/devstral"; // action
    let resp: Partial<Response> = { ok: false, json: async () => {} };
    try {
      resp = await fetch(action, {
        method: "post",
        body: new URLSearchParams({ intent: "call_ollama", prompt }),
      });
      console.info("::API_RESPONSE::", resp.status, resp.statusText);
    } catch (e) {
      console.error("::ERROR_AL_CONSULTAR_AL_API::", e);
    }
    return {
      ok: resp.ok,
      data: (resp as Response).text() as Promise<T>, // promise
    };
  };

  return {
    async getAnswer(prompt: string) {
      const { ok, data } = await queryLLM(prompt);
      if (ok) return data as Promise<T>;
    },
    queryLLMStream, // ← Nueva función para streaming
  };
};

const useLLM = () => {
  const [responses, setResponses] = useState("");
  const [currentResponse, setCurrentResponse] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const [conversation, setConversation] = useState<ChatStructure[]>([]);

  const handleSubmit = async (ev: FormEvent<HTMLFormElement>) => {
    ev.preventDefault();
    setIsLoading(true);
    setCurrentResponse("");
    const formData = new FormData(ev.currentTarget);
    const prompt = formData.get("prompt") as string;

    // Agrega el mensaje del usuario a la conversación
    const updatedConversation = [
      ...conversation,
      { role: "user", content: prompt },
    ];
    setConversation(updatedConversation);

    let finalResponse = "";
    const success = await queryLLMStream(updatedConversation, (chunk) => {
      setCurrentResponse((prev) => {
        const newResponse = prev + chunk;
        return newResponse;
      });
    });
    if (success) {
      setResponses((prev) => prev + finalResponse);
    }
    setIsLoading(false);
  };

  return {
    handleSubmit,
  };
};

// Construye el prompt para Ollama usando el historial de mensajes
export function buildPromptFromHistory(
  history: { role: string; content: string }[]
) {
  return (
    history
      .map(
        (msg) =>
          `${
            msg.role === "system"
              ? "System:"
              : msg.role === "user"
              ? "Usuario"
              : "Asistente"
          }: ${msg.content}`
      )
      .join("\n") + "\nAsistente:"
  );
}
