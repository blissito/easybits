import { resolveBaseUrl } from "@easybits.cloud/sdk";
import type { Command } from "../types.js";
import { bool } from "../args.js";
import { emit, fmtBytes, table, fmtDate } from "../output.js";
import { getClient, resolveApiKey } from "../client.js";
import { oauthLogin, readRc, writeRc } from "../auth.js";

export const login: Command = {
  name: "login",
  group: "Account",
  summary: "Sign in with your browser (or save an API key)",
  synopsis: "login [api-key]",
  leaf: {
    summary: "Sign in with your browser (OAuth2 + PKCE), or save an API key instead",
    usage: "easybits login [api-key] [--no-browser]",
    options: {
      "no-browser": { type: "boolean", description: "Only print the sign-in URL (e.g. for an agent to relay it)" },
    },
    examples: [
      "easybits login                        # opens the browser; waits for you",
      "easybits login --json                 # agents: prints {\"event\":\"login_url\"} first",
      "easybits login eb_sk_live_xxxxxxxx    # API key instead of the browser",
    ],
    async run(ctx) {
      const key = ctx.args[0];
      if (key) {
        // Una key explícita reemplaza la sesión del navegador: queda una sola credencial.
        const { oauth: _drop, ...rest } = readRc();
        writeRc({ ...rest, apiKey: key });
        emit(ctx, { ok: true, method: "apiKey", path: "~/.easybitsrc" }, () => console.log("Saved API key to ~/.easybitsrc"));
        return;
      }
      const session = await oauthLogin(ctx, { openBrowser: !bool(ctx, "no-browser") });
      // Comprueba que el token sirve antes de decir "listo".
      const eb = await getClient(ctx);
      const u = await eb.getUsageStats();
      const done = { event: "logged_in", method: "oauth", plan: u.plan, expiresAt: new Date(session.expiresAt).toISOString() };
      if (ctx.json) process.stdout.write(JSON.stringify(done) + "\n");
      else console.log(`Logged in (plan ${u.plan}). Session saved to ~/.easybitsrc`);
    },
  },
};

export const logout: Command = {
  name: "logout",
  group: "Account",
  summary: "Forget the saved session and API key",
  synopsis: "logout",
  leaf: {
    summary: "Remove the browser session and the API key from ~/.easybitsrc",
    usage: "easybits logout",
    examples: ["easybits logout"],
    async run(ctx) {
      const { oauth: _o, apiKey: _k, ...rest } = readRc();
      writeRc(rest);
      emit(ctx, { ok: true }, () => console.log("Logged out. Removed credentials from ~/.easybitsrc"));
    },
  },
};

export const usage: Command = {
  name: "usage",
  group: "Account",
  summary: "Show your plan, storage and resource counts",
  synopsis: "usage",
  leaf: {
    summary: "Show your plan, storage and resource counts",
    usage: "easybits usage",
    examples: ["easybits usage", "easybits usage --json"],
    async run(ctx) {
      const eb = await getClient(ctx);
      const u = await eb.getUsageStats();
      emit(ctx, u, () => {
        console.log(`Plan:     ${u.plan}`);
        console.log(
          `Storage:  ${fmtBytes(u.storage.usedBytes)} of ${fmtBytes(u.storage.maxBytes)} (${u.storage.percentUsed}%)`,
        );
        console.log(
          `Files:    ${u.counts.files}  (trash: ${u.counts.deletedFiles})\nWebsites: ${u.counts.websites}\nWebhooks: ${u.counts.webhooks}`,
        );
      });
    },
  },
};

export const websites: Command = {
  name: "websites",
  group: "Storage",
  summary: "List your static websites",
  synopsis: "websites",
  subs: {
    ls: {
      aliases: ["list"],
      summary: "List your static websites",
      usage: "easybits websites ls",
      examples: ["easybits websites ls --json"],
      async run(ctx) {
        const eb = await getClient(ctx);
        const { items } = await eb.listWebsites();
        emit(ctx, items, () =>
          table(
            items.map((w) => ({ ...w, size: fmtBytes(w.totalSize), createdAt: fmtDate(w.createdAt) })),
            [["id", "ID"], ["name", "NAME"], ["status", "STATUS"], ["fileCount", "FILES"], ["size", "SIZE"], ["url", "URL"]],
            "No websites yet.",
          ),
        );
      },
    },
  },
  defaultSub: "ls",
};

export const providers: Command = {
  name: "providers",
  group: "Storage",
  summary: "Show storage providers",
  synopsis: "providers",
  leaf: {
    summary: "Show storage providers",
    usage: "easybits providers [list]",
    async run(ctx) {
      const data = {
        defaultProvider: "tigris",
        note: "Use the Developer Dashboard to add custom providers.",
      };
      emit(ctx, data, () => {
        console.log("Default provider: Tigris (platform)");
        console.log("Use the Developer Dashboard to add custom providers.");
      });
    },
  },
};

export const config: Command = {
  name: "config",
  group: "MCP",
  summary: "Print MCP config JSON (streamable HTTP)",
  synopsis: "config",
  leaf: {
    summary: "Print MCP config JSON (streamable HTTP) with your key",
    usage: "easybits config",
    examples: ["easybits config > .mcp.json"],
    async run(ctx) {
      // Sólo una API key: el access token del navegador vence en una hora.
      const apiKey = resolveApiKey(ctx);
      const baseUrl = await resolveBaseUrl();
      // Siempre JSON: es su salida natural, con o sin --json.
      console.log(
        JSON.stringify(
          {
            mcpServers: {
              easybits: {
                type: "streamable-http",
                url: `${baseUrl}/api/mcp`,
                headers: { Authorization: `Bearer ${apiKey || "eb_sk_live_YOUR_KEY"}` },
              },
            },
          },
          null,
          2,
        ),
      );
    },
  },
};

export const mcp: Command = {
  name: "mcp",
  group: "MCP",
  summary: "Print MCP stdio config JSON",
  synopsis: "mcp",
  leaf: {
    summary: "Print MCP stdio config JSON (npx @easybits.cloud/mcp)",
    usage: "easybits mcp",
    async run() {
      console.log(
        JSON.stringify(
          {
            mcpServers: {
              easybits: {
                command: "npx",
                args: ["-y", "@easybits.cloud/mcp"],
                env: { EASYBITS_API_KEY: "eb_sk_live_YOUR_KEY" },
              },
            },
          },
          null,
          2,
        ),
      );
    },
  },
};
