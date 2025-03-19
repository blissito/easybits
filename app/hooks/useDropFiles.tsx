import { useEffect, useRef, useState } from "react";

const noop = () => {};

export const useDropFiles = <T extends HTMLElement>(config?: {
  type?: string;
}) => {
  const { type } = config || {};
  const [isHovered, setIsHovered] = useState<null | "hover" | "dropping">(null);
  const [files, setFiles] = useState<File[]>([]);
  const ref = useRef<T>(null);

  const handleDrop = (e: MouseEvent & any) => {
    e.preventDefault();
    if (e.dataTransfer.files.length < 1) return;

    // images* only
    if (type) {
      const fls = [...e.dataTransfer.files].filter((f) =>
        f.type.includes("image")
      );
      setFiles(fls);
    } else {
      setFiles([...e.dataTransfer.files]);
    }
  };

  const handleDragOver = (ev: DragEvent) => {
    ev.preventDefault();
    setIsHovered("dropping");
  };

  const handleDragEnter = () => {
    setIsHovered("dropping");
  };

  // listeners
  useEffect(() => {
    ref.current!.addEventListener("mouseenter", () => {
      setIsHovered("hover");
    });
    ref.current!.addEventListener("mouseleave", () => {
      setIsHovered(null);
    });
    ref.current!.addEventListener("dragenter", handleDragEnter);
    ref.current!.addEventListener("dragover", handleDragOver);
    ref.current!.addEventListener("drop", handleDrop);

    return () => {
      ref.current!.removeEventListener("mouseenter", noop);
      ref.current!.removeEventListener("mouseleave", noop);
      ref.current!.removeEventListener("dragenter", handleDragEnter);
      ref.current!.removeEventListener("dragover", handleDragOver);
      ref.current!.removeEventListener("drop", handleDrop);
    };
  }, []);

  return { isHovered, ref, files };
};
