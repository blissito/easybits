import { BLOCK_LABELS, type LandingBlock } from "~/lib/landing2/blockTypes";

export function BlockToolbar({
  block,
  index,
  total,
  onMove,
  onDuplicate,
  onDelete,
}: {
  block: LandingBlock;
  index: number;
  total: number;
  onMove: (direction: "up" | "down") => void;
  onDuplicate: () => void;
  onDelete: () => void;
}) {
  return (
    <div className="absolute -top-3 left-1/2 -translate-x-1/2 z-10 flex items-center gap-1 bg-white border-2 border-black rounded-lg px-2 py-1 shadow-[2px_2px_0_#000] opacity-0 group-hover:opacity-100 transition-opacity">
      <span className="text-[10px] font-black text-gray-500 mr-1 uppercase">
        {BLOCK_LABELS[block.type]}
      </span>
      <button
        type="button"
        onClick={onMove.bind(null, "up")}
        disabled={index === 0}
        className="p-0.5 hover:bg-gray-100 rounded text-xs disabled:opacity-30"
        title="Mover arriba"
      >
        ↑
      </button>
      <button
        type="button"
        onClick={onMove.bind(null, "down")}
        disabled={index === total - 1}
        className="p-0.5 hover:bg-gray-100 rounded text-xs disabled:opacity-30"
        title="Mover abajo"
      >
        ↓
      </button>
      <button
        type="button"
        onClick={onDuplicate}
        className="p-0.5 hover:bg-gray-100 rounded text-xs"
        title="Duplicar"
      >
        ⧉
      </button>
      <button
        type="button"
        onClick={onDelete}
        className="p-0.5 hover:bg-red-100 rounded text-xs text-red-500"
        title="Eliminar"
      >
        ×
      </button>
    </div>
  );
}
