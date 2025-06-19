import { fetchInternalOllama } from "~/.server/llms/devstral";
import type { Route } from "./+types/devstral";

export const action = async ({ request }: Route.ActionArgs) => {
  const formData = await request.formData();
  const intent = formData.get("intent");
  if (intent === "call_ollama") {
    const prompt = formData.get("prompt") as string;
    const ollamaResponse = await fetchInternalOllama(prompt);
    console.info("THE_GREAT_OLLAMA_RESPONSE", ollamaResponse);
    if (ollamaResponse.ok) {
      const json = await ollamaResponse.json();
      console.info("DATA?", json);
    }
  }
  return null;
};

// model: "devstral:24b-small-2505-q8_0",
// // prompt: "talk me about how to manage access to a ollama server on fly.io.",
// stream: false,

export const loader = () =>
  new Response(
    JSON.stringify({ message: "made by curiosity::Blissmo t(*_*t)" })
  );
