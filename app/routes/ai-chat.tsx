import { GeminiChat } from "~/components/ai/GeminiChat";

export default function AIChatPage() {
  return (
    <div className="min-h-screen bg-gray-50 py-8">
      <div className="max-w-4xl mx-auto px-4">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-gray-900 mb-2">
            Chat con Google Gemini
          </h1>
          <p className="text-gray-600">
            Interactúa con nuestro asistente de IA para obtener ayuda y
            respuestas
          </p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Chat principal */}
          <div className="lg:col-span-2">
            <GeminiChat
              className="h-[600px]"
              placeholder="Escribe tu pregunta aquí..."
              initialMessage="¡Hola! Soy tu asistente de IA con Google Gemini. Puedo ayudarte con preguntas, explicaciones, análisis de código, y mucho más. ¿En qué puedo asistirte hoy?"
            />
          </div>

          {/* Sidebar con información */}
          <div className="space-y-6">
            <div className="bg-white rounded-lg border border-gray-200 p-6">
              <h3 className="font-semibold text-gray-900 mb-3">
                💡 Sugerencias
              </h3>
              <ul className="space-y-2 text-sm text-gray-600">
                <li>• "Explica este concepto de programación"</li>
                <li>• "Ayúdame a optimizar este código"</li>
                <li>• "¿Cómo puedo implementar esta funcionalidad?"</li>
                <li>• "Revisa y mejora este texto"</li>
                <li>• "Genera ideas para mi proyecto"</li>
              </ul>
            </div>

            <div className="bg-white rounded-lg border border-gray-200 p-6">
              <h3 className="font-semibold text-gray-900 mb-3">
                ⚡ Características
              </h3>
              <ul className="space-y-2 text-sm text-gray-600">
                <li>• Respuestas en tiempo real</li>
                <li>• Contexto de conversación</li>
                <li>• Soporte en español</li>
                <li>• Análisis de código</li>
                <li>• Generación de contenido</li>
              </ul>
            </div>

            <div className="bg-gradient-to-r from-blue-500 to-purple-500 rounded-lg p-6 text-white">
              <h3 className="font-semibold mb-2">🤖 Google Gemini</h3>
              <p className="text-sm opacity-90">
                Potenciado por la tecnología de IA más avanzada de Google para
                brindarte respuestas precisas y útiles.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
