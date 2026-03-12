import { data } from "react-router";
import { generateText } from "ai";
import { getUserOrRedirect } from "~/.server/getters";
import { resolveModelLocal, getAiModel } from "~/.server/aiModels";
import type { Route } from "./+types/document-enhance";

export const action = async ({ request }: Route.ActionArgs) => {
  const user = await getUserOrRedirect(request);
  const body = await request.json();
  const prompt = String(body.prompt || "").trim();
  const name = String(body.name || "").trim();

  if (!prompt) {
    return data({ error: "Prompt requerido" }, { status: 400 });
  }

  const modelId = await getAiModel("docDirections");
  const model = resolveModelLocal(modelId);

  const { text } = await generateText({
    model,
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

  return data({ enhanced: text.trim() });
};
