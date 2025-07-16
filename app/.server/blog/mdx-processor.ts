import { compile } from "@mdx-js/mdx";
import matter from "gray-matter";
import readingTime from "reading-time";
import { promises as fs } from "fs";
import path from "path";
import { watch } from "chokidar";

export interface BlogMetadata {
  title: string;
  description: string;
  date: string;
  author: string;
  tags: string[];
  featuredImage?: string;
  published?: boolean;
}

export interface BlogPost {
  slug: string;
  title: string;
  description: string;
  date: string;
  author: string;
  tags: string[];
  featuredImage?: string;
  readingTime: number;
  content: string;
  excerpt: string;
  published: boolean;
}

export interface BlogListOptions {
  page?: number;
  limit?: number;
  tag?: string;
  search?: string;
  author?: string;
}

export interface PaginatedBlogPosts {
  posts: BlogPost[];
  totalPosts: number;
  totalPages: number;
  currentPage: number;
  hasNextPage: boolean;
  hasPrevPage: boolean;
}

export class MDXProcessor {
  private static readonly BLOG_CONTENT_DIR = path.join(
    process.cwd(),
    "app/content/blog"
  );

  // Cache for processed posts 🤩
  private static postsCache: Map<string, BlogPost> = new Map();
  private static cacheTimestamps: Map<string, number> = new Map();
  private static watcher: any = null;
  private static isWatching = false;

  // Fallback posts for production when file system is not available
  private static readonly FALLBACK_POSTS: BlogPost[] = [
    {
      slug: "como-conectar-stripe-onboarding",
      title:
        "Cómo Conectar Stripe en tu Onboarding: Guía Completa para Creadores",
      description:
        "Aprende a integrar Stripe Connect en tu proceso de onboarding para monetizar tu conocimiento de forma profesional y segura.",
      date: "2025-01-20",
      author: "EasyBits Team",
      tags: ["stripe", "onboarding", "monetización", "creadores"],
      featuredImage: "/blog/assets/stripe-connect-guide.jpg",
      readingTime: 8,
      content:
        "# Cómo Conectar Stripe en tu Onboarding\n\nGuía completa para integrar pagos en tu proceso de onboarding...",
      excerpt:
        "Aprende a integrar Stripe Connect en tu proceso de onboarding para monetizar tu conocimiento de forma profesional y segura.",
      published: true,
    },
    {
      slug: "tendencias-economia-creadores-2025",
      title:
        "Tendencias de la Economía de Creadores en 2025: Oportunidades y Desafíos",
      description:
        "Descubre las principales tendencias que están moldeando la economía de creadores en 2025 y cómo aprovecharlas.",
      date: "2025-01-16",
      author: "EasyBits Team",
      tags: ["tendencias", "economía", "creadores", "2025"],
      featuredImage: "/blog/assets/creator-economy-2025.jpg",
      readingTime: 12,
      content:
        "# Tendencias de la Economía de Creadores en 2025\n\nDescubre las principales tendencias que están moldeando...",
      excerpt:
        "Descubre las principales tendencias que están moldeando la economía de creadores en 2025 y cómo aprovecharlas.",
      published: true,
    },
    {
      slug: "monetizar-conocimiento-online",
      title: "Cómo Monetizar tu Conocimiento Online: Estrategias Comprobadas",
      description:
        "Guía práctica para convertir tu experiencia en ingresos sostenibles a través de diferentes canales digitales.",
      date: "2025-01-14",
      author: "EasyBits Team",
      tags: ["monetización", "conocimiento", "online", "estrategias"],
      featuredImage: "/blog/assets/monetize-knowledge.jpg",
      readingTime: 10,
      content:
        "# Cómo Monetizar tu Conocimiento Online\n\nGuía práctica para convertir tu experiencia en ingresos...",
      excerpt:
        "Guía práctica para convertir tu experiencia en ingresos sostenibles a través de diferentes canales digitales.",
      published: true,
    },
    {
      slug: "marketing-digital-para-creadores",
      title: "Marketing Digital para Creadores: Estrategias que Funcionan",
      description:
        "Aprende las mejores estrategias de marketing digital para hacer crecer tu audiencia y monetizar tu contenido.",
      date: "2025-01-12",
      author: "EasyBits Team",
      tags: ["marketing", "digital", "creadores", "estrategias"],
      featuredImage: "/blog/assets/digital-marketing-creators.jpg",
      readingTime: 7,
      content:
        "# Marketing Digital para Creadores\n\nAprende las mejores estrategias de marketing digital...",
      excerpt:
        "Aprende las mejores estrategias de marketing digital para hacer crecer tu audiencia y monetizar tu contenido.",
      published: true,
    },
    {
      slug: "como-crear-assets-digitales-exitosos",
      title: "Cómo Crear Assets Digitales Exitosos: Guía para Creadores",
      description:
        "Descubre el proceso completo para crear y vender assets digitales que generen ingresos pasivos.",
      date: "2025-01-10",
      author: "EasyBits Team",
      tags: ["assets", "digitales", "creadores", "ventas"],
      featuredImage: "/blog/assets/digital-assets-guide.jpg",
      readingTime: 6,
      content:
        "# Cómo Crear Assets Digitales Exitosos\n\nDescubre el proceso completo para crear y vender...",
      excerpt:
        "Descubre el proceso completo para crear y vender assets digitales que generen ingresos pasivos.",
      published: true,
    },
  ];

  /**
   * Process a single MDX file and return a BlogPost object
   */
  static async processFile(filePath: string): Promise<BlogPost> {
    try {
      const fileContent = await fs.readFile(filePath, "utf-8");
      const { data: frontmatter, content } = matter(fileContent);

      // Validate required frontmatter fields
      this.validateFrontmatter(frontmatter, filePath);

      const metadata = frontmatter as BlogMetadata;
      const slug = this.generateSlugFromFilename(path.basename(filePath));

      // For now, we'll store the raw content and process it on the client side
      // This avoids the complex server-side MDX compilation issues
      const readingTimeResult = readingTime(content);
      const excerpt = this.generateExcerpt(content);

      return {
        slug,
        title: metadata.title,
        description: metadata.description,
        date: metadata.date,
        author: metadata.author,
        tags: metadata.tags || [],
        featuredImage: metadata.featuredImage,
        readingTime: Math.ceil(readingTimeResult.minutes),
        content: content, // Store raw markdown content
        excerpt,
        published: metadata.published !== false, // Default to true if not specified
      };
    } catch (error) {
      throw new Error(
        `Error processing MDX file ${filePath}: ${
          error instanceof Error ? error.message : "Unknown error"
        }`
      );
    }
  }

  /**
   * Get all blog posts from the content directory with caching
   */
  static async getAllPosts(): Promise<BlogPost[]> {
    try {
      // Check if we're in production and file system might not be available
      if (process.env.NODE_ENV === "production") {
        console.log(
          "🔧 Production environment detected, checking file system availability..."
        );
      }

      // Check if blog content directory exists
      try {
        await fs.access(this.BLOG_CONTENT_DIR);
      } catch (error) {
        console.warn("⚠️ Blog content directory not accessible:", error);

        // In production, return fallback posts if file system is not available
        if (process.env.NODE_ENV === "production") {
          console.log("📝 Using fallback posts for production");
          return this.FALLBACK_POSTS;
        }

        // In development, return empty array
        return [];
      }

      const files = await fs.readdir(this.BLOG_CONTENT_DIR);
      const mdxFiles = files.filter((file) => file.endsWith(".mdx"));

      if (mdxFiles.length === 0) {
        console.warn("⚠️ No MDX files found in blog directory");

        // In production, return fallback posts if no files found
        if (process.env.NODE_ENV === "production") {
          console.log("📝 Using fallback posts - no MDX files found");
          return this.FALLBACK_POSTS;
        }

        return [];
      }

      console.log(`📚 Found ${mdxFiles.length} MDX files`);

      const posts = await Promise.all(
        mdxFiles.map(async (file) => {
          const filePath = path.join(this.BLOG_CONTENT_DIR, file);
          return this.getProcessedFile(filePath);
        })
      );

      // Filter published posts and sort by date (newest first)
      const publishedPosts = posts
        .filter((post) => post.published)
        .sort(
          (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()
        );

      console.log(
        `✅ Successfully loaded ${publishedPosts.length} published posts`
      );
      return publishedPosts;
    } catch (error) {
      console.error("❌ Error getting all posts:", error);

      // In production, return fallback posts on error
      if (process.env.NODE_ENV === "production") {
        console.log("📝 Using fallback posts due to error");
        return this.FALLBACK_POSTS;
      }

      throw new Error(
        `Error getting all posts: ${
          error instanceof Error ? error.message : "Unknown error"
        }`
      );
    }
  }

  /**
   * Get processed file with caching
   */
  private static async getProcessedFile(filePath: string): Promise<BlogPost> {
    const stats = await fs.stat(filePath);
    const lastModified = stats.mtime.getTime();
    const cachedTimestamp = this.cacheTimestamps.get(filePath);

    // Check if we have a cached version and it's still valid
    if (
      cachedTimestamp &&
      cachedTimestamp >= lastModified &&
      this.postsCache.has(filePath)
    ) {
      return this.postsCache.get(filePath)!;
    }

    // Process the file and cache the result
    const post = await this.processFile(filePath);
    this.postsCache.set(filePath, post);
    this.cacheTimestamps.set(filePath, lastModified);

    return post;
  }

  /**
   * Initialize file watching for automatic cache invalidation
   */
  static initializeFileWatcher(): void {
    if (this.isWatching) return;

    try {
      this.watcher = watch(this.BLOG_CONTENT_DIR, {
        ignored: /(^|[\/\\])\../, // ignore dotfiles
        persistent: true,
        ignoreInitial: true,
      });

      this.watcher
        .on("change", (filePath: string) => {
          console.log(`Blog file changed: ${filePath}`);
          this.invalidateCache(filePath);
        })
        .on("add", (filePath: string) => {
          console.log(`Blog file added: ${filePath}`);
          this.invalidateCache(filePath);
        })
        .on("unlink", (filePath: string) => {
          console.log(`Blog file removed: ${filePath}`);
          this.invalidateCache(filePath);
        });

      this.isWatching = true;
      console.log(`File watcher initialized for: ${this.BLOG_CONTENT_DIR}`);
    } catch (error) {
      console.error("Failed to initialize file watcher:", error);
    }
  }

  /**
   * Stop file watching
   */
  static stopFileWatcher(): void {
    if (this.watcher) {
      this.watcher.close();
      this.watcher = null;
      this.isWatching = false;
      console.log("File watcher stopped");
    }
  }

  /**
   * Invalidate cache for a specific file or all files
   */
  static invalidateCache(filePath?: string): void {
    if (filePath) {
      this.postsCache.delete(filePath);
      this.cacheTimestamps.delete(filePath);
      console.log(`Cache invalidated for: ${filePath}`);
    } else {
      this.postsCache.clear();
      this.cacheTimestamps.clear();
      console.log("All cache invalidated");
    }
  }

  /**
   * Discover all MDX files in the content directory
   */
  static async discoverMDXFiles(): Promise<string[]> {
    try {
      await fs.access(this.BLOG_CONTENT_DIR);
      const files = await fs.readdir(this.BLOG_CONTENT_DIR);
      return files
        .filter((file) => file.endsWith(".mdx"))
        .map((file) => path.join(this.BLOG_CONTENT_DIR, file));
    } catch {
      return [];
    }
  }

  /**
   * Get paginated blog posts with filtering and search
   */
  static async getPaginatedPosts(
    options: BlogListOptions = {}
  ): Promise<PaginatedBlogPosts> {
    try {
      const { page = 1, limit = 10, tag, search, author } = options;
      let posts = await this.getAllPosts();

      // Apply filters
      if (tag) {
        posts = posts.filter((post) =>
          post.tags.some(
            (postTag) => postTag.toLowerCase() === tag.toLowerCase()
          )
        );
      }

      if (author) {
        posts = posts.filter((post) =>
          post.author.toLowerCase().includes(author.toLowerCase())
        );
      }

      if (search) {
        const searchLower = search.toLowerCase();
        posts = posts.filter(
          (post) =>
            post.title.toLowerCase().includes(searchLower) ||
            post.description.toLowerCase().includes(searchLower) ||
            post.excerpt.toLowerCase().includes(searchLower) ||
            post.tags.some((tag) => tag.toLowerCase().includes(searchLower))
        );
      }

      const totalPosts = posts.length;
      const totalPages = Math.ceil(totalPosts / limit);
      const startIndex = (page - 1) * limit;
      const endIndex = startIndex + limit;
      const paginatedPosts = posts.slice(startIndex, endIndex);

      return {
        posts: paginatedPosts,
        totalPosts,
        totalPages,
        currentPage: page,
        hasNextPage: page < totalPages,
        hasPrevPage: page > 1,
      };
    } catch (error) {
      throw new Error(
        `Error getting paginated posts: ${
          error instanceof Error ? error.message : "Unknown error"
        }`
      );
    }
  }

  /**
   * Get a single blog post by slug
   */
  static async getPostBySlug(slug: string): Promise<BlogPost | null> {
    try {
      const posts = await this.getAllPosts();
      return posts.find((post) => post.slug === slug) || null;
    } catch (error) {
      throw new Error(
        `Error getting post by slug ${slug}: ${
          error instanceof Error ? error.message : "Unknown error"
        }`
      );
    }
  }

  /**
   * Get related posts based on tags
   */
  static async getRelatedPosts(
    slug: string,
    limit: number = 3
  ): Promise<BlogPost[]> {
    try {
      const currentPost = await this.getPostBySlug(slug);
      if (!currentPost) return [];

      const allPosts = await this.getAllPosts();

      // Filter out the current post and calculate relevance scores
      const otherPosts = allPosts.filter((post) => post.slug !== slug);

      const postsWithScores = otherPosts.map((post) => {
        const commonTags = post.tags.filter((tag) =>
          currentPost.tags.includes(tag)
        );
        const score = commonTags.length;
        return { post, score };
      });

      // Sort by relevance score (descending) and return top posts
      return postsWithScores
        .filter(({ score }) => score > 0)
        .sort((a, b) => b.score - a.score)
        .slice(0, limit)
        .map(({ post }) => post);
    } catch (error) {
      throw new Error(
        `Error getting related posts for ${slug}: ${
          error instanceof Error ? error.message : "Unknown error"
        }`
      );
    }
  }

  /**
   * Get all unique tags from all posts
   */
  static async getAllTags(): Promise<string[]> {
    try {
      const posts = await this.getAllPosts();
      const allTags = posts.flatMap((post) => post.tags);
      return [...new Set(allTags)].sort();
    } catch (error) {
      throw new Error(
        `Error getting all tags: ${
          error instanceof Error ? error.message : "Unknown error"
        }`
      );
    }
  }

  /**
   * Get all unique authors from all posts
   */
  static async getAllAuthors(): Promise<string[]> {
    try {
      const posts = await this.getAllPosts();
      const allAuthors = posts.map((post) => post.author);
      return [...new Set(allAuthors)].sort();
    } catch (error) {
      throw new Error(
        `Error getting all authors: ${
          error instanceof Error ? error.message : "Unknown error"
        }`
      );
    }
  }

  /**
   * Search posts by query across title, description, and content
   */
  static async searchPosts(
    query: string,
    limit: number = 10
  ): Promise<BlogPost[]> {
    try {
      if (!query.trim()) return [];

      const posts = await this.getAllPosts();
      const searchLower = query.toLowerCase();

      const matchingPosts = posts.filter(
        (post) =>
          post.title.toLowerCase().includes(searchLower) ||
          post.description.toLowerCase().includes(searchLower) ||
          post.excerpt.toLowerCase().includes(searchLower) ||
          post.tags.some((tag) => tag.toLowerCase().includes(searchLower)) ||
          post.author.toLowerCase().includes(searchLower)
      );

      return matchingPosts.slice(0, limit);
    } catch (error) {
      throw new Error(
        `Error searching posts: ${
          error instanceof Error ? error.message : "Unknown error"
        }`
      );
    }
  }

  /**
   * Generate an excerpt from the content
   */
  static generateExcerpt(content: string, maxLength: number = 160): string {
    // Remove MDX/markdown syntax and get plain text
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

    if (plainText.length <= maxLength) {
      return plainText;
    }

    // Find the last complete word within the limit
    const truncated = plainText.substring(0, maxLength);
    const lastSpaceIndex = truncated.lastIndexOf(" ");

    if (lastSpaceIndex > 0) {
      return truncated.substring(0, lastSpaceIndex) + "...";
    }

    return truncated + "...";
  }

  /**
   * Calculate reading time for content
   */
  static calculateReadingTime(content: string): number {
    const result = readingTime(content);
    return Math.ceil(result.minutes);
  }

  /**
   * Generate slug from filename
   */
  private static generateSlugFromFilename(filename: string): string {
    // Remove .mdx extension
    const nameWithoutExt = filename.replace(/\.mdx$/, "");

    // Check if filename follows YYYY-MM-DD-slug pattern
    const datePattern = /^\d{4}-\d{2}-\d{2}-(.+)$/;
    const match = nameWithoutExt.match(datePattern);

    if (match) {
      return match[1]; // Return the slug part after the date
    }

    // If no date pattern, use the entire filename as slug
    return nameWithoutExt;
  }

  /**
   * Validate frontmatter has required fields
   */
  private static validateFrontmatter(frontmatter: any, filePath: string): void {
    const requiredFields = ["title", "description", "date", "author"];
    const missingFields = requiredFields.filter((field) => !frontmatter[field]);

    if (missingFields.length > 0) {
      throw new Error(
        `Missing required frontmatter fields in ${filePath}: ${missingFields.join(
          ", "
        )}`
      );
    }

    // Validate date format
    const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
    if (!dateRegex.test(frontmatter.date)) {
      throw new Error(
        `Invalid date format in ${filePath}. Expected YYYY-MM-DD, got: ${frontmatter.date}`
      );
    }

    // Validate tags is array if present
    if (frontmatter.tags && !Array.isArray(frontmatter.tags)) {
      throw new Error(`Tags must be an array in ${filePath}`);
    }
  }
}
