import React, { useState, useRef, useEffect } from "react";
import { useBittor } from "~/hooks/useBittor";
import Spinner from "~/components/common/Spinner";

interface BittorChatProps {
  className?: string;
  placeholder?: string;
  initialMessage?: string;
  onClose?: () => void;
}

export function BittorChat({
  onClose,
  className = "",
  placeholder = "Escribe tu mensaje...",
  initialMessage = "¡Hola! 👋🏼 soy Bittor, tu asistente de IA.\n ¿En qué te ayudo? 📞",
}: BittorChatProps) {
  const [inputValue, setInputValue] = useState("");
  const chatContainerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Inicializar el hook con el mensaje inicial
  const { messages, sendMessage, isLoading } = useBittor([
    {
      id: "bittor-initial-message",
      role: "assistant",
      content: initialMessage || "¡Hola! ¿En qué puedo ayudarte hoy?",
      timestamp: new Date(),
    },
  ]);

  // Scroll al final de los mensajes cuando se actualicen
  useEffect(() => {
    const container = chatContainerRef.current;
    if (container) {
      // Usar requestAnimationFrame para asegurar que el DOM se ha actualizado
      requestAnimationFrame(() => {
        container.scrollTo({
          top: container.scrollHeight,
          behavior: 'smooth'
        });
      });
    }
  }, [messages]);

  // Función para parsear negritas y enlaces en el texto
  const parseText = (
    text: string,
    isCodeBlock: boolean = false
  ): React.ReactNode => {
    if (isCodeBlock) {
      return <pre className="whitespace-pre-wrap">{text}</pre>;
    }

    // Primero manejar las negritas
    const boldRegex = /\*\*(.*?)\*\*/g;
    const partsWithBold = [];
    let lastIndex = 0;
    let match;

    // Procesar texto con negritas
    while ((match = boldRegex.exec(text)) !== null) {
      // Añadir texto antes de la negrita
      if (match.index > lastIndex) {
        partsWithBold.push(text.substring(lastIndex, match.index));
      }
      // Añadir texto en negrita
      partsWithBold.push(<strong key={match.index}>{match[1]}</strong>);
      lastIndex = match.index + match[0].length;
    }
    // Añadir el texto restante
    if (lastIndex < text.length) {
      partsWithBold.push(text.substring(lastIndex));
    }

    // Luego manejar los enlaces en cada parte
    const markdownLinkRegex = /\[([^\]]+)\]\(([^)]+)\)/g;
    // Mejorar la expresión regular para URLs
    const urlRegex = /(https?:\/\/(?:www\.)?[a-zA-Z0-9-]+(?:\.[a-zA-Z0-9-]+)+[^\s<>\)\]"']*)|([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/g;
    
    return partsWithBold.map((part, index) => {
      if (typeof part !== 'string') return part;
      
      const linkParts = [];
      let lastIndex = 0;
      let match;

      // Primero manejar enlaces en formato markdown [texto](url)
      while ((match = markdownLinkRegex.exec(part)) !== null) {
        // Añadir texto antes del enlace
        if (match.index > lastIndex) {
          linkParts.push(part.substring(lastIndex, match.index));
        }
        
        const [fullMatch, linkText, url] = match;
        
        // Añadir el enlace markdown
        linkParts.push(
          <a
            key={`md-${index}-${match.index}`}
            href={url.startsWith('http') ? url : `https://${url}`}
            target="_blank"
            rel="noopener noreferrer"
            className="text-blue-500 hover:underline"
          >
            {linkText}
          </a>
        );
        
        lastIndex = match.index + fullMatch.length;
      }
      
      // Si no había enlaces markdown, procesar URLs directas
      const remainingText = part.substring(lastIndex);
      if (remainingText) {
        let urlLastIndex = 0;
        let urlMatch;
        
        while ((urlMatch = urlRegex.exec(remainingText)) !== null) {
          // Añadir texto antes del enlace
          if (urlMatch.index > urlLastIndex) {
            linkParts.push(remainingText.substring(urlLastIndex, urlMatch.index));
          }
          
          const url = urlMatch[0];
          const displayUrl = url.length > 30 ? `${url.substring(0, 30)}...` : url;
          
          // Añadir el enlace directo
          linkParts.push(
            <a
              key={`url-${index}-${urlMatch.index}`}
              href={url.startsWith('http') ? url : `mailto:${url}`}
              target="_blank"
              rel="noopener noreferrer"
              className="text-blue-500 hover:underline break-all"
              title={url}
            >
              {displayUrl}
            </a>
          );
          
          urlLastIndex = urlMatch.index + url.length;
        }
        
        // Añadir cualquier texto restante
        if (urlLastIndex < remainingText.length) {
          linkParts.push(remainingText.substring(urlLastIndex));
        }
      }
      
      
      return linkParts.length > 0 ? linkParts : part;
    });
  };

  // Función para dividir el texto en bloques de código
  const splitCodeBlocks = (text: string): React.ReactNode => {
    // Primero verificar si hay bloques de código válidos
    const codeBlockRegex = /(^|\n)```(\w*\n[\s\S]*?\n)```(\n|$)/g;
    
    // Si no hay bloques de código válidos, procesar normalmente
    if (!codeBlockRegex.test(text)) {
      return parseText(text);
    }
    
    // Resetear el índice de la expresión regular
    codeBlockRegex.lastIndex = 0;
    
    const parts: React.ReactNode[] = [];
    let lastIndex = 0;
    let match;
    
    // Procesar cada bloque de código encontrado
    while ((match = codeBlockRegex.exec(text)) !== null) {
      // Añadir texto antes del bloque de código
      if (match.index > lastIndex) {
        parts.push(parseText(text.substring(lastIndex, match.index)));
      }
      
      // Extraer el código y el lenguaje (si existe)
      const [fullMatch, , codeContent] = match;
      const code = codeContent.trim();
      
      // Añadir el bloque de código formateado
      parts.push(
        <pre
          key={`code-${match.index}`}
          className="bg-gray-800 text-green-400 p-4 rounded-lg overflow-x-auto my-2 text-sm whitespace-pre-wrap"
        >
          <code>{code}</code>
        </pre>
      );
      
      lastIndex = match.index + fullMatch.length;
    }
    
    // Añadir cualquier texto restante después del último bloque de código
    if (lastIndex < text.length) {
      parts.push(parseText(text.substring(lastIndex)));
    }
    
    return parts.length > 0 ? parts : parseText(text);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputValue.trim() || isLoading) return;

    setInputValue("");

    try {
      // El hook se encarga de añadir el mensaje del usuario y la respuesta
      await sendMessage(inputValue.trim());

      // Restaurar el focus al input después de enviar
      setTimeout(() => {
        inputRef.current?.focus();
      }, 100);
    } catch (error) {
      console.error("Error al enviar mensaje:", error);
    }
  };


  // focus
  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  return (

      <article className="h-full flex flex-col">
        {/* Header */}
        <header onClick={(e) => e.stopPropagation()} className="flex items-center justify-between p-4 border-b border-gray-200 bg-white sticky top-0 z-10">
          <h2 className="font-bold">Bittor</h2>
          <button 
            onClick={onClose} 
            className="flex items-center gap-2 z-20"
            aria-label="Cerrar chat"
          >

                ✕

          </button>
        </header>

        {/* Message List */}
        <div 
          ref={chatContainerRef}
          className="flex-1 overflow-y-auto p-4 space-y-4 overflow-x-hidden"
          style={{
            scrollBehavior: 'smooth',
            scrollbarWidth: 'thin',
            scrollbarGutter: 'stable',
            WebkitOverflowScrolling: 'touch',
            position: 'relative'
          }}
        >
          {messages.map((message) => (
            <div
              key={message.id}
              className={`flex ${
                message.role === "user" ? "justify-end" : "justify-start"
              }`}
            >
              <div
                className={`max-w-[80%] rounded-lg p-3 ${
                  message.role === "user"
                    ? "bg-blue-500 text-white"
                    : "bg-gray-100 text-gray-800"
                }`}
              >
                {splitCodeBlocks(message.content)}
                <p className="text-xs opacity-70 mt-1">
                  {message.timestamp?.toLocaleTimeString()}
                </p>
              </div>
            </div>
          ))}
          {/* Empty div to ensure scrolling to bottom */}
          <div ref={(el) => {
            // This ensures we always have a reference to the last message
            if (el) {
              el.scrollIntoView({ behavior: 'auto' });
            }
          }} />
        </div>

        {/* Input */}
        <div className="border-t border-gray-200 p-4">
          <form onSubmit={handleSubmit} className="flex gap-2">
            <input
              type="text"
              ref={inputRef}
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              placeholder={placeholder}
              className="flex-1 border border-gray-300 rounded-lg px-4 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
              disabled={isLoading}
            />
            <button
              type="submit"
              disabled={!inputValue.trim() || isLoading}
              className="bg-blue-500 text-white px-4 py-2 rounded-lg hover:bg-blue-600 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center min-w-[80px]"
            >
              {isLoading ? <Spinner className="w-5 h-5" /> : "Enviar"}
            </button>
          </form>
        </div>
      </article>

  );
}

export default BittorChat;
