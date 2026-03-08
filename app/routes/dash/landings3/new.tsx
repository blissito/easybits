import { Form, Link, redirect, useNavigation } from "react-router";
import { useState, useRef, useCallback, useEffect } from "react";
import { HiSparkles } from "react-icons/hi2";
import { data } from "react-router";
import { BrutalButton } from "~/components/common/BrutalButton";
import { getUserOrRedirect } from "~/.server/getters";
import { db } from "~/.server/db";
import type { Route } from "./+types/new";

export const meta = () => [
  { title: "Nueva Landing v3 — EasyBits" },
  { name: "robots", content: "noindex" },
];

export const action = async ({ request }: Route.ActionArgs) => {
  const user = await getUserOrRedirect(request);
  const formData = await request.formData();

  const name = String(formData.get("name") || "").trim();
  const prompt = String(formData.get("prompt") || "").trim();

  if (!name || !prompt) {
    return data({ error: "Nombre y descripción son requeridos" });
  }

  const landing = await db.landing.create({
    data: {
      name,
      prompt,
      sections: [],
      version: 3,
      ownerId: user.id,
    },
  });

  return redirect(`/dash/landings3/${landing.id}?generating=1`);
};

const brutalInput =
  "w-full px-4 py-2 border-2 border-black rounded-xl bg-white transition-all duration-150 -translate-x-1 -translate-y-1 hover:-translate-x-0.5 hover:-translate-y-0.5 focus:-translate-x-0 focus:-translate-y-0 focus:outline-none";

function BrutalField({ children }: { children: React.ReactNode }) {
  return <div className="rounded-xl bg-black">{children}</div>;
}

export default function NewLanding3() {
  const navigation = useNavigation();
  const isSubmitting = navigation.state === "submitting";
  const [referenceFile, setReferenceFile] = useState<File | null>(null);
  const [referencePreview, setReferencePreview] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const dropRef = useRef<HTMLDivElement>(null);
  const formRef = useRef<HTMLFormElement>(null);

  const handleFile = useCallback(async (file: File) => {
    if (!file.type.startsWith("image/") && file.type !== "application/pdf") return;
    if (file.size > 10 * 1024 * 1024) return;
    setReferenceFile(file);
    if (file.type.startsWith("image/")) {
      setReferencePreview(URL.createObjectURL(file));
    } else {
      setReferencePreview(null);
    }
  }, []);

  // Store reference image in sessionStorage before form submits
  useEffect(() => {
    if (navigation.state !== "submitting") return;
    if (!referenceFile || !referenceFile.type.startsWith("image/")) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        sessionStorage.setItem("landing3_refImg", reader.result as string);
      } catch { /* too large */ }
    };
    reader.readAsDataURL(referenceFile);
  }, [navigation.state, referenceFile]);

  return (
    <article className="pt-20 px-8 pb-24 md:pl-36 w-full max-w-2xl">
      <div className="flex items-center gap-3 mb-8">
        <Link
          to="/dash/landings3"
          className="text-sm font-bold hover:underline"
        >
          &larr; Volver
        </Link>
        <h1 className="text-3xl font-black tracking-tight uppercase">
          Nueva Landing v3
        </h1>
      </div>

      <Form ref={formRef} method="post" className="space-y-6">
        <div>
          <label className="block text-sm font-bold mb-1">
            Nombre de la landing
          </label>
          <BrutalField>
            <input
              name="name"
              required
              placeholder="Ej: Lanzamiento app, Evento tech..."
              className={brutalInput}
            />
          </BrutalField>
        </div>

        <div>
          <label className="block text-sm font-bold mb-1">
            &iquest;De qu&eacute; trata?
          </label>
          <BrutalField>
            <textarea
              name="prompt"
              required
              rows={4}
              placeholder="Describe tu landing con todo el detalle posible..."
              className={`${brutalInput} resize-none`}
            />
          </BrutalField>
          <p className="text-xs text-gray-500 mt-1">
            La AI generar&aacute; HTML+Tailwind con libertad creativa total
          </p>
        </div>

        {/* Reference image / document */}
        <div>
          <label className="block text-sm font-bold mb-1">
            Imagen o documento de referencia
            <span className="font-normal text-gray-400 ml-1">(opcional)</span>
          </label>
          <div
            ref={dropRef}
            onClick={() => fileInputRef.current?.click()}
            onDragOver={(e) => {
              e.preventDefault();
              e.stopPropagation();
              dropRef.current?.classList.add("border-brand-500", "bg-brand-50");
            }}
            onDragLeave={(e) => {
              e.preventDefault();
              dropRef.current?.classList.remove("border-brand-500", "bg-brand-50");
            }}
            onDrop={(e) => {
              e.preventDefault();
              e.stopPropagation();
              dropRef.current?.classList.remove("border-brand-500", "bg-brand-50");
              const file = e.dataTransfer.files[0];
              if (file) handleFile(file);
            }}
            className="relative cursor-pointer border-2 border-dashed border-gray-300 rounded-xl p-6 text-center transition-colors hover:border-gray-400 hover:bg-gray-50"
          >
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*,.pdf"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) handleFile(file);
              }}
            />
            {referenceFile ? (
              <div className="flex items-center gap-3">
                {referencePreview ? (
                  <img
                    src={referencePreview}
                    alt="Referencia"
                    className="w-20 h-20 object-cover rounded-lg border border-gray-200"
                  />
                ) : (
                  <div className="w-20 h-20 rounded-lg bg-gray-100 flex items-center justify-center text-2xl">
                    &#128196;
                  </div>
                )}
                <div className="text-left flex-1">
                  <p className="text-sm font-bold truncate">{referenceFile.name}</p>
                  <p className="text-xs text-gray-400">
                    {(referenceFile.size / 1024).toFixed(0)} KB
                  </p>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      setReferenceFile(null);
                      setReferencePreview(null);
                    }}
                    className="text-xs text-red-500 font-bold mt-1 hover:underline"
                  >
                    Quitar
                  </button>
                </div>
              </div>
            ) : (
              <>
                <div className="text-3xl mb-2 text-gray-300">&#128247;</div>
                <p className="text-sm text-gray-500">
                  Arrastra una imagen o PDF, o haz clic para subir
                </p>
                <p className="text-xs text-gray-400 mt-1">
                  La AI usar&aacute; esta referencia para replicar el dise&ntilde;o
                </p>
              </>
            )}
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
