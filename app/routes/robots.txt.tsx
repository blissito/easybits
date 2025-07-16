import { BlogSEOService } from "~/.server/blog/seo";

export const loader = async () => {
  const robotsTxt = BlogSEOService.generateRobotsTxt();

  return new Response(robotsTxt, {
    status: 200,
    headers: {
      "Content-Type": "text/plain",
      "Cache-Control": "public, max-age=86400", // Cache for 24 hours
    },
  });
};

export default function RobotsTxt() {
  return null; // This route doesn't render anything
}
