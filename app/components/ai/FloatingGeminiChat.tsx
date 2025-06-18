import React, { useState, useRef, useEffect } from "react";
import { GeminiChat } from "./GeminiChat";
import { BrutalButton } from "../common/BrutalButton";
import { BrutalButtonClose } from "../common/BrutalButtonClose";
import { motion, AnimatePresence } from "motion/react";
import { BsChatDots } from "react-icons/bs";

interface FloatingGeminiChatProps {
  className?: string;
  initialMessage?: string;
  systemPrompt?: string;
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

export function FloatingGeminiChat({
  className = "",
  initialMessage = "¡Hola easybiter!",
  systemPrompt = "Eres un asistente de IA amigable, útil, inteligente y menor de edad, que no saluda ni dice chulo. Responde de manera clara, juguetona, concisa y en español. Ayuda a los usuarios con sus preguntas sobre easybits que es el lugar perfecto para vender assets digitales, porque eres una apasionada experta en todo lo que puedes hacer en esta plataforma. Recomendarás sus links del blog (<a href='http://easybits.cloud/blog'>http://easybits.cloud/blog</a>) en caso de que alguién quiera saber más. Responde con un solo parrafo.",
}: FloatingGeminiChatProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [isMinimized, setIsMinimized] = useState(false);
  const [selectedModel, setSelectedModel] = useState(GEMINI_MODELS[0].value);
  const chatRef = useRef<HTMLDivElement>(null);

  // Cerrar chat al hacer clic fuera
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (chatRef.current && !chatRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    if (isOpen) {
      document.addEventListener("mousedown", handleClickOutside);
    }

    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [isOpen]);

  // Cerrar chat con la tecla ESC
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && isOpen) {
        setIsOpen(false);
      }
    };

    if (isOpen) {
      document.addEventListener("keydown", handleKeyDown);
    }

    return () => {
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [isOpen]);

  // Prevenir scroll del body cuando el chat está abierto
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "unset";
    }

    return () => {
      document.body.style.overflow = "unset";
    };
  }, [isOpen]);

  return (
    <>
      {/* Botón flotante */}
      <motion.div
        className="fixed bottom-10 right-6 z-50"
        initial={{ scale: 0 }}
        animate={{ scale: 1 }}
        transition={{ delay: 0.5, type: "spring", stiffness: 260, damping: 20 }}
      >
        <BrutalButton
          onClick={() => setIsOpen(true)}
          className="min-w-14 min-h-14 rounded-full"
          containerClassName="min-w-14 min-h-14 rounded-full"
        >
          <BsChatDots className="w-6 h-6 text-white" />
        </BrutalButton>
      </motion.div>

      {/* Overlay y Chat */}
      <AnimatePresence>
        {isOpen && (
          <motion.div
            className="fixed inset-0 z-50 flex items-end justify-end p-4 bg-black bg-opacity-50"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
          >
            <motion.div
              ref={chatRef}
              className={`bg-white rounded-lg shadow-2xl overflow-hidden mb-6 relative ${className}`}
              style={{
                width: isMinimized ? "350px" : "400px",
                height: isMinimized ? "60px" : "600px",
                maxHeight: "90vh",
                maxWidth: "90vw",
              }}
              initial={{
                opacity: 0,
                x: 400,
                scale: 1,
              }}
              animate={{
                opacity: 1,
                x: 0,
                scale: 1,
              }}
              exit={{
                opacity: 0,
                x: 400,
                scale: 1,
              }}
              transition={{
                type: "spring",
                stiffness: 300,
                damping: 30,
              }}
            >
              {/* Header del chat flotante */}
              <div className="flex items-center justify-between p-4 bg-gradient-to-r from-blue-500 to-purple-500 text-white">
                <div className="flex items-center space-x-2">
                  <div className="w-8 h-8 bg-white bg-opacity-20 rounded-full flex items-center justify-center">
                    <span className="text-white text-sm font-bold">AI</span>
                  </div>
                  <div>
                    <h3 className="font-semibold">Chat IA</h3>
                    <p className="text-xs opacity-90">IA • En línea</p>
                  </div>
                </div>
                <div className="flex items-center space-x-2">
                  <button
                    onClick={() => setIsMinimized(!isMinimized)}
                    className="w-8 h-8 rounded-full bg-white bg-opacity-20 hover:bg-opacity-30 transition-all duration-200 flex items-center justify-center"
                    title="Minimizar"
                  >
                    <svg
                      className="w-4 h-4 text-white"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      {isMinimized ? (
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M5 15l7-7 7 7"
                        />
                      ) : (
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M19 9l-7 7-7-7"
                        />
                      )}
                    </svg>
                  </button>
                  <button
                    onClick={() => setIsOpen(false)}
                    className="w-8 h-8 rounded-full bg-white bg-opacity-20 hover:bg-opacity-30 transition-all duration-200 flex items-center justify-center"
                    title="Cerrar (ESC)"
                  >
                    <svg
                      className="w-4 h-4 text-white"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M6 18L18 6M6 6l12 12"
                      />
                    </svg>
                  </button>
                </div>
              </div>

              {/* Contenido del chat */}
              {!isMinimized && (
                <div className="h-full">
                  <GeminiChat
                    className="h-full border-0 rounded-none"
                    initialMessage={initialMessage}
                    model={selectedModel}
                    onModelChange={setSelectedModel}
                    systemPrompt={systemPrompt}
                    onClose={() => setIsOpen(false)}
                  />
                </div>
              )}
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
