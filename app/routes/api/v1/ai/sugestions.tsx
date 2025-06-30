import { fetchInternalOllama } from "~/.server/llms/devstral";
import type { ChatStructure } from "~/hooks/useDevstral";
import { buildPromptFromHistory } from "~/hooks/useDevstral";

export const action = async ({ request }: { request: Request }) => {
  const formData = await request.formData();
  const chat = JSON.parse(formData.get("chat") as string) as ChatStructure[];
  const intent = formData.get("intent") as string;

  if (intent === "generate_sugestion") {
    // Construir prompt contextual con historial
    const prompt = buildPromptFromHistory(chat);

    const ollamaResponse = await fetchInternalOllama(prompt, true);
    console.info("OLLAMA_RESPONSE::\n", ollamaResponse.status);
    if (ollamaResponse.status > 399) {
      const d = await ollamaResponse.json();
      console.error("OLLAMA_ERROR::\n", d);
    }
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
  // i want a new action where I return  a description to share in social media based on the name, type and info from the asset i want to share/sell that is well structured based on the platfor it will be shareD
  if (intent === "generate_social_description") {
    const prompt = buildPromptFromHistory(chat);
    const ollamaResponse = await fetchInternalOllama(prompt, true);
    console.info("OLLAMA_RESPONSE::\n", ollamaResponse.status);
    if (ollamaResponse.status > 399) {
      const d = await ollamaResponse.json();
      console.error("OLLAMA_ERROR::\n", d);
    }

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
