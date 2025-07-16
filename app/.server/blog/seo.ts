import type { BlogPost } from "./mdx-processor";
import { BlogDataService } from "./blog-data";

export interface BlogSEOData {
  title: string;
  description: string;
  canonicalUrl: string;
  ogImage: string;
  publishedTime: string;
  modifiedTime?: string;
  author: string;
  tags: string[];
  readingTime: number;
  excerpt: string;
}

export interface StructuredDataArticle {
  "@context": string;
  "@type": string;
  headline: string;
  description: string;
  image: string[];
  datePublished: string;
  dateModified?: string;
  author: {
    "@type": string;
    name: string;
  };
  publisher: {
    "@type": string;
    name: string;
    logo: {
      "@type": string;
      url: string;
    };
  };
  mainEntityOfPage: {
    "@type": string;
    "@id": string;
  };
  keywords: string[];
  wordCount?: number;
  timeRequired?: string;
}

export class BlogSEOService {
  private static readonly SITE_NAME = "EasyBits";
  private static readonly SITE_URL = "https://www.easybits.cloud";
  private static readonly DEFAULT_OG_IMAGE =
    "https://brendiwebsite.fly.storage.tigris.dev/metaImage-easybits.webp";
  private static readonly PUBLISHER_LOGO =
    "https://brendiwebsite.fly.storage.tigris.dev/logo-easybits.webp";

  /**
   * Generate comprehensive meta tags for a blog post
   */
  static generateBlogPostMetaTags(post: BlogPost, canonicalUrl: string) {
    const ogImage = post.featuredImage || this.DEFAULT_OG_IMAGE;
    const fullCanonicalUrl = `${this.SITE_URL}${canonicalUrl}`;

    return [
      // Basic meta tags
      { title: `${post.title} | ${this.SITE_NAME}` },
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
      { property: "og:url", content: fullCanonicalUrl },
      { property: "og:site_name", content: this.SITE_NAME },
      { property: "og:locale", content: "es_ES" },

      // Article specific Open Graph tags
      {
        property: "article:published_time",
        content: new Date(post.date).toISOString(),
      },
      { property: "article:author", content: post.author },
      { property: "article:section", content: "Blog" },
      ...post.tags.map((tag) => ({ property: "article:tag", content: tag })),

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
      { tagName: "link", rel: "canonical", href: fullCanonicalUrl },
    ];
  }

  /**
   * Generate meta tags for blog listing page
   */
  static generateBlogListMetaTags(
    page: number = 1,
    tag?: string,
    search?: string
  ) {
    let title = `Blog | ${this.SITE_NAME}`;
    let description =
      "Consejos de Marketing + Negocios para creadores. Ve por tu café, toma asiento y descubre como impulsar tu negocio creativo.";

    if (tag) {
      title = `Posts sobre ${tag} | Blog | ${this.SITE_NAME}`;
      description = `Descubre todos nuestros artículos sobre ${tag}. ${description}`;
    }

    if (search) {
      title = `Búsqueda: "${search}" | Blog | ${this.SITE_NAME}`;
      description = `Resultados de búsqueda para "${search}". ${description}`;
    }

    if (page > 1) {
      title = `${title} - Página ${page}`;
    }

    const canonicalUrl = `${this.SITE_URL}/blog${
      page > 1 ? `?page=${page}` : ""
    }`;

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
      { property: "og:image", content: this.DEFAULT_OG_IMAGE },
      { property: "og:type", content: "website" },
      { property: "og:url", content: canonicalUrl },
      { property: "og:site_name", content: this.SITE_NAME },

      // Twitter Card tags
      { name: "twitter:card", content: "summary_large_image" },
      { name: "twitter:title", content: title },
      { name: "twitter:description", content: description },
      { name: "twitter:image", content: this.DEFAULT_OG_IMAGE },

      // SEO tags
      { name: "robots", content: "index, follow" },
      { tagName: "link", rel: "canonical", href: canonicalUrl },
    ];
  }

  /**
   * Generate structured data (JSON-LD) for a blog post
   */
  static generateBlogPostStructuredData(
    post: BlogPost,
    canonicalUrl: string
  ): StructuredDataArticle {
    const fullCanonicalUrl = `${this.SITE_URL}${canonicalUrl}`;
    const ogImage = post.featuredImage || this.DEFAULT_OG_IMAGE;

    return {
      "@context": "https://schema.org",
      "@type": "Article",
      headline: post.title,
      description: post.description,
      image: [ogImage],
      datePublished: new Date(post.date).toISOString(),
      dateModified: new Date(post.date).toISOString(), // We don't track modifications yet
      author: {
        "@type": "Person",
        name: post.author,
      },
      publisher: {
        "@type": "Organization",
        name: this.SITE_NAME,
        logo: {
          "@type": "ImageObject",
          url: this.PUBLISHER_LOGO,
        },
      },
      mainEntityOfPage: {
        "@type": "WebPage",
        "@id": fullCanonicalUrl,
      },
      keywords: post.tags,
      wordCount: this.estimateWordCount(post.content),
      timeRequired: `PT${post.readingTime}M`, // ISO 8601 duration format
    };
  }

  /**
   * Generate structured data for blog listing page
   */
  static async generateBlogListStructuredData() {
    const posts = await BlogDataService.getAllPosts({ limit: 50 }); // Get recent posts for structured data

    return {
      "@context": "https://schema.org",
      "@type": "Blog",
      name: `Blog | ${this.SITE_NAME}`,
      description: "Consejos de Marketing + Negocios para creadores",
      url: `${this.SITE_URL}/blog`,
      publisher: {
        "@type": "Organization",
        name: this.SITE_NAME,
        logo: {
          "@type": "ImageObject",
          url: this.PUBLISHER_LOGO,
        },
      },
      blogPost: posts.posts.slice(0, 10).map((post) => ({
        "@type": "BlogPosting",
        headline: post.title,
        description: post.description,
        url: `${this.SITE_URL}/blog/${post.slug}`,
        datePublished: new Date(post.date).toISOString(),
        author: {
          "@type": "Person",
          name: post.author,
        },
        keywords: post.tags,
      })),
    };
  }

  /**
   * Generate sitemap XML for all blog posts
   */
  static async generateSitemap(): Promise<string> {
    const posts = await BlogDataService.getAllPosts();
    const currentDate = new Date().toISOString().split("T")[0];

    const sitemapEntries = [
      // Blog index page
      `  <url>
    <loc>${this.SITE_URL}/blog</loc>
    <lastmod>${currentDate}</lastmod>
    <changefreq>daily</changefreq>
    <priority>0.8</priority>
  </url>`,

      // Individual blog posts
      ...posts.posts.map(
        (post) => `  <url>
    <loc>${this.SITE_URL}/blog/${post.slug}</loc>
    <lastmod>${new Date(post.date).toISOString().split("T")[0]}</lastmod>
    <changefreq>monthly</changefreq>
    <priority>0.7</priority>
  </url>`
      ),
    ];

    return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${sitemapEntries.join("\n")}
</urlset>`;
  }

  /**
   * Generate robots.txt content
   */
  static generateRobotsTxt(): string {
    return `User-agent: *
Allow: /

# Sitemap
Sitemap: ${this.SITE_URL}/sitemap.xml

# Crawl-delay for respectful crawling
Crawl-delay: 1`;
  }

  /**
   * Estimate word count from content
   */
  private static estimateWordCount(content: string): number {
    // Remove MDX/markdown syntax and count words
    const plainText = content
      .replace(/^---[\s\S]*?---/, "") // Remove frontmatter
      .replace(/```[\s\S]*?```/g, "") // Remove code blocks
      .replace(/`[^`]*`/g, "") // Remove inline code
      .replace(/!\[.*?\]\(.*?\)/g, "") // Remove images
      .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1") // Replace links with text
      .replace(/#{1,6}\s+/g, "") // Remove headers
      .replace(/[*_]{1,2}([^*_]*)[*_]{1,2}/g, "$1") // Remove bold/italic
      .replace(/\n+/g, " ") // Replace newlines with spaces
      .trim();

    return plainText.split(/\s+/).filter((word) => word.length > 0).length;
  }

  /**
   * Generate Open Graph image URL for a blog post
   * This is a placeholder - in a real implementation, you might generate dynamic OG images
   */
  static generateOGImageUrl(post: BlogPost): string {
    if (post.featuredImage) {
      return post.featuredImage;
    }

    // For now, return default image
    // In the future, this could generate dynamic OG images with the post title
    return this.DEFAULT_OG_IMAGE;
  }
}
