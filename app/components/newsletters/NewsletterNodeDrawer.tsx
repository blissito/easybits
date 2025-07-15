import React, { useState, useEffect } from "react";

interface NewsletterNodeDrawerProps {
  open: boolean;
  onClose: () => void;
  node: any | null;
  onSave: (updated: { title: string; content: string; delay: string }) => void;
}

export default function NewsletterNodeDrawer({
  open,
  onClose,
  node,
  onSave,
}: NewsletterNodeDrawerProps) {
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [delay, setDelay] = useState("");

  useEffect(() => {
    if (node) {
      setTitle(node.data?.title || node.data?.label || "");
      setContent(node.data?.content || "");
      setDelay(node.data?.delay || "in 1 day");
    }
  }, [node, open]);

  if (!open || !node) return null;

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    onSave({ title, content, delay });
    onClose();
  }

  return (
    <div
      style={{
        position: "fixed",
        top: 0,
        right: 0,
        width: 360,
        height: "100vh",
        background: "#fff",
        boxShadow: "-2px 0 16px rgba(0,0,0,0.08)",
        zIndex: 2000,
        transform: open ? "translateX(0)" : "translateX(100%)",
        transition: "transform 0.25s cubic-bezier(.4,0,.2,1)",
        padding: 32,
        display: "flex",
        flexDirection: "column",
      }}
    >
      <button
        onClick={onClose}
        style={{
          position: "absolute",
          top: 16,
          right: 16,
          background: "none",
          border: "none",
          fontSize: 24,
          cursor: "pointer",
          color: "#888",
        }}
        aria-label="Cerrar"
      >
        ×
      </button>
      <h2 style={{ marginBottom: 24, fontWeight: 700, fontSize: 22 }}>
        Editar Entrega
      </h2>
      <form
        onSubmit={handleSubmit}
        style={{ flex: 1, display: "flex", flexDirection: "column", gap: 18 }}
      >
        <label style={{ fontWeight: 500 }}>
          Título
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            style={{
              width: "100%",
              marginTop: 4,
              padding: 8,
              borderRadius: 4,
              border: "1px solid #ccc",
            }}
            required
          />
        </label>
        <label style={{ fontWeight: 500 }}>
          Contenido
          <textarea
            value={content}
            onChange={(e) => setContent(e.target.value)}
            style={{
              width: "100%",
              minHeight: 400,
              marginTop: 4,
              padding: 8,
              borderRadius: 4,
              border: "1px solid #ccc",
              resize: "vertical",
            }}
            required
          />
        </label>
        <label style={{ fontWeight: 500 }}>
          ¿Cuándo enviar?
          <select
            value={delay}
            onChange={(e) => setDelay(e.target.value)}
            style={{
              width: "100%",
              marginTop: 4,
              padding: 8,
              borderRadius: 4,
              border: "1px solid #ccc",
            }}
            required
          >
            <option value="in 1 minute">1 minuto</option>
            <option value="in 1 hour">1 hora</option>
            <option value="in 1 day">1 día</option>
            <option value="in 2 days">2 días</option>
            <option value="in 1 week">1 semana</option>
            <option value="in 2 weeks">2 semanas</option>
            <option value="in 4 weeks">4 semanas</option>
            <option value="in 2 months">2 meses</option>
          </select>
        </label>
        <div style={{ marginTop: "auto", display: "flex", gap: 12 }}>
          <button
            type="button"
            onClick={onClose}
            style={{
              background: "#eee",
              color: "#333",
              border: "none",
              borderRadius: 4,
              padding: "8px 18px",
              fontWeight: 500,
              cursor: "pointer",
            }}
          >
            Cancelar
          </button>
          <button
            type="submit"
            style={{
              background: "#222",
              color: "#fff",
              border: "none",
              borderRadius: 4,
              padding: "8px 18px",
              fontWeight: 600,
              cursor: "pointer",
            }}
          >
            Guardar
          </button>
        </div>
      </form>
    </div>
  );
}
