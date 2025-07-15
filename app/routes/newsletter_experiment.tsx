import React, { useState } from "react";
import ReactFlow, {
  Background,
  applyNodeChanges,
  applyEdgeChanges,
  MarkerType,
  Handle,
  Position,
} from "reactflow";
import type { Edge, Node, NodeChange, EdgeChange } from "reactflow";
import "reactflow/dist/style.css";
import { db } from "~/.server/db";
import { getUserOrRedirect } from "~/.server/getters";
import type { Route } from "./+types/newsletter_experiment";
import NewsletterNodeDrawer from "../components/newsletters/NewsletterNodeDrawer";
import { nanoid } from "nanoid";

// Contexto extendido para pasar handleOpenDrawer
export type NewsletterNodeContextType = {
  setNodes: React.Dispatch<React.SetStateAction<any[]>>;
  setEditingNodeId: React.Dispatch<React.SetStateAction<string | null>>;
  editValue: string;
  setEditValue: React.Dispatch<React.SetStateAction<string>>;
  handleDeleteNode: (nodeId: string) => void;
  editingNodeId: string | null;
  nodes: any[];
  handleOpenDrawer: (nodeId: string) => void;
};
export const NewsletterNodeContext = React.createContext<
  NewsletterNodeContextType | undefined
>(undefined);

// Loader para traer el newsletter del usuario
export async function loader({ request }: Route.LoaderArgs) {
  const user = await getUserOrRedirect(request);
  const newsletter = await db.newsletter.findFirst({
    where: { userId: user.id },
  });
  return { newsletter, userId: user.id };
}

const DEFAULT_DELAY = "in 1 day";
const DEFAULT_NODES = [
  {
    id: "1",
    title: "Bienvenida",
    trigger: "Al suscribirse",
    content: "",
    delay: DEFAULT_DELAY,
  },
];

// EditableNode definido FUERA del componente
const EditableNode = ({ id, data }: any) => {
  const context = React.useContext(NewsletterNodeContext);
  if (!context)
    throw new Error(
      "EditableNode must be used within a NewsletterNodeContext.Provider"
    );
  const { setNodes, handleDeleteNode, nodes, handleOpenDrawer } = context;

  const { label = "", idx } = data || {};
  // Busca el índice real del nodo en el array actual de nodos
  const realIdx = nodes.findIndex((n) => n.id === id);

  function moveNodeLeft() {
    if (realIdx > 0) {
      setNodes((prev: any[]) => {
        const arr = [...prev];
        [arr[realIdx - 1], arr[realIdx]] = [arr[realIdx], arr[realIdx - 1]];
        return arr;
      });
    }
  }
  function moveNodeRight() {
    setNodes((prev: any[]) => {
      if (realIdx < prev.length - 1) {
        const arr = [...prev];
        [arr[realIdx], arr[realIdx + 1]] = [arr[realIdx + 1], arr[realIdx]];
        return arr;
      }
      return prev;
    });
  }
  return (
    <div
      className="custom-node group"
      style={{
        background: "#fff",
        border: "1px solid #ccc",
        borderRadius: 8,
        padding: 12,
        minWidth: 120,
        textAlign: "center",
        position: "relative",
      }}
      onDoubleClick={() => handleOpenDrawer(id)}
    >
      <Handle
        type="target"
        position={Position.Left}
        style={{ background: "#222" }}
      />
      <Handle
        type="source"
        position={Position.Right}
        style={{ background: "#222" }}
      />
      <div className="node-actions absolute top-1 left-1 w-full pr-3 justify-between gap-1 z-20 hidden group-hover:flex">
        <nav>
          {realIdx > 0 && (
            <button
              onClick={moveNodeLeft}
              title="Mover a la izquierda"
              className="bg-none border-none text-gray-500 text-lg cursor-pointer p-0 mr-1 opacity-70 hover:text-black"
            >
              ←
            </button>
          )}
          {realIdx < nodes.length - 1 && (
            <button
              onClick={moveNodeRight}
              title="Mover a la derecha"
              className="bg-none border-none text-gray-500 text-lg cursor-pointer p-0 opacity-70 hover:text-black"
            >
              →
            </button>
          )}
        </nav>
        <button
          title="Eliminar nodo"
          onClick={() => handleDeleteNode(id)}
          className="bg-gray-200 border-none rounded text-xs cursor-pointer px-2 py-0.5 opacity-70 hover:text-red-600 hover:bg-gray-300 ml-1"
        >
          ×
        </button>
      </div>
      <span>{data?.title || label}</span>
    </div>
  );
};

// nodeTypes definido fuera del componente
export const nodeTypes = { editableNode: EditableNode };

// Toast verde sutil para notificar guardado
function SimpleToast({ show, message }: { show: boolean; message: string }) {
  if (!show) return null;
  return (
    <div
      style={{
        position: "fixed",
        bottom: 32,
        left: "50%",
        transform: "translateX(-50%)",
        background: "#d1fae5", // verde sutil
        color: "#065f46",
        padding: "12px 32px",
        borderRadius: 8,
        fontWeight: 400,
        fontSize: 17,
        zIndex: 1000,
        boxShadow: "0 2px 12px rgba(0,0,0,0.10)",
        border: "1px solid #a7f3d0",
      }}
    >
      {message}
    </div>
  );
}

export default function NewsletterExperiment({
  loaderData,
}: Route.ComponentProps) {
  // Usa los nodos del newsletter o el default
  const nodesData =
    loaderData?.newsletter?.data && Array.isArray(loaderData.newsletter.data)
      ? loaderData.newsletter.data
      : DEFAULT_NODES;

  // 1. Inicializa nodes: si ya vienen con estructura de React Flow, úsalos tal cual
  const [nodes, setNodes] = React.useState<Node[]>(() => {
    if (!Array.isArray(nodesData) || nodesData.length === 0) {
      // fallback seguro
      return DEFAULT_NODES.map((n: any, idx: number) => ({
        id: n.id?.toString() ?? (idx + 1).toString(),
        type: "editableNode",
        position: { x: 100 + idx * 200, y: 200 },
        data: {
          title: n.title || `Correo ${idx + 1}`,
          label: n.title || `Correo ${idx + 1}`,
          content: n.content || "",
          delay: n.delay || DEFAULT_DELAY,
          idx,
        },
      }));
    }
    // Siempre mapea a la estructura de React Flow
    return nodesData.map((n: any, idx: number) => ({
      id: n.id?.toString() ?? (idx + 1).toString(),
      type: "editableNode",
      position: n.position || { x: 100 + idx * 200, y: 200 },
      data: {
        title: n.title || n.data?.title || `Correo ${idx + 1}`,
        label: n.title || n.data?.title || `Correo ${idx + 1}`,
        content: n.content || n.data?.content || "",
        delay: n.delay || n.data?.delay || DEFAULT_DELAY,
        idx,
      },
    }));
  });

  // Mapea los nodos del newsletter a nodos de React Flow
  function mapNodes(data: any[]): Node[] {
    return data.map((n: any, idx: number) => ({
      id: n.id?.toString() ?? (idx + 1).toString(),
      type: "editableNode",
      position: { x: 100 + idx * 200, y: 200 },
      data: { label: n.title || `Correo ${idx + 1}` },
    }));
  }

  // Crea edges conectando los nodos en orden de aparición en el array
  function mapEdges(nodes: Node[]): Edge[] {
    if (!Array.isArray(nodes) || nodes.length < 2) return [];
    // Solo conecta secuencialmente según el orden actual
    return nodes.slice(0, -1).map((n, idx) => ({
      id: `e${n.id}-${nodes[idx + 1].id}`,
      source: n.id,
      target: nodes[idx + 1].id,
      type: "smoothstep",
      style: { stroke: "#222", strokeWidth: 2 },
      markerEnd: {
        type: MarkerType.ArrowClosed,
        color: "#222",
      },
      label: nodes[idx + 1].data?.delay || "",
      labelStyle: { fill: "#222", fontWeight: 600, fontSize: 13 },
      labelBgStyle: { fill: "#fff", fillOpacity: 0.8 },
    }));
  }

  // Estado de nodos y edges
  const [edges, setEdges] = React.useState<Edge[]>(
    mapEdges(mapNodes(nodesData))
  );
  // Estado para mostrar toast de guardado
  const [showSavedToast, setShowSavedToast] = React.useState(false);
  // Estado para guardar el snapshot serializado de los nodos
  const [lastSavedNodes, setLastSavedNodes] = React.useState<string>(
    JSON.stringify(nodes)
  );
  // Estado para respaldo de undo
  const [lastNodesBackup, setLastNodesBackup] = React.useState<Node[] | null>(
    null
  );
  const [lastEdgesBackup, setLastEdgesBackup] = React.useState<Edge[] | null>(
    null
  );
  const [showUndoToast, setShowUndoToast] = React.useState(false);

  // Al crear los nodos, pasamos los handlers y estado necesarios directamente
  const [editingNodeId, setEditingNodeId] = React.useState<string | null>(null);
  const [editValue, setEditValue] = React.useState("");

  // Añadir nodo
  function handleAddNode() {
    setNodes((prev) => {
      // Usar nanoid para id único
      const newId = nanoid();
      let newX = 100;
      let newY = 200;
      if (prev.length > 0) {
        const last = prev[prev.length - 1];
        newX = (last.position?.x ?? 100) + 200;
        newY = last.position?.y ?? 200;
      }
      return [
        ...prev,
        {
          id: newId,
          type: "editableNode",
          position: { x: newX, y: newY },
          data: {
            label: `Correo ${prev.length + 1}`,
            idx: prev.length,
            delay: DEFAULT_DELAY,
            title: `Correo ${prev.length + 1}`,
            content: "",
          },
        },
      ];
    });
  }

  // Borrar nodo y reconectar, con respaldo para undo
  const handleDeleteNode = React.useCallback(
    (nodeId: string) => {
      setLastNodesBackup(nodes);
      setLastEdgesBackup(edges);
      setShowUndoToast(true);
      setNodes((prev) => prev.filter((n) => n.id !== nodeId));
    },
    [nodes, edges]
  );

  // Handler para deshacer
  function handleUndoDelete() {
    if (lastNodesBackup && lastEdgesBackup) {
      setNodes(lastNodesBackup);
      setEdges(lastEdgesBackup);
      setLastNodesBackup(null);
      setLastEdgesBackup(null);
      setShowUndoToast(false);
    }
  }

  // Soporte para Ctrl+Z / Cmd+Z
  React.useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "z") {
        if (lastNodesBackup && lastEdgesBackup) {
          e.preventDefault();
          handleUndoDelete();
        }
      }
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [lastNodesBackup, lastEdgesBackup]);

  // Función para guardar realmente en la base de datos
  async function saveNewsletter(nodes: any[]) {
    if (!loaderData?.newsletter?.id || !loaderData?.newsletter?.name) return;
    await fetch("/api/v1/newsletters", {
      method: "POST",
      body: (() => {
        const form = new FormData();
        form.append("intent", "update_newsletter");
        form.append(
          "data",
          JSON.stringify({
            id: loaderData.newsletter.id,
            name: loaderData.newsletter.name,
            data: nodes,
          })
        );
        return form;
      })(),
    });
  }

  // Recalcula edges cada vez que cambia el array de nodos
  React.useEffect(() => {
    setEdges(mapEdges(nodes));
    // Autoguardado: solo si hay cambios reales
    const serialized = JSON.stringify(nodes);
    if (serialized !== lastSavedNodes) {
      setShowSavedToast(false);
      const timeout = setTimeout(async () => {
        await saveNewsletter(nodes);
        setShowSavedToast(true);
        setLastSavedNodes(serialized);
        setTimeout(() => setShowSavedToast(false), 1800);
      }, 3000);
      return () => clearTimeout(timeout);
    }
    // Si no hay cambios, no hacer nada
    // eslint-disable-next-line
  }, [nodes]);

  const onNodesChange = React.useCallback((changes: NodeChange[]) => {
    setNodes((nds) => applyNodeChanges(changes, nds));
  }, []);
  const onEdgesChange = React.useCallback((changes: EdgeChange[]) => {
    // No permitir borrar edges
    setEdges((eds) => {
      const filtered = changes.filter((c) => c.type !== "remove");
      return applyEdgeChanges(filtered, eds);
    });
  }, []);
  const onConnect = React.useCallback(() => {
    // No permitir conexiones manuales
    return null;
  }, []);

  // Estado para el drawer lateral y el nodo seleccionado
  const [drawerOpen, setDrawerOpen] = React.useState(false);
  const [drawerNodeId, setDrawerNodeId] = React.useState<string | null>(null);

  // Encuentra el nodo seleccionado para el drawer
  const drawerNode = React.useMemo(() => {
    if (!drawerNodeId) return null;
    return nodes.find((n) => n.id === drawerNodeId) || null;
  }, [drawerNodeId, nodes]);

  // Handler para abrir el drawer desde el nodo
  function handleOpenDrawer(nodeId: string) {
    setDrawerNodeId(nodeId);
    setDrawerOpen(true);
  }
  function handleCloseDrawer() {
    setDrawerOpen(false);
    setDrawerNodeId(null);
  }
  // Handler para guardar cambios del drawer
  function handleSaveDrawerNode(updated: {
    title: string;
    content: string;
    delay: string;
  }) {
    setNodes((nds) =>
      nds.map((n) =>
        n.id === drawerNodeId
          ? {
              ...n,
              data: {
                ...n.data,
                title: updated.title,
                label: updated.title, // para mostrar en el nodo
                content: updated.content,
                delay: updated.delay,
              },
            }
          : n
      )
    );
    setDrawerOpen(false);
    setDrawerNodeId(null);
  }

  return (
    <div style={{ width: "100vw", height: "100vh" }}>
      <div style={{ position: "absolute", top: 20, left: 20, zIndex: 10 }}>
        <button
          onClick={handleAddNode}
          style={{
            background: "#222",
            color: "#fff",
            border: "none",
            borderRadius: 6,
            padding: "8px 16px",
            fontWeight: 600,
            cursor: "pointer",
            fontSize: 16,
          }}
        >
          + Añadir Entrega
        </button>
        {/* Panel flotante para copiar enlace de suscripción */}
        {loaderData?.newsletter?.id && (
          <FloatingNewsletterLink newsletterId={loaderData.newsletter.id} />
        )}
      </div>
      <NewsletterNodeContext.Provider
        value={{
          setNodes,
          setEditingNodeId,
          editValue,
          setEditValue,
          handleDeleteNode,
          editingNodeId,
          nodes,
          handleOpenDrawer,
        }}
      >
        <ReactFlow
          nodes={nodes}
          edges={edges}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onConnect={onConnect}
          fitView
          nodeTypes={nodeTypes}
          snapToGrid={true}
          snapGrid={[20, 20]}
        >
          <Background />
        </ReactFlow>
        <NewsletterNodeDrawer
          open={drawerOpen}
          onClose={handleCloseDrawer}
          node={drawerNode}
          onSave={handleSaveDrawerNode}
        />
        <SimpleToast show={showSavedToast} message="¡Guardado!" />
        {showUndoToast && (
          <UndoToast
            onUndo={handleUndoDelete}
            onClose={() => setShowUndoToast(false)}
          />
        )}
      </NewsletterNodeContext.Provider>
    </div>
  );
}

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = React.useState(false);
  async function handleCopy() {
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 1200);
  }
  return (
    <button
      onClick={handleCopy}
      style={{
        background: copied ? "#d1fae5" : "#eee",
        color: copied ? "#065f46" : "#333",
        border: "none",
        borderRadius: 4,
        padding: "4px 12px",
        fontWeight: 500,
        cursor: "pointer",
        fontSize: 14,
        transition: "background 0.2s, color 0.2s",
      }}
      title="Copiar enlace"
    >
      {copied ? "¡Copiado!" : "Copiar"}
    </button>
  );
}

function FloatingNewsletterLink({ newsletterId }: { newsletterId: string }) {
  const origin = typeof window !== "undefined" ? window.location.origin : "";
  const url = `${origin}/api/v1/newsletters?newsletterId=${newsletterId}`;
  const [copied, setCopied] = React.useState(false);
  async function handleCopy() {
    await navigator.clipboard.writeText(url);
    setCopied(true);
    setTimeout(() => setCopied(false), 1200);
  }
  return (
    <div
      style={{
        marginTop: 12,
        background: "#fff",
        border: "1px solid #ccc",
        borderRadius: 8,
        padding: "10px 16px",
        boxShadow: "0 2px 8px rgba(0,0,0,0.06)",
        display: "flex",
        alignItems: "center",
        gap: 8,
        fontSize: 15,
        position: "relative",
        width: 420,
        maxWidth: "90vw",
      }}
    >
      <span
        style={{
          color: "#222",
          fontWeight: 500,
          flex: 1,
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
        }}
      >
        {url}
      </span>
      <button
        onClick={handleCopy}
        style={{
          background: copied ? "#d1fae5" : "#eee",
          color: copied ? "#065f46" : "#333",
          border: "none",
          borderRadius: 4,
          padding: "4px 12px",
          fontWeight: 500,
          cursor: "pointer",
          fontSize: 14,
          transition: "background 0.2s, color 0.2s",
        }}
        title="Copiar enlace"
      >
        {copied ? "¡Copiado!" : "Copiar"}
      </button>
    </div>
  );
}

function UndoToast({
  onUndo,
  onClose,
}: {
  onUndo: () => void;
  onClose: () => void;
}) {
  React.useEffect(() => {
    const timeout = setTimeout(onClose, 4000);
    return () => clearTimeout(timeout);
  }, [onClose]);
  return (
    <div
      style={{
        position: "fixed",
        bottom: 80,
        left: "50%",
        transform: "translateX(-50%)",
        background: "#fef3c7",
        color: "#92400e",
        padding: "12px 32px",
        borderRadius: 8,
        fontWeight: 500,
        fontSize: 17,
        zIndex: 1001,
        boxShadow: "0 2px 12px rgba(0,0,0,0.10)",
        border: "1px solid #fde68a",
        display: "flex",
        alignItems: "center",
        gap: 16,
      }}
    >
      Nodo eliminado
      <button
        onClick={onUndo}
        style={{
          background: "#fff7ed",
          color: "#b45309",
          border: "1px solid #fde68a",
          borderRadius: 4,
          padding: "6px 18px",
          fontWeight: 600,
          marginLeft: 12,
          cursor: "pointer",
        }}
      >
        Deshacer
      </button>
    </div>
  );
}
