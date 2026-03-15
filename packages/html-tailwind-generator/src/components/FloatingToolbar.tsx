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

// SVG icons for tab bar
const PaletteIcon = () => (
  <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="13.5" cy="6.5" r="0.5" fill="currentColor" stroke="none" />
    <circle cx="17.5" cy="10.5" r="0.5" fill="currentColor" stroke="none" />
    <circle cx="8.5" cy="7.5" r="0.5" fill="currentColor" stroke="none" />
    <circle cx="6.5" cy="12" r="0.5" fill="currentColor" stroke="none" />
    <path d="M12 2C6.5 2 2 6.5 2 12s4.5 10 10 10c.926 0 1.648-.746 1.648-1.688 0-.437-.18-.835-.437-1.125-.29-.289-.438-.652-.438-1.125a1.64 1.64 0 011.668-1.668h1.996c3.051 0 5.555-2.503 5.555-5.554C21.965 6.012 17.461 2 12 2z" />
  </svg>
);

const RulerIcon = () => (
  <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M21.3 15.3a2.4 2.4 0 010 3.4l-2.6 2.6a2.4 2.4 0 01-3.4 0L2.7 8.7a2.4 2.4 0 010-3.4l2.6-2.6a2.4 2.4 0 013.4 0z" />
    <path d="M14.5 12.5l2-2" />
    <path d="M11.5 9.5l2-2" />
    <path d="M8.5 6.5l2-2" />
    <path d="M17.5 15.5l2-2" />
  </svg>
);

const LinkIcon = () => (
  <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M10 13a5 5 0 007.54.54l3-3a5 5 0 00-7.07-7.07l-1.72 1.71" />
    <path d="M14 11a5 5 0 00-7.54-.54l-3 3a5 5 0 007.07 7.07l1.71-1.71" />
  </svg>
);

type TabType = "style" | "attrs" | null;

interface FloatingToolbarProps {
  selection: IframeMessage | null;
  iframeRect: DOMRect | null;
  onRefine: (instruction: string, referenceImage?: string, opts?: { isVariant?: boolean }) => void;
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
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const toolbarRef = useRef<HTMLDivElement>(null);

  const [showTagPicker, setShowTagPicker] = useState(false);
  const [activeTab, setActiveTab] = useState<TabType>('style');

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
    setActiveTab(null);
    // Auto-focus AI input only for section roots (not text elements where user may want to double-click edit)
    const isText = ["P", "SPAN", "H1", "H2", "H3", "H4", "H5", "H6", "BLOCKQUOTE", "LI", "A"].includes(selection?.tagName ?? "");
    if (!isText) {
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [selection?.sectionId, selection?.elementPath]);

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
    if (isRefining || !selection) return;
    if (prompt.trim()) {
      onRefine(prompt.trim(), refImage || undefined);
    } else {
      // No text — request variant
      const tag = selection.tagName?.toLowerCase();
      const text = selection.text?.substring(0, 80);
      const variantPrompt = selection.isSectionRoot
        ? "Genera una variante completamente diferente de esta seccion. Manten el mismo contenido/informacion pero cambia radicalmente el layout, la estructura visual, y el estilo. Sorprendeme con un diseno creativo e inesperado."
        : `Modifica SOLO el elemento <${tag}> que contiene "${text}". Genera una variante visual diferente de ESE elemento (diferente estilo, layout, tipografia). NO modifiques ningun otro elemento de la seccion.`;
      onRefine(variantPrompt, refImage || undefined, { isVariant: selection.isSectionRoot ? true : undefined });
    }
    setPrompt("");
    if (inputRef.current) inputRef.current.style.height = "auto";
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
    if (!selection?.sectionId || !selection?.elementPath || !onUpdateAttribute) return;
    const currentClasses = (selection.className || "").split(/\s+/).filter(Boolean);
    const filtered = currentClasses.filter(cls => {
      const bare = cls.includes(":") ? cls.substring(cls.lastIndexOf(":") + 1) : cls;
      return !removePrefixes.some(pfx => bare === pfx || bare.startsWith(pfx));
    });
    if (addClass) {
      for (const c of addClass.split(/\s+/).filter(Boolean)) {
        if (!filtered.includes(c)) filtered.push(c);
      }
    }
    onUpdateAttribute(selection.sectionId, selection.elementPath, "class", filtered.join(" "));
  }

  // Determine size presets based on element type
  const sizePresets = (() => {
    if (!onUpdateAttribute || !selection.tagName) return null;
    const tag = selection.tagName.toUpperCase();
    const CONTAINERS = ["DIV", "SECTION", "ARTICLE", "ASIDE", "HEADER", "FOOTER", "NAV", "MAIN"];
    const TEXT_TAGS = ["H1", "H2", "H3", "H4", "H5", "H6", "P", "SPAN", "BLOCKQUOTE"];
    const currentClasses = (selection.className || "").split(/\s+/);

    if (CONTAINERS.includes(tag)) {
      const W_PREFIXES = ["w-"];
      const MAX_W_PREFIXES = ["max-w-"];
      const P_PREFIXES = ["p-", "px-", "py-"];
      const widthOptions = [
        { label: "Full", cls: "w-full", prefixes: W_PREFIXES },
        { label: "3/4", cls: "w-3/4", prefixes: W_PREFIXES },
        { label: "2/3", cls: "w-2/3", prefixes: W_PREFIXES },
        { label: "1/2", cls: "w-1/2", prefixes: W_PREFIXES },
        { label: "1/3", cls: "w-1/3", prefixes: W_PREFIXES },
      ];
      const maxWOptions = [
        { label: "sm", cls: "max-w-sm", prefixes: MAX_W_PREFIXES },
        { label: "md", cls: "max-w-md", prefixes: MAX_W_PREFIXES },
        { label: "lg", cls: "max-w-lg", prefixes: MAX_W_PREFIXES },
        { label: "xl", cls: "max-w-xl", prefixes: MAX_W_PREFIXES },
        { label: "2xl", cls: "max-w-2xl", prefixes: MAX_W_PREFIXES },
        { label: "full", cls: "max-w-full", prefixes: MAX_W_PREFIXES },
      ];
      const paddingOptions = [
        { label: "0", cls: "p-0", prefixes: P_PREFIXES },
        { label: "4", cls: "p-4", prefixes: P_PREFIXES },
        { label: "8", cls: "p-8", prefixes: P_PREFIXES },
        { label: "12", cls: "p-12", prefixes: P_PREFIXES },
        { label: "16", cls: "p-16", prefixes: P_PREFIXES },
      ];
      const M_PREFIXES = ["m-", "mx-", "my-", "mt-", "mb-"];
      const marginOptions = [
        { label: "0", cls: "m-0", prefixes: M_PREFIXES },
        { label: "auto", cls: "mx-auto", prefixes: M_PREFIXES },
        { label: "2", cls: "m-2", prefixes: M_PREFIXES },
        { label: "4", cls: "m-4", prefixes: M_PREFIXES },
        { label: "8", cls: "m-8", prefixes: M_PREFIXES },
      ];
      return { width: widthOptions, maxW: maxWOptions, padding: paddingOptions, margin: marginOptions, currentClasses };
    }

    if (TEXT_TAGS.includes(tag)) {
      const TEXT_SIZE_EXACT = ["text-xs", "text-sm", "text-base", "text-lg", "text-xl", "text-2xl", "text-3xl", "text-4xl", "text-5xl", "text-6xl", "text-7xl", "text-8xl", "text-9xl"];
      const FONT_WEIGHT_EXACT = ["font-thin", "font-extralight", "font-light", "font-normal", "font-medium", "font-semibold", "font-bold", "font-extrabold", "font-black"];
      const textSizes = [
        { label: "sm", cls: "text-sm", prefixes: TEXT_SIZE_EXACT },
        { label: "base", cls: "text-base", prefixes: TEXT_SIZE_EXACT },
        { label: "lg", cls: "text-lg", prefixes: TEXT_SIZE_EXACT },
        { label: "xl", cls: "text-xl", prefixes: TEXT_SIZE_EXACT },
        { label: "2xl", cls: "text-2xl", prefixes: TEXT_SIZE_EXACT },
        { label: "3xl", cls: "text-3xl", prefixes: TEXT_SIZE_EXACT },
        { label: "4xl", cls: "text-4xl", prefixes: TEXT_SIZE_EXACT },
        { label: "5xl", cls: "text-5xl", prefixes: TEXT_SIZE_EXACT },
      ];
      const fontWeight = [
        { label: "light", cls: "font-light", prefixes: FONT_WEIGHT_EXACT },
        { label: "normal", cls: "font-normal", prefixes: FONT_WEIGHT_EXACT },
        { label: "medium", cls: "font-medium", prefixes: FONT_WEIGHT_EXACT },
        { label: "semibold", cls: "font-semibold", prefixes: FONT_WEIGHT_EXACT },
        { label: "bold", cls: "font-bold", prefixes: FONT_WEIGHT_EXACT },
      ];
      const M_PREFIXES = ["m-", "mx-", "my-", "mt-", "mb-"];
      const marginOptions = [
        { label: "0", cls: "m-0", prefixes: M_PREFIXES },
        { label: "auto", cls: "mx-auto", prefixes: M_PREFIXES },
        { label: "2", cls: "m-2", prefixes: M_PREFIXES },
        { label: "4", cls: "m-4", prefixes: M_PREFIXES },
        { label: "8", cls: "m-8", prefixes: M_PREFIXES },
      ];
      return { textSize: textSizes, fontWeight, margin: marginOptions, currentClasses };
    }

    if (tag === "BUTTON" || tag === "A") {
      const W_PREFIXES = ["w-"];
      const P_PREFIXES = ["p-", "px-", "py-"];
      const M_PREFIXES = ["m-", "mx-", "my-", "mt-", "mb-"];
      const widthOptions = [
        { label: "auto", cls: "w-auto", prefixes: W_PREFIXES },
        { label: "Full", cls: "w-full", prefixes: W_PREFIXES },
        { label: "1/2", cls: "w-1/2", prefixes: W_PREFIXES },
        { label: "1/3", cls: "w-1/3", prefixes: W_PREFIXES },
      ];
      const paddingOptions = [
        { label: "0", cls: "p-0", prefixes: P_PREFIXES },
        { label: "2", cls: "px-2 py-1", prefixes: P_PREFIXES },
        { label: "4", cls: "px-4 py-2", prefixes: P_PREFIXES },
        { label: "6", cls: "px-6 py-3", prefixes: P_PREFIXES },
        { label: "8", cls: "px-8 py-4", prefixes: P_PREFIXES },
      ];
      const marginOptions = [
        { label: "0", cls: "m-0", prefixes: M_PREFIXES },
        { label: "auto", cls: "mx-auto", prefixes: M_PREFIXES },
        { label: "2", cls: "m-2", prefixes: M_PREFIXES },
        { label: "4", cls: "m-4", prefixes: M_PREFIXES },
      ];
      return { width: widthOptions, padding: paddingOptions, margin: marginOptions, currentClasses };
    }

    if (tag === "IMG") {
      const IMG_SIZE_PREFIXES = ["w-", "max-w-"];
      const ROUNDED_PREFIXES = ["rounded"];
      const imgSizes = [
        { label: "sm", cls: "max-w-xs", prefixes: IMG_SIZE_PREFIXES },
        { label: "md", cls: "max-w-md", prefixes: IMG_SIZE_PREFIXES },
        { label: "lg", cls: "max-w-lg", prefixes: IMG_SIZE_PREFIXES },
        { label: "xl", cls: "max-w-xl", prefixes: IMG_SIZE_PREFIXES },
        { label: "full", cls: "w-full", prefixes: IMG_SIZE_PREFIXES },
      ];
      const rounded = [
        { label: "none", cls: "rounded-none", prefixes: ROUNDED_PREFIXES },
        { label: "md", cls: "rounded-md", prefixes: ROUNDED_PREFIXES },
        { label: "lg", cls: "rounded-lg", prefixes: ROUNDED_PREFIXES },
        { label: "xl", cls: "rounded-xl", prefixes: ROUNDED_PREFIXES },
        { label: "full", cls: "rounded-full", prefixes: ROUNDED_PREFIXES },
      ];
      return { imgSize: imgSizes, rounded, currentClasses };
    }

    return null;
  })();

  // Determine which tabs are available
  const hasStyleTab = true; // Always available (colors + size for non-section, style presets for section)
  const hasAttrsTab = hasAttrEditing;

  function toggleTab(tab: TabType) {
    setActiveTab(prev => prev === tab ? null : tab);
  }

  // Render color swatches panel
  function renderColorPanel() {
    if (selection!.isSectionRoot) {
      // Style presets for section root
      if (hideStylePresets) return null;
      return (
        <div className="flex items-center gap-1 pt-1 pb-0.5">
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
      );
    }

    // Color swatches for non-section elements
    if (!onUpdateAttribute || selection!.tagName === 'IMG') {
      // Still show size panel for IMG even without color swatches
      if (selection!.tagName === 'IMG' && sizePresets) return <div className="pt-1 pb-0.5">{renderSizePanel()}</div>;
      return null;
    }

    const containerTags = ['DIV', 'SECTION', 'HEADER', 'FOOTER', 'NAV', 'ASIDE', 'MAIN', 'ARTICLE'];
    const isContainer = containerTags.includes(selection!.tagName ?? '');

    const TEXT_COLOR_PREFIXES = ["text-primary", "text-secondary", "text-accent", "text-on-surface", "text-on-primary", "text-on-surface-muted", "text-white", "text-black", "text-transparent"];
    const BG_COLOR_PREFIXES = ["bg-primary", "bg-primary-dark", "bg-secondary", "bg-accent", "bg-surface", "bg-surface-alt", "bg-white", "bg-black", "bg-transparent"];

    const themeSwatches = themeColors ? [
      { color: themeColors.primary, textCls: "text-primary", bgCls: "bg-primary", label: "Primary" },
      { color: themeColors.secondary, textCls: "text-secondary", bgCls: "bg-secondary", label: "Secondary" },
      { color: themeColors.accent, textCls: "text-accent", bgCls: "bg-accent", label: "Accent" },
      { color: themeColors.surface, textCls: "text-on-surface", bgCls: "bg-surface", label: "Surface" },
    ] : [];

    const fixedSwatches = [
      { color: "#ffffff", textCls: "text-white", bgCls: "bg-white", label: "Blanco" },
      { color: "#000000", textCls: "text-black", bgCls: "bg-black", label: "Negro" },
      { color: "transparent", textCls: "text-transparent", bgCls: "bg-transparent", label: "Transparente" },
    ];

    const renderColorRow = (label: string, mode: "text" | "bg") => (
      <div key={mode} className="flex items-center gap-1 pt-0.5 pb-0.5">
        <span className="text-[10px] text-gray-500 uppercase tracking-wider mr-1 shrink-0 w-10">{label}</span>
        {fixedSwatches.map(({ color, textCls, bgCls, label: swatchLabel }) => (
          <button
            key={swatchLabel}
            onClick={() => {
              const prefixes = mode === "text" ? TEXT_COLOR_PREFIXES : BG_COLOR_PREFIXES;
              const cls = mode === "text" ? textCls : bgCls;
              handleReplaceClass(prefixes, cls);
              handleSetAttr("style", "");
            }}
            className="w-5 h-5 rounded-full border border-gray-600 hover:scale-125 transition-transform shrink-0"
            style={color === "transparent" ? {
              backgroundImage: "repeating-conic-gradient(#808080 0% 25%, #c0c0c0 0% 50%)",
              backgroundSize: "8px 8px",
            } : { backgroundColor: color }}
            title={swatchLabel}
          />
        ))}
        {themeSwatches.map(({ color, textCls, bgCls, label: swatchLabel }) => (
          <button
            key={swatchLabel}
            onClick={() => {
              const prefixes = mode === "text" ? TEXT_COLOR_PREFIXES : BG_COLOR_PREFIXES;
              const cls = mode === "text" ? textCls : bgCls;
              handleReplaceClass(prefixes, cls);
              handleSetAttr("style", "");
            }}
            className="w-5 h-5 rounded-full border border-gray-600 hover:scale-125 transition-transform shrink-0"
            style={{ backgroundColor: color }}
            title={swatchLabel}
          />
        ))}
        <input
          type="color"
          onChange={(e) => {
            handleReplaceClass(mode === "text" ? TEXT_COLOR_PREFIXES : BG_COLOR_PREFIXES, "");
            const cssProp = mode === "text" ? "color" : "background-color";
            handleSetAttr("style", `${cssProp}: ${e.target.value}`);
          }}
          className="w-5 h-5 rounded-full border border-gray-600 cursor-pointer shrink-0 p-0 bg-transparent [&::-webkit-color-swatch-wrapper]:p-0 [&::-webkit-color-swatch]:rounded-full [&::-webkit-color-swatch]:border-0"
          title="Color personalizado"
        />
      </div>
    );

    return (
      <div className="pt-1 pb-0.5">
        {renderColorRow("Color", "text")}
        {isContainer && renderColorRow("Fondo", "bg")}
        {renderSizePanel()}
      </div>
    );
  }

  // Render size presets panel
  function renderSizePanel() {
    if (!sizePresets || selection!.isSectionRoot) return null;
    const groups = Object.entries(sizePresets).filter(([k]) => k !== 'currentClasses') as [string, { label: string; cls: string; prefixes: string[] }[]][];
    const labels: Record<string, string> = { width: "Ancho", maxW: "Max", padding: "Padding", margin: "Margin", textSize: "Texto", fontWeight: "Peso", imgSize: "Tamaño", rounded: "Borde" };
    return (
      <div className="pt-1 pb-0.5">
        {groups.map(([key, options]) => (
          <div key={key} className="flex items-center gap-1 pt-0.5 pb-0.5">
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
          </div>
        ))}
      </div>
    );
  }

  // Render attributes panel
  function renderAttrsPanel() {
    if (!hasAttrEditing) return null;
    return (
      <div className="pt-1 pb-0.5">
        {isImg && (
          <div className="flex flex-col gap-1">
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
        {isLink && (
          <div className="flex items-center gap-1">
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

  return (
    <div
      ref={toolbarRef}
      className="fixed z-50 flex flex-col bg-gray-900 text-white rounded-xl shadow-2xl px-2 py-1.5 border border-gray-700"
      style={{ top: finalTop, left: clampedLeft, maxWidth: "min(600px, calc(100vw - 16px))" }}
    >
      {/* Main row */}
      <div className="flex items-center gap-1.5 flex-wrap">
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
        <form onSubmit={handleSubmit} className="flex items-start gap-1 flex-1">
          <textarea
            ref={inputRef}
            value={prompt}
            onChange={(e) => {
              setPrompt(e.target.value);
              e.target.style.height = "auto";
              e.target.style.height = Math.min(e.target.scrollHeight, 96) + "px";
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                handleSubmit(e);
              }
            }}
            placeholder={refImage ? "Instruccion + imagen..." : "Editar con AI..."}
            disabled={isRefining}
            rows={1}
            className="bg-transparent text-sm text-white placeholder:text-gray-500 outline-none min-w-[6rem] sm:min-w-[10rem] flex-1 px-2 py-1 resize-none overflow-hidden"
          />
          <button
            type="submit"
            disabled={isRefining}
            className={`flex items-center justify-center rounded-lg bg-blue-500 hover:bg-blue-600 disabled:opacity-30 transition-colors shrink-0 ${
              prompt.trim() ? "w-7 h-7" : "px-2.5 py-1 text-[11px] font-bold whitespace-nowrap"
            }`}
          >
            {isRefining ? (
              <span className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
            ) : prompt.trim() ? (
              <HiSparkles className="w-3.5 h-3.5" />
            ) : (
              "✦ Variante"
            )}
          </button>
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

        {/* Section-level actions (move/delete) */}
        {selection.isSectionRoot && (
          <span className="hidden sm:contents">
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
          </span>
        )}

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
          className="w-7 h-7 flex items-center justify-center rounded-lg hover:bg-gray-800 text-gray-400 hover:text-white transition-colors shrink-0"
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

      {/* Tab bar */}
      <div className="flex items-center gap-1 pt-1 border-t border-gray-700/50 overflow-x-auto [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]">
        {hasStyleTab && (
          <button
            onClick={() => toggleTab("style")}
            className={`flex items-center gap-1 px-2 py-1 rounded-md text-[10px] font-medium transition-colors ${
              activeTab === "style" ? "bg-blue-600 text-white" : "bg-gray-800 hover:bg-gray-700 text-gray-400"
            }`}
            title="Estilo y tamaño"
          >
            <PaletteIcon />
            <span>Estilo</span>
          </button>
        )}

        {hasAttrsTab && (
          <button
            onClick={() => toggleTab("attrs")}
            className={`flex items-center gap-1 px-2 py-1 rounded-md text-[10px] font-medium transition-colors ${
              activeTab === "attrs" ? "bg-blue-600 text-white" : "bg-gray-800 hover:bg-gray-700 text-gray-400"
            }`}
            title="Atributos"
          >
            <LinkIcon />
            <span>Attrs</span>
          </button>
        )}
        <button
          onClick={onViewCode}
          className="hidden sm:flex items-center gap-1 px-2 py-1 rounded-md text-[10px] font-medium bg-gray-800 hover:bg-gray-700 text-gray-400 transition-colors font-mono"
          title="Ver código"
        >
          &lt;/&gt;
        </button>
      </div>

      {/* Active tab panel */}
      {activeTab === "style" && renderColorPanel()}
      {activeTab === "attrs" && renderAttrsPanel()}
    </div>
  );
}
