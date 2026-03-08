import { useState, useRef, useEffect } from "react";
import { HiSparkles } from "react-icons/hi2";
import type { IframeMessage } from "~/lib/landing3/types";

interface FloatingToolbarProps {
  selection: IframeMessage | null;
  iframeRect: DOMRect | null;
  onRefine: (instruction: string) => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
  onDelete: () => void;
  onClose: () => void;
  onViewCode: () => void;
  isRefining: boolean;
}

export function FloatingToolbar({
  selection,
  iframeRect,
  onRefine,
  onMoveUp,
  onMoveDown,
  onDelete,
  onClose,
  onViewCode,
  isRefining,
}: FloatingToolbarProps) {
  const [prompt, setPrompt] = useState("");
  const [showCode, setShowCode] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const toolbarRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setPrompt("");
    setShowCode(false);
  }, [selection?.sectionId]);

  // ESC closes toolbar
  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [onClose]);

  if (!selection || !selection.rect || !iframeRect) return null;

  const top = iframeRect.top + selection.rect.top + selection.rect.height + 8;
  const left = iframeRect.left + selection.rect.left;
  // Clamp so toolbar doesn't go offscreen
  const clampedLeft = Math.max(8, Math.min(left, window.innerWidth - 400));
  // If below viewport, show above element
  const showAbove = top + 60 > window.innerHeight;
  const finalTop = showAbove
    ? iframeRect.top + selection.rect.top - 56
    : top;

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!prompt.trim() || isRefining) return;
    onRefine(prompt.trim());
    setPrompt("");
  }

  return (
    <div
      ref={toolbarRef}
      className="fixed z-50 flex items-center gap-1.5 bg-gray-900 text-white rounded-xl shadow-2xl px-2 py-1.5 border border-gray-700"
      style={{ top: finalTop, left: clampedLeft }}
    >
      {/* Tag badge */}
      {selection.tagName && (
        <span className="px-2 py-0.5 rounded-md bg-blue-600 text-[10px] font-mono font-bold uppercase tracking-wider">
          {selection.tagName.toLowerCase()}
        </span>
      )}

      {/* AI prompt input */}
      <form onSubmit={handleSubmit} className="flex items-center gap-1 flex-1">
        <input
          ref={inputRef}
          type="text"
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          placeholder="Editar con AI..."
          disabled={isRefining}
          className="bg-transparent text-sm text-white placeholder:text-gray-500 outline-none w-40 md:w-56 px-2 py-1"
        />
        <button
          type="submit"
          disabled={!prompt.trim() || isRefining}
          className="w-7 h-7 flex items-center justify-center rounded-lg bg-brand-500 hover:bg-brand-600 disabled:opacity-30 transition-colors"
        >
          {isRefining ? (
            <span className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
          ) : (
            <HiSparkles className="w-3.5 h-3.5" />
          )}
        </button>
      </form>

      {/* Divider */}
      <div className="w-px h-5 bg-gray-700" />

      {/* Section-level actions: move up/down, delete — only when clicking the section wrapper itself */}
      {selection.isSectionRoot && (
        <>
          <button
            onClick={onMoveUp}
            className="w-7 h-7 flex items-center justify-center rounded-lg hover:bg-gray-800 transition-colors text-xs"
            title="Mover arriba"
          >
            ↑
          </button>
          <button
            onClick={onMoveDown}
            className="w-7 h-7 flex items-center justify-center rounded-lg hover:bg-gray-800 transition-colors text-xs"
            title="Mover abajo"
          >
            ↓
          </button>
        </>
      )}

      {/* View code */}
      <button
        onClick={onViewCode}
        className="w-7 h-7 flex items-center justify-center rounded-lg hover:bg-gray-800 transition-colors text-xs font-mono text-gray-400 hover:text-white"
        title="Ver código"
      >
        &lt;/&gt;
      </button>

      {selection.isSectionRoot && (
        <>
          <div className="w-px h-5 bg-gray-700" />
          <button
            onClick={onDelete}
            className="w-7 h-7 flex items-center justify-center rounded-lg hover:bg-red-900/50 text-red-400 transition-colors"
            title="Eliminar sección"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="3 6 5 6 21 6" />
              <path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2" />
            </svg>
          </button>
        </>
      )}
    </div>
  );
}
