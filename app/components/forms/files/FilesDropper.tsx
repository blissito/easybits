import { useState, type DragEventHandler } from "react";
import { cn } from "~/utils/cn";

export const FilesDropper = ({
  onDrop,
  onClick,
}: {
  onDrop?: (arg0: DragEventHandler<HTMLButtonElement>) => void;
  onClick?: () => void;
}) => {
  const [isMouseDraggingOver, setIsMouseDraggingOver] = useState(false);
  return (
    <button
      onDragOverCapture={() => setIsMouseDraggingOver(true)}
      onDragOver={(event) => event.preventDefault()}
      onDrop={onDrop}
      type="button"
      onClick={onClick}
      className={cn(
        "border-2 border-black border-dashed rounded-xl px-32 flex items-center gap-3 h-[228px] box-border",
        "group hover:cursor-pointer hover:border-brand-500",
        "transition-all",
        {
          "border-brand-500 text-brand-500 scale-105": isMouseDraggingOver,
        }
      )}
    >
      <img className="w-8 h-8" src="/icons/image-upload.svg" />
      <p
        className={cn(
          "text-left",
          "text-sm group-hover:text-brand-500",
          "transition-all"
        )}
      >
        Arrastra o selecciona los archivos. Puedes subir hasta 50 archivos con
        un peso máximo de 10 GB en total.
      </p>
    </button>
  );
};
