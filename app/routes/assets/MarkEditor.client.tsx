import MDEditor from "@uiw/react-md-editor";
import { useState } from "react";

export const MarkEditor = ({
  defaultValue,
  onChange,
  error,
}: {
  onChange?: (arg0: string) => void;
  error?: string;
  defaultValue?: string | null;
}) => {
  const [content, setContent] = useState(defaultValue);
  const handleChange = (v = "") => {
    onChange?.(v);
    setContent(v);
  };
  return (
    <section className="mb-3" data-color-mode="light">
      <p className="pt-3">Descripción</p>
      <p className="text-xs pb-3">Puedes usar markdown</p>
      <MDEditor
        preview="edit"
        value={content!}
        onChange={handleChange}
        height={500}
      />
      {error && <p className="text-red-500 text-xs">{error}</p>}
    </section>
  );
};
