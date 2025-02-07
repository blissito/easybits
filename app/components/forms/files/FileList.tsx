import { AnimatePresence, LayoutGroup, motion } from "motion/react";
import { useEffect, useRef } from "react";
import { BrutalButtonClose } from "~/components/common/BrutalButtonClose";
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
      <section
        style={{ scrollbarWidth: files.length < 3 ? "none" : "inherit" }}
        className="overflow-hidden overflow-y-scroll grid gap-3 max-h-[130px]"
      >
        <AnimatePresence mode="popLayout">
          {files.map((file, i) => (
            <FileItem
              index={i}
              key={file.name}
              onRemove={() => onRemove?.(i)}
              file={file}
            />
          ))}
        </AnimatePresence>
      </section>
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
      className={cn(
        "group bg-black",
        "text-brand-gray",
        "rounded-xl",
        className
      )}
      {...props}
    >
      <div
        className={cn(
          "flex items-center gap-3 group-hover:-translate-x-1 group-hover:-translate-y-1 bg-white px-2 py-3",
          "border border-dashed border-brand-gray rounded-xl active:group-hover:translate-x-0 active:group-hover:translate-y-0",
          "transition-all"
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
        "flex justify-between items-center",
        "rounded-xl",
        "border-2 border-dashed border-brand-gray px-2 py-3"
      )}
    >
      {file.type.includes("image") && (
        <img
          className="border rounded-xl w-8 h-8"
          src={URL.createObjectURL(file)}
          alt="preview"
        />
      )}
      <span ref={ref}>{file.name}</span>
      <BrutalButtonClose onClick={onRemove} />
    </motion.div>
  );
};
