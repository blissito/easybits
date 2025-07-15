import React, { useState } from "react";
import ReactFlow, {
  Background,
  addEdge,
  applyNodeChanges,
  applyEdgeChanges,
  MarkerType,
  Handle,
  Position,
} from "reactflow";
import type { Connection, Edge, Node, NodeChange, EdgeChange } from "reactflow";
import "reactflow/dist/style.css";
import { db } from "~/.server/db";
import { getUserOrRedirect } from "~/.server/getters";
import type { Route } from "./+types/newsletter_experiment";
import { Button } from "../components/common/Button";
import { cn } from "~/utils/cn";

// Contexto para pasar handlers y estado a los nodos custom
type NewsletterNodeContextType = {
  setNodes: React.Dispatch<React.SetStateAction<any[]>>;
  setEditingNodeId: React.Dispatch<React.SetStateAction<string | null>>;
  editValue: string;
  setEditValue: React.Dispatch<React.SetStateAction<string>>;
  handleDeleteNode: (nodeId: string) => void;
  editingNodeId: string | null;
  nodes: any[];
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

// EditableNode ahora recibe handlers y estado como props
const EditableNode = ({ id, data }: any) => {
  const context = React.useContext(NewsletterNodeContext);
  if (!context)
    throw new Error(
      "EditableNode must be used within a NewsletterNodeContext.Provider"
    );
  const {
    setNodes,
    setEditingNodeId,
    editValue,
    setEditValue,
    handleDeleteNode,
    editingNodeId,
    nodes,
  } = context;

  const { label = "", idx } = data || {};
  // Busca el índice real del nodo en el array actual de nodos
  const realIdx = nodes.findIndex((n) => n.id === id);
  const isEditing = editingNodeId === id;

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
      onDoubleClick={() => {
        setEditingNodeId(id);
        setEditValue(label);
      }}
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
      {isEditing ? (
        <input
          autoFocus
          value={editValue}
          onChange={(e) => setEditValue(e.target.value)}
          onBlur={() => {
            setNodes((nds: any[]) =>
              nds.map((n) =>
                n.id === id
                  ? { ...n, data: { ...n.data, label: editValue } }
                  : n
              )
            );
            setEditingNodeId(null);
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              setNodes((nds: any[]) =>
                nds.map((n) =>
                  n.id === id
                    ? { ...n, data: { ...n.data, label: editValue } }
                    : n
                )
              );
              setEditingNodeId(null);
            }
            if (e.key === "Escape") setEditingNodeId(null);
          }}
          style={{ width: "90%" }}
        />
      ) : (
        <span>{label}</span>
      )}
    </div>
  );
};

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

  // 1. Inicializa nodes solo con datos básicos
  const [nodes, setNodes] = React.useState<Node[]>(() =>
    nodesData.map((n: any, idx: number) => ({
      id: n.id?.toString() ?? (idx + 1).toString(),
      type: "editableNode",
      position: { x: 100 + idx * 200, y: 200 },
      data: {
        label: n.title || `Correo ${idx + 1}`,
        idx,
      },
    }))
  );

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
    // Filtra nodos inválidos
    const validNodes = nodes.filter((n) => n && n.id);
    if (validNodes.length < 2) return [];
    return validNodes.slice(1).map((n, idx) => ({
      id: `e${validNodes[idx].id}-${n.id}`,
      source: validNodes[idx].id,
      target: n.id,
      type: "smoothstep",
      style: { stroke: "#222", strokeWidth: 2 },
      markerEnd: {
        type: MarkerType.ArrowClosed,
        color: "#222",
      },
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
  // Al crear los nodos, pasamos los handlers y estado necesarios directamente
  const [editingNodeId, setEditingNodeId] = React.useState<string | null>(null);
  const [editValue, setEditValue] = React.useState("");

  // Añadir nodo
  function handleAddNode() {
    setNodes((prev) => {
      const newId = (prev.length + 1).toString();
      return [
        ...prev,
        {
          id: newId,
          type: "editableNode",
          position: { x: 100 + prev.length * 200, y: 200 },
          data: { label: `Correo ${prev.length + 1}`, idx: prev.length },
        },
      ];
    });
  }

  // Borrar nodo y reconectar
  const handleDeleteNode = React.useCallback(
    (nodeId: string) => {
      setNodes((prev) => prev.filter((n) => n.id !== nodeId));
    },
    [setNodes]
  );

  // Recalcula edges cada vez que cambia el array de nodos
  React.useEffect(() => {
    setEdges(mapEdges(nodes));
    // Autoguardado: solo si hay cambios reales
    const serialized = JSON.stringify(nodes);
    if (serialized !== lastSavedNodes) {
      setShowSavedToast(false);
      const timeout = setTimeout(() => {
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
        <SimpleToast show={showSavedToast} message="¡Guardado!" />
      </NewsletterNodeContext.Provider>
    </div>
  );
}
