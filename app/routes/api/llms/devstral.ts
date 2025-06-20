import { fetchInternalOllama } from "~/.server/llms/devstral";
import type { Route } from "./+types/devstral";

export const action = async ({ request }: Route.ActionArgs) => {
  const formData = await request.formData();
  const intent = formData.get("intent");
  if (intent === "call_ollama") {
    const prompt = formData.get("prompt") as string;
    console.info("::EL_PROMPT::", prompt);
    const ollamaResponse = await fetchInternalOllama(prompt);
    console.info("THE_GREAT_OLLAMA_RESPONSE", ollamaResponse.status);
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

export const loader = () =>
  new Response(
    JSON.stringify({ message: "made whith curiosity::by::Blissmo t(*_*t)" })
  );
