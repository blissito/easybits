import { Form, redirect, useFetcher, useNavigation } from "react-router";
import { useEffect, useRef, useState } from "react";
import { generateText } from "ai";
import { createOpenAI } from "@ai-sdk/openai";
import { data } from "react-router";
import { BrutalButton } from "~/components/common/BrutalButton";
import Spinner from "~/components/common/Spinner";
import { getUserOrRedirect } from "~/.server/getters";
import { db } from "~/.server/db";
import type { Route } from "./+types/new";

export const meta = () => [
  { title: "Nueva Presentación — EasyBits" },
  { name: "robots", content: "noindex" },
];

export const action = async ({ request }: Route.ActionArgs) => {
  const user = await getUserOrRedirect(request);
  const formData = await request.formData();
  const intent = String(formData.get("intent") || "create");

  if (intent === "suggest-prompt") {
    const name = String(formData.get("name") || "").trim();
    if (!name || name.length < 3) {
      return data({ suggestion: "" });
    }

    const openai = createOpenAI({ apiKey: process.env.OPENAI_API_KEY! });
    const { text } = await generateText({
      model: openai("gpt-4o-mini"),
      system:
        "Genera una descripción breve (2-3 oraciones) para una presentación con el título dado. La descripción debe servir como prompt para un AI que generará las slides. Responde solo la descripción, sin comillas.",
      prompt: name,
    });

    return data({ suggestion: text });
  }

  const name = String(formData.get("name") || "").trim();
  const prompt = String(formData.get("prompt") || "").trim();
  const slideCount = Number(formData.get("slideCount") || 8);
  const theme = String(formData.get("theme") || "black");

  if (!name || !prompt) {
    return { error: "Nombre y prompt son requeridos" };
  }

  const presentation = await db.presentation.create({
    data: {
      name,
      prompt,
      slides: [],
      theme,
      ownerId: user.id,
    },
  });

  return redirect(
    `/dash/presentations/${presentation.id}?generating=1&slideCount=${slideCount}`
  );
};

const THEMES = [
  "black", "white", "league", "beige", "sky",
  "night", "serif", "simple", "solarized", "moon", "dracula",
];

const brutalInput =
  "w-full px-4 py-2 border-2 border-black rounded-xl bg-white transition-all duration-150 -translate-x-1 -translate-y-1 hover:-translate-x-0.5 hover:-translate-y-0.5 focus:-translate-x-0 focus:-translate-y-0 focus:outline-none";

function BrutalField({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-xl bg-black">
      {children}
    </div>
  );
}

export default function NewPresentation() {
  const navigation = useNavigation();
  const isSubmitting = navigation.state === "submitting";
  const suggestFetcher = useFetcher<{ suggestion?: string }>();
  const [nameValue, setNameValue] = useState("");
  const [promptValue, setPromptValue] = useState("");
  const lastSuggestion = useRef("");
  const debounceRef = useRef<ReturnType<typeof setTimeout>>();

  // Auto-suggest description when name changes
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);

    if (nameValue.trim().length < 3) return;

    debounceRef.current = setTimeout(() => {
      suggestFetcher.submit(
        { intent: "suggest-prompt", name: nameValue },
        { method: "post" }
      );
    }, 300);

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nameValue]);

  // Populate textarea when suggestion arrives
  useEffect(() => {
    const suggestion = suggestFetcher.data?.suggestion;
    if (!suggestion) return;

    // Only fill if empty or still showing the previous suggestion
    if (!promptValue || promptValue === lastSuggestion.current) {
      setPromptValue(suggestion);
      lastSuggestion.current = suggestion;
    }
  }, [suggestFetcher.data]); // eslint-disable-line react-hooks/exhaustive-deps

  const isSuggesting = suggestFetcher.state !== "idle";

  return (
    <article className="pt-20 px-8 pb-24 md:pl-36 w-full max-w-2xl">
      <h1 className="text-3xl font-black tracking-tight mb-8 uppercase">
        Nueva Presentación
      </h1>

      <Form method="post" className="space-y-6">
        <div>
          <label className="block text-sm font-bold mb-1">Nombre</label>
          <BrutalField>
            <input
              name="name"
              required
              placeholder="Mi presentación"
              className={brutalInput}
              value={nameValue}
              onChange={(e) => setNameValue(e.target.value)}
            />
          </BrutalField>
        </div>

        <div>
          <label className="block text-sm font-bold mb-1">
            Describe tu presentación
          </label>
          <div className="relative">
            <BrutalField>
              <textarea
                name="prompt"
                required
                rows={4}
                placeholder="Una presentación sobre inteligencia artificial para ejecutivos, enfocada en ROI y casos de uso prácticos..."
                className={`${brutalInput} resize-none ${isSuggesting ? "opacity-50" : ""}`}
                value={promptValue}
                onChange={(e) => setPromptValue(e.target.value)}
                disabled={isSuggesting}
              />
            </BrutalField>
            {isSuggesting && (
              <div className="absolute inset-0 flex items-center justify-center">
                <Spinner />
              </div>
            )}
          </div>
        </div>

        <div className="flex gap-4">
          <div className="flex-1">
            <label className="block text-sm font-bold mb-1">Slides</label>
            <BrutalField>
              <select
                name="slideCount"
                defaultValue="8"
                className={brutalInput}
              >
                <option value="3">3 slides</option>
                <option value="5">5 slides</option>
                <option value="8">8 slides</option>
                <option value="10">10 slides</option>
                <option value="12">12 slides</option>
              </select>
            </BrutalField>
          </div>

          <div className="flex-1">
            <label className="block text-sm font-bold mb-1">Tema</label>
            <BrutalField>
              <select
                name="theme"
                defaultValue="black"
                className={brutalInput}
              >
                {THEMES.map((t) => (
                  <option key={t} value={t}>
                    {t.charAt(0).toUpperCase() + t.slice(1)}
                  </option>
                ))}
              </select>
            </BrutalField>
            <p className="text-xs text-gray-500 mt-1">Puedes cambiarlo despues en el editor</p>
          </div>
        </div>

        <BrutalButton
          type="submit"
          isLoading={isSubmitting}
          isDisabled={isSubmitting}
          className="w-full"
          containerClassName="w-full"
        >
          Crear y generar con AI
        </BrutalButton>
      </Form>
    </article>
  );
}
