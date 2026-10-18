import React, { useState, useRef, useEffect } from "react";
import { useBittor } from "~/hooks/useBittor";
import Spinner from "~/components/common/Spinner";
import { cn } from "~/utils/cn";

interface BittorChatProps {
  className?: string;
  placeholder?: string;
  initialMessage?: string;
  onClose?: () => void;
}

export function BittorChat({
  onClose,
  className ,
  placeholder = "Escribe tu mensaje...",
  initialMessage = "¡Hola! 👋🏼 soy Bittor, tu asistente de IA.\n ¿En qué te ayudo? 📞",
}: BittorChatProps) {
  const [inputValue, setInputValue] = useState("");
  const chatContainerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Inicializar el hook con el mensaje inicial
  const { messages, sendMessage, isLoading, isGenerating, toolInUse } = useBittor([
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

      <article className={cn("h-full flex flex-col", className)}>
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
          {/* Mostrar herramienta en uso */}
          {toolInUse && (
            <div className={cn(`mb-4 p-3 rounded-lg text-sm ${
              toolInUse.status === 'completed' 
                ? 'bg-green-50 border border-green-200 text-green-800' 
                : toolInUse.status === 'error'
                  ? 'bg-orange-50 border border-orange-200 text-orange-800'
                  : 'bg-blue-50 border border-blue-200 text-blue-800'
            }`, {
               'border-blue-200' : toolInUse.status === 'pending' ? 'border-blue-200' : ''})}>
            
              <div className="flex items-center gap-2 mb-1">
                {toolInUse.status === 'completed' ? (
                  <svg className="w-4 h-4 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                ) : toolInUse.status === 'error' ? (
                  <svg className="w-4 h-4 text-orange-600" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                ) : (
                  <svg className="w-4 h-4 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                  </svg>
                )}
                <span className="font-medium">
                  {toolInUse.status === 'completed'
                    ? `Listo: ${toolInUse.name}`
                    : toolInUse.status === 'error'
                      ? `Error: ${toolInUse.name}`
                      : `Usando: ${toolInUse.name}`}
                </span>
              </div>
              {toolInUse.status === 'pending' && (
                <div className="mt-1 text-xs text-blue-600 flex items-center gap-1">
                  <span className="inline-block w-3 h-3 border-2 border-blue-200 border-t-blue-600 rounded-full animate-spin"></span>
                  Procesando...
                </div>
              )}
            </div>
          )}
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
                {message.isStreaming && message.role === 'assistant' ? (
                  <Waiting />
                ) : (
                  splitCodeBlocks(message.content)
                )}
                
    
                <section className="flex">

                      <p className="text-xs opacity-70 mt-1">
                        {message.timestamp?.toLocaleTimeString()}
                      </p>
                                  {/* Mostrar información de la herramienta usada  @TODO: make a component to better reuse */}
                                  {message.toolInUse && message.role === 'assistant' && (
                        <div className="w-max px-2 rounded">
                          <div className={`flex items-center gap-1 px-1 text-xs shadow-sm ${message.toolInUse.status === 'completed' ? 'text-green-600 border border-green-100 bg-green-50' : 'text-orange-500 border border-orange-100 bg-orange-50'}`}>
                            {message.toolInUse.status === 'completed' ? (
                              <svg className="w-3 h-3 flex-shrink-0 " fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                              </svg>
                            ) : (
                              <svg className="w-3 h-3 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                              </svg>
                            )}
                            <span className="text-gray-600">
                              {message.toolInUse.status === 'completed' 
                                ? `Usó: ${message.toolInUse.name}`
                                : `Error al usar: ${message.toolInUse.name}`}
                            </span>
                          </div>
                        </div>
                      )}
                </section>
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

// Estilos para la animación de los puntos suspensivos
const styles = `
  @keyframes typing-dot {
    0%, 60%, 100% { transform: translateY(0); }
    30% { transform: translateY(-4px); }
  }
  
  .typing-dot {
    display: inline-block;
    width: 8px;
    height: 8px;
    border-radius: 50%;
    background-color: #4b5563; /* Color gris para los puntos */
    margin: 0 1px;
    animation: typing-dot 1.4s infinite ease-in-out;
    animation-delay: var(--delay);
  }
`;

// Añadir estilos al documento
if (typeof document !== 'undefined') {
  const styleElement = document.createElement('style');
  styleElement.textContent = styles;
  document.head.appendChild(styleElement);
}

export default BittorChat;

// Puntitos mientras Bittor piensa. Si su caja estaba dormida o hay que arrancarla, la
// respuesta tarda más: en vez de silencio, se dice qué está pasando.
function Waiting() {
  const [secs, setSecs] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setSecs((s) => s + 1), 1000);
    return () => clearInterval(t);
  }, []);
  const note = secs >= 20 ? "Ya casi, estoy terminando de arrancar…" : secs >= 8 ? "Despertando…" : null;
  return (
    <div className="flex items-center gap-1">
      <span className="typing-dot" style={{ '--delay': '0s' } as React.CSSProperties}></span>
      <span className="typing-dot" style={{ '--delay': '0.2s' } as React.CSSProperties}></span>
      <span className="typing-dot" style={{ '--delay': '0.4s' } as React.CSSProperties}></span>
      {note && <span className="ml-2 text-xs text-gray-500">{note}</span>}
    </div>
  );
}
