import { AuthNav } from "~/components/login/auth-nav";
import { Footer } from "~/components/common/Footer";
import { BlogContent, BlogHeader } from "./blog/BlogList";
import type { Route } from "./+types/blog";
import { FloatingChat } from "~/components/ai/FloatingChat";
import { listPublishedPosts } from "~/.server/blogPosts";

export const loader = async () => {
  // La ruta está PRERENDERIZADA (react-router.config.ts): este loader corre una vez
  // en el build. Por eso devuelve TODOS los posts (sin cuerpo) y el filtrado por
  // pista/tag/búsqueda es en cliente — una query en la URL no llega a un snapshot.
  const allPosts = (await listPublishedPosts())
    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
    .map(({ content: _content, ...meta }) => meta);
  const allTags = [...new Set(allPosts.flatMap((post) => post.tags))].sort();
  const featured = allPosts.find((p) => p.featured) ?? allPosts[0] ?? null;
  return { posts: allPosts, tags: allTags, featured, user: null };
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
        "https://brendiwebsite.t3.storage.dev/metaImage-easybits.webp",
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
        "https://brendiwebsite.t3.storage.dev/metaImage-easybits.webp",
    },
  ];
};

export default function Blog({ loaderData }: Route.ComponentProps) {
  const serverData = loaderData as any; // Type assertion for now
  const { user, posts = [], tags = [], featured = null } = serverData;

  return (
    <section className="overflow-hidden">
      <AuthNav user={user} />
      <BlogHeader />
      <BlogContent posts={posts} tags={tags} featured={featured} />
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
                url: "https://brendiwebsite.t3.storage.dev/logo-easybits.webp",
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
