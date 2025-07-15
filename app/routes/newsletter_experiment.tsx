import React from "react";
import ReactFlow, {
  Background,
  addEdge,
  applyNodeChanges,
  applyEdgeChanges,
} from "reactflow";
import type { Connection, Edge, Node, NodeChange, EdgeChange } from "reactflow";
import "reactflow/dist/style.css";
import { db } from "~/.server/db";
import { getUserOrRedirect } from "~/.server/getters";
import type { Route } from "./+types/newsletter_experiment";

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

export default function NewsletterExperiment({
  loaderData,
}: Route.ComponentProps) {
  // Usa los nodos del newsletter o el default
  const nodesData =
    loaderData?.newsletter?.data && Array.isArray(loaderData.newsletter.data)
      ? loaderData.newsletter.data
      : DEFAULT_NODES;

  // Mapea los nodos del newsletter a nodos de React Flow
  const initialNodes: Node[] = nodesData.map((n: any, idx: number) => ({
    id: n.id?.toString() ?? (idx + 1).toString(),
    type: "default",
    position: { x: 100 + idx * 200, y: 200 }, // Fuerza posición única
    data: { label: n.title || `Correo ${idx + 1}` },
  }));

  // Crea edges conectando los nodos en orden
  const initialEdges: Edge[] =
    initialNodes.length > 1
      ? initialNodes.slice(1).map((n, idx) => ({
          id: `e${initialNodes[idx].id}-${n.id}`,
          source: initialNodes[idx].id,
          target: n.id,
          type: "smoothstep",
        }))
      : [];

  const [nodes, setNodes] = React.useState<Node[]>(initialNodes);
  const [edges, setEdges] = React.useState<Edge[]>(initialEdges);

  const onNodesChange = React.useCallback((changes: NodeChange[]) => {
    setNodes((nds) => applyNodeChanges(changes, nds));
  }, []);
  const onEdgesChange = React.useCallback((changes: EdgeChange[]) => {
    setEdges((eds) => applyEdgeChanges(changes, eds));
  }, []);
  const onConnect = React.useCallback((connection: Edge<any> | Connection) => {
    setEdges((eds) => addEdge({ ...connection, type: "smoothstep" }, eds));
  }, []);

  return (
    <div style={{ width: "100vw", height: "100vh" }}>
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={onConnect}
        fitView
        snapToGrid={true}
        snapGrid={[20, 20]}
      >
        <Background />
      </ReactFlow>
    </div>
  );
}
