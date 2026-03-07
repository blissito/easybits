import { useState, useRef, useEffect } from "react";

interface VariantOption {
  label: string;
  value: string;
}

export function VariantSelector({
  options,
  value,
  onChange,
}: {
  options: VariantOption[];
  value: string;
  onChange: (value: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const current = options.find((o) => o.value === value) || options[0];

  useEffect(() => {
    if (!open) return;
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    function handleKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", handleClick);
    document.addEventListener("keydown", handleKey);
    return () => {
      document.removeEventListener("mousedown", handleClick);
      document.removeEventListener("keydown", handleKey);
    };
  }, [open]);

  if (options.length <= 1) return null;

  return (
    <div ref={ref} className="relative inline-block">
      <button
        type="button"
        onClick={() => setOpen((p) => !p)}
        className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold bg-white/90 backdrop-blur border-2 border-black rounded-lg shadow-[2px_2px_0_#000] hover:bg-gray-50 transition-colors"
      >
        <span>{current?.label || "Estilo"}</span>
        <svg width="10" height="6" viewBox="0 0 10 6" fill="none" className={`transition-transform ${open ? "rotate-180" : ""}`}>
          <path d="M1 1L5 5L9 1" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
      </button>
      {open && (
        <div className="absolute top-full left-0 mt-1 z-50 bg-white border-2 border-black rounded-xl shadow-[4px_4px_0_#000] py-1 min-w-[140px]">
          {options.map((opt) => (
            <button
              key={opt.value}
              type="button"
              onClick={() => { onChange(opt.value); setOpen(false); }}
              className={`w-full text-left px-3 py-1.5 text-xs font-bold hover:bg-gray-50 flex items-center gap-2 ${opt.value === value ? "text-brand-500" : ""}`}
            >
              {opt.value === value && <span>&#10003;</span>}
              {opt.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export function BlockFloatingToolbar({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-2 mb-3 px-1">
      {children}
    </div>
  );
}
