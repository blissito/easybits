import { useEffect, useRef, useState, type ChangeEvent } from "react";
import toast from "react-hot-toast";

export const useDropFiles = <T extends HTMLElement>(config?: {
  type?: string;
}) => {
  const { type } = config || {};
  const [isHovered, setIsHovered] = useState<null | "hover" | "dropping">(null);
  const [files, setFiles] = useState<File[]>([]);
  const ref = useRef<T>(null);

  const removeFile = (index: number) => {
    const fs = [...files];
    fs.splice(index, 1);
    setFiles(fs);
  };

  const addFiles = (files: File[]) => {
    let fls = [];
    if (type) {
      fls = [...files].filter((f) => f.type.includes(type));
      fls.length < files.length &&
        toast.error("Selecciona el tipo de archivo correcto.", {
          style: {
            border: "2px solid #000000",
            padding: "16px",
            color: "#000000",
          },
        });
    } else {
      fls = files;
    }
    setFiles((fs) => [...fs, ...fls]);
  };

  const handleDrop = (e: MouseEvent & any) => {
    e.preventDefault();
    if (e.dataTransfer.files.length < 1) return;

    addFiles([...e.dataTransfer.files]);
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

  return { isHovered, ref, files, removeFile };
};
