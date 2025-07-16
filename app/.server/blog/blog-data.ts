import {
  MDXProcessor,
  type BlogPost,
  type BlogListOptions,
  type PaginatedBlogPosts,
} from "./mdx-processor";

export class BlogDataService {
  /**
   * Get all blog posts with pagination and filtering
   */
  static async getAllPosts(
    options: BlogListOptions = {}
  ): Promise<PaginatedBlogPosts> {
    return await MDXProcessor.getPaginatedPosts(options);
  }

  /**
   * Get a single blog post by slug
   */
  static async getPostBySlug(slug: string): Promise<BlogPost | null> {
    return await MDXProcessor.getPostBySlug(slug);
  }

  /**
   * Get related posts based on tags
   */
  static async getRelatedPosts(
    slug: string,
    limit: number = 3
  ): Promise<BlogPost[]> {
    return await MDXProcessor.getRelatedPosts(slug, limit);
  }

  /**
   * Search posts by query
   */
  static async searchPosts(
    query: string,
    limit: number = 10
  ): Promise<BlogPost[]> {
    return await MDXProcessor.searchPosts(query, limit);
  }

  /**
   * Get all unique tags
   */
  static async getAllTags(): Promise<string[]> {
    return await MDXProcessor.getAllTags();
  }

  /**
   * Get all unique authors
   */
  static async getAllAuthors(): Promise<string[]> {
    return await MDXProcessor.getAllAuthors();
  }

  /**
   * Initialize file watcher for development
   */
  static initializeFileWatcher(): void {
    if (process.env.NODE_ENV === "development") {
      MDXProcessor.initializeFileWatcher();
    }
  }

  /**
   * Stop file watcher
   */
  static stopFileWatcher(): void {
    MDXProcessor.stopFileWatcher();
  }
}
