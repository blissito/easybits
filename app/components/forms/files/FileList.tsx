import { AnimatePresence, motion } from "motion/react";
import { useEffect, useRef } from "react";
import { IoClose } from "react-icons/io5";
import { cn } from "~/utils/cn";

export const FileList = ({
  files,
  onRemove,
  onOpenFileSelector,
}: {
  onOpenFileSelector?: () => void;
  onRemove?: (arg0: number) => void;
  files: File[];
}) => {
  return (
    <>
      <motion.section
        drag
        style={{ scrollbarWidth: files.length < 3 ? "none" : "inherit" }}
        className="overflow-hidden overflow-y-scroll grid gap-3 max-h-[240px]"
      >
        <AnimatePresence mode="wait">
          {files.map((file, i) => (
            <FileItem
              index={i}
              key={file.name}
              onRemove={() => onRemove?.(i)}
              file={file}
            />
          ))}
        </AnimatePresence>
      </motion.section>
      <AddMoreButton
        className="mt-3"
        index={files.length + 1}
        onClick={onOpenFileSelector}
      />
    </>
  );
};

const AddMoreButton = ({
  index = 3,
  onClick,
  className,
  ...props
}: {
  className?: string;
  onClick?: () => void;
  [x: string]: unknown;
}) => {
  return (
    <motion.button
      layout
      transition={{ delay: index * 0.08 }}
      onClick={onClick}
      className={cn("group bg-black", "text-marengo", "rounded-xl", className)}
      {...props}
    >
      <div
        className={cn(
          "flex items-center gap-3  bg-white px-2 py-3",
          "border border-dashed border-marengo rounded-xl group-hover:active:translate-x-0 group-hover:active:translate-y-0",
          "transition-all",
          "group-hover:text-brand-500 group-hover:border-brand-500"
        )}
      >
        <img className="w-8 h-8" src="/icons/image-upload.svg" />
        <span>Selecciona más archivos</span>
      </div>
    </motion.button>
  );
};

const FileItem = ({
  index = 1,
  file,
  onRemove,
}: {
  index?: number;
  onRemove?: () => void;
  file: File;
}) => {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    ref.current?.scrollIntoView({ behavior: "smooth" });
  }, []);
  return (
    <motion.div
      layout
      exit={{ x: -10, opacity: 0 }}
      initial={{ x: 10, opacity: 0 }}
      animate={{ x: 0, opacity: 1 }}
      transition={{ delay: 0.08 * index }}
      className={cn(
        "flex items-center gap-2",
        "rounded-xl",
        "border border-dashed border-black px-3 py-3"
      )}
    >
      {file.type.includes("image") && (
        <img
          className="border rounded-lg w-8 h-8"
          src={URL.createObjectURL(file)}
          alt="preview"
        />
      )}
      <span className="truncate max-w-md" ref={ref}>
        {file.name}
      </span>
      <button className="w-6 h-6 bg-black rounded-full flex justify-center items-center ml-auto ">
        <IoClose onClick={onRemove} className="text-white text-xl " />
      </button>
    </motion.div>
  );
};
