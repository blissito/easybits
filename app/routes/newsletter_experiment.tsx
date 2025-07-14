import React, { useState } from "react";
import { BrutalButton } from "~/components/common/BrutalButton";
import { EmailNodeCard } from "~/components/newsletters/EmailNodeCard";
import type { EmailNode } from "~/components/newsletters/EmailNodeCard";
import { getUserOrRedirect } from "~/.server/getters";
import type { Route } from "./+types/newsletter_experiment";
import { db } from "~/.server/db";

export async function loader({ request }: Route.LoaderArgs) {
  const user = await getUserOrRedirect(request);
  const newsletter = await db.newsletter.findFirst({
    where: {
      userId: user.id,
    },
  });
  return { newsletter, userId: user.id };
}

const DEFAULT_DELAY = "in 1 day";
const DEFAULT_NODES: EmailNode[] = [
  {
    id: "1",
    title: "Bienvenida",
    trigger: "Al suscribirse",
    content: "",
    delay: DEFAULT_DELAY,
  },
];

export default function NewsletterExperiment({
  loaderData,
}: Route.ComponentProps) {
  const { newsletter, userId } = loaderData;
  // Si hay newsletter y tiene data, úsalo; si no, usa los nodos por defecto
  const initialNodes: EmailNode[] =
    newsletter && newsletter.data && Array.isArray(newsletter.data)
      ? (newsletter.data as unknown as EmailNode[])
      : DEFAULT_NODES;

  const [nodes, setNodes] = useState<EmailNode[]>(initialNodes);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editValue, setEditValue] = useState("");
  const [editContent, setEditContent] = useState("");
  const [editDelay, setEditDelay] = useState(DEFAULT_DELAY);
  const [isSaving, setIsSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);

  // Guardar o actualizar newsletter
  const handleSave = async () => {
    setIsSaving(true);
    setSaveSuccess(false);
    const formData = new FormData();
    formData.set(
      "intent",
      newsletter ? "update_newsletter" : "create_newsletter"
    );
    formData.set(
      "data",
      JSON.stringify(
        newsletter
          ? { id: newsletter.id, name: newsletter.name, data: nodes }
          : { userId, name: "Mi Newsletter", data: nodes }
      )
    );
    const res = await fetch("/api/v1/newsletters", {
      method: "POST",
      body: formData,
    });
    setIsSaving(false);
    setSaveSuccess(res.ok);
    // Opcional: feedback visual
    setTimeout(() => setSaveSuccess(false), 2000);
  };

  // Agregar un nuevo nodo simple
  const addNode = () => {
    setNodes([
      ...nodes,
      {
        id: (nodes.length + 1).toString(),
        title: `Correo ${nodes.length + 1}`,
        trigger: "Después del anterior",
        content: "",
        delay: DEFAULT_DELAY,
      },
    ]);
  };

  // Eliminar nodo por id
  const deleteNode = (id: string) => {
    setNodes(nodes.filter((node) => node.id !== id));
  };

  // Guardar el nuevo título, contenido y delay
  const saveEdit = (id: string) => {
    if (editValue.trim() === "") {
      setEditingId(null);
      return;
    }
    setNodes(
      nodes.map((node) =>
        node.id === id
          ? {
              ...node,
              title: editValue,
              content: editContent,
              delay: editDelay,
            }
          : node
      )
    );
    setEditingId(null);
  };

  // Al hacer click en editar, cargar valores actuales
  const handleEditClick = (node: EmailNode) => {
    setEditingId(node.id);
    setEditValue(node.title);
    setEditContent(node.content || "");
    setEditDelay(node.delay || DEFAULT_DELAY);
  };

  // Limpiar edición
  const clearEditing = () => {
    setEditingId(null);
    setEditValue("");
    setEditContent("");
    setEditDelay(DEFAULT_DELAY);
  };

  // Handler para el select de delay
  const handleDelaySelectChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    if (e.target.value === "custom") {
      setEditDelay("");
    } else {
      setEditDelay(e.target.value);
    }
  };

  // Handler para el input personalizado de delay
  const handleDelayInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setEditDelay(e.target.value);
  };

  // El render de los nodos ya mostrará todos los que llegan del backend
  return (
    <div className="min-h-screen bg-gray-50 flex flex-col items-center py-10">
      <h1 className="text-2xl font-bold mb-8">Newsletter Flow Builder (MVP)</h1>
      <div className="flex flex-col items-center w-full max-w-md">
        {nodes.map((node, idx) => (
          <React.Fragment key={node.id}>
            <EmailNodeCard
              node={node}
              isEditing={editingId === node.id}
              editValue={editValue}
              editContent={editContent}
              editDelay={editDelay}
              onEditClick={() => {
                setEditingId(node.id);
                setEditValue(node.title);
                setEditContent(node.content || "");
                setEditDelay(node.delay || DEFAULT_DELAY);
              }}
              onEditChange={(e) => setEditValue(e.target.value)}
              onContentChange={(e) => setEditContent(e.target.value)}
              onDelaySelectChange={(e) => {
                if (e.target.value === "custom") {
                  setEditDelay("");
                } else {
                  setEditDelay(e.target.value);
                }
              }}
              onDelayInputChange={(e) => setEditDelay(e.target.value)}
              onEditKeyDown={(e) => {
                if (e.key === "Enter") {
                  // Aquí deberías guardar la edición
                  setNodes((prev) =>
                    prev.map((n) =>
                      n.id === node.id
                        ? {
                            ...n,
                            title: editValue,
                            content: editContent,
                            delay: editDelay,
                          }
                        : n
                    )
                  );
                  setEditingId(null);
                }
                if (e.key === "Escape") setEditingId(null);
              }}
              onDelete={() =>
                confirm("Segur@?")
                  ? setNodes((prev) => prev.filter((n) => n.id !== node.id))
                  : undefined
              }
              onSave={() => {
                setNodes((prev) =>
                  prev.map((n) =>
                    n.id === node.id
                      ? {
                          ...n,
                          title: editValue,
                          content: editContent,
                          delay: editDelay,
                        }
                      : n
                  )
                );
                setEditingId(null);
              }}
              onCancel={() => setEditingId(null)}
            />
            {idx < nodes.length - 1 && (
              <div className="mb-2">
                <span className="text-gray-400">↓</span>
              </div>
            )}
          </React.Fragment>
        ))}
        <div className="mt-4 w-full flex flex-col gap-2">
          <BrutalButton
            onClick={() =>
              setNodes((prev) => [
                ...prev,
                {
                  id: (prev.length + 1).toString(),
                  title: `Correo ${prev.length + 1}`,
                  trigger: "Después del anterior",
                  content: "",
                  delay: DEFAULT_DELAY,
                },
              ])
            }
            className="w-full"
          >
            + Agregar entrega
          </BrutalButton>
          <button
            onClick={handleSave}
            disabled={isSaving}
            className="text-xs text-gray-400 hover:text-gray-700 mt-2 self-end px-2 py-1 border border-transparent rounded transition focus:outline-none focus:ring-1 focus:ring-gray-300 disabled:opacity-50"
            style={{ background: "none" }}
          >
            {isSaving ? "Guardando..." : saveSuccess ? "¡Guardado!" : "Guardar"}
          </button>
        </div>
      </div>
    </div>
  );
}
