import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { MDXProcessor } from "../app/.server/blog/mdx-processor";
import { promises as fs } from "fs";
import path from "path";

describe("MDX File Discovery and Processing", () => {
  const testContentDir = path.join(process.cwd(), "test-content");
  const testBlogDir = path.join(testContentDir, "blog");

  beforeEach(async () => {
    // Create test directory structure
    await fs.mkdir(testBlogDir, { recursive: true });

    // Create a test MDX file
    const testPost = `---
title: "Test Blog Post"
description: "This is a test blog post"
date: "2025-01-15"
author: "Test Author"
tags: ["test", "blog"]
published: true
---

# Test Blog Post

This is the content of the test blog post. It has some **bold text** and *italic text*.

\`\`\`javascript
console.log("Hello, world!");
\`\`\`

This is a longer paragraph to test excerpt generation. It should be truncated properly when generating the excerpt for the blog post listing.
`;

    await fs.writeFile(
      path.join(testBlogDir, "2025-01-15-test-post.mdx"),
      testPost
    );
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

  it("should discover MDX files in the content directory", async () => {
    // Temporarily override the BLOG_CONTENT_DIR for testing
    const originalDir = (MDXProcessor as any).BLOG_CONTENT_DIR;
    (MDXProcessor as any).BLOG_CONTENT_DIR = testBlogDir;

    const files = await MDXProcessor.discoverMDXFiles();

    expect(files).toHaveLength(1);
    expect(files[0]).toContain("2025-01-15-test-post.mdx");

    // Restore original directory
    (MDXProcessor as any).BLOG_CONTENT_DIR = originalDir;
  });

  it("should process MDX file and extract metadata correctly", async () => {
    const filePath = path.join(testBlogDir, "2025-01-15-test-post.mdx");
    const post = await MDXProcessor.processFile(filePath);

    expect(post.title).toBe("Test Blog Post");
    expect(post.description).toBe("This is a test blog post");
    expect(post.date).toBe("2025-01-15");
    expect(post.author).toBe("Test Author");
    expect(post.tags).toEqual(["test", "blog"]);
    expect(post.slug).toBe("test-post");
    expect(post.published).toBe(true);
    expect(post.readingTime).toBeGreaterThan(0);
    expect(post.excerpt).toBeTruthy();
    expect(post.content).toBeTruthy();
  });

  it("should generate proper excerpt from content", () => {
    const content = `# Test Title

This is a paragraph with **bold** and *italic* text. It also has some \`inline code\` and [a link](http://example.com).

\`\`\`javascript
console.log("This code block should be removed");
\`\`\`

This is another paragraph that should be included in the excerpt generation process.`;

    const excerpt = MDXProcessor.generateExcerpt(content, 100);

    expect(excerpt).not.toContain("```");
    expect(excerpt).not.toContain("**");
    expect(excerpt).not.toContain("*");
    expect(excerpt).not.toContain("`");
    expect(excerpt).not.toContain("#");
    expect(excerpt.length).toBeLessThanOrEqual(103); // 100 + "..."
  });

  it("should calculate reading time correctly", () => {
    const shortContent = "This is a short piece of content.";
    const longContent = "This is a much longer piece of content. ".repeat(100);

    const shortTime = MDXProcessor.calculateReadingTime(shortContent);
    const longTime = MDXProcessor.calculateReadingTime(longContent);

    expect(shortTime).toBe(1); // Minimum 1 minute
    expect(longTime).toBeGreaterThan(shortTime);
  });

  it("should generate slug from filename correctly", () => {
    // Test with date prefix
    const slug1 = (MDXProcessor as any).generateSlugFromFilename(
      "2025-01-15-my-blog-post.mdx"
    );
    expect(slug1).toBe("my-blog-post");

    // Test without date prefix
    const slug2 = (MDXProcessor as any).generateSlugFromFilename(
      "simple-post.mdx"
    );
    expect(slug2).toBe("simple-post");
  });

  it("should validate frontmatter correctly", () => {
    const validFrontmatter = {
      title: "Test",
      description: "Test description",
      date: "2025-01-15",
      author: "Test Author",
      tags: ["test"],
    };

    const invalidFrontmatter = {
      title: "Test",
      // missing required fields
    };

    expect(() => {
      (MDXProcessor as any).validateFrontmatter(validFrontmatter, "test.mdx");
    }).not.toThrow();

    expect(() => {
      (MDXProcessor as any).validateFrontmatter(invalidFrontmatter, "test.mdx");
    }).toThrow();
  });
});
