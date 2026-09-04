import { getDocsMarkdown } from "~/.server/docs/reference";

// GET /llms.txt — LLM-readable API documentation (public, no auth)
export async function loader() {
  const markdown = `# EasyBits — La nube para expertos IA

> Cloud for AI agents: sandboxes (Firecracker microVMs), web (search, fetch, extract records), files, SQL databases, documents, app hosting and WhatsApp agents — all via one MCP (200+ tools), REST API v2 and a typed SDK. Priced in MXN, free tier available.
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
