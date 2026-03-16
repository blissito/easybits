import { Form, Link, redirect, useNavigation } from "react-router";
import { useState } from "react";
import { data } from "react-router";
import { BrutalButton } from "~/components/common/BrutalButton";
import { getUserOrRedirect } from "~/.server/getters";
import { db } from "~/.server/db";
import type { Route } from "./+types/new";

export const meta = () => [
  { title: "Nueva Landing v4 — EasyBits" },
  { name: "robots", content: "noindex" },
];

export const action = async ({ request }: Route.ActionArgs) => {
  const user = await getUserOrRedirect(request);
  const formData = await request.formData();
  const name = String(formData.get("name") || "").trim();

  if (!name) {
    return data({ error: "El nombre es requerido" });
  }

  const landing = await db.landing.create({
    data: {
      name,
      prompt: "",
      sections: [],
      version: 5,
      ownerId: user.id,
    },
  });

  return redirect(`/dash/landings4/${landing.id}`);
};

const brutalInput =
  "w-full px-4 py-2 border-2 border-black rounded-xl bg-white transition-all duration-150 -translate-x-1 -translate-y-1 hover:-translate-x-0.5 hover:-translate-y-0.5 focus:-translate-x-0 focus:-translate-y-0 focus:outline-none";

function BrutalField({ children }: { children: React.ReactNode }) {
  return <div className="rounded-xl bg-black">{children}</div>;
}

export default function NewLanding4() {
  const navigation = useNavigation();
  const isSubmitting = navigation.state === "submitting";
  const [nameValue, setNameValue] = useState("");

  return (
    <article className="pt-20 px-8 pb-24 md:pl-36 w-full max-w-2xl">
      <div className="flex items-center gap-3 mb-8">
        <Link
          to="/dash/landings4"
          className="text-sm font-bold hover:underline"
        >
          &larr; Volver
        </Link>
        <h1 className="text-3xl font-black tracking-tight uppercase">
          Nueva Landing v4
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
              value={nameValue}
              onChange={(e) => setNameValue(e.target.value)}
              placeholder="Ej: Mi sitio web, Landing de producto..."
              className={brutalInput}
            />
          </BrutalField>
          <p className="text-xs text-gray-500 mt-1">
            Arrastra bloques predise&ntilde;ados para construir tu landing visualmente
          </p>
        </div>

        <BrutalButton
          type="submit"
          isLoading={isSubmitting}
          isDisabled={isSubmitting || !nameValue.trim()}
          className="w-full"
          containerClassName="w-full"
        >
          Crear landing
        </BrutalButton>
      </Form>
    </article>
  );
}
