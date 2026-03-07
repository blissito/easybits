import { useCallback, useRef } from "react";
import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Placeholder from "@tiptap/extension-placeholder";
import type { LandingBlock } from "~/lib/landing2/blockTypes";

export function ImageTextBlock({
  block,
  onUpdate,
}: {
  block: LandingBlock;
  onUpdate: (content: Record<string, any>) => void;
}) {
  const c = block.content;
  const imgLeft = c.imagePosition === "left";
  const debounceRef = useRef<ReturnType<typeof setTimeout>>(undefined);

  const debouncedUpdate = useCallback(
    (html: string) => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(() => onUpdate({ body: html }), 600);
    },
    [onUpdate]
  );

  const editor = useEditor({
    extensions: [
      StarterKit.configure({}),
      Placeholder.configure({ placeholder: "Descripción del contenido..." }),
    ],
    content: c.body || "<p>Descripción del contenido</p>",
    onUpdate: ({ editor }) => {
      debouncedUpdate(editor.getHTML());
    },
    editorProps: {
      attributes: {
        class: "prose prose-lg max-w-none outline-none min-h-[60px] opacity-80",
      },
    },
  });

  return (
    <div
      style={{ background: "var(--landing-bg)", color: "var(--landing-text)" }}
      className="py-20"
    >
      <div className={`max-w-7xl mx-auto px-6 flex flex-col ${imgLeft ? "lg:flex-row" : "lg:flex-row-reverse"} items-center gap-12`}>
        <div className="flex-1">
          <div className="relative group">
            {c.imageUrl ? (
              <img
                src={c.imageUrl}
                alt=""
                className="w-full rounded-2xl shadow-xl"
              />
            ) : (
              <div className="w-full aspect-video bg-gray-100 rounded-2xl flex items-center justify-center text-gray-400">
                Sin imagen
              </div>
            )}
            <input
              type="text"
              value={c.imageUrl || ""}
              onChange={(e) => onUpdate({ imageUrl: e.target.value })}
              placeholder="URL de imagen"
              className="absolute bottom-2 left-2 right-2 text-xs bg-white/90 backdrop-blur border rounded-lg px-2 py-1 opacity-0 group-hover:opacity-100 transition-opacity"
            />
          </div>
          <div className="flex gap-2 mt-2 justify-center">
            <button
              type="button"
              onClick={() => onUpdate({ imagePosition: "left" })}
              className={`text-xs px-2 py-1 rounded font-bold ${imgLeft ? "bg-black text-white" : "bg-gray-100"}`}
            >
              Img izquierda
            </button>
            <button
              type="button"
              onClick={() => onUpdate({ imagePosition: "right" })}
              className={`text-xs px-2 py-1 rounded font-bold ${!imgLeft ? "bg-black text-white" : "bg-gray-100"}`}
            >
              Img derecha
            </button>
          </div>
        </div>
        <div className="flex-1">
          <h2
            contentEditable
            suppressContentEditableWarning
            onBlur={(e) => onUpdate({ title: e.currentTarget.textContent || "" })}
            className="text-3xl lg:text-4xl font-extrabold mb-4 outline-none focus:ring-2 focus:ring-brand-500/30 rounded-lg px-2"
          >
            {c.title || "Título"}
          </h2>

          {editor && (
            <div className="flex gap-1 mb-3 border-b border-gray-200 pb-2">
              <ToolbarBtn
                active={editor.isActive("bold")}
                onClick={() => editor.chain().focus().toggleBold().run()}
              >
                B
              </ToolbarBtn>
              <ToolbarBtn
                active={editor.isActive("italic")}
                onClick={() => editor.chain().focus().toggleItalic().run()}
              >
                I
              </ToolbarBtn>
              <ToolbarBtn
                active={editor.isActive("bulletList")}
                onClick={() => editor.chain().focus().toggleBulletList().run()}
              >
                &bull;
              </ToolbarBtn>
            </div>
          )}
          <EditorContent editor={editor} />
        </div>
      </div>
    </div>
  );
}

function ToolbarBtn({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`px-2 py-1 rounded text-sm font-bold transition-colors ${
        active
          ? "bg-black text-white"
          : "bg-gray-100 text-gray-600 hover:bg-gray-200"
      }`}
    >
      {children}
    </button>
  );
}
