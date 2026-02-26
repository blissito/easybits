import { AuthNav } from "~/components/login/auth-nav";
import { PostHeader } from "./blog/PostHeader";
import { PostContent } from "./blog/PostContent";
import { SuscriptionBox } from "./blog/SuscriptionBox";
import { Footer } from "~/components/common/Footer";
import type { Route } from "./+types/blog.$slug";
import path from "path";
import matter from "gray-matter";
// import readingTime from "reading-time"; // REMOVE this import

// Map of known blog posts with their file paths
const BLOG_POSTS = {
  "conecta-agente-ia-easybits-mcp":
    "app/content/blog/2026-02-25-conecta-agente-ia-easybits-mcp.mdx",
  "gestiona-archivos-desde-claude-easybits":
    "app/content/blog/2026-02-25-gestiona-archivos-desde-claude-easybits.mdx",
  "como-conectar-stripe-onboarding":
    "app/content/blog/2025-01-20-como-conectar-stripe-onboarding.mdx",
  "tendencias-economia-creadores-2025":
    "app/content/blog/2025-01-16-tendencias-economia-creadores-2025.mdx",
  "monetizar-conocimiento-online":
    "app/content/blog/2025-01-14-monetizar-conocimiento-online.mdx",
  "marketing-digital-para-creadores":
    "app/content/blog/2025-01-12-marketing-digital-para-creadores.mdx",
  "como-crear-assets-digitales-exitosos":
    "app/content/blog/2025-01-10-como-crear-assets-digitales-exitosos.mdx",
  "herramientas-esenciales-creadores-2025":
    "app/content/blog/2025-01-18-herramientas-esenciales-creadores-2025.mdx",
} as const;

// Array con slug y featuredImage igual que en la lista de blog
const BLOG_POSTS_LIST = [
  {
    slug: "conecta-agente-ia-easybits-mcp",
    featuredImage:
      "https://images.unsplash.com/photo-1677442136019-21780ecad995?w=800&auto=format",
  },
  {
    slug: "gestiona-archivos-desde-claude-easybits",
    featuredImage:
      "https://images.unsplash.com/photo-1620712943543-bcc4688e7485?w=800&auto=format",
  },
  {
    slug: "como-conectar-stripe-onboarding",
    featuredImage:
      "https://images.pexels.com/photos/4968391/pexels-photo-4968391.jpeg?auto=compress&w=800",
  },
  {
    slug: "tendencias-economia-creadores-2025",
    featuredImage:
      "https://images.pexels.com/photos/3184465/pexels-photo-3184465.jpeg?auto=compress&w=800",
  },
  {
    slug: "monetizar-conocimiento-online",
    featuredImage:
      "https://images.pexels.com/photos/4386375/pexels-photo-4386375.jpeg?auto=compress&w=800",
  },
  {
    slug: "marketing-digital-para-creadores",
    featuredImage:
      "https://images.pexels.com/photos/3861964/pexels-photo-3861964.jpeg?auto=compress&w=800",
  },
  {
    slug: "como-crear-assets-digitales-exitosos",
    featuredImage:
      "https://images.pexels.com/photos/1181671/pexels-photo-1181671.jpeg?auto=compress&w=800",
  },
  {
    slug: "herramientas-esenciales-creadores-2025",
    featuredImage:
      "https://images.pexels.com/photos/1181675/pexels-photo-1181675.jpeg?auto=compress&w=800",
  },
];

// Helper para buscar la imagen por slug
const getFeaturedImageBySlug = (slug: string) => {
  const post = BLOG_POSTS_LIST.find((p) => p.slug === slug);
  return post?.featuredImage || null;
};

// Helper to ensure absolute image URLs
const getAbsoluteImageUrl = (img: string | undefined) =>
  img?.startsWith("http")
    ? img
    : img
    ? `https://www.easybits.cloud${img}`
    : undefined;

export const loader = async ({ params }: Route.LoaderArgs) => {
  const slug = params.slug;

  if (!slug || !BLOG_POSTS[slug as keyof typeof BLOG_POSTS]) {
    throw new Response("Post not found", { status: 404 });
  }

  try {
    const { promises: fs } = await import("fs");
    const filePath = BLOG_POSTS[slug as keyof typeof BLOG_POSTS];
    const fullPath = path.join(process.cwd(), filePath);

    const fileContent = await fs.readFile(fullPath, "utf-8");
    const { data: frontmatter, content } = matter(fileContent);

    // Import reading-time only in the loader (server-side)
    const readingTime = (await import("reading-time")).default;
    const readingTimeResult = readingTime(content);
    const excerpt =
      content
        .replace(/[#*`]/g, "")
        .replace(/\n+/g, " ")
        .trim()
        .substring(0, 160) + "...";

    const post = {
      slug,
      title: frontmatter.title,
      description: frontmatter.description,
      date: frontmatter.date,
      author: frontmatter.author,
      tags: frontmatter.tags || [],
      featuredImage: frontmatter.featuredImage || getFeaturedImageBySlug(slug),
      readingTime: Math.ceil(readingTimeResult.minutes),
      content,
      excerpt,
      published: frontmatter.published !== false,
    };

    if (!post.published) {
      throw new Response("Post not found", { status: 404 });
    }

    // Get related posts (simplified - just get other posts with similar tags)
    const relatedPosts = Object.entries(BLOG_POSTS)
      .filter(([otherSlug]) => otherSlug !== slug)
      .slice(0, 3)
      .map(([otherSlug]) => ({
        slug: otherSlug,
        title: `Related Post: ${otherSlug}`,
        description: "Related blog post",
        date: "2025-01-01",
        author: "EasyBits Team",
        tags: [],
        featuredImage: getFeaturedImageBySlug(otherSlug),
        readingTime: 5,
        content: "",
        excerpt: "Related blog post",
        published: true,
      }));

    return {
      post,
      relatedPosts,
    };
  } catch (error) {
    console.error("Error loading blog post:", error);
    throw new Response("Error loading post", { status: 500 });
  }
};

export const meta = ({ data }: Route.MetaArgs) => {
  if (!data?.post) {
    return [
      { title: "Post no encontrado | EasyBits" },
      { name: "description", content: "El post que buscas no existe." },
    ];
  }

  const { post } = data;
  const fallbackImage = "https://www.easybits.cloud/logo-eb.svg";
  const imageUrl = getAbsoluteImageUrl(post.featuredImage) || fallbackImage;

  return [
    { title: `${post.title} | EasyBits` },
    { name: "description", content: post.description },
    { name: "keywords", content: post.tags.join(", ") },
    { name: "author", content: post.author },

    // Open Graph
    { property: "og:title", content: post.title },
    { property: "og:description", content: post.description },
    { property: "og:type", content: "article" },
    {
      property: "og:url",
      content: `https://www.easybits.cloud/blog/${post.slug}`,
    },
    {
      property: "og:image",
      content: imageUrl,
    },
    { property: "article:author", content: post.author },
    {
      property: "article:published_time",
      content: new Date(post.date).toISOString(),
    },
    { property: "article:tag", content: post.tags.join(", ") },

    // Twitter Card
    { name: "twitter:card", content: "summary_large_image" },
    { name: "twitter:title", content: post.title },
    { name: "twitter:description", content: post.description },
    {
      name: "twitter:image",
      content: imageUrl,
    },
  ];
};

export default function BlogPost({ loaderData }: Route.ComponentProps) {
  const serverData = loaderData as any; // Type assertion for now

  // Handle the case where we have both server and client data
  const post = serverData.post || null;
  const user = serverData.user || null;
  const relatedPosts = serverData.relatedPosts || [];

  if (!post) {
    return (
      <section className="overflow-hidden">
        <AuthNav user={user} />
        <div className="pt-32 md:pt-[200px] pb-20 md:pb-32 max-w-7xl border-x-[2px] border-black mx-4 md:mx-[5%] xl:mx-auto px-4">
          <div className="text-center py-20">
            <h1 className="text-2xl font-bold mb-4">Post no encontrado</h1>
            <p className="text-iron">
              El post que buscas no existe o no se pudo cargar.
            </p>
          </div>
        </div>
        <Footer />
      </section>
    );
  }
  return (
    <section className="overflow-hidden">
      <AuthNav user={user} />
      <div className="pt-32 md:pt-[200px] pb-20 md:pb-32 max-w-7xl border-x-[2px] border-black mx-4 md:mx-[5%] xl:mx-auto px-4">
        <PostHeader post={post} />
        <PostContent post={post} />
        <SuscriptionBox />
      </div>
      <Footer />

      {/* Structured Data (JSON-LD) */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify({
            "@context": "https://schema.org",
            "@type": "Article",
            headline: post.title,
            description: post.description,
            image: [
              getAbsoluteImageUrl(post.featuredImage) ||
                "https://www.easybits.cloud/logo-eb.svg",
            ],
            datePublished: new Date(post.date).toISOString(),
            dateModified: new Date(post.date).toISOString(),
            author: {
              "@type": "Person",
              name: post.author,
            },
            publisher: {
              "@type": "Organization",
              name: "EasyBits",
              logo: {
                "@type": "ImageObject",
                url: "https://www.easybits.cloud/logo-eb.svg",
              },
            },
            mainEntityOfPage: {
              "@type": "WebPage",
              "@id": `https://www.easybits.cloud/blog/${post.slug}`,
            },
            keywords: post.tags,
            wordCount: post.content
              .split(/\s+/)
              .filter((word: string) => word.length > 0).length,
            timeRequired: `PT${post.readingTime}M`,
          }),
        }}
      />
    </section>
  );
}
