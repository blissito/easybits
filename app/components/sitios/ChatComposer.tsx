import TextareaAutosize from "react-textarea-autosize";
import { LuArrowUp, LuImagePlus, LuLoaderCircle } from "react-icons/lu";

/**
 * Caja de chat estándar (estilo ChatGPT/Claude): un solo contenedor con el textarea que
 * crece hasta 6 renglones (react-textarea-autosize, el de la comunidad: mide de verdad,
 * también el placeholder, y encoge al borrar), adjuntar a la izquierda y enviar redondo a la derecha.
 * Enter envía, Shift+Enter hace salto de línea (respeta IME). Soltar o pegar una imagen
 * la adjunta (lo maneja quien la usa con `onFile`).
 */
export function ChatComposer({
  value,
  onChange,
  onSend,
  onFile,
  busy,
  canSend,
  placeholder,
  accept = "image/png,image/jpeg,image/webp",
}: {
  value: string;
  onChange: (v: string) => void;
  onSend: () => void;
  onFile?: (file: File | null | undefined) => void;
  busy: boolean;
  canSend: boolean;
  placeholder: string;
  accept?: string;
}) {
  const submit = () => {
    if (!busy && canSend) onSend();
  };

  return (
    <form
      className="p-3 pb-16 md:pb-3 border-t border-gray-200"
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
      onDragOver={(e) => e.preventDefault()}
      onDrop={(e) => {
        e.preventDefault();
        onFile?.(e.dataTransfer.files?.[0]);
      }}
    >
      <div className="flex items-end gap-1.5 rounded-2xl border-2 border-black bg-white px-2 py-1.5 focus-within:shadow-[3px_3px_0px_0px_rgba(0,0,0,1)] transition-shadow">
        {onFile && (
          <label
            className="shrink-0 grid place-items-center w-8 h-8 rounded-lg text-gray-500 hover:text-black hover:bg-gray-100 cursor-pointer"
            title="Adjuntar imagen o mockup (también puedes pegarla o arrastrarla)"
            aria-label="Adjuntar imagen"
          >
            <LuImagePlus className="w-[18px] h-[18px]" />
            <input
              type="file"
              accept={accept}
              className="hidden"
              onChange={(e) => {
                onFile(e.target.files?.[0]);
                e.target.value = "";
              }}
            />
          </label>
        )}
        <TextareaAutosize
          minRows={1}
          maxRows={6}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
              e.preventDefault();
              submit();
            }
          }}
          placeholder={placeholder}
          className="flex-1 min-w-0 resize-none bg-transparent border-0 shadow-none px-1 py-1.5 text-sm leading-[22px] placeholder:text-gray-400 focus:outline-none focus:ring-0 focus:border-0"
        />
        <button
          type="submit"
          disabled={busy || !canSend}
          aria-label={busy ? "Trabajando…" : "Enviar"}
          className="shrink-0 grid place-items-center w-8 h-8 rounded-full bg-black text-white disabled:bg-gray-200 disabled:text-gray-400 transition-colors"
        >
          {busy ? <LuLoaderCircle className="w-4 h-4 animate-spin" /> : <LuArrowUp className="w-4 h-4" />}
        </button>
      </div>
      <p className="hidden md:block mt-1 px-1 text-[10px] text-gray-400">Enter envía · Shift+Enter salto de línea · arrastra o pega un mockup</p>
    </form>
  );
}
