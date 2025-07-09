import { fetchOpenRouter } from "~/.server/llms/openRouter";
import { webFetchToolDefinition, handleWebFetch } from "~/.server/llms/tools/fetchWebTool";
import { webSearchToolDefinition, handleWebSearch } from "~/.server/llms/tools/webSearchTool";
import type { Route } from "./+types/chat";

type Message = {
  role: 'user' | 'assistant' | 'system' | 'tool';
  content: string;
  name?: string;
  tool_call_id?: string;
};

type ToolCall = {
  id: string;
  type: string;
  function: {
    name: string;
    arguments: string;
  };
};

const SYSTEM_PROMPT = `Eres un asistente de IA con acceso a herramientas para buscar información. 

INSTRUCCIONES IMPORTANTES:
1. SIEMPRE usa la herramienta web_search cuando el usuario te pida información que pueda estar desactualizada o que no estés seguro de conocer.
2. Usa web_fetch cuando el usuario proporcione una URL específica para obtener su contenido.
3. No menciones que estás usando herramientas, simplemente proporciona la información solicitada.
4. Si no estás seguro de algo, usa web_search para buscar información actualizada.
5. Puedes solicitar el uso de más de una herramienta a la vez, intenta incluir links en tu respuesta.
6. Mantén tus respuestas claras y concisas, en español.`;

interface ToolResult {
  tool_call_id: string;
  output?: string;
  role?: 'assistant' | 'user' | 'system' | 'tool';
  content?: string;
  name?: string;
  tool_calls?: Array<{
    id: string;
    type: 'function';
    function: {
      name: string;
      arguments: string;
    };
  }>;
}

async function processToolCalls(toolCalls: ToolCall[]): Promise<ToolResult[]> {
  const results: ToolResult[] = [];
  
  for (const toolCall of toolCalls) {
    const startTime = Date.now();
    const toolName = toolCall.function?.name || 'unknown';
    
    console.log(`Ejecutando tool call ${toolCall.id} (${toolName})`);
    
    // Verificar si es una sugerencia de web_fetch
    if (toolCall.function.arguments.trim().startsWith('{') && toolCall.function.arguments.includes('_type') && toolCall.function.arguments.includes('suggest_web_fetch')) {
      try {
        // Limpiar los argumentos antes de parsear
        const cleanArgs = toolCall.function.arguments.replace(/[​-‍﻿]/g, '');
        const suggestion = JSON.parse(cleanArgs);
        
        if (suggestion._type === 'suggest_web_fetch') {
          // Crear un objeto de argumentos para web_fetch
          const fetchArgs = { 
            url: `https://${suggestion.domain.replace(/^https?:\/\//, '')}`,
            timeout: 10,
            forceHttps: true
          };
          
          const result: ToolResult = {
            tool_call_id: toolCall.id,
            output: JSON.stringify({
              _type: 'suggest_web_fetch',
              message: suggestion.message,
              domain: suggestion.domain
            }),
            role: 'assistant',
            content: suggestion.message,
            tool_calls: [{
              id: `call_${Date.now()}`,
              type: 'function',
              function: {
                name: 'web_fetch',
                arguments: JSON.stringify(fetchArgs)
              }
            }]
          };
          results.push(result);
          continue;
        }
      } catch (e) {
        console.error('Error procesando sugerencia de web_fetch:', e);
      }
    }
    
    try {
      if (toolCall.function.name === 'web_fetch') {
        const { url: rawUrl, timeout = 10 } = JSON.parse(toolCall.function.arguments);
        // Asegurar que la URL use HTTPS
        const url = rawUrl.startsWith('http://') 
          ? 'https://' + rawUrl.slice(7) 
          : rawUrl.startsWith('https://') 
            ? rawUrl 
            : 'https://' + rawUrl;
            
        console.log(`Ejecutando web_fetch para URL: ${url}`);
        const output = await handleWebFetch({ url, timeout });
        
        console.log(`Tool call ${toolCall.id} completado en ${Date.now() - startTime}ms`);
        
        // Formatear la respuesta para que sea más legible
        let formattedOutput = output;
        try {
          // Si la salida es un objeto JSON, convertirlo a string formateado
          if (typeof output === 'object') {
            formattedOutput = JSON.stringify(output, null, 2);
          }
        } catch (e) {
          console.error('Error formateando la salida:', e);
        }
        
        results.push({
          role: 'tool' as const,
          tool_call_id: toolCall.id,
          name: toolCall.function.name,
          content: formattedOutput,
          output: formattedOutput
        });
      }
      if (toolCall.function.name === 'web_search') {
        try {
          let args;
          const funcArgs = toolCall.function.arguments.trim();
          
          // Manejar diferentes formatos de argumentos
          if (funcArgs.startsWith('query=') || funcArgs.includes('query=')) {
            // Formato: query="texto" o query='texto' o query=texto
            const match = funcArgs.match(/query\s*=\s*["']?([^"']+)["']?/);
            args = { 
              query: match ? match[1].trim() : funcArgs.replace(/^query\s*=\s*/, '').replace(/^["']|["']$/g, '') 
            };
          } else if (funcArgs.startsWith('{') && funcArgs.endsWith('}')) {
            // Formato JSON
            try {
              args = JSON.parse(funcArgs);
            } catch (e) {
              console.warn('Error parsing JSON arguments, falling back to raw string');
              args = { query: funcArgs };
            }
          } else {
            // Asumir que todo el string es la consulta
            args = { query: funcArgs };
          }
          
          // Asegurarse de que los argumentos tengan el formato correcto
          if (typeof args === 'string') {
            args = { query: args };
          }
          
          console.log(`Parámetros de web_search:`, args);
          
          const content = await handleWebSearch(args);
          
          console.log(`Tool call ${toolCall.id} completado en ${Date.now() - startTime}ms`);
          
          results.push({
            role: 'tool' as const,
            tool_call_id: toolCall.id,
            name: 'web_search',
            content: content || 'No se pudo obtener la información solicitada',
            output: content || 'No se pudo obtener la información solicitada'
          });
        } catch (error) {
          console.error('Error en web_search:', error);
          results.push({
            role: 'tool' as const,
            tool_call_id: toolCall.id,
            name: 'web_search',
            content: 'Error al procesar la búsqueda. Por favor, inténtalo de nuevo.',
            output: 'Error al procesar la búsqueda.'
          });
        }
      }
    } catch (error) {
      console.error('Error en tool call:', error);
      const output = 'Error ejecutando la herramienta';
      results.push({
        role: 'tool' as const,
        tool_call_id: toolCall.id,
        name: toolCall.function.name,
        content: output,
        output: output
      });
    }
  }
  
  return results;
}

export const action = async ({ request }: Route.ActionArgs) => {
  try {
    // 1. Parse request body once
    const requestData = await request.json();



    const { message, history = [] } = requestData;
    
    if (!message) {
      return new Response(
        JSON.stringify({ error: 'Mensaje requerido' }), 
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // 2. Prepare messages for the first API call
    const messages: Message[] = [
      { role: 'system', content: SYSTEM_PROMPT },
      ...history,
      { role: 'user', content: message }
    ];



    // 3. First API call - may include tool calls
    const firstResponse = await fetchOpenRouter({
      messages,
      tools: [webSearchToolDefinition, webFetchToolDefinition],
      tool_choice: 'auto',
      model: 'deepseek/deepseek-chat:free',
      stream: false
    });

    if (!firstResponse.data) {
      throw new Error('No se pudo conectar con el servicio de IA');
    }

    const assistantMessage = firstResponse.data.choices[0]?.message;

    if (!assistantMessage) {
      throw new Error('Respuesta inválida del servicio de IA');
    }

    // 4. Check for tool calls
    const toolCalls = assistantMessage.tool_calls;
    
    if (!toolCalls || toolCalls.length === 0) {
      console.log('No se detectaron tool calls necesarias');
      // No tool calls, return the assistant's response directly
      return new Response(
        JSON.stringify(assistantMessage),
        { headers: { 'Content-Type': 'application/json' } }
      );
    }

    // 5. Process tool calls
    console.log(`🔧 Procesando ${toolCalls.length} tool calls`);
    toolCalls.forEach((tc: any) => {
      console.log(`  - Tool Call: ${tc.function?.name} (${tc.id})`);
      console.log(`    Args: ${tc.function?.arguments || 'Ninguno'}`);
    });
    
    const toolResults = await processToolCalls(toolCalls);
    console.log('✅ Resultados de herramientas procesadas:', 
      toolResults.map((tr: any) => ({
        name: tr.name,
        content_length: tr.content?.length || 0
      }))
    );

    // 6. Prepare messages for second API call
    const secondCallMessages = [
      ...messages,
      assistantMessage,
      ...toolResults
    ];
    
    console.log('🔄 Enviando segunda llamada a la API con resultados de herramientas');
    console.log(`   - Total de mensajes: ${secondCallMessages.length}`);
    console.log(`   - Último mensaje: ${JSON.stringify(secondCallMessages[secondCallMessages.length - 1]?.content || '').substring(0, 100)}...`);
    
    const secondResponse = await fetchOpenRouter({
      messages: secondCallMessages,
      model: 'deepseek/deepseek-chat:free',
      stream: false
    });

    if (!secondResponse.data) {
      throw new Error('No se pudo completar la operación');
    }

    const finalResponse = secondResponse.data.choices[0]?.message;

    if (!finalResponse) {
      throw new Error('No se pudo generar una respuesta final');
    }

    return new Response(
      JSON.stringify(finalResponse),
      { headers: { 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error en el chat:', error);
    const errorMessage = error instanceof Error ? error.message : 'Error desconocido';
    
    return new Response(
      JSON.stringify({
        role: 'assistant',
        content: `Lo siento, ha ocurrido un error: ${errorMessage}`
      }),
      { 
        status: error instanceof Error && 'status' in error ? (error as any).status : 500,
        headers: { 'Content-Type': 'application/json' }
      }
    );
  }
};
