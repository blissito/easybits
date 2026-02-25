/**
 * @easybits.cloud/mcp — Stdio-to-HTTP proxy for Easybits MCP
 *
 * Reads JSON-RPC messages from stdin, forwards them to the Easybits
 * Streamable HTTP endpoint (/api/mcp), and writes responses to stdout.
 *
 * Usage:
 *   EASYBITS_API_KEY=eb_sk_live_... npx @easybits.cloud/mcp
 *   Or configure ~/.easybitsrc with: {"apiKey": "eb_sk_live_..."}
 *
 * Claude Desktop config:
 *   {
 *     "mcpServers": {
 *       "easybits": {
 *         "command": "npx",
 *         "args": ["-y", "@easybits.cloud/mcp"],
 *         "env": { "EASYBITS_API_KEY": "eb_sk_live_..." }
 *       }
 *     }
 *   }
 */
import { readFileSync } from "fs";
import { join } from "path";
import { homedir } from "os";

// ─── Config ──────────────────────────────────────────────────────

const DEFAULT_BASE_URL = "https://www.easybits.cloud";

function readRcConfig(): { apiKey?: string; baseUrl?: string } {
  try {
    const rcPath = join(homedir(), ".easybitsrc");
    return JSON.parse(readFileSync(rcPath, "utf-8"));
  } catch {
    return {};
  }
}

function getApiKey(): string {
  const key = process.env.EASYBITS_API_KEY || readRcConfig().apiKey;
  if (!key) {
    console.error(
      "No API key found. Set EASYBITS_API_KEY env var or create ~/.easybitsrc"
    );
    process.exit(1);
  }
  return key;
}

function getBaseUrl(): string {
  return process.env.EASYBITS_URL || readRcConfig().baseUrl || DEFAULT_BASE_URL;
}

// ─── Stdio-to-HTTP Proxy ─────────────────────────────────────────

async function main() {
  const apiKey = getApiKey();
  const mcpUrl = `${getBaseUrl()}/api/mcp`;

  let sessionId: string | undefined;
  let pending = 0;
  let stdinEnded = false;

  console.error(`Easybits MCP proxy → ${mcpUrl}`);

  // Read line-delimited JSON-RPC from stdin
  let buffer = "";

  process.stdin.setEncoding("utf-8");
  process.stdin.on("data", (chunk: string) => {
    buffer += chunk;

    // Process complete lines
    let newlineIdx: number;
    while ((newlineIdx = buffer.indexOf("\n")) !== -1) {
      const line = buffer.slice(0, newlineIdx).trim();
      buffer = buffer.slice(newlineIdx + 1);

      if (!line) continue;

      pending++;
      handleMessage(line, mcpUrl, apiKey, sessionId).then((newSessionId) => {
        if (newSessionId) sessionId = newSessionId;
      }).catch((err) => {
        console.error("Error handling message:", err);
      }).finally(() => {
        pending--;
        if (stdinEnded && pending === 0) process.exit(0);
      });
    }
  });

  process.stdin.on("end", () => {
    stdinEnded = true;
    if (pending === 0) process.exit(0);
    // Safety timeout so the process doesn't hang forever
    setTimeout(() => process.exit(0), 30_000);
  });
}

async function handleMessage(
  line: string,
  mcpUrl: string,
  apiKey: string,
  sessionId: string | undefined
): Promise<string | undefined> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    Accept: "application/json, text/event-stream",
    Authorization: `Bearer ${apiKey}`,
  };

  if (sessionId) {
    headers["Mcp-Session-Id"] = sessionId;
  }

  try {
    const res = await fetch(mcpUrl, {
      method: "POST",
      headers,
      body: line,
      redirect: "follow", // TODO: experiment with 308 redirect on DNS/server to preserve POST method natively instead of relying on this
    });

    // Capture session ID from response
    const newSessionId = res.headers.get("mcp-session-id") || undefined;

    if (!res.ok) {
      const body = await res.text();
      console.error(`HTTP ${res.status}: ${body}`);
      // For JSON-RPC errors, try to write an error response
      try {
        const parsed = JSON.parse(line);
        if (parsed.id !== undefined) {
          const errorResponse = {
            jsonrpc: "2.0",
            id: parsed.id,
            error: { code: -32603, message: `HTTP ${res.status}: ${body}` },
          };
          process.stdout.write(JSON.stringify(errorResponse) + "\n");
        }
      } catch {
        // ignore parse errors
      }
      return newSessionId;
    }

    const contentType = res.headers.get("content-type") || "";

    if (contentType.includes("text/event-stream")) {
      // Handle SSE responses
      const text = await res.text();
      for (const eventLine of text.split("\n")) {
        if (eventLine.startsWith("data: ")) {
          const data = eventLine.slice(6);
          if (data) {
            process.stdout.write(data + "\n");
          }
        }
      }
    } else {
      // JSON response — write directly
      const body = await res.text();
      if (body.trim()) {
        process.stdout.write(body + "\n");
      }
    }

    return newSessionId;
  } catch (err) {
    console.error("Fetch error:", err);
    // Try to send error response for requests with IDs
    try {
      const parsed = JSON.parse(line);
      if (parsed.id !== undefined) {
        const errorResponse = {
          jsonrpc: "2.0",
          id: parsed.id,
          error: {
            code: -32603,
            message: `Connection error: ${err instanceof Error ? err.message : String(err)}`,
          },
        };
        process.stdout.write(JSON.stringify(errorResponse) + "\n");
      }
    } catch {
      // ignore
    }
    return undefined;
  }
}

main();
