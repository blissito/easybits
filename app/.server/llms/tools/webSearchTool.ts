// Servicio de búsqueda web usando múltiples proveedores (DuckDuckGo y Tavily)

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

// URLs base para búsquedas
const DUCKDUCKGO_SEARCH_URL = 'https://duckduckgo.com/?q=';
const TAVILY_API_URL = 'https://api.tavily.com/search';

// Interfaz para los resultados de Tavily
interface TavilySearchResult {
  url: string;
  title: string;
  content: string;
  score?: number;
}

interface TavilyResponse {
  results: TavilySearchResult[];
  query: string;
  images?: string[];
  news?: any[];
  error?: string;
}

// Función para buscar usando Tavily
async function searchWithTavily(query: string, maxResults: number = 5): Promise<TavilySearchResult[]> {
  try {
    const response = await fetch(TAVILY_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${process.env.TAVILY_API_KEY}`
      },
      body: JSON.stringify({
        query,
        include_domains: [],
        search_depth: 'basic',
        include_answer: true,
        include_raw_content: false,
        max_results: maxResults,
      })
    });

    if (!response.ok) {
      console.error('Tavily API error:', await response.text());
      return [];
    }

    const data: TavilyResponse = await response.json();
    return data.results || [];
  } catch (error) {
    console.error('Error searching with Tavily:', error);
    return [];
  }
}

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

// Función para generar un enlace de búsqueda directa
function getSearchLink(query: string): string {
  return `${DUCKDUCKGO_SEARCH_URL}${encodeURIComponent(query)}`;
}

export async function handleWebSearch(args: { query: string; format?: string; timeout?: number; useTavily?: boolean }) {
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
    let hasValidResponse = false;
  let data: DuckDuckGoResponse | null = null;
  
  // 1. Intentar con la API de DuckDuckGo primero (a menos que se solicite específicamente Tavily)
  if (!args.useTavily) {
    try {
      const response = await fetch(ddgUrl.toString(), {
        method: 'GET',
        headers: { 'Accept': 'application/json' },
        signal: controller.signal
      });
      
      if (!response.ok) {
        throw new Error(`Error HTTP ${response.status}: ${response.statusText}`);
      }
      
      data = await response.json();
      
      // Verificar si la respuesta es válida o solo contiene metadatos
      hasValidResponse = !!data?.Abstract || 
                        (data?.RelatedTopics && data.RelatedTopics.length > 0) ||
                        (data?.Results && data.Results.length > 0) ||
                        !!data?.Answer ||
                        !!data?.Redirect;
    } catch (error) {
      console.warn('Error con DuckDuckGo, intentando con Tavily...', error);
    }
  }
  
  // 2. Si DuckDuckGo falló o se solicitó Tavily explícitamente, intentar con Tavily
  if ((!hasValidResponse || args.useTavily) && process.env.TAVILY_API_KEY) {
    try {
      const tavilyResults = await searchWithTavily(query, 5);
      if (tavilyResults.length > 0) {
        // Formatear resultados de Tavily para que coincidan con la estructura esperada
        data = {
          Abstract: '',
          AbstractSource: 'Tavily',
          AbstractText: tavilyResults[0]?.content || '',
          AbstractURL: tavilyResults[0]?.url || '',
          Answer: '',
          AnswerType: '',
          Definition: '',
          DefinitionSource: '',
          DefinitionURL: '',
          Entity: '',
          Heading: tavilyResults[0]?.title || 'Resultados de búsqueda',
          Image: '',
          ImageHeight: 0,
          ImageIsLogo: 0,
          ImageWidth: 0,
          Infobox: {},
          Redirect: '',
          RelatedTopics: tavilyResults.map(result => ({
            FirstURL: result.url,
            Text: result.title,
            Result: result.content,
            URL: result.url
          })),
          Results: [],
          Type: 'A',
          meta: { status: 200 }
        };
        hasValidResponse = true;
      }
    } catch (error) {
      console.error('Error con Tavily:', error);
    }
  }
    
    if (data) {
      console.log('📊 Análisis de respuesta:', {
        hasAbstract: !!data.Abstract,
        hasRelatedTopics: data.RelatedTopics?.length > 0,
        hasResults: data.Results?.length > 0,
        hasAnswer: !!data.Answer,
        hasRedirect: !!data.Redirect,
        isValid: hasValidResponse,
        dataSample: JSON.stringify(data, null, 2).substring(0, 500) + '...'
      });
    } else {
      console.log('No se recibieron datos de búsqueda');
    }
    
    clearTimeout(timeoutId);
    
    // Si no hay una respuesta válida, verificar si parece ser una búsqueda de dominio
    if (!hasValidResponse || !data) {
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
        useTavily: {
          type: "boolean",
          description: "Si es true, usa Tavily como motor de búsqueda en lugar de DuckDuckGo",
          default: false
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