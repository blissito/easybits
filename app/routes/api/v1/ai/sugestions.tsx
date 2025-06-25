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
  if (intent === "generate_image_dslx") {
    // Construir prompt contextual con historial
    const prompt = buildPromptFromHistory(chat);
    const payload = {
      data: [prompt, 30, 1024, 1024, 7.5],
    };
    const dslxResponse = await fetch(
      "https://stable-diffusion-xl.fly.dev/api/predict",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      }
    );
    const dslxJson = await dslxResponse.json();
    const url = dslxJson.url;
    return new Response(JSON.stringify({ url }), {
      headers: { "Content-Type": "application/json" },
    });
  }
  return null;
};
