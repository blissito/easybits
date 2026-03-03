import { Form, Link, redirect, useNavigation } from "react-router";
import { useState } from "react";
import { HiSparkles } from "react-icons/hi2";
import { data } from "react-router";
import { BrutalButton } from "~/components/common/BrutalButton";
import { getUserOrRedirect } from "~/.server/getters";
import { db } from "~/.server/db";
import { LANDING_THEMES } from "~/lib/landingCatalog";
import type { Route } from "./+types/new";

export const meta = () => [
  { title: "Nueva Landing — EasyBits" },
  { name: "robots", content: "noindex" },
];

export const action = async ({ request }: Route.ActionArgs) => {
  const user = await getUserOrRedirect(request);
  const formData = await request.formData();

  const name = String(formData.get("name") || "").trim();
  const prompt = String(formData.get("prompt") || "").trim();
  const theme = String(formData.get("theme") || "modern");

  if (!name || !prompt) {
    return data({ error: "Nombre y descripción son requeridos" });
  }

  const landing = await db.landing.create({
    data: {
      name,
      prompt,
      sections: [],
      theme,
      ownerId: user.id,
    },
  });

  return redirect(`/dash/landings/${landing.id}?generating=1`);
};

const brutalInput =
  "w-full px-4 py-2 border-2 border-black rounded-xl bg-white transition-all duration-150 -translate-x-1 -translate-y-1 hover:-translate-x-0.5 hover:-translate-y-0.5 focus:-translate-x-0 focus:-translate-y-0 focus:outline-none";

function BrutalField({ children }: { children: React.ReactNode }) {
  return <div className="rounded-xl bg-black">{children}</div>;
}

export default function NewLanding() {
  const navigation = useNavigation();
  const isSubmitting = navigation.state === "submitting";
  const [selectedTheme, setSelectedTheme] = useState("modern");

  return (
    <article className="pt-20 px-8 pb-24 md:pl-36 w-full max-w-2xl">
      <div className="flex items-center gap-3 mb-8">
        <Link
          to="/dash/landings"
          className="text-sm font-bold hover:underline"
        >
          &larr; Volver
        </Link>
        <h1 className="text-3xl font-black tracking-tight uppercase">
          Nueva Landing
        </h1>
      </div>

      <Form method="post" className="space-y-6">
        <div>
          <label className="block text-sm font-bold mb-1">
            Nombre de la landing
          </label>
          <BrutalField>
            <input
              name="name"
              required
              placeholder="Ej: Lanzamiento app, Evento tech, Mi portafolio..."
              className={brutalInput}
            />
          </BrutalField>
        </div>

        <div>
          <label className="block text-sm font-bold mb-1">
            ¿De qué trata?
          </label>
          <BrutalField>
            <textarea
              name="prompt"
              required
              rows={4}
              placeholder="Describe tu landing: un evento, un producto, una comunidad, un portafolio, una promoción..."
              className={`${brutalInput} resize-none`}
            />
          </BrutalField>
          <p className="text-xs text-gray-500 mt-1">
            Sé lo más específico posible para obtener mejor contenido
          </p>
        </div>

        <div>
          <label className="block text-sm font-bold mb-2">Estilo</label>
          <input type="hidden" name="theme" value={selectedTheme} />
          <div className="flex gap-2 overflow-x-auto pb-2 -mx-1 px-1">
            {LANDING_THEMES.map((theme) => (
              <button
                key={theme.id}
                type="button"
                onClick={() => setSelectedTheme(theme.id)}
                className={`shrink-0 w-20 rounded-lg p-1.5 transition-all border-2 ${
                  selectedTheme === theme.id
                    ? "border-brand-500 ring-2 ring-brand-500"
                    : "border-transparent hover:border-gray-300"
                }`}
              >
                <div
                  className="h-8 rounded-md mb-1 flex items-end"
                  style={{ background: theme.bg, border: `1px solid ${theme.text}20` }}
                >
                  <div
                    className="h-2 w-full rounded-b-md"
                    style={{ background: theme.accent }}
                  />
                </div>
                <span className="text-[10px] font-bold truncate block text-center">
                  {theme.name}
                </span>
              </button>
            ))}
          </div>
        </div>

        <BrutalButton
          type="submit"
          isLoading={isSubmitting}
          isDisabled={isSubmitting}
          className="w-full"
          containerClassName="w-full"
        >
          <HiSparkles className="inline -mt-0.5" /> Crear y generar con AI
        </BrutalButton>
      </Form>
    </article>
  );
}
