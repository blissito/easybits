import { useEffect, useRef, useState, type ChangeEvent } from "react";
import { useErrorToast } from "./useErrorToast";

export const useDropFiles = <T extends HTMLElement>(config?: {

  type?: 'epub' | 'pdf' | 'mobi' | 'text/plain';
  onDrop?: (files: File[]) => void;
  onChange?: (files: File[], name?: string) => void;
  persistFiles?: boolean;
  avoidClickWhenFiles?: boolean;
  name?: string;
  mode?: 'single' | 'multiple';
}) => {
  const {
    type,
    onDrop,
    onChange,
    persistFiles = true,
    avoidClickWhenFiles = false,
    name,
    mode = 'multiple',
  } = config || {};

  const [isHovered, setIsHovered] = useState<null | "hover" | "dropping">(null);
  const [files, setFiles] = useState<File[]>([]);
  const ref = useRef<T>(null);

  const removeFile = (index: number) => {
    const fs = [...files];
    fs.splice(index, 1);
    setFiles(fs);
  };

  const errorToast = useErrorToast("Selecciona el tipo de archivo correcto."); 

  const addFiles = (files: File[]) => {
    let fls = [];
    if (type) {
      fls = [...files].filter((f) => f.type.includes(type));
      fls.length < files.length && errorToast();
    } else {
      fls = files;
    }
    if (mode === 'single') {
      setFiles(fls);
    } else {
      setFiles((fs) => [...fs, ...fls]);
    }
  };

  const handleDrop = (e: MouseEvent & any) => {
    e.preventDefault();
    if (e.dataTransfer.files.length < 1) return;
    const files = [...e.dataTransfer.files];
    addFiles(files);
    onDrop?.(files);
  };

  const handleDragOver = (ev: DragEvent) => {
    ev.preventDefault();
    setIsHovered("dropping");
  };

  const handleDragEnter = () => {
    setIsHovered("dropping");
  };

  const handleClick = () => {
    if (avoidClickWhenFiles && files.length > 0) return;

    const input = Object.assign(document.createElement("input"), {
      type: "file",
      hidden: true,
      multiple: true,
    });
    input.accept = type!
    document.body.appendChild(input);
    input.onchange = (ev: ChangeEvent<HTMLInputElement>) => {
      if (!ev.currentTarget?.files || ev.currentTarget.files.length < 1) {
        return;
      }
      addFiles([...ev.currentTarget.files]);
    };
    input.click();
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

  useEffect(() => {
    onChange?.(files, name); // drop and click
    if (!persistFiles) {
      setFiles([]);
    }
  }, [files.length]);

  return { isHovered, ref, files, removeFile };
};
