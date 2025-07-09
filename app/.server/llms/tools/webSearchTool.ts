// Servicio de búsqueda web usando la API pública de DuckDuckGo

interface SearchResult {
  FirstURL?: string;
  Text: string;
  Result?: string;
  URL?: string;
  Icon?: {
    URL: string;
    Height?: number;
    Width?: number;
  };
}

interface DuckDuckGoResponse {
  Abstract: string;
  AbstractSource: string;
  AbstractText: string;
  AbstractURL: string;
  Answer: string;
  AnswerType: string;
  Definition: string;
  DefinitionSource: string;
  DefinitionURL: string;
  Entity: string;
  Heading: string;
  Image: string;
  ImageHeight: number;
  ImageIsLogo: number;
  ImageWidth: number;
  Infobox: any;
  Redirect: string;
  RelatedTopics: SearchResult[];
  Results: any[];
  Type: string;
  meta: {
    status: number;
  };
}

// Función que maneja la llamada a la herramienta
// URL base para la búsqueda directa de DuckDuckGo
const DUCKDUCKGO_SEARCH_URL = 'https://duckduckgo.com/?q=';

// Función para detectar si una consulta parece ser un dominio
function isDomainQuery(query: string): boolean {
  // Expresión regular para detectar dominios comunes
  const domainRegex = /^([a-z0-9]+(-[a-z0-9]+)*\.)+[a-z]{2,}$/i;
  // Verificar si la consulta parece un dominio
  return domainRegex.test(query) || 
         query.includes('.com') || 
         query.includes('.org') || 
         query.includes('.net') ||
         query.includes('www.') ||
         query.startsWith('http://') ||
         query.startsWith('https://');
}

// Función para normalizar una URL asegurando que use HTTPS
function normalizeUrl(url: string): string {
  // Si no tiene protocolo, asumir HTTPS
  if (!url.startsWith('http://') && !url.startsWith('https://')) {
    return `https://${url}`;
  }
  // Si tiene HTTP, cambiarlo a HTTPS
  return url.replace(/^http:\/\//i, 'https://');
}

// Función para generar un enlace de búsqueda directa
function getSearchLink(query: string): string {
  return `${DUCKDUCKGO_SEARCH_URL}${encodeURIComponent(query)}`;
}

export async function handleWebSearch(args: { query: string; format?: string; timeout?: number }) {
  // Limpiar y normalizar la consulta
  const cleanQuery = (args.query || '').trim();
  if (!cleanQuery) {
    return 'Error: La consulta de búsqueda está vacía';
  }
  
  // Si el query parece ser un JSON duplicado, tomar solo el primer objeto
  let query = cleanQuery;
  try {
    // Intentar parsear como JSON
    const parsed = JSON.parse(cleanQuery);
    if (typeof parsed === 'object' && parsed !== null) {
      query = parsed.query || cleanQuery;
    }
  } catch (e) {
    // Si hay un error de parseo, usar el query original
    console.warn('Error parsing query as JSON, using raw query:', cleanQuery);
  }
  // URL de la API de DuckDuckGo
  const ddgUrl = new URL('https://api.duckduckgo.com/');
  ddgUrl.searchParams.append('q', query);
  ddgUrl.searchParams.append('format', 'json');
  ddgUrl.searchParams.append('no_html', '1');
  ddgUrl.searchParams.append('skip_disambig', '1');
  ddgUrl.searchParams.append('no_redirect', '1');
  ddgUrl.searchParams.append('t', 'bittor'); // Identificador de la aplicación
  
  console.log('Buscando en DuckDuckGo:', query);
  
  const webSearchUrl = getSearchLink(args.query);

  const controller = new AbortController();
  const timeoutMs = (args.timeout || 15) * 1000;
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  console.log('🔍 Realizando búsqueda:', {
    query: args.query,
    format: args.format || 'markdown',
    timeout: args.timeout || 15
  });

  try {
    // 1. Intentar con la API de DuckDuckGo primero
    const response = await fetch(ddgUrl.toString(), {
      method: 'GET',
      headers: { 'Accept': 'application/json' },
      signal: controller.signal
    });
    
    clearTimeout(timeoutId);
    
    if (!response.ok) {
      throw new Error(`Error HTTP ${response.status}: ${response.statusText}`);
    }
    
    const data: DuckDuckGoResponse = await response.json();
    
    // Verificar si la respuesta es válida o solo contiene metadatos
    const hasValidResponse = data.Abstract || 
                           (data.RelatedTopics && data.RelatedTopics.length > 0) ||
                           (data.Results && data.Results.length > 0) ||
                           data.Answer ||
                           data.Redirect;
    
    console.log('📊 Análisis de respuesta:', {
      hasAbstract: !!data.Abstract,
      hasRelatedTopics: data.RelatedTopics?.length > 0,
      hasResults: data.Results?.length > 0,
      hasAnswer: !!data.Answer,
      hasRedirect: !!data.Redirect,
      isValid: hasValidResponse,
      dataSample: JSON.stringify(data, null, 2).substring(0, 500) + '...'
    });
    
    // Si no hay una respuesta válida, verificar si parece ser una búsqueda de dominio
    if (!hasValidResponse) {
      if (isDomainQuery(args.query)) {
        // Si parece ser un dominio, sugerir usar web_fetch
        const domain = args.query.replace(/^https?:\/\//i, '').split('/')[0];
        return JSON.stringify({
          _type: 'suggest_web_fetch',
          message: `No se encontró información sobre "${domain}" en la búsqueda. ¿Te gustaría que intente obtener el contenido directamente del sitio web?`,
          domain: domain
        });
      }
      
      // Si no es un dominio, mostrar el enlace de búsqueda normal
      return `No se encontraron resultados directos. [Buscar en DuckDuckGo](${webSearchUrl})`;
    }
    
    // Procesar los resultados
    const results: SearchResult[] = [];
    
    // Agregar el resultado principal si existe
    if (data.Abstract) {
      results.push({
        FirstURL: data.AbstractURL || `https://duckduckgo.com/?q=${encodeURIComponent(args.query)}`,
        Text: data.Heading || args.query,
        Result: data.AbstractText || data.Abstract,
        Icon: data.Image ? { URL: data.Image } : undefined
      });
    } else if (data.Heading && data.AbstractText) {
      // Algunas respuestas pueden tener Heading y AbstractText sin Abstract
      results.push({
        FirstURL: data.AbstractURL || `https://duckduckgo.com/?q=${encodeURIComponent(args.query)}`,
        Text: data.Heading,
        Result: data.AbstractText,
        Icon: data.Image ? { URL: data.Image } : undefined
      });
    }
    
    // Agregar temas relacionados
    if (data.RelatedTopics?.length > 0) {
      data.RelatedTopics.forEach(topic => {
        if (!topic) return;
        
        const url = topic.FirstURL || topic.URL;
        const text = topic.Text || topic.Result?.replace(/<[^>]*>?/gm, '').substring(0, 100) || 'Sin título';
        
        if (url && text) {
          results.push({
            FirstURL: url,
            Text: text,
            Result: topic.Result ? topic.Result.replace(/<[^>]*>?/gm, '') : '',
            Icon: topic.Icon
          });
        }
      });
    }
    
    // Si no hay resultados principales ni temas relacionados, verificar si hay resultados directos
    if (results.length === 0 && data.Results?.length > 0) {
      data.Results.forEach((result: any) => {
        if (result.FirstURL && result.Text) {
          results.push({
            FirstURL: result.FirstURL,
            Text: result.Text,
            Result: result.Result ? result.Result.replace(/<[^>]*>?/gm, '') : '',
            Icon: result.Icon
          });
        }
      });
    }
    
    // Si aún no hay resultados, verificar si hay una respuesta directa
    if (results.length === 0 && data.Answer) {
      return `Respuesta directa: ${data.Answer}`;
    }
    
    // Si aún no hay resultados, verificar si hay redirección
    if (results.length === 0 && data.Redirect) {
      return `Redirigiendo a: [${data.Redirect}](${data.Redirect})`;
    }
    
    // Formatear los resultados según el formato solicitado
    const format = args.format || 'markdown';
    
    switch (format) {
      case 'html':
        return `
          <div class="search-results">
            ${results.map((result, index) => `
              <div class="search-result">
                <h3><a href="${result.FirstURL}" target="_blank" rel="noopener noreferrer">
                  ${result.Text}
                </a></h3>
                <p>${result.Result || ''}</p>
              </div>
              ${index < results.length - 1 ? '<hr/>' : ''}
            `).join('')}
          </div>
        `;
        
      case 'text':
        return results.map((result, index) => 
          `${index + 1}. ${result.Text}
   ${result.FirstURL}
   ${result.Result || ''}`
        ).join('\n\n');
        
      case 'markdown':
      default:
        return results.map(result => 
          `- [${result.Text}](${result.FirstURL})\n  ${result.Result || ''}`
        ).join('\n\n');
    }
    
  } catch (error) {
    console.error('❌ Error en web_search:', {
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
      query: args.query,
    });
    // Si hay un error, devolver un mensaje con enlace de búsqueda directa
    return `No se pudo completar la búsqueda. [Intenta buscando directamente en DuckDuckGo](${webSearchUrl})`;
  } finally {
    clearTimeout(timeoutId);
  }
}

/** TOOL DEFINITION FOR OPENROUTER 🧐 */
export const webSearchToolDefinition = {
  type: "function" as const,
  function: {
    name: "web_search",
    description: "Realiza una búsqueda en la web usando DuckDuckGo y devuelve los resultados.",
    parameters: {
      type: "object",
      properties: {
        query: {
          type: "string",
          description: "Términos de búsqueda"
        },
        format: {
          type: "string",
          enum: ["markdown", "text", "html"],
          default: "markdown",
          description: "Formato de salida de los resultados"
        },
        timeout: { 
          type: "number",
          description: "Tiempo máximo de espera en segundos",
          minimum: 5,
          maximum: 30,
          default: 15
        }
      },
      required: ["query"]
    }
  }
};