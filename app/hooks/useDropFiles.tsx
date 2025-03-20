import { useEffect, useRef, useState, type ChangeEvent } from "react";

export const useDropFiles = <T extends HTMLElement>(config?: {
  type?: string;
}) => {
  const { type } = config || {};
  const [isHovered, setIsHovered] = useState<null | "hover" | "dropping">(null);
  const [files, setFiles] = useState<File[]>([]);
  const ref = useRef<T>(null);

  const addFiles = (files: File[]) => {
    setFiles((fs) => [...fs, ...files]);
  };

  const handleDrop = (e: MouseEvent & any) => {
    e.preventDefault();
    if (e.dataTransfer.files.length < 1) return;

    // images* only
    if (type) {
      const fls = [...e.dataTransfer.files].filter((f) =>
        f.type.includes("image")
      );
      addFiles(fls);
    } else {
      addFiles([...e.dataTransfer.files]);
    }
  };

  const handleDragOver = (ev: DragEvent) => {
    ev.preventDefault();
    setIsHovered("dropping");
  };

  const handleDragEnter = () => {
    setIsHovered("dropping");
  };

  const handleClick = () => {
    const input = Object.assign(document.createElement("input"), {
      type: "file",
      hidden: true,
      multiple: true,
    });
    document.body.appendChild(input);
    input.click();
    input.onchange = (ev: ChangeEvent<HTMLInputElement>) => {
      if (!ev.currentTarget?.files || ev.currentTarget.files.length < 1) {
        return;
      }
      addFiles([...ev.currentTarget.files]);
    };
  };

  const handleMouseEnter = () => {
    setIsHovered("hover");
  };

  const handleMouseLeave = () => {
    setIsHovered(null);
  };

  // listeners
  useEffect(() => {
    if (!ref.current) return;

    ref.current.addEventListener("mouseenter", handleMouseEnter);
    ref.current.addEventListener("mouseleave", handleMouseLeave);
    ref.current.addEventListener("dragenter", handleDragEnter);
    ref.current.addEventListener("dragover", handleDragOver);
    ref.current.addEventListener("drop", handleDrop);
    ref.current.addEventListener("click", handleClick);

    return () => {
      if (!ref.current) return;

      ref.current.removeEventListener("click", handleClick);
      ref.current.removeEventListener("mouseenter", handleMouseEnter);
      ref.current.removeEventListener("mouseleave", handleMouseLeave);
      ref.current.removeEventListener("dragenter", handleDragEnter);
      ref.current.removeEventListener("dragover", handleDragOver);
      ref.current.removeEventListener("drop", handleDrop);
    };
  }, []);

  return { isHovered, ref, files };
};
