import { useState } from "react";
import {
  useLoaderData,
  useFetcher,
  Link,
  useNavigate,
  data,
} from "react-router";
import { BrutalButton } from "~/components/common/BrutalButton";
import { getUserOrRedirect } from "~/.server/getters";
import { db } from "~/.server/db";
import {
  getBook,
  createBook,
  addChapter,
  deleteChapter,
  updateBook,
} from "~/.server/core/bookOperations";
import { createChaptersFromChunks } from "~/.server/core/bookOperations";
import { chunkByChapters } from "~/lib/books/chunkByChapters";
import { LANDING_THEMES, type CustomColors } from "@easybits.cloud/html-tailwind-generator";
import type { Route } from "./+types/book-editor";

export const meta = () => [
  { title: "Editor de Libro — EasyBits" },
  { name: "robots", content: "noindex" },
];

const LANGUAGES = [
  { code: "auto", label: "Auto-detectar" },
  { code: "en", label: "Inglés" },
  { code: "es", label: "Español" },
  { code: "fr", label: "Francés" },
  { code: "de", label: "Alemán" },
  { code: "it", label: "Italiano" },
  { code: "pt", label: "Portugués" },
];

const TARGET_LANGUAGES = LANGUAGES.filter((l) => l.code !== "auto");

export const loader = async ({ params, request }: Route.LoaderArgs) => {
  const user = await getUserOrRedirect(request);
  const asset = await db.asset.findUnique({ where: { id: params.assetId } });
  if (!asset || asset.userId !== user.id || asset.type !== "EBOOK") {
    throw new Response("Not found", { status: 404 });
  }
  const book = await getBook(params.assetId, user.id);
  return { asset, book };
};

export const action = async ({ params, request }: Route.ActionArgs) => {
  const user = await getUserOrRedirect(request);
  const asset = await db.asset.findUnique({ where: { id: params.assetId } });
  if (!asset || asset.userId !== user.id || asset.type !== "EBOOK") {
    return data({ error: "No encontrado" }, { status: 404 });
  }

  const formData = await request.formData();
  const intent = formData.get("intent");

  if (intent === "setup-book") {
    const sourceText = String(formData.get("sourceText") || "");
    const sourceLanguage = String(formData.get("sourceLanguage") || "auto");
    const targetLanguage = String(formData.get("targetLanguage") || "es");

    if (!sourceText.trim()) {
      return data({ error: "El texto no puede estar vacío" }, { status: 400 });
    }

    const chunks = chunkByChapters(sourceText);
    const book = await createBook({
      assetId: params.assetId,
      userId: user.id,
      sourceText,
      sourceLanguage: sourceLanguage === "auto" ? undefined : sourceLanguage,
      targetLanguage,
    });
    await createChaptersFromChunks(book.id, chunks);
    return data({ ok: true });
  }

  if (intent === "add-chapter") {
    const book = await getBook(params.assetId, user.id);
    if (!book) return data({ error: "Libro no encontrado" }, { status: 404 });
    const title = String(formData.get("title") || `Capítulo ${book.chapters.length + 1}`);
    await addChapter(book.id, user.id, { title });
    return data({ ok: true });
  }

  if (intent === "rename-chapter") {
    const chapterId = String(formData.get("chapterId"));
    const title = String(formData.get("title") || "");
    if (!title.trim()) return data({ error: "Título vacío" }, { status: 400 });
    const chapter = await db.bookChapter.findUnique({
      where: { id: chapterId },
      include: { book: { include: { asset: true } } },
    });
    if (!chapter || chapter.book.asset.userId !== user.id) {
      return data({ error: "No encontrado" }, { status: 404 });
    }
    await db.bookChapter.update({
      where: { id: chapterId },
      data: { title: title.trim() },
    });
    return data({ ok: true });
  }

  if (intent === "delete-chapter") {
    const chapterId = String(formData.get("chapterId"));
    await deleteChapter(chapterId, user.id);
    return data({ ok: true });
  }

  if (intent === "update-theme") {
    const theme = String(formData.get("theme") || "default");
    const customColorsRaw = formData.get("customColors");
    const updateData: { theme: string; customColors?: any } = { theme };
    if (customColorsRaw) {
      try {
        updateData.customColors = JSON.parse(String(customColorsRaw));
      } catch {}
    }
    await updateBook(params.assetId, user.id, updateData);
    return data({ ok: true });
  }

  return data({ error: "Intent desconocido" }, { status: 400 });
};

export default function BookEditor() {
  const { asset, book } = useLoaderData<typeof loader>();
  const fetcher = useFetcher();
  const navigate = useNavigate();

  if (!book) {
    return <SetupView assetId={asset.id} assetTitle={asset.title} />;
  }

  return (
    <ChapterIndexView
      asset={asset}
      book={book}
    />
  );
}

/* ─── State A: Setup ─── */
function SetupView({
  assetId,
  assetTitle,
}: {
  assetId: string;
  assetTitle: string;
}) {
  const fetcher = useFetcher();
  const [sourceText, setSourceText] = useState("");
  const [sourceLanguage, setSourceLanguage] = useState("auto");
  const [targetLanguage, setTargetLanguage] = useState("es");
  const isSubmitting = fetcher.state !== "idle";

  return (
    <article className="pt-20 px-4 sm:px-8 pb-24 md:pl-36 w-full max-w-3xl mx-auto">
      <Link
        to={`/dash/assets/${assetId}/edit`}
        className="text-sm font-bold hover:underline mb-6 inline-block"
      >
        &larr; Volver a {assetTitle}
      </Link>

      <div className="border-2 border-black rounded-xl shadow-[4px_4px_0_0_rgba(0,0,0,1)] bg-white p-6 sm:p-8">
        <h1 className="text-2xl sm:text-3xl font-black tracking-tight mb-2">
          Prepara tu libro
        </h1>
        <p className="text-sm text-gray-500 mb-6">
          Pega tu texto y la AI lo convierte en un libro profesional
        </p>

        <fetcher.Form method="post">
          <input type="hidden" name="intent" value="setup-book" />

          <div className="mb-4">
            <label className="block text-sm font-bold mb-1">
              Texto fuente
            </label>
            <textarea
              name="sourceText"
              value={sourceText}
              onChange={(e) => setSourceText(e.target.value)}
              rows={16}
              placeholder="Pega aquí el texto de tu libro..."
              className="w-full px-4 py-3 border-2 border-black rounded-xl resize-y focus:outline-none text-sm font-mono"
              required
            />
            <p className="text-xs text-gray-400 mt-1">
              {sourceText.length.toLocaleString()} caracteres
              {sourceText.trim() &&
                ` · ~${chunkByChapters(sourceText).length} capítulos detectados`}
            </p>
          </div>

          <div className="grid grid-cols-2 gap-4 mb-6">
            <div>
              <label className="block text-sm font-bold mb-1">
                Idioma origen
              </label>
              <select
                name="sourceLanguage"
                value={sourceLanguage}
                onChange={(e) => setSourceLanguage(e.target.value)}
                className="w-full px-3 py-2 border-2 border-black rounded-xl text-sm font-bold focus:outline-none"
              >
                {LANGUAGES.map((l) => (
                  <option key={l.code} value={l.code}>
                    {l.label}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-bold mb-1">
                Idioma destino
              </label>
              <select
                name="targetLanguage"
                value={targetLanguage}
                onChange={(e) => setTargetLanguage(e.target.value)}
                className="w-full px-3 py-2 border-2 border-black rounded-xl text-sm font-bold focus:outline-none"
              >
                {TARGET_LANGUAGES.map((l) => (
                  <option key={l.code} value={l.code}>
                    {l.label}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {(fetcher.data as any)?.error && (
            <p className="text-sm font-bold text-red-600 mb-4">
              {(fetcher.data as any).error}
            </p>
          )}

          <BrutalButton
            type="submit"
            isLoading={isSubmitting}
            isDisabled={!sourceText.trim() || isSubmitting}
          >
            Preparar libro
          </BrutalButton>
        </fetcher.Form>
      </div>
    </article>
  );
}

/* ─── State B: Chapter index ─── */
function ChapterIndexView({
  asset,
  book,
}: {
  asset: any;
  book: any;
}) {
  const fetcher = useFetcher();
  const navigate = useNavigate();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState("");
  const [showThemes, setShowThemes] = useState(false);

  const theme = book.theme || "default";
  const chapters = book.chapters || [];

  function handleRename(chapterId: string, title: string) {
    fetcher.submit(
      { intent: "rename-chapter", chapterId, title },
      { method: "post" }
    );
  }

  function handleDelete(chapterId: string) {
    if (!confirm("¿Eliminar este capítulo?")) return;
    fetcher.submit(
      { intent: "delete-chapter", chapterId },
      { method: "post" }
    );
  }

  function handleAddChapter() {
    fetcher.submit({ intent: "add-chapter" }, { method: "post" });
  }

  function handleThemeChange(themeId: string) {
    fetcher.submit(
      { intent: "update-theme", theme: themeId },
      { method: "post" }
    );
    setShowThemes(false);
  }

  const statusColors: Record<string, string> = {
    draft:
      "bg-gray-100 border-gray-300 text-gray-500",
    translated:
      "bg-blue-50 border-blue-300 text-blue-700",
    reviewed:
      "bg-green-50 border-green-300 text-green-700",
  };

  const statusLabels: Record<string, string> = {
    draft: "Borrador",
    translated: "Traducido",
    reviewed: "Revisado",
  };

  return (
    <article className="pt-20 px-4 sm:px-8 pb-24 md:pl-36 w-full max-w-4xl mx-auto">
      <Link
        to={`/dash/assets/${asset.id}/edit`}
        className="text-sm font-bold hover:underline mb-6 inline-block"
      >
        &larr; Volver a {asset.title}
      </Link>

      {/* Header */}
      <div className="flex items-center justify-between mb-6 gap-3">
        <div>
          <h1 className="text-2xl sm:text-3xl font-black tracking-tight">
            {asset.title}
          </h1>
          <p className="text-sm text-gray-500 mt-1">
            {chapters.length} {chapters.length === 1 ? "capítulo" : "capítulos"}
            {book.targetLanguage && ` · Idioma destino: ${book.targetLanguage.toUpperCase()}`}
          </p>
        </div>

        {/* Theme picker */}
        <div className="relative">
          <button
            onClick={() => setShowThemes((p) => !p)}
            className="text-xs font-bold text-brand-600 hover:underline flex items-center gap-1 border-2 border-black rounded-lg px-3 py-1.5 bg-white shadow-[2px_2px_0_0_rgba(0,0,0,1)] hover:shadow-[3px_3px_0_0_rgba(0,0,0,1)] hover:-translate-x-0.5 hover:-translate-y-0.5 transition-all"
          >
            Tema:{" "}
            {(() => {
              const t = LANDING_THEMES.find((t) => t.id === theme);
              return t ? t.label : theme;
            })()}
          </button>
          {showThemes && (
            <div className="absolute right-0 top-full mt-1 w-44 bg-white border-2 border-black rounded-xl shadow-[4px_4px_0_#000] z-50 py-1">
              {LANDING_THEMES.map((t) => (
                <button
                  key={t.id}
                  onClick={() => handleThemeChange(t.id)}
                  className={`w-full text-left px-3 py-1.5 text-xs font-bold flex items-center gap-2 hover:bg-gray-50 ${
                    theme === t.id ? "bg-brand-50 text-brand-700" : ""
                  }`}
                >
                  <span className="flex gap-0.5 shrink-0">
                    <span
                      className="w-2.5 h-2.5 rounded-sm"
                      style={{ backgroundColor: t.colors.primary }}
                    />
                    <span
                      className="w-2.5 h-2.5 rounded-sm"
                      style={{ backgroundColor: t.colors.accent }}
                    />
                  </span>
                  {t.label}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Chapters table */}
      <div className="border-2 border-black rounded-xl shadow-[4px_4px_0_0_rgba(0,0,0,1)] bg-white overflow-hidden">
        {chapters.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12">
            <p className="text-gray-400 text-sm mb-4">
              No hay capítulos aún
            </p>
            <BrutalButton onClick={handleAddChapter}>
              + Agregar capítulo
            </BrutalButton>
          </div>
        ) : (
          <div className="divide-y divide-gray-200">
            {chapters.map((ch: any, idx: number) => {
              const sections = Array.isArray(ch.sections) ? ch.sections : [];
              return (
                <div
                  key={ch.id}
                  className="flex items-center gap-3 px-4 py-3 hover:bg-gray-50 transition-colors group cursor-pointer"
                  onClick={() =>
                    navigate(
                      `/dash/assets/${asset.id}/book-editor/${ch.id}`
                    )
                  }
                >
                  {/* Drag handle (visual only) */}
                  <span className="text-gray-300 cursor-grab select-none text-sm shrink-0">
                    &#9776;
                  </span>

                  {/* Chapter number */}
                  <span className="text-xs font-mono text-gray-400 w-6 text-right shrink-0">
                    {idx + 1}
                  </span>

                  {/* Title */}
                  <div
                    className="flex-1 min-w-0"
                    onClick={(e) => e.stopPropagation()}
                    onDoubleClick={() => {
                      setEditingId(ch.id);
                      setEditTitle(ch.title);
                    }}
                  >
                    {editingId === ch.id ? (
                      <input
                        autoFocus
                        value={editTitle}
                        onChange={(e) => setEditTitle(e.target.value)}
                        onBlur={() => {
                          if (editTitle.trim()) handleRename(ch.id, editTitle.trim());
                          setEditingId(null);
                        }}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") {
                            if (editTitle.trim()) handleRename(ch.id, editTitle.trim());
                            setEditingId(null);
                          }
                          if (e.key === "Escape") setEditingId(null);
                        }}
                        className="w-full px-2 py-0.5 border-2 border-black rounded-lg text-sm font-bold focus:outline-none"
                      />
                    ) : (
                      <span className="text-sm font-bold truncate block">
                        {ch.title}
                      </span>
                    )}
                  </div>

                  {/* Status badge */}
                  <span
                    className={`shrink-0 px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider border ${
                      statusColors[ch.status] || statusColors.draft
                    }`}
                  >
                    {statusLabels[ch.status] || ch.status}
                  </span>

                  {/* Page count */}
                  <span className="text-xs text-gray-400 shrink-0 w-16 text-right">
                    {sections.length}{" "}
                    {sections.length === 1 ? "pág" : "págs"}
                  </span>

                  {/* Delete */}
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      handleDelete(ch.id);
                    }}
                    className="shrink-0 w-7 h-7 flex items-center justify-center rounded-lg text-gray-300 hover:text-red-500 hover:bg-red-50 transition-colors opacity-0 group-hover:opacity-100"
                    title="Eliminar capítulo"
                  >
                    &times;
                  </button>
                </div>
              );
            })}
          </div>
        )}

        {/* Add chapter button */}
        {chapters.length > 0 && (
          <div className="border-t border-gray-200 px-4 py-3">
            <button
              onClick={handleAddChapter}
              className="text-sm font-bold text-brand-600 hover:underline"
            >
              + Agregar capítulo
            </button>
          </div>
        )}
      </div>
    </article>
  );
}
