import { Form, redirect, useNavigation } from "react-router";
import { BrutalButton } from "~/components/common/BrutalButton";
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

export default function NewPresentation() {
  const navigation = useNavigation();
  const isSubmitting = navigation.state === "submitting";

  return (
    <article className="pt-20 px-8 pb-24 md:pl-36 w-full max-w-2xl">
      <h1 className="text-3xl font-black tracking-tight mb-8 uppercase">
        Nueva Presentación
      </h1>

      <Form method="post" className="space-y-6">
        <div>
          <label className="block text-sm font-bold mb-1">Nombre</label>
          <input
            name="name"
            required
            placeholder="Mi presentación"
            className="w-full px-4 py-2 border-2 border-black rounded-xl shadow-[3px_3px_0px_0px_rgba(0,0,0,1)] focus:outline-none focus:-translate-x-0.5 focus:-translate-y-0.5 transition-transform"
          />
        </div>

        <div>
          <label className="block text-sm font-bold mb-1">
            Describe tu presentación
          </label>
          <textarea
            name="prompt"
            required
            rows={4}
            placeholder="Una presentación sobre inteligencia artificial para ejecutivos, enfocada en ROI y casos de uso prácticos..."
            className="w-full px-4 py-2 border-2 border-black rounded-xl shadow-[3px_3px_0px_0px_rgba(0,0,0,1)] focus:outline-none focus:-translate-x-0.5 focus:-translate-y-0.5 transition-transform resize-none"
          />
        </div>

        <div className="flex gap-4">
          <div className="flex-1">
            <label className="block text-sm font-bold mb-1">Slides</label>
            <select
              name="slideCount"
              defaultValue="8"
              className="w-full px-4 py-2 border-2 border-black rounded-xl shadow-[3px_3px_0px_0px_rgba(0,0,0,1)] bg-white"
            >
              <option value="6">6 slides</option>
              <option value="8">8 slides</option>
              <option value="10">10 slides</option>
              <option value="12">12 slides</option>
            </select>
          </div>

          <div className="flex-1">
            <label className="block text-sm font-bold mb-1">Tema</label>
            <select
              name="theme"
              defaultValue="black"
              className="w-full px-4 py-2 border-2 border-black rounded-xl shadow-[3px_3px_0px_0px_rgba(0,0,0,1)] bg-white"
            >
              {THEMES.map((t) => (
                <option key={t} value={t}>
                  {t.charAt(0).toUpperCase() + t.slice(1)}
                </option>
              ))}
            </select>
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
