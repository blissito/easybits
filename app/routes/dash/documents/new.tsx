import { Form, Link, redirect, useNavigation } from "react-router";
import { useState, useRef, useCallback, useEffect } from "react";
import { HiSparkles } from "react-icons/hi2";
import { data } from "react-router";
import { BrutalButton } from "~/components/common/BrutalButton";
import { getUserOrRedirect } from "~/.server/getters";
import { db } from "~/.server/db";

import { parseFiles, combineContent, combineContentWithMeta, MAX_FILE_SIZE, MAX_CONTENT_CHARS } from "~/lib/documents/parseFiles";
import type { Route } from "./+types/new";

export const meta = () => [
  { title: "Nuevo Documento — EasyBits" },
  { name: "robots", content: "noindex" },
];

export const action = async ({ request }: Route.ActionArgs) => {
  const user = await getUserOrRedirect(request);
  const formData = await request.formData();
  const name = String(formData.get("name") || "").trim();
  const prompt = String(formData.get("prompt") || "").trim();
  const sourceContent = String(formData.get("sourceContent") || "").trim();
  const logoDataUrl = String(formData.get("logoDataUrl") || "").trim();
  const pageCount = Math.min(20, Math.max(1, Number(formData.get("pageCount")) || 5));

  if (!name) {
    return data({ error: "El nombre es requerido" });
  }

  const metadata: Record<string, unknown> = {};
  if (sourceContent) metadata.sourceContent = sourceContent;

  const landing = await db.landing.create({
    data: {
      name,
      prompt:
        prompt ||
        "Transforma este contenido en un documento profesional con diseño atractivo",
      sections: [],
      version: 4,
      ownerId: user.id,
      metadata,
    },
  });

  // Store logo as data URL directly in metadata (avoids Tigris 403 issues)
  if (logoDataUrl) {
    metadata.logoUrl = logoDataUrl;
    await db.landing.update({
      where: { id: landing.id },
      data: { metadata },
    });
  }

  return redirect(`/dash/documents/${landing.id}?generating=1&pages=${pageCount}`);
};

const brutalInput =
  "w-full px-4 py-2 border-2 border-black rounded-xl bg-white transition-all duration-150 -translate-x-1 -translate-y-1 hover:-translate-x-0.5 hover:-translate-y-0.5 focus:-translate-x-0 focus:-translate-y-0 focus:outline-none";

function BrutalField({ children }: { children: React.ReactNode }) {
  return <div className="rounded-xl bg-black">{children}</div>;
}

/** Resize image to max dimension and return data URL (JPEG, ~80% quality) */
function resizeImageToDataUrl(file: File, maxDim: number): Promise<string> {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        let { width, height } = img;
        if (width <= maxDim && height <= maxDim && file.size < 1024 * 1024) {
          resolve(reader.result as string);
          return;
        }
        const scale = Math.min(maxDim / width, maxDim / height, 1);
        width = Math.round(width * scale);
        height = Math.round(height * scale);
        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;
        canvas.getContext("2d")!.drawImage(img, 0, 0, width, height);
        resolve(canvas.toDataURL("image/jpeg", 0.8));
      };
      img.src = reader.result as string;
    };
    reader.readAsDataURL(file);
  });
}

const ACCEPTED_TYPES = ".txt,.md,.csv,.xlsx,.xls,.docx,.pdf";

export default function NewDocument() {
  const navigation = useNavigation();
  const isSubmitting = navigation.state === "submitting";
  const [nameValue, setNameValue] = useState("");
  const [promptValue, setPromptValue] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [parsedContent, setParsedContent] = useState("");
  const [isParsing, setIsParsing] = useState(false);
  const [fileErrors, setFileErrors] = useState<string[]>([]);
  const [isTruncated, setIsTruncated] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const dropRef = useRef<HTMLDivElement>(null);

  // Logo state
  const [pageCount, setPageCount] = useState(5);
  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [logoPreview, setLogoPreview] = useState<string | null>(null);
  const [logoDataUrl, setLogoDataUrl] = useState("");
  const logoInputRef = useRef<HTMLInputElement>(null);

  // Convert logo to data URL for passing to AI
  useEffect(() => {
    if (!logoFile) {
      setLogoDataUrl("");
      setLogoPreview(null);
      return;
    }
    const url = URL.createObjectURL(logoFile);
    setLogoPreview(url);

    resizeImageToDataUrl(logoFile, 512).then(setLogoDataUrl);

    return () => URL.revokeObjectURL(url);
  }, [logoFile]);

  const handleFiles = useCallback(
    async (newFiles: FileList | File[]) => {
      const fileArray = Array.from(newFiles).filter((f) => {
        const ext = f.name.split(".").pop()?.toLowerCase() || "";
        return ["txt", "md", "csv", "xlsx", "xls", "docx", "pdf"].includes(
          ext
        );
      });
      if (fileArray.length === 0) return;

      setIsParsing(true);
      const allFiles = [...files, ...fileArray];
      setFiles(allFiles);

      try {
        const parsed = await parseFiles(allFiles);
        const meta = combineContentWithMeta(parsed);
        setParsedContent(combineContent(parsed));
        setIsTruncated(meta.truncated);
        setFileErrors(
          parsed
            .filter((f) => f.error)
            .map((f) => `${f.name}: ${f.error}`)
        );

        // Auto-set name from first file if empty
        if (!nameValue && fileArray.length > 0) {
          const firstName = fileArray[0].name.replace(/\.[^.]+$/, "");
          setNameValue(firstName);
        }
      } catch (err) {
        console.error("Parse error:", err);
      } finally {
        setIsParsing(false);
      }
    },
    [files, nameValue]
  );

  function removeFile(index: number) {
    const updated = files.filter((_, i) => i !== index);
    setFiles(updated);
    if (updated.length === 0) {
      setParsedContent("");
    } else {
      parseFiles(updated).then((parsed) => {
        setParsedContent(combineContent(parsed));
      });
    }
  }

  return (
    <article className="pt-20 px-8 pb-24 mx-auto w-full max-w-2xl">
      <div className="flex items-center gap-3 mb-8">
        <Link
          to="/dash/documents"
          className="text-sm font-bold hover:underline"
        >
          &larr; Volver
        </Link>
        <h1 className="text-3xl font-black tracking-tight uppercase">
          Nuevo Documento
        </h1>
      </div>

      <Form method="post" className="space-y-6">
        {/* Hidden fields */}
        <input type="hidden" name="sourceContent" value={parsedContent} />
        <input type="hidden" name="logoDataUrl" value={logoDataUrl} />
        <input type="hidden" name="pageCount" value={pageCount} />

        {/* File upload zone */}
        <div>
          <label className="block text-sm font-bold mb-1">
            Archivos fuente
            <span className="font-normal text-gray-400 ml-1">
              (txt, md, docx, csv, xlsx, pdf)
            </span>
          </label>

          {files.length === 0 ? (
            <div
              ref={dropRef}
              onClick={() => fileInputRef.current?.click()}
              onDragOver={(e) => {
                e.preventDefault();
                dropRef.current?.classList.add(
                  "border-brand-500",
                  "bg-brand-50"
                );
              }}
              onDragLeave={(e) => {
                e.preventDefault();
                dropRef.current?.classList.remove(
                  "border-brand-500",
                  "bg-brand-50"
                );
              }}
              onDrop={(e) => {
                e.preventDefault();
                dropRef.current?.classList.remove(
                  "border-brand-500",
                  "bg-brand-50"
                );
                handleFiles(e.dataTransfer.files);
              }}
              className="relative cursor-pointer border-2 border-dashed border-gray-300 rounded-xl p-8 text-center transition-colors hover:border-gray-400 hover:bg-gray-50"
            >
              <input
                ref={fileInputRef}
                type="file"
                accept={ACCEPTED_TYPES}
                multiple
                className="hidden"
                onChange={(e) => {
                  if (e.target.files) handleFiles(e.target.files);
                }}
              />
              {isParsing ? (
                <div className="flex flex-col items-center gap-2">
                  <span className="block w-6 h-6 border-[3px] border-gray-200 border-t-brand-500 rounded-full animate-spin" />
                  <p className="text-sm text-gray-500">Leyendo archivos...</p>
                </div>
              ) : (
                <>
                  <div className="text-4xl mb-2 text-gray-300">&#128206;</div>
                  <p className="text-sm text-gray-500">
                    Arrastra archivos aqu&iacute; o haz clic para seleccionar
                  </p>
                  <p className="text-xs text-gray-400 mt-1">
                    Puedes mezclar formatos &mdash; la AI combina todo en un
                    documento hermoso
                  </p>
                </>
              )}
            </div>
          ) : (
            /* File list — replace drop zone once files are added */
            <div className="space-y-2">
              {files.map((f, i) => (
                <div
                  key={`${f.name}-${i}`}
                  className="flex items-center gap-3 px-3 py-2 bg-gray-50 rounded-lg border border-gray-200"
                >
                  <span className="text-lg">
                    {f.name.endsWith(".pdf")
                      ? "\u{1F4C4}"
                      : f.name.endsWith(".docx")
                        ? "\u{1F4DD}"
                        : f.name.match(/\.(xlsx|xls|csv)$/)
                          ? "\u{1F4CA}"
                          : "\u{1F4C3}"}
                  </span>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-bold truncate">{f.name}</p>
                    <p className="text-xs text-gray-400">
                      {(f.size / 1024).toFixed(0)} KB
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      removeFile(i);
                    }}
                    className="text-xs text-red-500 font-bold hover:underline"
                  >
                    Quitar
                  </button>
                </div>
              ))}
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="w-full py-2 text-sm font-bold text-brand-600 border-2 border-dashed border-gray-300 rounded-lg hover:border-brand-400 hover:bg-brand-50 transition-colors"
              >
                + Agregar m&aacute;s archivos
              </button>
              <input
                ref={fileInputRef}
                type="file"
                accept={ACCEPTED_TYPES}
                multiple
                className="hidden"
                onChange={(e) => {
                  if (e.target.files) handleFiles(e.target.files);
                }}
              />
            </div>
          )}
        </div>

        {/* Logo upload */}
        <div>
          <label className="block text-sm font-bold mb-1">
            Logo
            <span className="font-normal text-gray-400 ml-1">(opcional)</span>
          </label>
          <div className="flex items-center gap-4">
            {logoPreview ? (
              <div className="relative group">
                <img
                  src={logoPreview}
                  alt="Logo"
                  className="w-16 h-16 object-contain rounded-lg border-2 border-gray-200 bg-white p-1"
                />
                <button
                  type="button"
                  onClick={() => setLogoFile(null)}
                  className="absolute -top-2 -right-2 w-5 h-5 bg-red-500 text-white rounded-full text-xs font-black flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                >
                  &times;
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => logoInputRef.current?.click()}
                className="w-16 h-16 border-2 border-dashed border-gray-300 rounded-lg flex flex-col items-center justify-center text-gray-400 hover:border-gray-400 hover:bg-gray-50 transition-colors cursor-pointer"
              >
                <svg
                  width="20"
                  height="20"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                >
                  <rect x="3" y="3" width="18" height="18" rx="2" />
                  <circle cx="8.5" cy="8.5" r="1.5" />
                  <polyline points="21 15 16 10 5 21" />
                </svg>
              </button>
            )}
            <div className="text-xs text-gray-500">
              {logoPreview ? (
                <p className="font-bold text-gray-700">{logoFile?.name}</p>
              ) : (
                <p>
                  La AI incluir&aacute; tu logo en la portada y encabezados
                </p>
              )}
            </div>
          </div>
          <input
            ref={logoInputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file && file.type.startsWith("image/")) {
                setLogoFile(file);
              }
            }}
          />
        </div>

        <div>
          <label className="block text-sm font-bold mb-1">
            Nombre del documento
          </label>
          <BrutalField>
            <input
              name="name"
              required
              value={nameValue}
              onChange={(e) => setNameValue(e.target.value)}
              placeholder="Ej: Cotización Q1 2026, Reporte Mensual..."
              className={brutalInput}
            />
          </BrutalField>
        </div>

        <div>
          <label className="block text-sm font-bold mb-1">
            Instrucciones para la AI
            <span className="font-normal text-gray-400 ml-1">(opcional)</span>
          </label>
          <BrutalField>
            <textarea
              name="prompt"
              rows={4}
              value={promptValue}
              onChange={(e) => setPromptValue(e.target.value)}
              placeholder="Ej: Hazlo con estilo corporativo azul, agrega gráficas para los datos numéricos, incluye portada y tabla de contenido..."
              className={`${brutalInput} resize-none`}
            />
          </BrutalField>
          <p className="text-xs text-gray-500 mt-1">
            La AI crear&aacute; p&aacute;ginas tama&ntilde;o carta con
            dise&ntilde;o profesional
          </p>
        </div>

        {/* File errors */}
        {fileErrors.length > 0 && (
          <div className="bg-red-50 border border-red-200 rounded-xl p-3 text-xs text-red-700 space-y-1">
            {fileErrors.map((err, i) => (
              <p key={i}>{err}</p>
            ))}
          </div>
        )}

        {/* Content preview */}
        {parsedContent && (
          <div>
            <label className="block text-sm font-bold mb-1">
              Contenido detectado
              <span className="font-normal text-gray-400 ml-1">
                ({parsedContent.length.toLocaleString()} caracteres)
              </span>
            </label>
            {isTruncated && (
              <div className="bg-amber-50 border border-amber-200 rounded-xl p-2.5 text-xs text-amber-700 mb-2">
                Tu contenido tiene {parsedContent.length.toLocaleString()} caracteres. La AI usar&aacute; los primeros {MAX_CONTENT_CHARS.toLocaleString()} para la generaci&oacute;n.
              </div>
            )}
            <div className="max-h-40 overflow-auto bg-gray-50 border border-gray-200 rounded-xl p-3 text-xs text-gray-600 font-mono whitespace-pre-wrap">
              {parsedContent.substring(0, 2000)}
              {parsedContent.length > 2000 && "\n\n... (contenido truncado en vista previa)"}
            </div>
          </div>
        )}

        {/* Page count selector */}
        <div>
          <label className="block text-sm font-bold mb-1">
            Numero de paginas
          </label>
          <div className="flex items-center gap-3">
            <input
              type="range"
              min={1}
              max={20}
              value={pageCount}
              onChange={(e) => setPageCount(Number(e.target.value))}
              className="flex-1 accent-brand-500"
            />
            <span className="text-lg font-black tabular-nums w-8 text-center">{pageCount}</span>
          </div>
          <p className="text-xs text-gray-500 mt-1">
            La AI generara aproximadamente {pageCount} {pageCount === 1 ? "pagina" : "paginas"} tamano carta
          </p>
        </div>

        <BrutalButton
          type="submit"
          isLoading={isSubmitting}
          isDisabled={isSubmitting || !nameValue.trim()}
          className="w-full"
          containerClassName="w-full"
        >
          <HiSparkles className="inline -mt-0.5" /> Generar documento
        </BrutalButton>
      </Form>
    </article>
  );
}
