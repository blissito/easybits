// Este archivo es el resultado de renombrar GeminiChat.tsx a BittorChat.tsx

import React, { useState, useRef, useEffect } from "react";
import { motion, AnimatePresence } from "motion/react";
import { Button } from "../common/Button";
import { Input } from "../common/Input";
import { BrutalButtonClose } from "../common/BrutalButtonClose";
import { BrutalButton } from "../common/BrutalButton";
import Spinner from "../common/Spinner";
import { useBittor } from "~/hooks/useBittor";
import { nanoid } from "nanoid";

export interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: Date;
  isStreaming?: boolean;
}

interface BittorChatProps {
  className?: string;
  placeholder?: string;
  initialMessage?: string;
  model?: string;
  onModelChange?: (model: string) => void;
  systemPrompt?: string;
  onClose?: () => void;
}

export function BittorChat({
  className = "",
  placeholder = "Escribe tu mensaje...",
  initialMessage = "¡Hola! 👋🏼 soy Bittor, tu asistente de IA.\n ¿En qué te ayudo? 📞",
  onClose,
}: BittorChatProps) {
  const [messages, setMessages] = useState<Message[]>([
    {
      id: "bittor-initial-message",
      role: "assistant",
      content: initialMessage,
      timestamp: new Date(),
    },
  ]);
  const [inputValue, setInputValue] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  // Función para parsear links en el texto
  const parseLinks = (
    input: string | (string | React.ReactNode)[]
  ): React.ReactNode[] => {
    if (Array.isArray(input)) {
      // Procesa cada parte recursivamente
      return input.flatMap((part, i) =>
        typeof part === "string" ? parseLinks(part) : [part]
      );
    }
    const text = input;
    const linkRegex = /<a\s+href=["']([^"']+)["'][^>]*>(.*?)<\/a>/gi;
    const parts: React.ReactNode[] = [];
    let lastIndex = 0;
    let match;

    while ((match = linkRegex.exec(text)) !== null) {
      if (match.index > lastIndex) {
        parts.push(text.slice(lastIndex, match.index));
      }
      const href = match[1];
      const linkText = match[2];
      parts.push(
        <a
          key={`link-${match.index}`}
          href={href}
          target="_blank"
          rel="noopener noreferrer"
          className="text-blue-600 hover:text-blue-800 underline"
        >
          {linkText}
        </a>
      );
      lastIndex = match.index + match[0].length;
    }
    if (lastIndex < text.length) {
      parts.push(text.slice(lastIndex));
    }
    return parts;
  };

  // Función para parsear negritas tipo **texto** (markdown)
  const parseBold = (text: string) => {
    const boldRegex = /\*\*(.*?)\*\*/g;
    const parts = [];
    let lastIndex = 0;
    let match;

    while ((match = boldRegex.exec(text)) !== null) {
      // Agregar texto antes de la negrita
      if (match.index > lastIndex) {
        parts.push(text.slice(lastIndex, match.index));
      }
      // Agregar el texto en negrita
      parts.push(<strong key={`bold-${match.index}`}>{match[1]}</strong>);
      lastIndex = match.index + match[0].length;
    }
    // Agregar texto restante
    if (lastIndex < text.length) {
      parts.push(text.slice(lastIndex));
    }
    return parts.length > 0 ? parts : text;
  };

  // Validación defensiva para historial
  const safeHistory = messages.filter(
    (msg) =>
      msg && typeof msg.role === "string" && typeof msg.content === "string"
  );
  const { sendMessage } = useBittor({
    model: "deepseek/deepseek-chat:free",
    history: safeHistory,
    onMessages(messages: Message[]) {
      setMessages(messages);
    },
  });
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

    // WIP
    // @todo here whe should let the streams flow
    const responseMessage = await sendMessage(inputValue.trim(), safeHistory);
    setMessages((prev) => [...prev, responseMessage]);

    setIsLoading(false);
    // Restaurar el focus al input después de enviar
    setTimeout(() => {
      inputRef.current?.focus();
    }, 100);
  };

  return (
    <>
      <article
        className={`flex flex-col bg-white rounded-lg border border-gray-200 ${className}`}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <header className="flex items-center p-4 border-b border-gray-200">
          <section className="flex items-center gap-2">
            <div className="w-8 h-8 bg-black rounded-full flex items-center justify-center">
              <span className="text-white text-sm font-bold w-10 text-center">
                AI
              </span>
            </div>
            <h2 className="text-2xl font-bold">Bittor</h2>
          </section>
        </header>

        {/* Messages */}
        <section className="flex-1 overflow-y-auto p-4 space-y-4">
          {messages
            .filter((msg) => msg.role.toLowerCase() !== "system")
            .map((message) => (
              <div
                key={message.id}
                className={`flex ${
                  message.role === "user" ? "justify-end" : "justify-start"
                }`}
              >
                {message.role === "assistant" && (
                  <div className="w-8 h-8 rounded-full bg-black flex items-center justify-center mr-2 flex-shrink-0">
                    <img
                      src="/logo-purple.svg"
                      alt="EasyBits AI"
                      className="w-5 h-5"
                    />
                  </div>
                )}
                <div
                  className={`max-w-[80%] rounded-lg px-4 py-2 ${
                    message.role === "user"
                      ? "bg-brand-500 text-black"
                      : "bg-gray-100 text-gray-900"
                  }`}
                >
                  <p className="text-sm whitespace-pre-wrap">
                    {parseLinks(parseBold(message.content))}
                    {message.isStreaming && (
                      <span className="inline-block w-2 h-4 bg-gray-400 ml-1 animate-pulse"></span>
                    )}
                  </p>
                  <p className="text-xs opacity-70 mt-1">
                    {message.timestamp?.toLocaleTimeString()}
                  </p>
                </div>
              </div>
            ))}
          <div ref={messagesEndRef} />
        </section>

        {/* Input */}
        <form onSubmit={handleSubmit} className="p-4 border-t border-gray-200">
          <div className="flex space-x-2">
            <Input
              ref={inputRef}
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              placeholder={placeholder}
              disabled={isLoading}
              inputClassName="focus:border-munsell focus:outline-none focus:ring-munsell "
            />
            <Button
              type="submit"
              isDisabled={!inputValue.trim() || isLoading}
              className="px-4 py-2 bg-munsell text-black"
            >
              {isLoading ? <Spinner size="sm" /> : "Enviar"}
            </Button>
          </div>
        </form>
      </article>
    </>
  );
}

export default BittorChat;
