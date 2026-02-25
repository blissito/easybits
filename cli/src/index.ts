#!/usr/bin/env node
import {
  EasybitsClient,
  EasybitsError,
  readRcConfig,
  writeRcConfig,
  resolveApiKey,
  resolveBaseUrl,
  createClientFromEnv,
} from "@easybits.cloud/sdk";
import { readFileSync, existsSync, statSync } from "fs";

// ─── Helpers ─────────────────────────────────────────────────────

async function getClient(): Promise<EasybitsClient> {
  try {
    return await createClientFromEnv();
  } catch {
    console.error("Not logged in. Run: easybits login <api-key>");
    process.exit(1);
  }
}

// ─── Commands ────────────────────────────────────────────────────

async function login() {
  const key = process.argv[3];
  if (!key) {
    console.error("Usage: easybits login <api-key>");
    process.exit(1);
  }
  await writeRcConfig({ apiKey: key });
  console.log("Saved API key to ~/.easybitsrc");
}

async function filesList() {
  const client = await getClient();
  try {
    const data = await client.listFiles();
    if (data.items.length === 0) {
      console.log("No files found");
      return;
    }
    console.log(
      `${"Name".padEnd(30)} ${"Size".padEnd(10)} ${"Status".padEnd(10)} ID`
    );
    console.log("-".repeat(70));
    for (const f of data.items) {
      const size =
        f.size < 1024 * 1024
          ? `${(f.size / 1024).toFixed(1)}KB`
          : `${(f.size / (1024 * 1024)).toFixed(1)}MB`;
      console.log(
        `${f.name.slice(0, 29).padEnd(30)} ${size.padEnd(10)} ${f.status.padEnd(10)} ${f.id}`
      );
    }
  } catch (err) {
    if (err instanceof EasybitsError) {
      console.error(`Error ${err.status}: ${err.body}`);
      process.exit(1);
    }
    throw err;
  }
}

async function filesUpload() {
  const fileName = process.argv[4];
  if (!fileName) {
    console.error("Usage: easybits files upload <filename>");
    process.exit(1);
  }
  if (!existsSync(fileName)) {
    console.error(`File not found: ${fileName}`);
    process.exit(1);
  }
  const stat = statSync(fileName);
  const ext = fileName.split(".").pop() || "";
  const mimeMap: Record<string, string> = {
    pdf: "application/pdf",
    png: "image/png",
    jpg: "image/jpeg",
    jpeg: "image/jpeg",
    mp4: "video/mp4",
    zip: "application/zip",
  };
  const contentType = mimeMap[ext] || "application/octet-stream";

  const client = await getClient();
  try {
    const data = await client.uploadFile({
      fileName: fileName.split("/").pop()!,
      contentType,
      size: stat.size,
    });

    // Upload to presigned URL
    const fileBuffer = readFileSync(fileName);
    const uploadRes = await fetch(data.putUrl, {
      method: "PUT",
      body: fileBuffer,
      headers: { "Content-Type": contentType },
    });

    if (uploadRes.ok) {
      console.log(`Uploaded: ${data.file.id}`);
    } else {
      console.error(`Upload failed: ${uploadRes.status}`);
    }
  } catch (err) {
    if (err instanceof EasybitsError) {
      console.error(`Error ${err.status}: ${err.body}`);
      process.exit(1);
    }
    throw err;
  }
}

async function filesDelete() {
  const fileId = process.argv[4];
  if (!fileId) {
    console.error("Usage: easybits files delete <file-id>");
    process.exit(1);
  }
  const client = await getClient();
  try {
    await client.deleteFile(fileId);
    console.log("Deleted");
  } catch (err) {
    if (err instanceof EasybitsError) {
      console.error(`Error ${err.status}: ${err.body}`);
      process.exit(1);
    }
    throw err;
  }
}

async function providersList() {
  console.log("Default provider: Tigris (platform)");
  console.log("Use the Developer Dashboard to add custom providers.");
}

async function printMcpConfig() {
  const apiKey = await resolveApiKey();
  const baseUrl = await resolveBaseUrl();
  const config = {
    mcpServers: {
      easybits: {
        type: "streamable-http",
        url: `${baseUrl}/api/mcp`,
        headers: {
          Authorization: `Bearer ${apiKey || "eb_sk_live_YOUR_KEY"}`,
        },
      },
    },
  };
  console.log(JSON.stringify(config, null, 2));
}

function printMcpStdioConfig() {
  const config = {
    mcpServers: {
      easybits: {
        command: "npx",
        args: ["-y", "@easybits.cloud/mcp"],
        env: {
          EASYBITS_API_KEY: "eb_sk_live_YOUR_KEY",
        },
      },
    },
  };
  console.log(JSON.stringify(config, null, 2));
}

// ─── Router ──────────────────────────────────────────────────────

const [cmd, sub] = [process.argv[2], process.argv[3]];

switch (cmd) {
  case "login":
    login();
    break;
  case "files":
    if (sub === "list" || !sub) filesList();
    else if (sub === "upload") filesUpload();
    else if (sub === "delete") filesDelete();
    else console.error(`Unknown: files ${sub}`);
    break;
  case "providers":
    providersList();
    break;
  case "config":
    printMcpConfig();
    break;
  case "mcp":
    printMcpStdioConfig();
    break;
  case "help":
  case undefined:
    console.log(`easybits CLI — @easybits.cloud/cli

Commands:
  login <key>       Save API key
  files list        List your files
  files upload <f>  Upload a file
  files delete <id> Delete a file
  providers list    Show storage providers
  config            Print MCP config JSON (streamable HTTP)
  mcp               Print MCP stdio config JSON`);
    break;
  default:
    console.error(`Unknown command: ${cmd}. Run 'easybits help'`);
}
