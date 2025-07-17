// Este archivo es el resultado de renombrar FloatingGeminiChat.tsx a FloatingChat.tsx

import React, { useState, useRef, useEffect } from "react";
import { BittorChat } from "./BittorChat";
import { BrutalButton } from "../common/BrutalButton";
import { motion, AnimatePresence } from "motion/react";
import { BrutalButtonClose } from "../common/BrutalButtonClose";

interface FloatingChatProps {
  className?: string;
  initialMessage?: string;
  systemPrompt?: string;
}

export function FloatingChat({}: FloatingChatProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
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


  const [isMobile, setIsMobile] = useState(false);
  useEffect(() => {
    const checkSize = ()=>{
      if(window.innerWidth < 768){
        setIsMobile(true);
      }else{
        setIsMobile(false);
      }
    }
    window.addEventListener("resize", checkSize);
    checkSize();
  }, []);

  return (
    <>
      {/* Botón flotante */}
      <motion.div
        className="fixed bottom-4 md:bottom-6 right-4 md:right-8 z-30"
        initial={{ scale: 0 }}
        animate={{ scale: 1 }}
        transition={{ delay: 0.5, type: "spring", stiffness: 260, damping: 20 }}
      >
        <BrutalButton
          id="chatbot-button"
          onClick={() => setIsOpen(true)}
          className="min-w-[49px] min-h-[49px] md:min-w-14 md:min-h-14 w-12 h-12 md:w-14 md:h-14 rounded-full p-0 grid place-items-center bg-munsell"
          containerClassName="w-full h-full rounded-full"
        >
          {/* <BsChatDots className="w-6 h-6 text-white" /> */}
          <img
            id="chatbot-button"
            src="/icons/chatbot.svg"
            alt="chat"
            className="w-9! h-9!"
          />
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
                width: isMobile ? "100%" : "50%",
                height: isMobile ? "100%" : "50%",
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
                width: isMobile ? "100%" : "50%",
                height: isMobile ? "90%" : "80%",
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

         
                <BittorChat
                  className="h-full border-0 rounded-none"
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

export default FloatingChat;
