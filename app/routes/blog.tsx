import { AuthNav } from "~/components/login/auth-nav";
import { Footer } from "~/components/common/Footer";
import { BlogContent, BlogHeader } from "./blog/BlogList";
import type { Route } from "./+types/blog";
import { FloatingChat } from "~/components/ai/FloatingChat";
import path from "path";
import matter from "gray-matter";
import { listPublishedPosts } from "~/.server/blogPosts";
// import readingTime from "reading-time"; // REMOVE this import

export const loader = async ({ request }: Route.LoaderArgs) => {
  const url = new URL(request.url);
  const page = parseInt(url.searchParams.get("page") || "1");
  const tag = url.searchParams.get("tag") || undefined;
  const search = url.searchParams.get("search") || undefined;
  const limit = 10;

  // El índice sale del directorio de posts, no de una lista a mano.
  const allPosts = await listPublishedPosts();
  let filteredPosts = allPosts;

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
  const allTags = [...new Set(allPosts.flatMap((post) => post.tags))].sort();

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
