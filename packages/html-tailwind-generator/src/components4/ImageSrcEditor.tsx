import { useEffect, useState, useCallback } from "react";
import type { Editor } from "grapesjs";

interface Props {
  editor: Editor | null;
}

function readSrc(component: any): string {
  if (!component) return "";
  const attrs = component.getAttributes?.() || {};
  return attrs.src || "";
}

function readAlt(component: any): string {
  if (!component) return "";
  const attrs = component.getAttributes?.() || {};
  return attrs.alt || "";
}

function isImageComponent(component: any): boolean {
  if (!component) return false;
  if (component.get?.("type") === "image") return true;
  const el = component.getEl?.();
  return el?.tagName === "IMG";
}

function isValidHttpUrl(value: string): boolean {
  if (!value) return false;
  try {
    const u = new URL(value);
    return u.protocol === "http:" || u.protocol === "https:";
  } catch {
    return false;
  }
}

export default function ImageSrcEditor({ editor }: Props) {
  const [selectedComponent, setSelectedComponent] = useState<any>(null);
  const [isImg, setIsImg] = useState(false);
  const [src, setSrc] = useState("");
  const [alt, setAlt] = useState("");
  const [previewError, setPreviewError] = useState(false);

  const apply = useCallback((next: { src?: string; alt?: string }) => {
    if (!selectedComponent) return;
    selectedComponent.addAttributes?.(next);
    const el = selectedComponent.getEl?.();
    if (el) {
      if (next.src !== undefined) el.setAttribute("src", next.src);
      if (next.alt !== undefined) el.setAttribute("alt", next.alt);
    }
    editor?.trigger("sidebar:change");
  }, [editor, selectedComponent]);

  const applySrc = useCallback(() => {
    if (!isValidHttpUrl(src)) return;
    apply({ src });
  }, [apply, src]);

  const applyAlt = useCallback(() => {
    apply({ alt });
  }, [apply, alt]);

  useEffect(() => {
    if (!editor) return;

    const onSelected = (component: any) => {
      setSelectedComponent(component);
      const img = isImageComponent(component);
      setIsImg(img);
      if (img) {
        setSrc(readSrc(component));
        setAlt(readAlt(component));
        setPreviewError(false);
      } else {
        setSrc("");
        setAlt("");
      }
    };
    const onDeselected = () => {
      setSelectedComponent(null);
      setIsImg(false);
      setSrc("");
      setAlt("");
    };

    editor.on("component:selected", onSelected);
    editor.on("component:deselected", onDeselected);

    const current = editor.getSelected();
    if (current) onSelected(current);

    return () => {
      editor.off("component:selected", onSelected);
      editor.off("component:deselected", onDeselected);
    };
  }, [editor]);

  if (!isImg) return null;

  const urlValid = isValidHttpUrl(src);

  return (
    <div className="p-3 border-b border-gray-800 bg-gray-900/50">
      <p className="text-[10px] text-gray-400 font-bold uppercase tracking-wider mb-2">Imagen</p>

      {src && !previewError && (
        <div className="mb-2 rounded-md overflow-hidden border border-gray-700 bg-gray-950" style={{ aspectRatio: "16 / 9" }}>
          <img
            src={src}
            alt=""
            className="w-full h-full object-cover"
            onError={() => setPreviewError(true)}
            onLoad={() => setPreviewError(false)}
          />
        </div>
      )}

      <label className="block text-[10px] text-gray-500 uppercase tracking-wider mb-1">URL</label>
      <div className="flex items-center gap-1 mb-2">
        <input
          type="text"
          value={src}
          onChange={(e) => { setSrc(e.target.value); setPreviewError(false); }}
          onKeyDown={(e) => { if (e.key === "Enter") applySrc(); }}
          placeholder="https://..."
          className="flex-1 bg-gray-800 text-xs text-white rounded px-2 py-1.5 outline-none border border-transparent focus:border-brand-500 min-w-0"
        />
        <button
          onClick={applySrc}
          disabled={!urlValid}
          className="px-2.5 py-1.5 text-[10px] font-bold rounded bg-brand-500 hover:bg-brand-600 transition-colors shrink-0 disabled:opacity-40 disabled:cursor-not-allowed"
        >
          Aplicar
        </button>
      </div>
      {src && !urlValid && (
        <p className="text-[10px] text-amber-500 mb-2">URL inválida — debe empezar con http:// o https://</p>
      )}
      {previewError && urlValid && (
        <p className="text-[10px] text-red-400 mb-2">No se pudo cargar la imagen desde esa URL.</p>
      )}

      <label className="block text-[10px] text-gray-500 uppercase tracking-wider mb-1">Alt</label>
      <div className="flex items-center gap-1">
        <input
          type="text"
          value={alt}
          onChange={(e) => setAlt(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") applyAlt(); }}
          placeholder="Descripción..."
          className="flex-1 bg-gray-800 text-xs text-white rounded px-2 py-1.5 outline-none border border-transparent focus:border-brand-500 min-w-0"
        />
        <button
          onClick={applyAlt}
          className="px-2.5 py-1.5 text-[10px] font-bold rounded bg-gray-700 hover:bg-gray-600 transition-colors shrink-0"
        >
          Aplicar
        </button>
      </div>
    </div>
  );
}
