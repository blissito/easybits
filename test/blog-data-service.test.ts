import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { MDXProcessor } from "../app/.server/blog/mdx-processor";
import { promises as fs } from "fs";
import path from "path";

describe("Blog Data Service CRUD Operations", () => {
  const testContentDir = path.join(process.cwd(), "test-blog-content");
  const testBlogDir = path.join(testContentDir, "blog");

  beforeEach(async () => {
    // Create test directory structure
    await fs.mkdir(testBlogDir, { recursive: true });

    // Create multiple test MDX files
    const testPosts = [
      {
        filename: "2025-01-15-react-hooks.mdx",
        content: `---
title: "Understanding React Hooks"
description: "A comprehensive guide to React hooks"
date: "2025-01-15"
author: "John Doe"
tags: ["react", "javascript", "hooks"]
published: true
---

# Understanding React Hooks

React hooks are a powerful feature that allows you to use state and other React features without writing a class component.

\`\`\`javascript
const [count, setCount] = useState(0);
\`\`\`

This is a comprehensive guide to understanding and using React hooks effectively.`,
      },
      {
        filename: "2025-01-10-typescript-tips.mdx",
        content: `---
title: "TypeScript Best Practices"
description: "Essential TypeScript tips for better code"
date: "2025-01-10"
author: "Jane Smith"
tags: ["typescript", "javascript", "best-practices"]
published: true
---

# TypeScript Best Practices

TypeScript provides static type checking for JavaScript, making your code more robust and maintainable.

Here are some essential tips for writing better TypeScript code.`,
      },
      {
        filename: "2025-01-05-node-performance.mdx",
        content: `---
title: "Node.js Performance Optimization"
description: "How to optimize Node.js applications"
date: "2025-01-05"
author: "John Doe"
tags: ["nodejs", "performance", "backend"]
published: true
---

# Node.js Performance Optimization

Learn how to optimize your Node.js applications for better performance and scalability.`,
      },
      {
        filename: "2024-12-20-draft-post.mdx",
        content: `---
title: "Draft Post"
description: "This is a draft post"
date: "2024-12-20"
author: "Jane Smith"
tags: ["draft"]
published: false
---

# Draft Post

This post is not published yet.`,
      },
    ];

    // Write test files
    for (const post of testPosts) {
      await fs.writeFile(path.join(testBlogDir, post.filename), post.content);
    }
  });

  afterEach(async () => {
    // Clean up test files
    try {
      await fs.rm(testContentDir, { recursive: true, force: true });
    } catch (error) {
      // Ignore cleanup errors
    }

    // Stop file watcher and clear cache
    MDXProcessor.stopFileWatcher();
    MDXProcessor.invalidateCache();
  });

  it("should get all published posts sorted by date", async () => {
    // Temporarily override the BLOG_CONTENT_DIR for testing
    const originalDir = (MDXProcessor as any).BLOG_CONTENT_DIR;
    (MDXProcessor as any).BLOG_CONTENT_DIR = testBlogDir;

    const posts = await MDXProcessor.getAllPosts();

    expect(posts).toHaveLength(3); // Only published posts
    expect(posts[0].title).toBe("Understanding React Hooks"); // Newest first
    expect(posts[1].title).toBe("TypeScript Best Practices");
    expect(posts[2].title).toBe("Node.js Performance Optimization");

    // Restore original directory
    (MDXProcessor as any).BLOG_CONTENT_DIR = originalDir;
  });

  it("should get paginated posts with correct pagination info", async () => {
    const originalDir = (MDXProcessor as any).BLOG_CONTENT_DIR;
    (MDXProcessor as any).BLOG_CONTENT_DIR = testBlogDir;

    const result = await MDXProcessor.getPaginatedPosts({
      page: 1,
      limit: 2,
    });

    expect(result.posts).toHaveLength(2);
    expect(result.totalPosts).toBe(3);
    expect(result.totalPages).toBe(2);
    expect(result.currentPage).toBe(1);
    expect(result.hasNextPage).toBe(true);
    expect(result.hasPrevPage).toBe(false);

    // Test second page
    const page2 = await MDXProcessor.getPaginatedPosts({
      page: 2,
      limit: 2,
    });

    expect(page2.posts).toHaveLength(1);
    expect(page2.hasNextPage).toBe(false);
    expect(page2.hasPrevPage).toBe(true);

    (MDXProcessor as any).BLOG_CONTENT_DIR = originalDir;
  });

  it("should filter posts by tag", async () => {
    const originalDir = (MDXProcessor as any).BLOG_CONTENT_DIR;
    (MDXProcessor as any).BLOG_CONTENT_DIR = testBlogDir;

    const result = await MDXProcessor.getPaginatedPosts({
      tag: "javascript",
    });

    expect(result.posts).toHaveLength(2);
    expect(
      result.posts.every((post) =>
        post.tags.some((tag) => tag.toLowerCase() === "javascript")
      )
    ).toBe(true);

    (MDXProcessor as any).BLOG_CONTENT_DIR = originalDir;
  });

  it("should filter posts by author", async () => {
    const originalDir = (MDXProcessor as any).BLOG_CONTENT_DIR;
    (MDXProcessor as any).BLOG_CONTENT_DIR = testBlogDir;

    const result = await MDXProcessor.getPaginatedPosts({
      author: "John Doe",
    });

    expect(result.posts).toHaveLength(2);
    expect(result.posts.every((post) => post.author === "John Doe")).toBe(true);

    (MDXProcessor as any).BLOG_CONTENT_DIR = originalDir;
  });

  it("should search posts by query", async () => {
    const originalDir = (MDXProcessor as any).BLOG_CONTENT_DIR;
    (MDXProcessor as any).BLOG_CONTENT_DIR = testBlogDir;

    const result = await MDXProcessor.getPaginatedPosts({
      search: "React",
    });

    expect(result.posts).toHaveLength(1);
    expect(result.posts[0].title).toBe("Understanding React Hooks");

    // Test search in description
    const result2 = await MDXProcessor.getPaginatedPosts({
      search: "optimization",
    });

    expect(result2.posts).toHaveLength(1);
    expect(result2.posts[0].title).toBe("Node.js Performance Optimization");

    (MDXProcessor as any).BLOG_CONTENT_DIR = originalDir;
  });

  it("should get post by slug", async () => {
    const originalDir = (MDXProcessor as any).BLOG_CONTENT_DIR;
    (MDXProcessor as any).BLOG_CONTENT_DIR = testBlogDir;

    const post = await MDXProcessor.getPostBySlug("react-hooks");

    expect(post).toBeTruthy();
    expect(post?.title).toBe("Understanding React Hooks");
    expect(post?.slug).toBe("react-hooks");

    // Test non-existent post
    const nonExistent = await MDXProcessor.getPostBySlug("non-existent");
    expect(nonExistent).toBeNull();

    (MDXProcessor as any).BLOG_CONTENT_DIR = originalDir;
  });

  it("should get related posts based on tags", async () => {
    const originalDir = (MDXProcessor as any).BLOG_CONTENT_DIR;
    (MDXProcessor as any).BLOG_CONTENT_DIR = testBlogDir;

    const relatedPosts = await MDXProcessor.getRelatedPosts("react-hooks", 2);

    expect(relatedPosts).toHaveLength(1); // Only TypeScript post shares 'javascript' tag
    expect(relatedPosts[0].title).toBe("TypeScript Best Practices");

    // Test with non-existent post
    const noRelated = await MDXProcessor.getRelatedPosts("non-existent");
    expect(noRelated).toHaveLength(0);

    (MDXProcessor as any).BLOG_CONTENT_DIR = originalDir;
  });

  it("should get all unique tags", async () => {
    const originalDir = (MDXProcessor as any).BLOG_CONTENT_DIR;
    (MDXProcessor as any).BLOG_CONTENT_DIR = testBlogDir;

    const tags = await MDXProcessor.getAllTags();

    expect(tags).toContain("react");
    expect(tags).toContain("javascript");
    expect(tags).toContain("typescript");
    expect(tags).toContain("nodejs");
    expect(tags).toContain("performance");
    expect(tags).toContain("backend");
    expect(tags).toContain("hooks");
    expect(tags).toContain("best-practices");
    expect(tags).not.toContain("draft"); // From unpublished post

    // Should be sorted
    const sortedTags = [...tags].sort();
    expect(tags).toEqual(sortedTags);

    (MDXProcessor as any).BLOG_CONTENT_DIR = originalDir;
  });

  it("should get all unique authors", async () => {
    const originalDir = (MDXProcessor as any).BLOG_CONTENT_DIR;
    (MDXProcessor as any).BLOG_CONTENT_DIR = testBlogDir;

    const authors = await MDXProcessor.getAllAuthors();

    expect(authors).toContain("John Doe");
    expect(authors).toContain("Jane Smith");
    expect(authors).toHaveLength(2);

    // Should be sorted
    const sortedAuthors = [...authors].sort();
    expect(authors).toEqual(sortedAuthors);

    (MDXProcessor as any).BLOG_CONTENT_DIR = originalDir;
  });

  it("should search posts with query", async () => {
    const originalDir = (MDXProcessor as any).BLOG_CONTENT_DIR;
    (MDXProcessor as any).BLOG_CONTENT_DIR = testBlogDir;

    const results = await MDXProcessor.searchPosts("TypeScript");

    expect(results).toHaveLength(1);
    expect(results[0].title).toBe("TypeScript Best Practices");

    // Test search with multiple matches
    const jsResults = await MDXProcessor.searchPosts("javascript");
    expect(jsResults).toHaveLength(2);

    // Test empty query
    const emptyResults = await MDXProcessor.searchPosts("");
    expect(emptyResults).toHaveLength(0);

    // Test no matches
    const noResults = await MDXProcessor.searchPosts("nonexistent");
    expect(noResults).toHaveLength(0);

    (MDXProcessor as any).BLOG_CONTENT_DIR = originalDir;
  });

  it("should combine filters correctly", async () => {
    const originalDir = (MDXProcessor as any).BLOG_CONTENT_DIR;
    (MDXProcessor as any).BLOG_CONTENT_DIR = testBlogDir;

    // Search for JavaScript posts by John Doe
    const result = await MDXProcessor.getPaginatedPosts({
      author: "John Doe",
      tag: "javascript",
    });

    expect(result.posts).toHaveLength(1);
    expect(result.posts[0].title).toBe("Understanding React Hooks");

    (MDXProcessor as any).BLOG_CONTENT_DIR = originalDir;
  });
});
