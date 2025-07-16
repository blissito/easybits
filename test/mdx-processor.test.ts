import { describe, it, expect } from "vitest";
import { MDXProcessor } from "../app/.server/blog/mdx-processor";
import path from "path";

describe("MDXProcessor", () => {
  it("should process a valid MDX file correctly", async () => {
    const testFilePath = path.join(
      process.cwd(),
      "app/content/blog/2025-01-15-test-post.mdx"
    );

    const post = await MDXProcessor.processFile(testFilePath);

    expect(post.slug).toBe("test-post");
    expect(post.title).toBe("Test Blog Post");
    expect(post.description).toBe(
      "This is a test blog post to verify MDX processing"
    );
    expect(post.date).toBe("2025-01-15");
    expect(post.author).toBe("Test Author");
    expect(post.tags).toEqual(["test", "mdx", "blog"]);
    expect(post.featuredImage).toBe("/blog/assets/test-image.jpg");
    expect(post.published).toBe(true);
    expect(post.readingTime).toBeGreaterThan(0);
    expect(post.excerpt).toBeTruthy();
    expect(post.content).toBeTruthy();
  });

  it("should generate correct excerpt from content", () => {
    const content = `---
title: Test
---

# This is a heading

This is the first paragraph with **bold text** and *italic text*. It should be included in the excerpt.

This is the second paragraph that might be too long for the excerpt depending on the length limit.`;

    const excerpt = MDXProcessor.generateExcerpt(content, 100);

    expect(excerpt).toContain("This is the first paragraph");
    expect(excerpt).not.toContain("**");
    expect(excerpt).not.toContain("*");
    expect(excerpt).not.toContain("#");
  });

  it("should calculate reading time correctly", () => {
    const shortContent = "This is a short piece of content.";
    const longContent = "This is a much longer piece of content. ".repeat(100);

    const shortTime = MDXProcessor.calculateReadingTime(shortContent);
    const longTime = MDXProcessor.calculateReadingTime(longContent);

    expect(shortTime).toBe(1); // Minimum 1 minute
    expect(longTime).toBeGreaterThan(shortTime);
  });

  it("should get all posts and sort by date", async () => {
    const posts = await MDXProcessor.getAllPosts();

    expect(Array.isArray(posts)).toBe(true);

    if (posts.length > 1) {
      // Check if sorted by date (newest first)
      for (let i = 0; i < posts.length - 1; i++) {
        const currentDate = new Date(posts[i].date);
        const nextDate = new Date(posts[i + 1].date);
        expect(currentDate.getTime()).toBeGreaterThanOrEqual(
          nextDate.getTime()
        );
      }
    }
  });

  it("should get post by slug", async () => {
    const post = await MDXProcessor.getPostBySlug("test-post");

    expect(post).toBeTruthy();
    expect(post?.slug).toBe("test-post");
    expect(post?.title).toBe("Test Blog Post");
  });

  it("should return null for non-existent slug", async () => {
    const post = await MDXProcessor.getPostBySlug("non-existent-post");

    expect(post).toBeNull();
  });
});
