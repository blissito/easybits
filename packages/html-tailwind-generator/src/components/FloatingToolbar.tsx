import React, { useState, useRef, useEffect } from "react";
import { HiSparkles } from "react-icons/hi2";
import type { IframeMessage } from "../types";
import type { LandingTheme } from "../themes";

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
  onChangeTag?: (sectionId: string, elementPath: string, newTag: string) => void;
  onReplaceClass?: (sectionId: string, elementPath: string, removePrefixes: string[], addClass: string) => void;
  onDeleteElement?: (sectionId: string, elementPath: string) => void;
  isRefining: boolean;
  hideStylePresets?: boolean;
  themeColors?: LandingTheme["colors"];
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
  onChangeTag,
  onReplaceClass,
  onDeleteElement,
  isRefining,
  hideStylePresets,
  themeColors,
}: FloatingToolbarProps) {
  const [prompt, setPrompt] = useState("");
  const [showCode, setShowCode] = useState(false);
  const [refImage, setRefImage] = useState<string | null>(null);
  const [refImageName, setRefImageName] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const toolbarRef = useRef<HTMLDivElement>(null);

  const [showTagPicker, setShowTagPicker] = useState(false);

  // Local attr editing state
  const [imgSrc, setImgSrc] = useState("");
  const [imgAlt, setImgAlt] = useState("");
  const [linkHref, setLinkHref] = useState("");

  useEffect(() => {
    setPrompt("");
    setShowCode(false);
    setRefImage(null);
    setRefImageName(null);
    setShowTagPicker(false);
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

  function handleReplaceClass(removePrefixes: string[], addClass: string) {
    if (!selection?.sectionId || !selection?.elementPath || !onReplaceClass) return;
    onReplaceClass(selection.sectionId, selection.elementPath, removePrefixes, addClass);
  }

  // Determine size presets based on element type
  const sizePresets = (() => {
    if (!onReplaceClass || !selection.tagName) return null;
    const tag = selection.tagName.toUpperCase();
    const CONTAINERS = ["DIV", "SECTION", "ARTICLE", "ASIDE", "HEADER", "FOOTER", "NAV", "MAIN"];
    const TEXT_TAGS = ["H1", "H2", "H3", "H4", "H5", "H6", "P", "SPAN", "BLOCKQUOTE"];
    const currentClasses = (selection.className || "").split(/\s+/);

    if (CONTAINERS.includes(tag)) {
      const RESP = ["sm:", "md:", "lg:", "xl:", "2xl:"];
      const BASE_W = ["w-full", "w-auto", "w-screen", "w-1/2", "w-1/3", "w-2/3", "w-1/4", "w-3/4", "w-1/5", "w-2/5", "w-3/5", "w-4/5"];
      const BASE_MAX_W = ["max-w-none", "max-w-xs", "max-w-sm", "max-w-md", "max-w-lg", "max-w-xl", "max-w-2xl", "max-w-3xl", "max-w-4xl", "max-w-5xl", "max-w-6xl", "max-w-7xl", "max-w-full", "max-w-screen-sm", "max-w-screen-md", "max-w-screen-lg", "max-w-screen-xl"];
      const BASE_P = ["p-0", "p-1", "p-2", "p-3", "p-4", "p-5", "p-6", "p-8", "p-10", "p-12", "p-16", "p-20", "p-24", "px-0", "px-1", "px-2", "px-3", "px-4", "px-5", "px-6", "px-8", "px-10", "px-12", "px-16", "px-20", "px-24", "py-0", "py-1", "py-2", "py-3", "py-4", "py-5", "py-6", "py-8", "py-10", "py-12", "py-16", "py-20", "py-24"];
      const WIDTH_CLASSES = BASE_W.flatMap(c => [c, ...RESP.map(r => r + c)]);
      const MAX_W_CLASSES = BASE_MAX_W.flatMap(c => [c, ...RESP.map(r => r + c)]);
      const PADDING_CLASSES = BASE_P.flatMap(c => [c, ...RESP.map(r => r + c)]);
      const widthOptions = [
        { label: "Full", cls: "w-full", prefixes: WIDTH_CLASSES },
        { label: "3/4", cls: "w-3/4", prefixes: WIDTH_CLASSES },
        { label: "2/3", cls: "w-2/3", prefixes: WIDTH_CLASSES },
        { label: "1/2", cls: "w-1/2", prefixes: WIDTH_CLASSES },
        { label: "1/3", cls: "w-1/3", prefixes: WIDTH_CLASSES },
      ];
      const maxWOptions = [
        { label: "sm", cls: "max-w-sm", prefixes: MAX_W_CLASSES },
        { label: "md", cls: "max-w-md", prefixes: MAX_W_CLASSES },
        { label: "lg", cls: "max-w-lg", prefixes: MAX_W_CLASSES },
        { label: "xl", cls: "max-w-xl", prefixes: MAX_W_CLASSES },
        { label: "2xl", cls: "max-w-2xl", prefixes: MAX_W_CLASSES },
        { label: "full", cls: "max-w-full", prefixes: MAX_W_CLASSES },
      ];
      const paddingOptions = [
        { label: "0", cls: "p-0", prefixes: PADDING_CLASSES },
        { label: "4", cls: "p-4", prefixes: PADDING_CLASSES },
        { label: "8", cls: "p-8", prefixes: PADDING_CLASSES },
        { label: "12", cls: "p-12", prefixes: PADDING_CLASSES },
        { label: "16", cls: "p-16", prefixes: PADDING_CLASSES },
      ];
      return { width: widthOptions, maxW: maxWOptions, padding: paddingOptions, currentClasses };
    }

    if (TEXT_TAGS.includes(tag)) {
      const BASE_TEXT_SIZES = ["text-xs", "text-sm", "text-base", "text-lg", "text-xl", "text-2xl", "text-3xl", "text-4xl", "text-5xl", "text-6xl", "text-7xl", "text-8xl", "text-9xl"];
      const BASE_FONT_WEIGHTS = ["font-thin", "font-extralight", "font-light", "font-normal", "font-medium", "font-semibold", "font-bold", "font-extrabold", "font-black"];
      const RESPONSIVE = ["sm:", "md:", "lg:", "xl:", "2xl:"];
      const TEXT_SIZE_CLASSES = BASE_TEXT_SIZES.flatMap(c => [c, ...RESPONSIVE.map(r => r + c)]);
      const FONT_WEIGHT_CLASSES = BASE_FONT_WEIGHTS.flatMap(c => [c, ...RESPONSIVE.map(r => r + c)]);
      const textSizes = [
        { label: "sm", cls: "text-sm", prefixes: TEXT_SIZE_CLASSES },
        { label: "base", cls: "text-base", prefixes: TEXT_SIZE_CLASSES },
        { label: "lg", cls: "text-lg", prefixes: TEXT_SIZE_CLASSES },
        { label: "xl", cls: "text-xl", prefixes: TEXT_SIZE_CLASSES },
        { label: "2xl", cls: "text-2xl", prefixes: TEXT_SIZE_CLASSES },
        { label: "3xl", cls: "text-3xl", prefixes: TEXT_SIZE_CLASSES },
        { label: "4xl", cls: "text-4xl", prefixes: TEXT_SIZE_CLASSES },
        { label: "5xl", cls: "text-5xl", prefixes: TEXT_SIZE_CLASSES },
      ];
      const fontWeight = [
        { label: "light", cls: "font-light", prefixes: FONT_WEIGHT_CLASSES },
        { label: "normal", cls: "font-normal", prefixes: FONT_WEIGHT_CLASSES },
        { label: "medium", cls: "font-medium", prefixes: FONT_WEIGHT_CLASSES },
        { label: "semibold", cls: "font-semibold", prefixes: FONT_WEIGHT_CLASSES },
        { label: "bold", cls: "font-bold", prefixes: FONT_WEIGHT_CLASSES },
      ];
      return { textSize: textSizes, fontWeight, currentClasses };
    }

    if (tag === "IMG") {
      const R = ["sm:", "md:", "lg:", "xl:", "2xl:"];
      const BASE_IMG = ["max-w-none", "max-w-xs", "max-w-sm", "max-w-md", "max-w-lg", "max-w-xl", "max-w-2xl", "max-w-full", "w-full", "w-auto", "w-1/2", "w-1/3", "w-2/3"];
      const BASE_ROUND = ["rounded-none", "rounded-sm", "rounded", "rounded-md", "rounded-lg", "rounded-xl", "rounded-2xl", "rounded-3xl", "rounded-full"];
      const IMG_SIZE_CLASSES = BASE_IMG.flatMap(c => [c, ...R.map(r => r + c)]);
      const ROUNDED_CLASSES = BASE_ROUND.flatMap(c => [c, ...R.map(r => r + c)]);
      const imgSizes = [
        { label: "sm", cls: "max-w-xs", prefixes: IMG_SIZE_CLASSES },
        { label: "md", cls: "max-w-md", prefixes: IMG_SIZE_CLASSES },
        { label: "lg", cls: "max-w-lg", prefixes: IMG_SIZE_CLASSES },
        { label: "xl", cls: "max-w-xl", prefixes: IMG_SIZE_CLASSES },
        { label: "full", cls: "w-full", prefixes: IMG_SIZE_CLASSES },
      ];
      const rounded = [
        { label: "none", cls: "rounded-none", prefixes: ROUNDED_CLASSES },
        { label: "md", cls: "rounded-md", prefixes: ROUNDED_CLASSES },
        { label: "lg", cls: "rounded-lg", prefixes: ROUNDED_CLASSES },
        { label: "xl", cls: "rounded-xl", prefixes: ROUNDED_CLASSES },
        { label: "full", cls: "rounded-full", prefixes: ROUNDED_CLASSES },
      ];
      return { imgSize: imgSizes, rounded, currentClasses };
    }

    return null;
  })();

  return (
    <div
      ref={toolbarRef}
      className="fixed z-50 flex flex-col gap-1.5 bg-gray-900 text-white rounded-xl shadow-2xl px-2 py-1.5 border border-gray-700"
      style={{ top: finalTop, left: clampedLeft, maxWidth: "min(600px, calc(100vw - 16px))" }}
    >
      {/* Main row */}
      <div className="flex items-center gap-1.5">
        {/* Tag badge / switcher */}
        {selection.tagName && (() => {
          const tag = selection.tagName.toUpperCase();
          const HEADINGS = ["H1", "H2", "H3", "H4", "H5", "H6"];
          const TEXT = ["P", "SPAN", "DIV", "BLOCKQUOTE"];
          const CONTAINERS = ["DIV", "SECTION", "ARTICLE", "ASIDE", "HEADER", "FOOTER", "NAV", "MAIN"];
          const NO_SWITCH = ["A", "IMG", "INPUT", "BUTTON", "SVG", "VIDEO", "IFRAME", "TABLE", "UL", "OL", "LI", "FORM"];

          let tagOptions: string[] = [];
          if (HEADINGS.includes(tag)) tagOptions = [...HEADINGS, "P"];
          else if (TEXT.includes(tag) && !CONTAINERS.includes(tag)) tagOptions = [...TEXT, "H1", "H2", "H3"];
          else if (CONTAINERS.includes(tag)) tagOptions = [...CONTAINERS, "P", "SPAN"];
          // Filter out current tag and no-switch tags
          tagOptions = tagOptions.filter((t) => t !== tag);
          const canSwitch = !NO_SWITCH.includes(tag) && tagOptions.length > 0 && onChangeTag;

          return canSwitch ? (
            <div className="relative shrink-0">
              <button
                onClick={() => setShowTagPicker(!showTagPicker)}
                className="px-2 py-0.5 rounded-md bg-blue-600 hover:bg-blue-500 text-[10px] font-mono font-bold uppercase tracking-wider transition-colors flex items-center gap-0.5"
              >
                {tag.toLowerCase()}
                <svg className="w-2.5 h-2.5 opacity-60" viewBox="0 0 20 20" fill="currentColor">
                  <path fillRule="evenodd" d="M5.23 7.21a.75.75 0 011.06.02L10 11.168l3.71-3.938a.75.75 0 111.08 1.04l-4.25 4.5a.75.75 0 01-1.08 0l-4.25-4.5a.75.75 0 01.02-1.06z" clipRule="evenodd" />
                </svg>
              </button>
              {showTagPicker && (
                <div className={`absolute left-0 bg-gray-800 border border-gray-600 rounded-lg shadow-xl py-1 z-50 min-w-[4rem] max-h-[200px] overflow-y-auto ${showAbove ? "bottom-full mb-1" : "top-full mt-1"}`}>
                  {tagOptions.map((t) => (
                    <button
                      key={t}
                      onClick={() => {
                        if (selection.sectionId && selection.elementPath) {
                          onChangeTag(selection.sectionId, selection.elementPath, t.toLowerCase());
                        }
                        setShowTagPicker(false);
                      }}
                      className="block w-full text-left px-3 py-1 text-[11px] font-mono font-bold uppercase hover:bg-gray-700 transition-colors"
                    >
                      {t.toLowerCase()}
                    </button>
                  ))}
                </div>
              )}
            </div>
          ) : (
            <span className="px-2 py-0.5 rounded-md bg-blue-600 text-[10px] font-mono font-bold uppercase tracking-wider shrink-0">
              {tag.toLowerCase()}
            </span>
          );
        })()}

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

        {selection.isSectionRoot ? (
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
        ) : onDeleteElement && (
          <>
            <div className="w-px h-5 bg-gray-700" />
            <button
              onClick={() => {
                if (selection.sectionId && selection.elementPath) {
                  onDeleteElement(selection.sectionId, selection.elementPath);
                }
              }}
              className="w-7 h-7 flex items-center justify-center rounded-lg hover:bg-red-900/50 text-red-400 transition-colors"
              title="Eliminar elemento"
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
      {selection.isSectionRoot && !hideStylePresets && (
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

      {/* Color swatches for text/container elements */}
      {!selection.isSectionRoot && onUpdateAttribute && selection.tagName !== 'IMG' && (() => {
        const containerTags = ['DIV', 'SECTION', 'HEADER', 'FOOTER', 'NAV', 'ASIDE', 'MAIN', 'ARTICLE'];
        const isContainer = containerTags.includes(selection.tagName ?? '');
        const colorSwatches = [
          { color: "#ffffff", css: "#ffffff", label: "Blanco" },
          { color: "#000000", css: "#000000", label: "Negro" },
          { color: "transparent", css: "transparent", label: "Transparente" },
          ...(themeColors ? [
            { color: themeColors.primary, css: "var(--color-primary)", label: "Primary" },
            { color: themeColors.secondary, css: "var(--color-secondary)", label: "Secondary" },
            { color: themeColors.accent, css: "var(--color-accent)", label: "Accent" },
            { color: themeColors.surface, css: "var(--color-surface)", label: "Surface" },
          ] : []),
        ];
        const renderColorRow = (label: string, cssProp: string) => (
          <div key={cssProp} className="flex items-center gap-1 pt-0.5 pb-0.5 border-t border-gray-700/50">
            <span className="text-[10px] text-gray-500 uppercase tracking-wider mr-1 shrink-0 w-10">{label}</span>
            {colorSwatches.map(({ color, css, label: swatchLabel }) => (
              <button
                key={swatchLabel}
                onClick={() => handleSetAttr("style", `${cssProp}: ${css}`)}
                className="w-5 h-5 rounded-full border border-gray-600 hover:scale-125 transition-transform shrink-0"
                style={color === "transparent" ? {
                  backgroundImage: "repeating-conic-gradient(#808080 0% 25%, #c0c0c0 0% 50%)",
                  backgroundSize: "8px 8px",
                } : { backgroundColor: color }}
                title={swatchLabel}
              />
            ))}
            <input
              type="color"
              onChange={(e) => handleSetAttr("style", `${cssProp}: ${e.target.value}`)}
              className="w-5 h-5 rounded-full border border-gray-600 cursor-pointer shrink-0 p-0 bg-transparent [&::-webkit-color-swatch-wrapper]:p-0 [&::-webkit-color-swatch]:rounded-full [&::-webkit-color-swatch]:border-0"
              title="Color personalizado"
            />
          </div>
        );
        return isContainer ? (
          <>
            {renderColorRow("Color", "color")}
            {renderColorRow("Fondo", "background-color")}
          </>
        ) : (
          renderColorRow("Color", "color")
        );
      })()}

      {/* Size presets */}
      {sizePresets && !selection.isSectionRoot && (() => {
        const groups = Object.entries(sizePresets).filter(([k]) => k !== 'currentClasses') as [string, { label: string; cls: string; prefixes: string[] }[]][];
        const labels: Record<string, string> = { width: "Ancho", maxW: "Max", padding: "Padding", textSize: "Texto", fontWeight: "Peso", imgSize: "Tamaño", rounded: "Borde" };
        return groups.map(([key, options]) => (
          <div key={key} className="flex items-center gap-1 pt-0.5 pb-0.5 border-t border-gray-700/50">
            <span className="text-[10px] text-gray-500 uppercase tracking-wider mr-1 shrink-0 w-10">{labels[key] || key}</span>
            {options.map((opt) => {
              const isActive = sizePresets.currentClasses.includes(opt.cls);
              return (
                <button
                  key={opt.cls}
                  onClick={() => handleReplaceClass(opt.prefixes, opt.cls)}
                  className={`px-2 py-0.5 text-[10px] font-mono font-bold rounded-md transition-colors whitespace-nowrap ${
                    isActive ? "bg-blue-600 text-white" : "bg-gray-800 hover:bg-gray-700 text-gray-300"
                  }`}
                >
                  {opt.label}
                </button>
              );
            })}
            <input
              type="text"
              placeholder="clase..."
              className="w-16 bg-gray-800 text-[10px] font-mono text-white rounded-md px-1.5 py-0.5 outline-none placeholder:text-gray-600 ml-1"
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  const val = (e.target as HTMLInputElement).value.trim();
                  if (val) {
                    handleReplaceClass(options[0].prefixes, val);
                    (e.target as HTMLInputElement).value = "";
                  }
                }
              }}
            />
          </div>
        ));
      })()}

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
