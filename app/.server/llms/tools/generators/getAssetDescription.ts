import type { Asset } from "@prisma/client";
import { createMCPServer } from "fixtergeek-mcp-server";

export const generateDescription = async (
  title: string,
  userPrompt: string
) => {
  const chat = [
    {
      role: "system",
      content: `
            You are a helpful easybits.cloud assistant that generates a description for an asset.
            The asset title is ${title}.
            Generate a description for the asset, according to the user prompt. Remember, the description should be in spanish and should contain images and catchy words. 
            `,
    },
    {
      role: "user",
      content: userPrompt,
    },
  ];

  const server = await getMCPServer();
  console.log("AVERS::", server);
  //   const answer = await server.processUserQuery(chat);
};
// MCP SERVER
let server: MCPServer;
const getMCPServer = async () => {
  if (server) return server;

  server = createMCPServer({
    port: 3001,
    cors: true,
    llm: {
      provider: "ollama",
      //   baseUrl: "http://ollama-old.flycast",
      baseUrl: "http://localhost:11434",
      model: process.env.OLLAMA_MODEL || "phi4:14b",
      temperature: 0.7,
    },
  });
  await server.start();
  console.log("🚀 Servidor MCP iniciado");
};
