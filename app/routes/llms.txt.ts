import { getDocsMarkdown } from "~/.server/docs/reference";

// GET /llms.txt — LLM-readable API documentation (public, no auth)
export async function loader() {
  const markdown = `# EasyBits — Agentic-First File Storage

> AI agents store, manage, and consume files via SDK, MCP, and REST API.
> Website: https://www.easybits.cloud
> Docs: https://www.easybits.cloud/docs
> SDK: npm install @easybits.cloud/sdk
> MCP: npx -y @easybits.cloud/mcp

${getDocsMarkdown()}`;

  return new Response(markdown, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "public, max-age=3600",
    },
  });
}
