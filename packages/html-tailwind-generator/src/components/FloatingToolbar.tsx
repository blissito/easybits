import React, { useState, useRef, useEffect } from "react";
import { HiSparkles } from "react-icons/hi2";
import type { IframeMessage } from "../types";

const STYLE_PRESETS = [
  { label: "Minimal", icon: "○", instruction: "Redisena esta seccion con estetica minimal: mucho espacio en blanco, tipografia limpia, sin bordes ni sombras innecesarias. Manten el mismo contenido." },
  { label: "Cards", icon: "▦", instruction: "Redisena esta seccion usando layout de cards en grid: cada item en su propia card con padding, sombra sutil y bordes redondeados. Manten el mismo contenido." },
  { label: "Bold", icon: "■", instruction: "Redisena esta seccion con estilo bold/brutalist: tipografia grande y gruesa, colores de alto contraste, bordes solidos, sin gradientes. Manten el mismo contenido." },
  { label: "Glass", icon: "◇", instruction: "Redisena esta seccion con glassmorphism: fondos translucidos con backdrop-blur, bordes sutiles blancos, sombras suaves. Usa un fondo oscuro o con gradiente detras. Manten el mismo contenido." },
  { label: "Dark", icon: "●", instruction: "Redisena esta seccion con fondo oscuro (#111 o similar), texto claro, acentos de color vibrantes. Manten el mismo contenido." },
];

interface FloatingToolbarProps {
  selection: IframeMessage | null;
  iframeRect: DOMRect | null;
  onRefine: (instruction: string, referenceImage?: string) => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
  onDelete: () => void;
  onClose: () => void;
  onViewCode: () => void;
  onUpdateAttribute?: (sectionId: string, elementPath: string, attr: string, value: string) => void;
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
  onUpdateAttribute,
  isRefining,
}: FloatingToolbarProps) {
  const [prompt, setPrompt] = useState("");
  const [showCode, setShowCode] = useState(false);
  const [refImage, setRefImage] = useState<string | null>(null);
  const [refImageName, setRefImageName] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const toolbarRef = useRef<HTMLDivElement>(null);

  // Local attr editing state
  const [imgSrc, setImgSrc] = useState("");
  const [imgAlt, setImgAlt] = useState("");
  const [linkHref, setLinkHref] = useState("");

  useEffect(() => {
    setPrompt("");
    setShowCode(false);
    setRefImage(null);
    setRefImageName(null);
  }, [selection?.sectionId]);

  // Sync attr inputs when selection changes
  useEffect(() => {
    if (selection?.attrs) {
      setImgSrc(selection.attrs.src || "");
      setImgAlt(selection.attrs.alt || "");
      setLinkHref(selection.attrs.href || "");
    }
  }, [selection?.attrs, selection?.elementPath]);

  // ESC closes toolbar
  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [onClose]);

  if (!selection || !selection.rect || !iframeRect) return null;

  const toolbarWidth = toolbarRef.current?.offsetWidth || 600;
  const toolbarHeight = toolbarRef.current?.offsetHeight || 60;
  const top = iframeRect.top + selection.rect.top + selection.rect.height + 8;
  const left = iframeRect.left + selection.rect.left;
  const clampedLeft = Math.max(8, Math.min(left, window.innerWidth - toolbarWidth - 8));
  const showAbove = top + toolbarHeight + 8 > window.innerHeight;
  const finalTop = Math.max(8, showAbove
    ? iframeRect.top + selection.rect.top - toolbarHeight - 8
    : top);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!prompt.trim() || isRefining) return;
    onRefine(prompt.trim(), refImage || undefined);
    setPrompt("");
    setRefImage(null);
    setRefImageName(null);
  }

  function handleFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setRefImageName(file.name);

    const img = new Image();
    img.onload = () => {
      const MAX = 1024;
      let { width, height } = img;
      if (width > MAX || height > MAX) {
        const ratio = Math.min(MAX / width, MAX / height);
        width = Math.round(width * ratio);
        height = Math.round(height * ratio);
      }
      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      canvas.getContext("2d")!.drawImage(img, 0, 0, width, height);
      canvas.toBlob(
        (blob) => {
          if (!blob) return;
          const reader = new FileReader();
          reader.onload = () => setRefImage(reader.result as string);
          reader.readAsDataURL(blob);
        },
        "image/jpeg",
        0.7
      );
      URL.revokeObjectURL(img.src);
    };
    img.src = URL.createObjectURL(file);
    e.target.value = "";
  }

  function handleSetAttr(attr: string, value: string) {
    if (!selection?.sectionId || !selection?.elementPath || !onUpdateAttribute) return;
    onUpdateAttribute(selection.sectionId, selection.elementPath, attr, value);
  }

  const isImg = selection.tagName === "IMG";
  const isLink = selection.tagName === "A";
  const hasAttrEditing = (isImg || isLink) && onUpdateAttribute;

  return (
    <div
      ref={toolbarRef}
      className="fixed z-50 flex flex-col gap-1.5 bg-gray-900 text-white rounded-xl shadow-2xl px-2 py-1.5 border border-gray-700"
      style={{ top: finalTop, left: clampedLeft, maxWidth: "min(600px, calc(100vw - 16px))" }}
    >
      {/* Main row */}
      <div className="flex items-center gap-1.5">
        {/* Tag badge */}
        {selection.tagName && (
          <span className="px-2 py-0.5 rounded-md bg-blue-600 text-[10px] font-mono font-bold uppercase tracking-wider shrink-0">
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
            placeholder={refImage ? "Instruccion + imagen..." : "Editar con AI..."}
            disabled={isRefining}
            className="bg-transparent text-sm text-white placeholder:text-gray-500 outline-none min-w-[10rem] flex-1 px-2 py-1"
          />
          {/* Submit button */}
          <button
            type="submit"
            disabled={!prompt.trim() || isRefining}
            className="w-7 h-7 flex items-center justify-center rounded-lg bg-blue-500 hover:bg-blue-600 disabled:opacity-30 transition-colors shrink-0"
          >
            {isRefining ? (
              <span className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
            ) : (
              <HiSparkles className="w-3.5 h-3.5" />
            )}
          </button>
          {/* Image attach button */}
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={isRefining}
            className={`w-7 h-7 flex items-center justify-center rounded-lg transition-colors shrink-0 ${
              refImage
                ? "bg-blue-600 text-white"
                : "hover:bg-gray-800 text-gray-400 hover:text-white"
            }`}
            title={refImage ? `Imagen: ${refImageName}` : "Adjuntar imagen de referencia"}
          >
            <svg className="w-3.5 h-3.5" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M1 5.25A2.25 2.25 0 013.25 3h13.5A2.25 2.25 0 0119 5.25v9.5A2.25 2.25 0 0116.75 17H3.25A2.25 2.25 0 011 14.75v-9.5zm1.5 5.81V14.75c0 .414.336.75.75.75h13.5a.75.75 0 00.75-.75v-2.06l-2.22-2.22a.75.75 0 00-1.06 0L8.56 16.1l-3.28-3.28a.75.75 0 00-1.06 0l-1.72 1.72zm12-4.06a1.5 1.5 0 11-3 0 1.5 1.5 0 013 0z" clipRule="evenodd"/>
            </svg>
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            onChange={handleFileSelect}
            className="hidden"
          />
        </form>

        {/* Variante button */}
        <div className="w-px h-5 bg-gray-700" />
        <button
          onClick={() => {
            const tag = selection.tagName?.toLowerCase();
            const text = selection.text?.substring(0, 80);
            const prompt = selection.isSectionRoot
              ? "Genera una variante completamente diferente de esta seccion. Manten el mismo contenido/informacion pero cambia radicalmente el layout, la estructura visual, y el estilo. Sorprendeme con un diseno creativo e inesperado."
              : `Modifica SOLO el elemento <${tag}> que contiene "${text}". Genera una variante visual diferente de ESE elemento (diferente estilo, layout, tipografia). NO modifiques ningun otro elemento de la seccion.`;
            onRefine(prompt, refImage || undefined);
          }}
          disabled={isRefining}
          className="px-2.5 py-1 text-[11px] font-bold rounded-lg bg-blue-600 hover:bg-blue-500 disabled:opacity-30 transition-colors whitespace-nowrap shrink-0"
          title="Generar variante"
        >
          ✦ Variante
        </button>

        {/* Section-level actions (move/delete) */}
        {selection.isSectionRoot && (
          <>
            <div className="w-px h-5 bg-gray-700" />
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
          title="Ver codigo"
        >
          &lt;/&gt;
        </button>

        {selection.isSectionRoot && (
          <>
            <div className="w-px h-5 bg-gray-700" />
            <button
              onClick={onDelete}
              className="w-7 h-7 flex items-center justify-center rounded-lg hover:bg-red-900/50 text-red-400 transition-colors"
              title="Eliminar seccion"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="3 6 5 6 21 6" />
                <path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2" />
              </svg>
            </button>
          </>
        )}

        {/* Close button */}
        <div className="w-px h-5 bg-gray-700" />
        <button
          onClick={onClose}
          className="w-7 h-7 flex items-center justify-center rounded-lg hover:bg-gray-800 text-gray-400 hover:text-white transition-colors"
          title="Cerrar (ESC)"
        >
          ✕
        </button>
      </div>

      {/* Reference image preview */}
      {refImage && (
        <div className="flex items-center gap-2 pt-0.5 pb-0.5 border-t border-gray-700/50">
          <img src={refImage} alt="Referencia" className="w-10 h-10 rounded object-cover border border-gray-600" />
          <span className="text-[10px] text-gray-400 truncate flex-1">{refImageName}</span>
          <button
            onClick={() => { setRefImage(null); setRefImageName(null); }}
            className="text-[10px] text-gray-500 hover:text-white px-1"
          >
            ✕
          </button>
        </div>
      )}

      {/* Style presets row — only for section roots */}
      {selection.isSectionRoot && (
        <div className="flex items-center gap-1 pt-0.5 pb-0.5 border-t border-gray-700/50">
          <span className="text-[10px] text-gray-500 uppercase tracking-wider mr-1 shrink-0">Estilo</span>
          {STYLE_PRESETS.map((preset) => (
            <button
              key={preset.label}
              onClick={() => onRefine(preset.instruction)}
              disabled={isRefining}
              className="px-2 py-0.5 text-[11px] font-medium rounded-md bg-gray-800 hover:bg-gray-700 disabled:opacity-30 transition-colors whitespace-nowrap"
              title={preset.label}
            >
              <span className="mr-1">{preset.icon}</span>
              {preset.label}
            </button>
          ))}
        </div>
      )}

      {/* Image attr editing */}
      {isImg && hasAttrEditing && (
        <div className="flex flex-col gap-1 pt-0.5 pb-0.5 border-t border-gray-700/50">
          <div className="flex items-center gap-1">
            <span className="text-[10px] text-gray-500 uppercase tracking-wider w-8 shrink-0">src</span>
            <input
              type="text"
              value={imgSrc}
              onChange={(e) => setImgSrc(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") handleSetAttr("src", imgSrc); }}
              className="flex-1 bg-gray-800 text-xs text-white rounded px-2 py-1 outline-none min-w-0"
              placeholder="URL de imagen..."
            />
            <button
              onClick={() => handleSetAttr("src", imgSrc)}
              className="px-2 py-1 text-[10px] font-bold rounded bg-blue-500 hover:bg-blue-600 transition-colors shrink-0"
            >
              Set
            </button>
          </div>
          <div className="flex items-center gap-1">
            <span className="text-[10px] text-gray-500 uppercase tracking-wider w-8 shrink-0">alt</span>
            <input
              type="text"
              value={imgAlt}
              onChange={(e) => setImgAlt(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") handleSetAttr("alt", imgAlt); }}
              className="flex-1 bg-gray-800 text-xs text-white rounded px-2 py-1 outline-none min-w-0"
              placeholder="Alt text..."
            />
            <button
              onClick={() => handleSetAttr("alt", imgAlt)}
              className="px-2 py-1 text-[10px] font-bold rounded bg-blue-500 hover:bg-blue-600 transition-colors shrink-0"
            >
              Set
            </button>
          </div>
        </div>
      )}

      {/* Link attr editing */}
      {isLink && hasAttrEditing && (
        <div className="flex items-center gap-1 pt-0.5 pb-0.5 border-t border-gray-700/50">
          <span className="text-[10px] text-gray-500 uppercase tracking-wider w-8 shrink-0">href</span>
          <input
            type="text"
            value={linkHref}
            onChange={(e) => setLinkHref(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") handleSetAttr("href", linkHref); }}
            className="flex-1 bg-gray-800 text-xs text-white rounded px-2 py-1 outline-none min-w-0"
            placeholder="URL del enlace..."
          />
          <button
            onClick={() => handleSetAttr("href", linkHref)}
            className="px-2 py-1 text-[10px] font-bold rounded bg-blue-500 hover:bg-blue-600 transition-colors shrink-0"
          >
            Set
          </button>
        </div>
      )}
    </div>
  );
}
