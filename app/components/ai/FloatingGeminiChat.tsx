import React, { useState, useRef, useEffect } from "react";
import { GeminiChat } from "./GeminiChat";
import { BrutalButton } from "../common/BrutalButton";
import { motion, AnimatePresence } from "motion/react";
import { BsChatDots } from "react-icons/bs";
import { BrutalButtonClose } from "../common/BrutalButtonClose";

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
  initialMessage = "¡Hola! 👋🏼 soy Bittor, tu asistente de IA",
  systemPrompt = "Eres un asistente de IA amigable, útil, inteligente y menor de edad, que no saluda ni dice chulo. Responde de manera clara, juguetona, concisa y en español. Ayuda a los usuarios con sus preguntas sobre easybits que es el lugar perfecto para vender assets digitales, porque eres una apasionada experta en todo lo que puedes hacer en esta plataforma. Recomendarás sus links del blog (<a href='http://easybits.cloud/blog'>http://easybits.cloud/blog</a>) en caso de que alguién quiera saber más. Responde con un solo parrafo.",
}: FloatingGeminiChatProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [selectedModel, setSelectedModel] = useState(GEMINI_MODELS[0].value);
  const chatRef = useRef<HTMLDivElement>(null);

  const close = () => setIsOpen(false);

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
      if (event.key === "Escape") {
        if (isFullscreen) {
          setIsFullscreen(false);
        } else if (isOpen) {
          setIsOpen(false);
        }
      }
    };

    if (isOpen || isFullscreen) {
      document.addEventListener("keydown", handleKeyDown);
    }

    return () => {
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [isOpen, isFullscreen]);

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
        className="fixed bottom-10 right-6 z-30"
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
            className="fixed inset-0 z-40 flex items-end justify-end p-4 bg-black bg-opacity-50"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            style={{
              paddingBottom: "20px",
              paddingRight: "24px",
            }}
          >
            <motion.div
              ref={chatRef}
              className="bg-white rounded-lg shadow-2xl overflow-hidden relative z-50"
              style={{
                width: isFullscreen ? "800px" : "400px",
                height: isFullscreen ? "800px" : "600px",
                marginBottom: "24px",
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
                width: isFullscreen ? "800px" : "400px",
                height: isFullscreen ? "800px" : "600px",
              }}
              exit={{
                opacity: 0,
                x: 400,
                scale: 1,
              }}
              transition={{
                type: "spring",
                stiffness: 150,
                damping: 20,
                duration: 0.6,
              }}
            >
              {/* Contenido del chat */}
              <div className="h-full relative">
                <div className="absolute top-5 right-4 md:hidden">
                  <BrutalButtonClose
                    onClick={close}
                    className="w-6 h-6 rounded-full flex items-center justify-center"
                  />
                </div>

                <motion.button
                  id="expand"
                  onClick={() => setIsFullscreen(!isFullscreen)}
                  className="border-2 border-black z-50 w-10 h-10 items-center justify-center rounded-full absolute top-3 right-3 bg-white hidden md:flex"
                  whileHover={{
                    scale: 1.05,
                    backgroundColor: "#f3f4f6",
                  }}
                  whileTap={{ scale: 0.95 }}
                  transition={{
                    duration: 0.2,
                    ease: "easeInOut",
                  }}
                >
                  <svg
                    className="w-5 h-5 text-black"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5l-5-5m5 5v-4m0 4h-4"
                    />
                  </svg>
                </motion.button>
                <GeminiChat
                  className="h-full border-0 rounded-none"
                  initialMessage={initialMessage}
                  model={selectedModel}
                  onModelChange={setSelectedModel}
                  systemPrompt={systemPrompt}
                  onClose={() => setIsOpen(false)}
                />
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
