import { AuthNav } from "~/components/login/auth-nav";
import { Footer } from "~/components/common/Footer";
import { BlogContent, BlogHeader } from "./blog/BlogList";
import type { Route } from "./+types/blog";
import { FloatingChat } from "~/components/ai/FloatingChat";
import { BlogDataService } from "~/.server/blog/blog-data";

export const loader = async ({ request }: Route.LoaderArgs) => {
  const url = new URL(request.url);
  const page = parseInt(url.searchParams.get("page") || "1");
  const tag = url.searchParams.get("tag") || undefined;
  const search = url.searchParams.get("search") || undefined;

  const blogData = await BlogDataService.getAllPosts({
    page,
    tag,
    search,
    limit: 10,
  });

  const tags = await BlogDataService.getAllTags();

  // Get user data on server side too
  let user = null;
  try {
    // This would need to be implemented server-side
    // For now, we'll handle user on client side
  } catch (error) {
    console.log("Could not fetch user on server side");
  }

  return {
    ...blogData,
    tags,
    user,
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
  // Get URL parameters from the loader data
  const { currentPage = 1, tag, search } = data || {};

  let title = "Blog | EasyBits";
  let description =
    "Consejos de Marketing + Negocios para creadores. Ve por tu café, toma asiento y descubre como impulsar tu negocio creativo.";

  if (tag) {
    title = `Posts sobre ${tag} | Blog | EasyBits`;
    description = `Descubre todos nuestros artículos sobre ${tag}. ${description}`;
  }

  if (search) {
    title = `Búsqueda: "${search}" | Blog | EasyBits`;
    description = `Resultados de búsqueda para "${search}". ${description}`;
  }

  if (currentPage > 1) {
    title = `${title} - Página ${currentPage}`;
  }

  const canonicalUrl = `https://www.easybits.cloud/blog${
    currentPage > 1 ? `?page=${currentPage}` : ""
  }`;
  const ogImage =
    "https://brendiwebsite.fly.storage.tigris.dev/metaImage-easybits.webp";

  return [
    { title },
    { name: "description", content: description },
    {
      name: "keywords",
      content:
        "blog, marketing digital, negocios creativos, assets digitales, emprendimiento",
    },

    // Open Graph tags
    { property: "og:title", content: title },
    { property: "og:description", content: description },
    { property: "og:image", content: ogImage },
    { property: "og:type", content: "website" },
    { property: "og:url", content: canonicalUrl },
    { property: "og:site_name", content: "EasyBits" },

    // Twitter Card tags
    { name: "twitter:card", content: "summary_large_image" },
    { name: "twitter:title", content: title },
    { name: "twitter:description", content: description },
    { name: "twitter:image", content: ogImage },

    // SEO tags
    { name: "robots", content: "index, follow" },
    { tagName: "link", rel: "canonical", href: canonicalUrl },
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
