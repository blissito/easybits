import { fetchInternalOllama } from "~/.server/llms/devstral";
import type { ChatStructure } from "~/hooks/useDevstral";

export const action = async ({ request }: { request: Request }) => {
  const formData = await request.formData();
  const chat = JSON.parse(formData.get("chat") as string) as ChatStructure[];
  const intent = formData.get("intent") as string;

  if (intent === "generate_sugestion") {
    const ollamaResponse = await fetchInternalOllama(chat[0].content, true);
    console.info("THE_SECOND_GREAT_OLLAMA_RESPONSE", ollamaResponse.status);
    // streams
    if (ollamaResponse.ok) {
      return new Response(ollamaResponse.body, {
        headers: {
          "Content-Type": "text/plain",
          "Cache-Control": "no-cache",
          Connection: "keep-alive",
        },
      });
    }
  }
  return null;
};
