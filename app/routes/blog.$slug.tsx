import { AuthNav } from "~/components/login/auth-nav";
import { PostHeader } from "./blog/PostHeader";
import { PostContent } from "./blog/PostContent";
import { SuscriptionBox } from "./blog/SuscriptionBox";
import { Footer } from "~/components/common/Footer";
import type { Route } from "./+types/blog.$slug";
import { BlogDataService } from "~/.server/blog/blog-data";

export const loader = async ({ params }: Route.LoaderArgs) => {
  const post = await BlogDataService.getPostBySlug(params.slug);

  if (!post) {
    throw new Response("Post not found", { status: 404 });
  }

  const relatedPosts = await BlogDataService.getRelatedPosts(params.slug, 3);

  return {
    post,
    relatedPosts,
  };
};

export const clientLoader = async ({ serverLoader }: any) => {
  // Get server data first
  const serverData = await serverLoader();

  // Then get user data on client side
  const user = await fetch("/api/v1/user?intent=self").then((r) => r.json());

  return {
    ...serverData,
    user,
  };
};

export const meta = ({ data }: Route.MetaArgs) => {
  if (!data?.post) {
    return [
      { title: "Post no encontrado | EasyBits" },
      { name: "description", content: "El post que buscas no existe." },
    ];
  }

  const { post } = data;
  const ogImage =
    post.featuredImage ||
    "https://brendiwebsite.fly.storage.tigris.dev/metaImage-easybits.webp";
  const canonicalUrl = `https://www.easybits.cloud/blog/${post.slug}`;

  return [
    // Basic meta tags
    { title: `${post.title} | EasyBits` },
    { name: "description", content: post.description },
    { name: "keywords", content: post.tags.join(", ") },
    { name: "author", content: post.author },

    // Open Graph tags
    { property: "og:title", content: post.title },
    { property: "og:description", content: post.description },
    { property: "og:image", content: ogImage },
    {
      property: "og:image:alt",
      content: `Imagen destacada para: ${post.title}`,
    },
    { property: "og:type", content: "article" },
    { property: "og:url", content: canonicalUrl },
    { property: "og:site_name", content: "EasyBits" },
    { property: "og:locale", content: "es_ES" },

    // Article specific Open Graph tags
    {
      property: "article:published_time",
      content: new Date(post.date).toISOString(),
    },
    { property: "article:author", content: post.author },
    { property: "article:section", content: "Blog" },
    ...post.tags.map((tag: string) => ({
      property: "article:tag",
      content: tag,
    })),

    // Twitter Card tags
    { name: "twitter:card", content: "summary_large_image" },
    { name: "twitter:title", content: post.title },
    { name: "twitter:description", content: post.description },
    { name: "twitter:image", content: ogImage },
    {
      name: "twitter:image:alt",
      content: `Imagen destacada para: ${post.title}`,
    },

    // Additional SEO tags
    { name: "robots", content: "index, follow" },
    { name: "googlebot", content: "index, follow" },
    { name: "bingbot", content: "index, follow" },

    // Reading time and content info
    { name: "reading-time", content: `${post.readingTime} minutos` },
    { name: "content-type", content: "article" },

    // Canonical URL
    { tagName: "link", rel: "canonical", href: canonicalUrl },
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
              post.featuredImage ||
                "https://brendiwebsite.fly.storage.tigris.dev/metaImage-easybits.webp",
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
                url: "https://brendiwebsite.fly.storage.tigris.dev/logo-easybits.webp",
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
