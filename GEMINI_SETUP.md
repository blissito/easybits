# Configuración de Google Gemini en EasyBits

Este documento explica cómo configurar y usar el agente de Google Gemini en tu proyecto React Router v7.

## 🚀 Instalación

El proyecto ya incluye todos los componentes necesarios. Solo necesitas configurar la API key.

## 🔑 Configuración de la API Key

1. **Obtén tu API Key de Google AI Studio:**

   - Ve a [Google AI Studio](https://makersuite.google.com/app/apikey)
   - Inicia sesión con tu cuenta de Google
   - Crea una nueva API key

2. **Configura la variable de entorno:**

   Crea o actualiza tu archivo `.env`:

   ```bash
   GOOGLE_AI_API_KEY=tu_api_key_aqui
   ```

3. **Para producción (Fly.io):**
   ```bash
   fly secrets set GOOGLE_AI_API_KEY=tu_api_key_aqui
   ```

## 📁 Estructura de Archivos

```
app/
├── components/
│   └── ai/
│       └── GeminiChat.tsx          # Componente principal del chat
├── routes/
│   ├── ai-chat.tsx                 # Página de ejemplo del chat
│   └── api/
│       └── v1/
│           └── ai/
│               └── chat.tsx        # API endpoint para el chat
└── routes.ts                       # Configuración de rutas
```

## 🎯 Uso

### Página de Chat Completa

Visita `/ai-chat` para usar la interfaz completa del chat con Google Gemini.

### Componente Reutilizable

Puedes usar el componente `GeminiChat` en cualquier parte de tu aplicación:

```tsx
import { GeminiChat } from "~/components/ai/GeminiChat";

export default function MiPagina() {
  return (
    <div>
      <h1>Mi Página</h1>
      <GeminiChat
        className="h-[400px]"
        placeholder="¿En qué puedo ayudarte?"
        initialMessage="¡Hola! Soy tu asistente."
      />
    </div>
  );
}
```

### Props del Componente

- `className`: Clases CSS adicionales
- `placeholder`: Texto del placeholder del input
- `initialMessage`: Mensaje inicial del asistente

## 🔧 Personalización

### Cambiar el Modelo

En `app/routes/api/v1/ai/chat.tsx`, puedes cambiar el modelo:

```tsx
const model = genAI.getGenerativeModel({
  model: "gemini-1.5-pro", // Otros modelos disponibles
});
```

Modelos disponibles:

- `gemini-1.5-flash` (rápido, recomendado)
- `gemini-1.5-pro` (más potente)
- `gemini-1.0-pro` (versión anterior)

### Personalizar la Configuración

Modifica la configuración de generación:

```tsx
generationConfig: {
  maxOutputTokens: 2000, // Más tokens para respuestas más largas
  temperature: 0.9,      // Más creatividad
},
```

## 🌐 API Endpoint

El endpoint `/api/v1/ai/chat` acepta:

**POST Request:**

```json
{
  "message": "Tu mensaje aquí",
  "history": [
    {
      "role": "user",
      "content": "Mensaje anterior del usuario"
    },
    {
      "role": "assistant",
      "content": "Respuesta anterior del asistente"
    }
  ]
}
```

**Response:**

```json
{
  "response": "Respuesta del asistente de Google Gemini"
}
```

## 🛠️ Desarrollo

Para probar localmente:

1. Configura tu API key en `.env`
2. Ejecuta `npm run dev`
3. Visita `http://localhost:3000/ai-chat`

## 🔒 Seguridad

- La API key se almacena en variables de entorno
- Las peticiones se validan en el servidor
- Se incluye manejo de errores robusto

## 📝 Notas

- El chat mantiene contexto de las últimas 10 mensajes
- Las respuestas están limitadas a 1000 tokens por defecto
- La temperatura está configurada en 0.7 para un balance entre creatividad y precisión
- Gemini 1.5 Flash es rápido y eficiente para la mayoría de casos de uso

## 🆘 Solución de Problemas

### Error: "GOOGLE_AI_API_KEY no está configurada"

- Verifica que la variable de entorno esté configurada correctamente
- Reinicia el servidor después de cambiar las variables de entorno

### Error: "Error de Google AI: 401"

- Verifica que tu API key sea válida
- Asegúrate de que tu cuenta tenga acceso a Gemini API

### Error: "Error interno del servidor"

- Revisa los logs del servidor para más detalles
- Verifica la conectividad con la API de Google AI

### Límites de Rate Limiting

- Google AI tiene límites de requests por minuto
- Si alcanzas el límite, espera un momento antes de hacer más requests

## 🚀 Ventajas de Gemini

- **Velocidad**: Gemini 1.5 Flash es muy rápido
- **Calidad**: Respuestas de alta calidad y precisión
- **Multimodal**: Soporte para texto, imágenes y más (futuro)
- **Contexto**: Excelente manejo de conversaciones largas
- **Gratuito**: Generoso límite gratuito para desarrollo
