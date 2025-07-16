// Test script to verify blog posts are being processed correctly
const { BlogDataService } = require("./app/.server/blog/blog-data.ts");

async function testBlog() {
  try {
    console.log("Testing blog data service...");

    const posts = await BlogDataService.getAllPosts();
    console.log(`Found ${posts.totalPosts} posts:`);

    posts.posts.forEach((post) => {
      console.log(
        `- ${post.title} (${post.slug}) - Published: ${post.published}`
      );
    });
  } catch (error) {
    console.error("Error testing blog:", error);
  }
}

testBlog();
