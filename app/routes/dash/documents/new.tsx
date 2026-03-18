import { Form, Link, redirect, useNavigation, useNavigate, useLoaderData } from "react-router";
import { useState, useRef, useCallback, useEffect } from "react";
import { HiSparkles } from "react-icons/hi2";
import { data } from "react-router";
import { BrutalButton } from "~/components/common/BrutalButton";
import { getUserOrRedirect } from "~/.server/getters";
import toast from "react-hot-toast";

import { parseFiles, combineContent, combineContentWithMeta, renderPdfPages, MAX_FILE_SIZE, MAX_CONTENT_CHARS } from "~/lib/documents/parseFiles";
import { db } from "~/.server/db";
import type { Route } from "./+types/new";

export const meta = () => [
  { title: "Nuevo Documento — EasyBits" },
  { name: "robots", content: "noindex" },
];

export const loader = async ({ request }: Route.LoaderArgs) => {
  const user = await getUserOrRedirect(request);
  const brandKits = await db.brandKit.findMany({
    where: { ownerId: user.id },
    orderBy: { createdAt: "desc" },
  });
  return { brandKits };
};

export const action = async ({ request }: Route.ActionArgs) => {
  await getUserOrRedirect(request);
  // We don't create the Landing here — the directions page creates it after user picks a style
  // Just validate and redirect
  const formData = await request.formData();
  const name = String(formData.get("name") || "").trim();

  if (!name) {
    return data({ error: "El nombre es requerido" });
  }

  // Form data is passed via sessionStorage on the client side (see component below)
  return redirect("/dash/documents/directions");
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

const ACCEPTED_TYPES = ".txt,.md,.csv,.xlsx,.xls,.docx,.pdf,image/*";

type FileRole = "content" | "design";

function getDefaultRole(file: File): FileRole {
  const ext = file.name.split(".").pop()?.toLowerCase() || "";
  if (["png", "jpg", "jpeg", "webp", "svg", "gif"].includes(ext) || file.type.startsWith("image/")) return "design";
  return "content";
}

function isRoleToggleable(file: File): boolean {
  const ext = file.name.split(".").pop()?.toLowerCase() || "";
  return ext === "pdf";
}

function isImageFile(file: File): boolean {
  const ext = file.name.split(".").pop()?.toLowerCase() || "";
  return ["png", "jpg", "jpeg", "webp", "svg", "gif"].includes(ext) || file.type.startsWith("image/");
}

export default function NewDocument() {
  const { brandKits } = useLoaderData<typeof loader>();
  const navigation = useNavigation();
  const navigate = useNavigate();
  const isSubmitting = navigation.state === "submitting";
  const [nameValue, setNameValue] = useState("");
  const [promptValue, setPromptValue] = useState("");
  const [selectedKitId, setSelectedKitId] = useState<string | null>(null);
  const [files, setFiles] = useState<File[]>([]);
  const [fileRoles, setFileRoles] = useState<Map<number, FileRole>>(new Map());
  const [parsedContent, setParsedContent] = useState("");
  const [isParsing, setIsParsing] = useState(false);
  const [fileErrors, setFileErrors] = useState<string[]>([]);
  const [isTruncated, setIsTruncated] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const dropRef = useRef<HTMLDivElement>(null);

  // Logo state
  const [pageCount, setPageCount] = useState(4);
  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [logoPreview, setLogoPreview] = useState<string | null>(null);
  const [logoDataUrl, setLogoDataUrl] = useState("");
  const logoInputRef = useRef<HTMLInputElement>(null);

  const [isEnhancing, setIsEnhancing] = useState(false);
  const [isAutoDescribing, setIsAutoDescribing] = useState(false);
  const autoDescribeTimer = useRef<ReturnType<typeof setTimeout>>(null);
  const lastAutoDescribedName = useRef("");
  const promptWasManuallyEdited = useRef(false);

  // Design reference state (computed from design-role files)
  const [referenceDataUrl, setReferenceDataUrl] = useState("");
  const [pdfReferencePages, setPdfReferencePages] = useState<string[]>([]);
  const [isRenderingRef, setIsRenderingRef] = useState(false);

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

  // Process design-role files into referenceDataUrl / pdfReferencePages
  const designFiles = files.filter((_, i) => (fileRoles.get(i) ?? getDefaultRole(files[i])) === "design");
  useEffect(() => {
    if (designFiles.length === 0) {
      setReferenceDataUrl("");
      setPdfReferencePages([]);
      return;
    }
    let cancelled = false;
    setIsRenderingRef(true);

    (async () => {
      const allPages: string[] = [];
      let firstDataUrl = "";

      for (const file of designFiles) {
        if (cancelled) break;
        if (file.name.toLowerCase().endsWith(".pdf")) {
          try {
            const pages = await renderPdfPages(file, { maxPages: 20, scale: 1.5 });
            allPages.push(...pages);
            if (!firstDataUrl && pages.length > 0) firstDataUrl = pages[0];
          } catch (err) {
            console.error("PDF render error:", err);
          }
        } else {
          try {
            const dataUrl = await resizeImageToDataUrl(file, 1024);
            allPages.push(dataUrl);
            if (!firstDataUrl) firstDataUrl = dataUrl;
          } catch (err) {
            console.error("Image resize error:", err);
          }
        }
      }

      if (!cancelled) {
        setPdfReferencePages(allPages);
        setReferenceDataUrl(firstDataUrl);
      }
    })().finally(() => { if (!cancelled) setIsRenderingRef(false); });

    return () => { cancelled = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [files, fileRoles]);

  // Auto-describe from title (debounced)
  useEffect(() => {
    if (autoDescribeTimer.current) clearTimeout(autoDescribeTimer.current);
    const trimmed = nameValue.trim();
    // Only auto-describe if: name has 3+ chars, prompt is empty, and we haven't already described this name
    if (trimmed.length < 3 || promptWasManuallyEdited.current || lastAutoDescribedName.current === trimmed) return;

    autoDescribeTimer.current = setTimeout(async () => {
      if (lastAutoDescribedName.current === trimmed) return;
      setIsAutoDescribing(true);
      try {
        const res = await fetch("/api/v2/document-enhance", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ _action: "auto-describe", name: trimmed }),
        });
        const json = await res.json();
        if (json.description) {
          setPromptValue(json.description);
          lastAutoDescribedName.current = trimmed;
        }
      } catch {}
      setIsAutoDescribing(false);
    }, 800);

    return () => { if (autoDescribeTimer.current) clearTimeout(autoDescribeTimer.current); };
  }, [nameValue]); // intentionally only nameValue — we check promptValue inside

  const handleFiles = useCallback(
    async (newFiles: FileList | File[]) => {
      const fileArray = Array.from(newFiles).filter((f) => {
        const ext = f.name.split(".").pop()?.toLowerCase() || "";
        return ["txt", "md", "csv", "xlsx", "xls", "docx", "pdf", "png", "jpg", "jpeg", "webp", "svg", "gif"].includes(ext) || f.type.startsWith("image/");
      });
      if (fileArray.length === 0) return;

      const allFiles = [...files, ...fileArray];
      setFiles(allFiles);

      // Assign default roles for new files
      setFileRoles((prev) => {
        const next = new Map(prev);
        fileArray.forEach((f, i) => {
          const idx = files.length + i;
          next.set(idx, getDefaultRole(f));
        });
        return next;
      });

      // Parse content-role files only
      const contentFiles = allFiles.filter((f, i) => {
        const role = i < files.length
          ? (fileRoles.get(i) ?? getDefaultRole(f))
          : getDefaultRole(f);
        return role === "content";
      });

      if (contentFiles.length > 0) {
        setIsParsing(true);
        try {
          const parsed = await parseFiles(contentFiles);
          const meta = combineContentWithMeta(parsed);
          setParsedContent(combineContent(parsed));
          setIsTruncated(meta.truncated);
          setFileErrors(
            parsed.filter((f) => f.error).map((f) => `${f.name}: ${f.error}`)
          );
        } catch (err) {
          console.error("Parse error:", err);
        } finally {
          setIsParsing(false);
        }
      }

      // Auto-set name from first file if empty
      if (!nameValue && fileArray.length > 0) {
        const firstName = fileArray[0].name.replace(/\.[^.]+$/, "");
        setNameValue(firstName);
      }
    },
    [files, fileRoles, nameValue]
  );

  function removeFile(index: number) {
    const updated = files.filter((_, i) => i !== index);
    // Rebuild roles map with shifted indices
    const newRoles = new Map<number, FileRole>();
    let j = 0;
    for (let i = 0; i < files.length; i++) {
      if (i === index) continue;
      newRoles.set(j, fileRoles.get(i) ?? getDefaultRole(files[i]));
      j++;
    }
    setFiles(updated);
    setFileRoles(newRoles);

    // Re-parse content files
    const contentFiles = updated.filter((f, i) => (newRoles.get(i) ?? getDefaultRole(f)) === "content");
    if (contentFiles.length === 0) {
      setParsedContent("");
      setFileErrors([]);
      setIsTruncated(false);
    } else {
      parseFiles(contentFiles).then((parsed) => {
        const meta = combineContentWithMeta(parsed);
        setParsedContent(combineContent(parsed));
        setIsTruncated(meta.truncated);
        setFileErrors(parsed.filter((f) => f.error).map((f) => `${f.name}: ${f.error}`));
      });
    }
  }

  function toggleRole(index: number) {
    const current = fileRoles.get(index) ?? getDefaultRole(files[index]);
    const next: FileRole = current === "content" ? "design" : "content";
    setFileRoles((prev) => {
      const m = new Map(prev);
      m.set(index, next);
      return m;
    });

    // Re-parse content files with updated roles
    const contentFiles = files.filter((f, i) => {
      const role = i === index ? next : (fileRoles.get(i) ?? getDefaultRole(f));
      return role === "content";
    });
    if (contentFiles.length === 0) {
      setParsedContent("");
      setFileErrors([]);
      setIsTruncated(false);
    } else {
      parseFiles(contentFiles).then((parsed) => {
        const meta = combineContentWithMeta(parsed);
        setParsedContent(combineContent(parsed));
        setIsTruncated(meta.truncated);
        setFileErrors(parsed.filter((f) => f.error).map((f) => `${f.name}: ${f.error}`));
      });
    }
  }

  return (
    <article className="pt-20 px-4 sm:px-8 pb-24 mx-auto w-full max-w-2xl">
      <div className="flex items-center gap-2 sm:gap-3 mb-6 sm:mb-8 flex-wrap">
        <Link
          to="/dash/documents"
          className="text-sm font-bold hover:underline"
        >
          &larr; Volver
        </Link>
        <h1 className="text-2xl sm:text-3xl font-black tracking-tight uppercase">
          Nuevo Documento
        </h1>
      </div>

      <form className="space-y-6" onSubmit={(e) => {
        e.preventDefault();
        if (!nameValue.trim()) return;
        const selectedKit = brandKits.find((k: any) => k.id === selectedKitId);
        sessionStorage.removeItem("doc-directions-cache");
        sessionStorage.setItem("doc-new", JSON.stringify({
          name: nameValue,
          prompt: promptValue,
          sourceContent: parsedContent,
          logoDataUrl: selectedKit?.logoUrl || logoDataUrl,
          pageCount,
          referenceDataUrl,
          referencePages: pdfReferencePages.length > 0 ? pdfReferencePages : undefined,
          brandKit: selectedKit ? {
            colors: selectedKit.colors,
            fonts: selectedKit.fonts,
            mood: selectedKit.mood,
          } : undefined,
        }));
        if (selectedKit) {
          // Skip directions — go straight to create
          navigate("/dash/documents/directions?useBrandKit=1");
        } else {
          navigate("/dash/documents/directions");
        }
      }}>
        {/* Hidden fields */}
        <input type="hidden" name="sourceContent" value={parsedContent} />
        <input type="hidden" name="logoDataUrl" value={logoDataUrl} />
        <input type="hidden" name="pageCount" value={pageCount} />

        {/* Unified file upload zone */}
        <div>
          <label className="block text-sm font-bold mb-1">
            Archivos
            <span className="font-normal text-gray-400 ml-1">
              (contenido y/o referencias de dise&ntilde;o)
            </span>
          </label>

          {files.length === 0 ? (
            <div
              ref={dropRef}
              onClick={() => fileInputRef.current?.click()}
              onDragOver={(e) => {
                e.preventDefault();
                dropRef.current?.classList.add("border-brand-500", "bg-brand-50");
              }}
              onDragLeave={(e) => {
                e.preventDefault();
                dropRef.current?.classList.remove("border-brand-500", "bg-brand-50");
              }}
              onDrop={(e) => {
                e.preventDefault();
                dropRef.current?.classList.remove("border-brand-500", "bg-brand-50");
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
                    Sube contenido y/o referencias de dise&ntilde;o &mdash; la AI combina todo
                  </p>
                </>
              )}
            </div>
          ) : (
            <div className="space-y-2">
              {files.map((f, i) => {
                const role = fileRoles.get(i) ?? getDefaultRole(f);
                const toggleable = isRoleToggleable(f);
                const isImg = isImageFile(f);
                return (
                  <div
                    key={`${f.name}-${i}`}
                    className={`flex items-center gap-3 px-3 py-2 rounded-lg border ${
                      role === "design"
                        ? "bg-purple-50 border-purple-200"
                        : "bg-gray-50 border-gray-200"
                    }`}
                  >
                    <span className="text-lg">
                      {isImg
                        ? "\u{1F5BC}"
                        : f.name.endsWith(".pdf")
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
                    {/* Role badge */}
                    {toggleable ? (
                      <button
                        type="button"
                        onClick={() => toggleRole(i)}
                        className={`text-xs font-bold px-2 py-0.5 rounded-full border transition-colors ${
                          role === "design"
                            ? "bg-purple-100 text-purple-700 border-purple-300 hover:bg-purple-200"
                            : "bg-gray-100 text-gray-600 border-gray-300 hover:bg-gray-200"
                        }`}
                      >
                        {role === "design" ? "Dise\u00f1o \u25BE" : "Contenido \u25BE"}
                      </button>
                    ) : (
                      <span
                        className={`text-xs font-bold px-2 py-0.5 rounded-full ${
                          role === "design"
                            ? "bg-purple-100 text-purple-700"
                            : "bg-gray-100 text-gray-500"
                        }`}
                      >
                        {role === "design" ? "Dise\u00f1o" : "Contenido"}
                      </span>
                    )}
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
                );
              })}

              {/* Design reference thumbnail strip */}
              {pdfReferencePages.length > 0 && (
                <div className="flex gap-2 overflow-x-auto pb-1 pt-1">
                  {pdfReferencePages.slice(0, 8).map((dataUrl, i) => (
                    <img key={i} src={dataUrl} alt={`Ref ${i + 1}`} className="w-16 h-20 object-cover rounded border border-purple-200 shrink-0" />
                  ))}
                  {pdfReferencePages.length > 8 && (
                    <div className="w-16 h-20 rounded border border-purple-200 bg-purple-100 flex items-center justify-center text-xs font-bold text-purple-500 shrink-0">
                      +{pdfReferencePages.length - 8}
                    </div>
                  )}
                </div>
              )}
              {isRenderingRef && (
                <p className="text-xs text-gray-500 flex items-center gap-1">
                  <span className="inline-block w-3 h-3 border-2 border-gray-200 border-t-brand-500 rounded-full animate-spin" />
                  Renderizando referencias de dise&ntilde;o...
                </p>
              )}

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

        {/* Logo */}
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
          <div className="flex items-center justify-between mb-1">
            <label className="block text-sm font-bold">
              Instrucciones para la AI
              <span className="font-normal text-gray-400 ml-1">(opcional)</span>
              {isAutoDescribing && (
                <span className="inline-flex items-center gap-1 ml-2 text-xs font-normal text-gray-400">
                  <span className="inline-block w-3 h-3 border-2 border-gray-200 border-t-brand-500 rounded-full animate-spin" />
                  Generando...
                </span>
              )}
            </label>
            {promptValue.trim() && (
              <BrutalButton
                type="button"
                size="chip"
                mode="ghost"
                isLoading={isEnhancing}
                isDisabled={isEnhancing}
                onClick={async () => {
                  setIsEnhancing(true);
                  try {
                    const res = await fetch("/api/v2/document-enhance", {
                      method: "POST",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({ prompt: promptValue, name: nameValue }),
                    });
                    const json = await res.json();
                    if (json.enhanced) setPromptValue(json.enhanced);
                    else toast.error(json.error || "Error al mejorar");
                  } catch {
                    toast.error("Error al mejorar descripcion");
                  } finally {
                    setIsEnhancing(false);
                  }
                }}
              >
                <HiSparkles className="inline -mt-0.5" /> Mejorar
              </BrutalButton>
            )}
          </div>
          <BrutalField>
            <textarea
              name="prompt"
              rows={8}
              disabled={isAutoDescribing}
              value={promptValue}
              onChange={(e) => { setPromptValue(e.target.value); promptWasManuallyEdited.current = true; }}
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

        {/* Brand Kit selector */}
        {brandKits.length > 0 && (
          <div>
            <label className="block text-sm font-bold mb-1">
              Usar Brand Kit
              <span className="font-normal text-gray-400 ml-1">(opcional — salta la seleccion de estilo)</span>
            </label>
            <div className="flex gap-2 flex-wrap">
              {brandKits.map((kit: any) => (
                <button
                  key={kit.id}
                  type="button"
                  onClick={() => setSelectedKitId(selectedKitId === kit.id ? null : kit.id)}
                  className={`flex items-center gap-2 px-3 py-2 rounded-xl border-2 transition-all text-sm font-bold ${
                    selectedKitId === kit.id
                      ? "border-brand-500 bg-brand-50 -translate-x-0.5 -translate-y-0.5 shadow-[3px_3px_0_#9870ED]"
                      : "border-gray-300 bg-white hover:border-black"
                  }`}
                >
                  <span className="flex gap-0.5">
                    {["primary", "secondary", "accent", "surface"].map((c) => (
                      <span
                        key={c}
                        className="w-3 h-3 rounded-sm border border-gray-200"
                        style={{ backgroundColor: (kit.colors as any)?.[c] }}
                      />
                    ))}
                  </span>
                  {kit.name}
                  {kit.isDefault && <span className="text-brand-500 text-xs">&#9733;</span>}
                </button>
              ))}
            </div>
          </div>
        )}

        <BrutalButton
          type="submit"
          isLoading={isSubmitting}
          isDisabled={isSubmitting || !nameValue.trim()}
          className="w-full"
          containerClassName="w-full"
        >
          <HiSparkles className="inline -mt-0.5" /> {selectedKitId ? "Crear con Brand Kit" : "Generar documento"}
        </BrutalButton>
      </form>
    </article>
  );
}
