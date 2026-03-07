import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Placeholder from "@tiptap/extension-placeholder";
import TextAlign from "@tiptap/extension-text-align";
import { useCallback, useRef } from "react";
import type { LandingBlock } from "~/lib/landing2/blockTypes";

export function TextBlock({
  block,
  onUpdate,
}: {
  block: LandingBlock;
  onUpdate: (content: Record<string, any>) => void;
}) {
  const c = block.content;
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
      Placeholder.configure({ placeholder: "Escribe tu contenido aquí..." }),
      TextAlign.configure({ types: ["heading", "paragraph"] }),
    ],
    content: c.body || "<p>Escribe tu contenido aquí...</p>",
    onUpdate: ({ editor }) => {
      debouncedUpdate(editor.getHTML());
    },
    editorProps: {
      attributes: {
        class: "prose prose-lg max-w-none outline-none min-h-[80px]",
      },
    },
  });

  return (
    <div
      style={{ background: "var(--landing-bg)", color: "var(--landing-text)" }}
      className="py-20"
    >
      <div className="max-w-3xl mx-auto px-6">
        <h2
          contentEditable
          suppressContentEditableWarning
          onBlur={(e) => onUpdate({ title: e.currentTarget.textContent || "" })}
          className="text-3xl font-extrabold mb-6 outline-none focus:ring-2 focus:ring-brand-500/30 rounded-lg px-2"
        >
          {c.title || "Título de sección"}
        </h2>

        {/* TipTap toolbar */}
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
              active={editor.isActive("heading", { level: 3 })}
              onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()}
            >
              H3
            </ToolbarBtn>
            <ToolbarBtn
              active={editor.isActive("bulletList")}
              onClick={() => editor.chain().focus().toggleBulletList().run()}
            >
              &bull;
            </ToolbarBtn>
            <ToolbarBtn
              active={editor.isActive("orderedList")}
              onClick={() => editor.chain().focus().toggleOrderedList().run()}
            >
              1.
            </ToolbarBtn>
          </div>
        )}

        <EditorContent editor={editor} />
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
