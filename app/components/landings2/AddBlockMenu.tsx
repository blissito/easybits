import { useState, useRef, useEffect } from "react";
import {
  ALL_BLOCK_TYPES,
  BLOCK_LABELS,
  BLOCK_ICONS,
  type BlockType,
} from "~/lib/landing2/blockTypes";

export function AddBlockMenu({
  onAdd,
}: {
  onAdd: (type: BlockType) => void;
}) {
  const [open, setOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function handleClick(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
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

  return (
    <div ref={menuRef} className="relative flex justify-center py-2">
      <button
        type="button"
        onClick={() => setOpen((p) => !p)}
        className="w-8 h-8 rounded-full border-2 border-dashed border-gray-300 text-gray-400 hover:border-brand-500 hover:text-brand-500 transition-colors flex items-center justify-center text-lg font-bold"
      >
        +
      </button>
      {open && (
        <div className="absolute top-full mt-1 z-50 bg-white border-2 border-black rounded-xl shadow-[4px_4px_0_#000] py-1 w-52">
          {ALL_BLOCK_TYPES.map((type) => (
            <button
              key={type}
              type="button"
              onClick={() => {
                onAdd(type);
                setOpen(false);
              }}
              className="w-full text-left px-4 py-2 text-sm font-bold hover:bg-gray-50 flex items-center gap-2"
            >
              <span>{BLOCK_ICONS[type]}</span>
              {BLOCK_LABELS[type]}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
