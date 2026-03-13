import { data } from "react-router";
import { generateText } from "ai";
import { getUserOrRedirect } from "~/.server/getters";
import { resolveModelLocal, getAiModel } from "~/.server/aiModels";
import { logAiUsage } from "~/.server/aiGenerationLimit";
import type { Route } from "./+types/document-enhance";

export const action = async ({ request }: Route.ActionArgs) => {
  const user = await getUserOrRedirect(request);
  const body = await request.json();
  const action = String(body._action || "enhance");
  const name = String(body.name || "").trim();

  // Auto-describe: generate description from title only
  if (action === "auto-describe") {
    if (!name) {
      return data({ error: "Nombre requerido" }, { status: 400 });
    }

    const modelId = await getAiModel("docAutoDescribe");
    const model = resolveModelLocal(modelId);

    const { text, usage } = await generateText({
      model,
      system: `You are a creative assistant. Given a document title, write a brief description (2-3 sentences in Spanish) of what the document should contain and how it should look. Be specific about content structure and design style. Do NOT add greetings or explanations, just the description.`,
      prompt: `Document title: "${name}"\n\nWrite a brief description for this document:`,
    });

    logAiUsage(user.id, {
      type: "enhance",
      product: "document",
      modelId,
      inputTokens: usage?.inputTokens,
      outputTokens: usage?.outputTokens,
    });

    return data({ description: text.trim() });
  }

  // Enhance existing prompt
  const prompt = String(body.prompt || "").trim();

  if (!prompt) {
    return data({ error: "Prompt requerido" }, { status: 400 });
  }

  const enhanceModelId = await getAiModel("docDirections");
  const enhanceModel = resolveModelLocal(enhanceModelId);

  const { text, usage: enhanceUsage } = await generateText({
    model: enhanceModel,
    system: `You are a creative director helping a user write better instructions for an AI document generator.
The user will give you a brief description of what they want. Your job is to enhance it into a detailed, actionable prompt that will produce a beautiful, professional document.

RULES:
- Keep the user's original intent intact
- Add specific design suggestions (colors, layout, typography style)
- Suggest content structure (sections, charts, tables if relevant)
- Keep it under 3-4 sentences, concise but rich
- Write in Spanish
- Do NOT add greetings or explanations, just the improved prompt
- If the user mentions data/numbers, suggest visualizations`,
    prompt: `Document name: "${name}"
User's description: "${prompt}"

Write an enhanced version of this description:`,
  });

  logAiUsage(user.id, {
    type: "enhance",
    product: "document",
    modelId: enhanceModelId,
    inputTokens: enhanceUsage?.promptTokens,
    outputTokens: enhanceUsage?.completionTokens,
  });

  return data({ enhanced: text.trim() });
};
