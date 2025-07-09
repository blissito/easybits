import { useState } from "react";
import { nanoid } from "nanoid";

export type Message = {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: Date;
  isStreaming?: boolean;
};

export const useBittor = (initialHistory: Message[] = []) => {
  const [messages, setMessages] = useState<Message[]>(initialHistory);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const sendMessage = async (userMessage: string) => {
    setIsLoading(true);
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
    
    try {
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
      const assistantMessage: Message = {
        id: assistantId,
        role: "assistant",
        content: data.content || data.message?.content || "No se pudo obtener una respuesta",
        timestamp: new Date(),
        isStreaming: false
      };
      
      setMessages(prev => [...prev, assistantMessage]);
      return assistantMessage;
      
    } catch (err) {
      const errorMessage = "Error al procesar tu mensaje. Intenta de nuevo.";
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
    }
  };

  return { 
    messages, 
    sendMessage, 
    isLoading, 
    error 
  };
};
