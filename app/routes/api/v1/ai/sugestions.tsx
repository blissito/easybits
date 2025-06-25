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
      data: [prompt, 30, 512, 512, 7.5],
      fn_index: 0,
    };
    const dslxResponse = await fetch(
      "https://stable-diffusion-xl.fly.dev/api/predict",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      }
    );
    if (!dslxResponse.ok) {
      const text = await dslxResponse.text();
      return new Response(
        JSON.stringify({
          error: true,
          status: dslxResponse.status,
          message: text,
        }),
        { headers: { "Content-Type": "application/json" }, status: 500 }
      );
    }
    const dslxJson = await dslxResponse.json();
    // Extraer la URL de la imagen generada desde data[0]
    if (
      Array.isArray(dslxJson.data) &&
      typeof dslxJson.data[0] === "string" &&
      dslxJson.data[0].startsWith("http")
    ) {
      const imageUrl = dslxJson.data[0];

      // Descargar la imagen y convertirla a base64
      try {
        const imageResponse = await fetch(imageUrl);
        if (imageResponse.ok) {
          const imageBuffer = await imageResponse.arrayBuffer();
          const base64 = Buffer.from(imageBuffer).toString("base64");
          const mimeType =
            imageResponse.headers.get("content-type") || "image/png";

          return new Response(
            JSON.stringify({
              url: imageUrl,
              base64: `data:${mimeType};base64,${base64}`,
            }),
            {
              headers: { "Content-Type": "application/json" },
            }
          );
        }
      } catch (error) {
        console.error("Error downloading image:", error);
      }

      // Si falla la descarga, devolver solo la URL
      return new Response(JSON.stringify({ url: imageUrl }), {
        headers: { "Content-Type": "application/json" },
      });
    } else if (
      Array.isArray(dslxJson.data) &&
      typeof dslxJson.data[1] === "string"
    ) {
      return new Response(
        JSON.stringify({ loading: true, message: dslxJson.data[1] }),
        { headers: { "Content-Type": "application/json" }, status: 202 }
      );
    } else {
      return new Response(
        JSON.stringify({
          error: true,
          message: "No se pudo generar la imagen.",
        }),
        { headers: { "Content-Type": "application/json" }, status: 500 }
      );
    }
  }
  return null;
};
