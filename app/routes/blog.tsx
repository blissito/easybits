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
    slug: "como-conectar-stripe-onboarding",
    filePath: "app/content/blog/2025-01-20-como-conectar-stripe-onboarding.mdx",
    title:
      "Cómo Conectar Stripe en tu Onboarding: Guía Completa para Creadores",
    description:
      "Aprende a integrar Stripe Connect en tu proceso de onboarding para monetizar tu conocimiento de forma profesional y segura.",
    date: "2025-01-20",
    author: "EasyBits Team",
    tags: ["stripe", "onboarding", "monetización", "creadores"],
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
    tags: ["tendencias", "economía", "creadores", "2025"],
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
    tags: ["monetización", "conocimiento", "online", "estrategias"],
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
    tags: ["marketing", "digital", "creadores", "estrategias"],
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
    tags: ["assets", "digitales", "creadores", "ventas"],
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
    tags: ["herramientas", "creadores", "2025", "productividad"],
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
