import { AuthNav } from "~/components/login/auth-nav";
import { Footer } from "~/components/common/Footer";
import { BlogContent, BlogHeader } from "./blog/BlogList";
import type { Route } from "./+types/blog";
import { FloatingChat } from "~/components/ai/FloatingChat";
import path from "path";
import matter from "gray-matter";
// import readingTime from "reading-time"; // REMOVE this import

// Map of known blog posts with their file paths and metadata
const BLOG_POSTS = [
  {
    slug: "tres-pruebas-una-sola-herramienta",
    filePath:
      "app/content/blog/2026-06-25-tres-pruebas-una-sola-herramienta.mdx",
    title: "Tres pruebas, una sola herramienta",
    description:
      "Oscar, de CoreGrid, grabó este video usando Easybits en producción: una llamada que se graba sola, un sitio en Astro que se publica en vivo y un agente que lo mueve todo. Las tres son el mismo sandbox haciendo trabajos distintos.",
    date: "2026-06-25",
    author: "Equipo Easybits",
    tags: ["sandboxes", "agentes", "build in public", "ghostycode", "Astro"],
    featuredImage: "https://img.youtube.com/vi/cPIUKyjkhl0/maxresdefault.jpg",
    readingTime: 3,
    excerpt:
      "Oscar de CoreGrid grabó un video usando Easybits en producción. Una llamada que se graba, un sitio en Astro que se publica y un agente que lo mueve: las tres son el mismo sandbox haciendo trabajos distintos.",
    published: true,
  },
  {
    slug: "ejemplo-server-url-publica",
    filePath: "app/content/blog/2026-06-08-ejemplo-server-url-publica.mdx",
    title:
      "Levanta un servidor y compártelo con una URL pública (en 15 líneas)",
    description:
      "Tercer Ejemplo: dentro de un sandbox arrancas un servidor y EasyBits te da una URL pública con HTTPS para compartirlo al instante. Sin Docker, sin configurar dominios, sin desplegar nada. Te regalamos el server.js listo para usar.",
    date: "2026-06-08",
    author: "Equipo Easybits",
    tags: ["ejemplos", "sandboxes", "SDK"],
    featuredImage: "/blog/assets/blog-server-url-editorial.png",
    readingTime: 4,
    excerpt:
      "Arrancas un servidor dentro de un sandbox y exposePort te da una URL pública con HTTPS al instante — sin Docker, sin dominios, sin desplegar. Regalo: server.js sin dependencias.",
    published: true,
  },
  {
    slug: "ejemplo-agente-embebido-en-tu-web",
    filePath:
      "app/content/blog/2026-06-07-ejemplo-agente-embebido-en-tu-web.mdx",
    title: "Pon un agente que ejecuta código dentro de tu web (sin backend)",
    description:
      "Segundo Ejemplo: creas un agente una sola vez con el SDK y lo embebes en cualquier página con 30 líneas de HTML. El visitante le escribe, el agente corre código en un sandbox y te responde en vivo — todo desde el navegador, sin que montes un servidor. Te regalamos el HTML listo para abrir.",
    date: "2026-06-07",
    author: "Equipo Easybits",
    tags: ["ejemplos", "agentes", "SDK"],
    featuredImage: "/blog/assets/blog-agent-embed-editorial.png",
    readingTime: 5,
    excerpt:
      "Creas un agente una vez con el SDK y lo embebes en cualquier web con 30 líneas de HTML. El visitante le escribe, el agente corre código en un sandbox y responde en vivo — sin backend. El embed token (agt_) es seguro en el cliente.",
    published: true,
  },
  {
    slug: "ejemplo-data-analyst-sandbox",
    filePath:
      "app/content/blog/2026-06-07-ejemplo-data-analyst-sandbox.mdx",
    title:
      "Tu primer analista de datos con IA: analiza un CSV en un sandbox (paso a paso)",
    description:
      "Un ejemplo para empezar: subes un CSV de ventas a un sandbox, corres unas líneas de Python y obtienes las respuestas — productos más vendidos, ventas por mes, ticket promedio y hasta una gráfica. Te regalamos el CSV para que lo pruebes hoy mismo. Sin configurar nada en tu compu.",
    date: "2026-06-07",
    author: "Equipo Easybits",
    tags: ["ejemplos", "sandboxes", "SDK"],
    featuredImage: "/blog/assets/blog-data-analyst-editorial.png",
    readingTime: 6,
    excerpt:
      "El primero de nuestros Ejemplos: subes un CSV de ventas a un sandbox, corres unas líneas de Python y obtienes top de productos, ventas por mes, ticket promedio y una gráfica. Te regalamos el CSV para que lo pruebes hoy mismo.",
    published: true,
  },
  {
    slug: "tu-agente-no-deberia-llamar-tools-una-por-una",
    filePath:
      "app/content/blog/2026-06-06-tu-agente-no-deberia-llamar-tools-una-por-una.mdx",
    title: "Tu agente no debería llamar tools una por una",
    description:
      "El cambio del que todos hablan en 2026: Code Mode. En vez de llamar una tool MCP a la vez, el agente escribe un script que las orquesta y lo corre en un sandbox. Anthropic reportó −98.7% de tokens; Cloudflare, −99.9%. El patrón, por qué necesita una caja, y hacia dónde lo llevamos.",
    date: "2026-06-06",
    author: "Equipo Easybits",
    tags: ["sandboxes", "MCP", "agentes", "code-mode", "SDK"],
    featuredImage: "/blog/assets/blog-tool-batching-editorial.png",
    readingTime: 5,
    excerpt:
      "El loop clásico de MCP convierte al modelo en un router carísimo: cada resultado pasa por la ventana de contexto solo para copiarse al siguiente input. Code Mode lo cambia — el agente escribe un script, lo corre en un sandbox, y devuelve solo el resultado. −98.7% de tokens.",
    published: true,
  },
  {
    slug: "migra-tus-pipelines-sandboxes-easybits",
    filePath:
      "app/content/blog/2026-06-05-migra-tus-pipelines-sandboxes-easybits.mdx",
    title:
      "Tres llamadas son un CI runner: corre tus pipelines en sandboxes de Easybits",
    description:
      "execBackground, bgStatus y bgKill. Con esas tres funciones del SDK de Easybits tienes el corazón de un runner de CI: lanzas el build, lees su salida mientras corre y lo matas si se cuelga. Un pipeline real en 20 líneas y, con honestidad, qué conviene migrar y qué todavía no.",
    date: "2026-06-05",
    author: "Equipo Easybits",
    tags: ["sandboxes", "CI", "pipelines", "SDK", "DevOps"],
    featuredImage: "/blog/assets/blog-pipelines-editorial.png",
    readingTime: 5,
    excerpt:
      "El build de un CI es un proceso largo en una caja limpia del que quieres saber tres cosas: si terminó, con qué exit code, y qué imprimió. El SDK expone exactamente eso. Pipeline real en 20 líneas + qué migrar y qué no.",
    published: true,
  },
  {
    slug: "tu-agente-corre-codigo-sandboxes-easybits",
    filePath:
      "app/content/blog/2026-06-04-tu-agente-corre-codigo-sandboxes-easybits.mdx",
    title:
      "Tu agente ya puede correr código, levantar servers y publicar URLs — todo por MCP",
    description:
      "La segunda parte: qué puede HACER tu agente con los sandboxes de Easybits. Corre código con estado (kernel de Python), genera gráficas a partir de datos, lanza procesos en segundo plano, maneja archivos y expone un puerto como URL pública con HTTPS. Todo desde un solo MCP.",
    date: "2026-06-04",
    author: "Equipo Easybits",
    tags: ["sandboxes", "agentes", "IA", "MCP", "code-interpreter"],
    featuredImage: "/blog/assets/sandbox-sdk.jpg",
    readingTime: 5,
    excerpt:
      "El cómo, no el qué: kernel de Python con estado, gráficas a partir de datos, procesos en segundo plano, archivos y un puerto expuesto como URL pública con HTTPS. Todo por MCP.",
    published: true,
  },
  {
    slug: "sandboxes-para-agentes-ia",
    filePath: "app/content/blog/2026-06-04-sandboxes-para-agentes-ia.mdx",
    title:
      "El código que tu IA escribe tiene que correr en algún lado (y no debería ser tu laptop)",
    description:
      "Encuesta Stack Overflow 2025: 84% de los devs ya usa IA, pero solo el 29% confía en que el código salga correcto. Aun así, ese código llega a producción. Te explicamos qué es un sandbox, por qué los microVMs importan, y por qué construimos los nuestros en pesos y en español.",
    date: "2026-06-04",
    author: "Equipo Easybits",
    tags: ["sandboxes", "agentes", "IA", "MCP", "seguridad"],
    featuredImage: "/blog/assets/sandbox-ghosty.jpg",
    readingTime: 5,
    excerpt:
      "Generamos más código del que leemos y no nos lo creemos. Un sandbox es dónde corres ese código sin que toque nada tuyo. Por qué los nuestros son microVMs reales, en pesos y en español.",
    published: true,
  },
  {
    slug: "editar-pagina-22k-tokens-mcp",
    filePath: "app/content/blog/2026-05-18-editar-pagina-22k-tokens-mcp.mdx",
    title:
      "Cuando editar una página cuesta 22K tokens: lo que aprendimos midiendo agentes largos sobre nuestro MCP",
    description:
      "Una sesión real de 55 minutos editando un PDF técnico vía el MCP de EasyBits: 26 llamadas a set_page_html, varias reescrituras idénticas byte-a-byte, y 7 auto-compactaciones del SDK. Esto es lo que vimos y lo que vamos a cambiar.",
    date: "2026-05-18",
    author: "EasyBits Team",
    tags: ["MCP", "Claude", "agentes", "tokens", "ingeniería"],
    featuredImage:
      "https://images.unsplash.com/photo-1551288049-bebda4e38f71?w=800&auto=format",
    readingTime: 6,
    excerpt:
      "Reporte de campo: por qué iterar sobre una página vía set_page_html dispara auto-compactaciones, y el roadmap de ediciones por diff que estamos preparando.",
    published: true,
  },
  {
    slug: "oauth-mcp-claude-cowork",
    filePath: "app/content/blog/2026-04-14-oauth-mcp-claude-cowork.mdx",
    title: "OAuth 2.1 + DCR para MCP: cómo conectamos EasyBits a Claude Cowork sin API keys",
    description:
      "El nuevo flujo de OAuth dinámico que permite a Claude.ai y Cowork conectarse a EasyBits con un solo click. RFC 8414, 9728, 7591 y PKCE S256 explicados desde el código real.",
    date: "2026-04-14",
    author: "EasyBits Team",
    tags: ["MCP", "OAuth", "Claude", "Cowork", "arquitectura"],
    featuredImage:
      "https://images.unsplash.com/photo-1633265486064-086b219458ec?w=800&auto=format",
    readingTime: 9,
    excerpt:
      "Web MCP clients como Cowork no pueden copiar API keys. Así implementamos OAuth 2.1 con Dynamic Client Registration sin romper el flujo Bearer existente.",
    published: true,
  },
  {
    slug: "nuevos-planes-easybits-storage-para-agentes",
    filePath: "app/content/blog/2026-04-04-nuevos-planes-easybits-storage-para-agentes.mdx",
    title: "Nuevos planes EasyBits: storage agentic desde $299 MXN",
    description: "Rediseñamos nuestros planes para agentes AI. Byte gratis con 100 MB, Mega desde $299 MXN con 10 GB y 50 créditos AI, Tera desde $2,490 MXN con 100 GB.",
    date: "2026-04-04",
    author: "Equipo EasyBits",
    tags: ["planes", "pricing", "agentes-ai", "mcp", "storage"],
    featuredImage: "https://images.unsplash.com/photo-1633356122544-f134324a6cee?w=800&auto=format",
    readingTime: 4,
    excerpt: "Rediseñamos nuestros planes para agentes AI. Byte gratis, Mega y Tera para producción.",
    published: true,
  },
  {
    slug: "por-que-tailwind-en-nuestro-editor-de-documentos",
    filePath:
      "app/content/blog/2026-03-17-por-que-tailwind-en-nuestro-editor-de-documentos.mdx",
    title: "Por que elegimos Tailwind CSS para nuestro editor de documentos",
    description:
      "Tailwind CSS es el motor detras del editor de documentos de EasyBits. Te explicamos por que lo elegimos, como funciona con la generacion de AI, y que ventajas tiene para disenadores web.",
    date: "2026-03-17",
    author: "EasyBits Team",
    tags: ["Tailwind CSS", "Editor", "Documentos", "Diseno Web", "AI"],
    featuredImage:
      "https://images.unsplash.com/photo-1507721999472-8ed4421c4af2?w=800&auto=format",
    readingTime: 8,
    excerpt:
      "Tailwind CSS es el motor detras del editor de documentos de EasyBits. Te explicamos por que lo elegimos, como funciona con la generacion de AI, y que ventajas tiene para disenadores web.",
    published: true,
  },
  {
    slug: "mcp-apps-ui-easybits-laboratorio",
    filePath:
      "app/content/blog/2026-03-07-mcp-apps-ui-easybits-laboratorio.mdx",
    title: "MCP Apps UI — EasyBits como laboratorio abierto",
    description:
      "Construimos 3 interfaces inline para MCP Apps UI antes de que ningun cliente las soporte. Asi nos preparamos para el futuro del protocolo.",
    date: "2026-03-07",
    author: "EasyBits Team",
    tags: ["MCP", "Apps UI", "Build in Public"],
    featuredImage:
      "https://images.unsplash.com/photo-1558494949-ef010cbdcc31?w=800&auto=format",
    readingTime: 6,
    excerpt:
      "Construimos 3 interfaces inline para MCP Apps UI antes de que ningun cliente las soporte. Asi nos preparamos para el futuro del protocolo.",
    published: true,
  },
  {
    slug: "gestiona-archivos-desde-claude-easybits",
    filePath:
      "app/content/blog/2026-02-25-gestiona-archivos-desde-claude-easybits.mdx",
    title: "Gestiona tus archivos digitales desde Claude con EasyBits",
    description:
      "Guía práctica de las 21 herramientas del MCP de EasyBits: sube archivos, comparte links, optimiza imágenes, busca con IA y más.",
    date: "2026-02-25",
    author: "EasyBits Team",
    tags: ["MCP", "herramientas", "IA"],
    featuredImage:
      "https://images.unsplash.com/photo-1620712943543-bcc4688e7485?w=800&auto=format",
    readingTime: 8,
    excerpt:
      "Guía práctica de las 21 herramientas del MCP de EasyBits: sube archivos, comparte links, optimiza imágenes, busca con IA y más.",
    published: true,
  },
  {
    slug: "conecta-agente-ia-easybits-mcp",
    filePath:
      "app/content/blog/2026-02-25-conecta-agente-ia-easybits-mcp.mdx",
    title: "Conecta tu agente de IA a EasyBits con MCP",
    description:
      "Aprende a conectar Claude, Cursor y otros agentes de IA a EasyBits usando el protocolo MCP. Setup en 3 pasos.",
    date: "2026-02-25",
    author: "EasyBits Team",
    tags: ["MCP", "IA"],
    featuredImage:
      "https://images.unsplash.com/photo-1677442136019-21780ecad995?w=800&auto=format",
    readingTime: 5,
    excerpt:
      "Aprende a conectar Claude, Cursor y otros agentes de IA a EasyBits usando el protocolo MCP. Setup en 3 pasos.",
    published: true,
  },
  {
    slug: "como-conectar-stripe-onboarding",
    filePath: "app/content/blog/2025-01-20-como-conectar-stripe-onboarding.mdx",
    title:
      "Cómo Conectar Stripe en tu Onboarding: Guía Completa para Creadores",
    description:
      "Aprende a integrar Stripe Connect en tu proceso de onboarding para monetizar tu conocimiento de forma profesional y segura.",
    date: "2025-01-20",
    author: "EasyBits Team",
    tags: ["stripe", "monetización", "creadores"],
    featuredImage:
      "https://images.pexels.com/photos/4968391/pexels-photo-4968391.jpeg?auto=compress&w=800",
    readingTime: 8,
    excerpt:
      "Aprende a integrar Stripe Connect en tu proceso de onboarding para monetizar tu conocimiento de forma profesional y segura.",
    published: true,
  },
  {
    slug: "tendencias-economia-creadores-2025",
    filePath:
      "app/content/blog/2025-01-16-tendencias-economia-creadores-2025.mdx",
    title:
      "Tendencias de la Economía de Creadores en 2025: Oportunidades y Desafíos",
    description:
      "Descubre las principales tendencias que están moldeando la economía de creadores en 2025 y cómo aprovecharlas.",
    date: "2025-01-16",
    author: "EasyBits Team",
    tags: ["creadores", "monetización"],
    featuredImage:
      "https://images.pexels.com/photos/3184465/pexels-photo-3184465.jpeg?auto=compress&w=800",
    readingTime: 12,
    excerpt:
      "Descubre las principales tendencias que están moldeando la economía de creadores en 2025 y cómo aprovecharlas.",
    published: true,
  },
  {
    slug: "monetizar-conocimiento-online",
    filePath: "app/content/blog/2025-01-14-monetizar-conocimiento-online.mdx",
    title: "Cómo Monetizar tu Conocimiento Online: Estrategias Comprobadas",
    description:
      "Guía práctica para convertir tu experiencia en ingresos sostenibles a través de diferentes canales digitales.",
    date: "2025-01-14",
    author: "EasyBits Team",
    tags: ["monetización", "marketing"],
    featuredImage:
      "https://images.pexels.com/photos/4386375/pexels-photo-4386375.jpeg?auto=compress&w=800",
    readingTime: 10,
    excerpt:
      "Guía práctica para convertir tu experiencia en ingresos sostenibles a través de diferentes canales digitales.",
    published: true,
  },
  {
    slug: "marketing-digital-para-creadores",
    filePath:
      "app/content/blog/2025-01-12-marketing-digital-para-creadores.mdx",
    title: "Marketing Digital para Creadores: Estrategias que Funcionan",
    description:
      "Aprende las mejores estrategias de marketing digital para hacer crecer tu audiencia y monetizar tu contenido.",
    date: "2025-01-12",
    author: "EasyBits Team",
    tags: ["marketing", "creadores"],
    featuredImage:
      "https://images.pexels.com/photos/3861964/pexels-photo-3861964.jpeg?auto=compress&w=800",
    readingTime: 7,
    excerpt:
      "Aprende las mejores estrategias de marketing digital para hacer crecer tu audiencia y monetizar tu contenido.",
    published: true,
  },
  {
    slug: "como-crear-assets-digitales-exitosos",
    filePath:
      "app/content/blog/2025-01-10-como-crear-assets-digitales-exitosos.mdx",
    title: "Cómo Crear Assets Digitales Exitosos: Guía para Creadores",
    description:
      "Descubre el proceso completo para crear y vender assets digitales que generen ingresos pasivos.",
    date: "2025-01-10",
    author: "EasyBits Team",
    tags: ["assets digitales", "creadores"],
    featuredImage:
      "https://images.pexels.com/photos/1181671/pexels-photo-1181671.jpeg?auto=compress&w=800",
    readingTime: 6,
    excerpt:
      "Descubre el proceso completo para crear y vender assets digitales que generen ingresos pasivos.",
    published: true,
  },
  {
    slug: "herramientas-esenciales-creadores-2025",
    filePath:
      "app/content/blog/2025-01-18-herramientas-esenciales-creadores-2025.mdx",
    title: "Herramientas Esenciales para Creadores en 2025",
    description:
      "Descubre las herramientas más importantes que todo creador necesita para crecer en 2025.",
    date: "2025-01-18",
    author: "EasyBits Team",
    tags: ["herramientas", "creadores"],
    featuredImage:
      "https://images.pexels.com/photos/1181675/pexels-photo-1181675.jpeg?auto=compress&w=800",
    readingTime: 15,
    excerpt:
      "Descubre las herramientas más importantes que todo creador necesita para crecer en 2025.",
    published: true,
  },
];

export const loader = async ({ request }: Route.LoaderArgs) => {
  const url = new URL(request.url);
  const page = parseInt(url.searchParams.get("page") || "1");
  const tag = url.searchParams.get("tag") || undefined;
  const search = url.searchParams.get("search") || undefined;
  const limit = 10;

  // Import fs only in the loader (server-side)
  // const { promises: fs } = await import("fs");
  // Si necesitas leer archivos aquí, usa fs.readFile

  // Import reading-time only in the loader (server-side)
  // const readingTime = (await import("reading-time")).default;
  // Si necesitas calcular el tiempo de lectura aquí, hazlo así:
  // const readingTimeResult = readingTime(content);

  // Filter posts based on criteria
  let filteredPosts = BLOG_POSTS.filter((post) => post.published);

  if (tag) {
    filteredPosts = filteredPosts.filter((post) =>
      post.tags.some((postTag) => postTag.toLowerCase() === tag.toLowerCase())
    );
  }

  if (search) {
    const searchLower = search.toLowerCase();
    filteredPosts = filteredPosts.filter(
      (post) =>
        post.title.toLowerCase().includes(searchLower) ||
        post.description.toLowerCase().includes(searchLower) ||
        post.excerpt.toLowerCase().includes(searchLower) ||
        post.tags.some((tag) => tag.toLowerCase().includes(searchLower))
    );
  }

  // Sort by date (newest first)
  filteredPosts.sort(
    (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()
  );

  // Pagination
  const totalPosts = filteredPosts.length;
  const totalPages = Math.ceil(totalPosts / limit);
  const startIndex = (page - 1) * limit;
  const endIndex = startIndex + limit;
  const paginatedPosts = filteredPosts.slice(startIndex, endIndex);

  // Get all unique tags
  const allTags = [...new Set(BLOG_POSTS.flatMap((post) => post.tags))].sort();

  return {
    posts: paginatedPosts,
    totalPosts,
    totalPages,
    currentPage: page,
    hasNextPage: page < totalPages,
    hasPrevPage: page > 1,
    tags: allTags,
    user: null, // Will be handled on client side
  };
};

export const meta = () => {
  return [
    { title: "Blog | EasyBits" },
    {
      name: "description",
      content: "Consejos de Marketing + Negocios para creadores",
    },
    {
      name: "keywords",
      content: "blog, marketing, creadores, negocios, estrategias",
    },

    // Open Graph
    { property: "og:title", content: "Blog | EasyBits" },
    {
      property: "og:description",
      content: "Consejos de Marketing + Negocios para creadores",
    },
    { property: "og:type", content: "website" },
    { property: "og:url", content: "https://www.easybits.cloud/blog" },
    {
      property: "og:image",
      content:
        "https://brendiwebsite.fly.storage.tigris.dev/metaImage-easybits.webp",
    },

    // Twitter Card
    { name: "twitter:card", content: "summary_large_image" },
    { name: "twitter:title", content: "Blog | EasyBits" },
    {
      name: "twitter:description",
      content: "Consejos de Marketing + Negocios para creadores",
    },
    {
      name: "twitter:image",
      content:
        "https://brendiwebsite.fly.storage.tigris.dev/metaImage-easybits.webp",
    },
  ];
};

export default function Blog({ loaderData }: Route.ComponentProps) {
  const serverData = loaderData as any; // Type assertion for now
  const {
    user,
    posts = [],
    tags = [],
    totalPages,
    currentPage,
    hasNextPage,
    hasPrevPage,
  } = serverData;

  return (
    <section className="overflow-hidden">
      <AuthNav user={user} />
      <BlogHeader />
      <BlogContent
        posts={posts}
        tags={tags}
        totalPages={totalPages}
        currentPage={currentPage}
        hasNextPage={hasNextPage}
        hasPrevPage={hasPrevPage}
      />
      <Footer />
      <FloatingChat />

      {/* Structured Data (JSON-LD) */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify({
            "@context": "https://schema.org",
            "@type": "Blog",
            name: "Blog | EasyBits",
            description: "Consejos de Marketing + Negocios para creadores",
            url: "https://www.easybits.cloud/blog",
            publisher: {
              "@type": "Organization",
              name: "EasyBits",
              logo: {
                "@type": "ImageObject",
                url: "https://brendiwebsite.fly.storage.tigris.dev/logo-easybits.webp",
              },
            },
            blogPost: posts.slice(0, 10).map((post: any) => ({
              "@type": "BlogPosting",
              headline: post.title,
              description: post.description,
              url: `https://www.easybits.cloud/blog/${post.slug}`,
              datePublished: new Date(post.date).toISOString(),
              author: {
                "@type": "Person",
                name: post.author,
              },
              keywords: post.tags,
            })),
          }),
        }}
      />
    </section>
  );
}
