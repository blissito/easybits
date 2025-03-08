import React from "react";
import SimpleMDE from "react-simplemde-editor";
import "easymde/dist/easymde.min.css";

// @todo what about a custom one?

export const MarkEditor = () => {
  return (
    <section className="mt-8 mb-3">
      <h2 className="text-2xl">Detalles de tu Asset</h2>
      <p className="py-3">Descripción</p>
      <SimpleMDE />
    </section>
  );
};
