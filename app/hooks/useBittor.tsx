import { useState } from "react";
import { nanoid } from "nanoid";

export type Message = {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: Date;
  isStreaming?: boolean;
  toolInUse?: {
    name: string;
    input?: string;
    status: 'pending' | 'completed' | 'error';
    result?: string;
  };
};

export const useBittor = (initialHistory: Message[] = []) => {
  const [messages, setMessages] = useState<Message[]>(initialHistory);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [toolInUse, setToolInUse] = useState<{
    name: string;
    input?: string;
    status: 'pending' | 'completed' | 'error';
    result?: string;
  } | null>(null);
  
  // Estado para controlar si se está generando una respuesta
  const [isGenerating, setIsGenerating] = useState(false);

  const sendMessage = async (userMessage: string) => {
    setIsLoading(true);
    setIsGenerating(true);
    setError(null);
    const assistantId = nanoid();
    
    // Crear mensaje del usuario
    const userMessageObj: Message = {
      id: nanoid(3),
      role: "user",
      content: userMessage,
      timestamp: new Date()
    };
    
    // Añadir mensaje del usuario al historial
    setMessages(prev => [...prev, userMessageObj]);
    
    // Crear mensaje de asistente temporal para mostrar carga
    const tempAssistantMessage: Message = {
      id: assistantId,
      role: "assistant",
      content: "",
      timestamp: new Date(),
      isStreaming: true
    };
    
    setMessages(prev => [...prev, tempAssistantMessage]);
    
    try {
      // Usar fetch para compatibilidad con la implementación existente
      const response = await fetch("/api/v1/ai/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: userMessage,
          history: messages
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Error en la respuesta: ${response.status} - ${errorText}`);
      }
      
      const data = await response.json();
      
      // Actualizar el mensaje del asistente con la respuesta
      setMessages(prev => {
        const updated = [...prev];
        const lastMessage = updated[updated.length - 1];
        if (lastMessage && lastMessage.role === 'assistant') {
          lastMessage.content = data.content || data.message?.content || "No se pudo obtener una respuesta";
          lastMessage.isStreaming = false;
          
          // Si hay información de herramienta usada, la añadimos al mensaje
          // pero solo guardamos el nombre de la herramienta, no el resultado
          if (data.tool_used) {
            lastMessage.toolInUse = {
              name: data.tool_used.name,
              status: 'completed'
            };
          }
        }
        return updated;
      });
      
      return data;
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : "Error al procesar tu mensaje. Intenta de nuevo.";
      setError(errorMessage);
      
      const errorMessageObj: Message = {
        id: assistantId,
        role: "assistant",
        content: errorMessage,
        timestamp: new Date(),
        isStreaming: false
      };
      
      setMessages(prev => [...prev, errorMessageObj]);
      return errorMessageObj;
    } finally {
      setIsLoading(false);
      setIsGenerating(false);
      setToolInUse(null);
    }
  };

  return { 
    messages, 
    sendMessage, 
    isLoading, 
    isGenerating,
    error,
    toolInUse
  };
};
