import React, { useState, useRef, useEffect } from "react";
import { Button } from "../common/Button";
import { Input } from "../common/Input";
import Spinner from "../common/Spinner";

interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: Date;
  isStreaming?: boolean;
}

// Modelos disponibles de Gemini
const GEMINI_MODELS = [
  { value: "gemini-1.5-flash", label: "Gemini 1.5 Flash" },
  { value: "gemini-1.5-pro", label: "Gemini 1.5 Pro" },
  { value: "gemini-2.0-flash-exp", label: "Gemini 2.0 Flash" },
  { value: "claude-3-5-sonnet", label: "Claude 3.5 Sonnet" },
  { value: "claude-3-5-haiku", label: "Claude 3.5 Haiku" },
  { value: "gpt-4-turbo", label: "GPT-4 Turbo" },
  { value: "gpt-4o", label: "GPT-4o" },
  { value: "llama-3-1-8b", label: "Llama 3.1 8B" },
  { value: "llama-3-1-70b", label: "Llama 3.1 70B" },
];

interface GeminiChatProps {
  className?: string;
  placeholder?: string;
  initialMessage?: string;
  model?: string;
  onModelChange?: (model: string) => void;
  systemPrompt?: string;
}

export function GeminiChat({
  className = "",
  placeholder = "Escribe tu mensaje...",
  initialMessage = "¡Hola blissmo!",
  model = "gemini-1.5-flash",
  onModelChange,
  systemPrompt = "Eres un asistente de IA amigable y útil. Responde de manera clara, concisa y en español. Ayuda a los usuarios con sus preguntas y tareas de la mejor manera posible.",
}: GeminiChatProps) {
  const [messages, setMessages] = useState<Message[]>([
    {
      id: "1",
      role: "assistant",
      content: initialMessage,
      timestamp: new Date(),
    },
  ]);
  const [inputValue, setInputValue] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputValue.trim() || isLoading) return;

    const userMessage: Message = {
      id: Date.now().toString(),
      role: "user",
      content: inputValue.trim(),
      timestamp: new Date(),
    };

    setMessages((prev) => [...prev, userMessage]);
    setInputValue("");
    setIsLoading(true);

    // Crear mensaje del asistente para streaming
    const assistantMessageId = (Date.now() + 1).toString();
    const assistantMessage: Message = {
      id: assistantMessageId,
      role: "assistant",
      content: "",
      timestamp: new Date(),
      isStreaming: true,
    };

    setMessages((prev) => [...prev, assistantMessage]);

    try {
      const response = await fetch("/api/v1/ai/chat", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          message: userMessage.content,
          history: messages.slice(-10).map((msg) => ({
            role: msg.role,
            content: msg.content,
          })),
          model,
          systemPrompt,
        }),
      });

      if (!response.ok) {
        throw new Error("Error en la respuesta del servidor");
      }

      // Procesar el stream de respuesta
      const reader = response.body?.getReader();
      const decoder = new TextDecoder();

      if (!reader) {
        throw new Error("No se pudo leer el stream");
      }

      let accumulatedContent = "";

      while (true) {
        const { done, value } = await reader.read();

        if (done) break;

        const chunk = decoder.decode(value);
        const lines = chunk.split("\n");

        for (const line of lines) {
          if (line.startsWith("data: ")) {
            try {
              const data = JSON.parse(line.slice(6));

              switch (data.type) {
                case "start":
                  // El stream ha comenzado
                  break;
                case "chunk":
                  // Agregar contenido al mensaje
                  accumulatedContent += data.content;
                  setMessages((prev) =>
                    prev.map((msg) =>
                      msg.id === assistantMessageId
                        ? { ...msg, content: accumulatedContent }
                        : msg
                    )
                  );
                  break;
                case "end":
                  // El stream ha terminado
                  setMessages((prev) =>
                    prev.map((msg) =>
                      msg.id === assistantMessageId
                        ? { ...msg, isStreaming: false }
                        : msg
                    )
                  );
                  break;
                case "error":
                  throw new Error(data.error);
              }
            } catch (parseError) {
              console.error("Error parsing SSE data:", parseError);
            }
          }
        }
      }
    } catch (error) {
      console.error("Error al enviar mensaje:", error);
      const errorMessage: Message = {
        id: assistantMessageId,
        role: "assistant",
        content:
          "Lo siento, hubo un error al procesar tu mensaje. Por favor, intenta de nuevo.",
        timestamp: new Date(),
        isStreaming: false,
      };
      setMessages((prev) =>
        prev.map((msg) => (msg.id === assistantMessageId ? errorMessage : msg))
      );
    } finally {
      setIsLoading(false);
      // Restaurar el focus al input después de enviar
      setTimeout(() => {
        inputRef.current?.focus();
      }, 100);
    }
  };

  return (
    <div
      className={`flex flex-col h-full max-h-[600px] bg-white rounded-lg border border-gray-200 ${className}`}
    >
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b border-gray-200">
        <div className="flex items-center space-x-3">
          <div className="w-8 h-8 bg-gradient-to-r from-blue-500 to-purple-500 rounded-full flex items-center justify-center">
            <span className="text-white text-sm font-bold">AI</span>
          </div>
          <div className="flex items-center space-x-2">
            <h3 className="font-semibold text-gray-900">Chatea con</h3>
            <select
              value={model}
              onChange={(e) => onModelChange?.(e.target.value)}
              className="bg-gray-100 text-gray-900 text-sm rounded-lg px-2 py-1 pr-6 border border-gray-300 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent hover:bg-gray-200 transition-all duration-200 appearance-none relative"
              style={{
                backgroundImage: `url("data:image/svg+xml,%3csvg xmlns='http://www.w3.org/2000/svg' fill='none' viewBox='0 0 20 20'%3e%3cpath stroke='%236b7280' stroke-linecap='round' stroke-linejoin='round' stroke-width='1.5' d='m6 8 4 4 4-4'/%3e%3c/svg%3e")`,
                backgroundPosition: "right 4px center",
                backgroundRepeat: "no-repeat",
                backgroundSize: "16px 16px",
              }}
            >
              {GEMINI_MODELS.map((modelOption) => (
                <option key={modelOption.value} value={modelOption.value}>
                  {modelOption.label}
                </option>
              ))}
            </select>
          </div>
        </div>
        <div className="flex items-center space-x-2">
          {isLoading && (
            <div className="flex items-center space-x-1 text-sm text-gray-500">
              <Spinner size="sm" />
              <span>Pensando...</span>
            </div>
          )}
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {messages.map((message) => (
          <div
            key={message.id}
            className={`flex ${
              message.role === "user" ? "justify-end" : "justify-start"
            }`}
          >
            <div
              className={`max-w-[80%] rounded-lg px-4 py-2 ${
                message.role === "user"
                  ? "bg-blue-500 text-white"
                  : "bg-gray-100 text-gray-900"
              }`}
            >
              <p className="text-sm whitespace-pre-wrap">
                {message.content}
                {message.isStreaming && (
                  <span className="inline-block w-2 h-4 bg-gray-400 ml-1 animate-pulse"></span>
                )}
              </p>
              <p className="text-xs opacity-70 mt-1">
                {message.timestamp.toLocaleTimeString()}
              </p>
            </div>
          </div>
        ))}
        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <form onSubmit={handleSubmit} className="p-4 border-t border-gray-200">
        <div className="flex space-x-2">
          <Input
            ref={inputRef}
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            placeholder={placeholder}
            disabled={isLoading}
            className="flex-1"
          />
          <Button
            type="submit"
            disabled={!inputValue.trim() || isLoading}
            className="px-4 py-2"
          >
            {isLoading ? <Spinner size="sm" /> : "Enviar"}
          </Button>
        </div>
      </form>
    </div>
  );
}
