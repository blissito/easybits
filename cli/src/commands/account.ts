import { resolveBaseUrl } from "@easybits.cloud/sdk";
import type { Command, Ctx } from "../types.js";
import { bool, need, readStdin, str } from "../args.js";
import { CliError, EXIT, notLoggedIn, usageError } from "../errors.js";
import { emit, fmtBytes, table, fmtDate } from "../output.js";
import { api } from "../api.js";
import { getClient, resolveApiKey, resolveCredential } from "../client.js";
import { fetchEmail, oauthLogin, readRc, writeRc } from "../auth.js";
import { t } from "../i18n.js";

export const login: Command = {
  name: "login",
  group: "Account",
  summary: "Sign in with your browser (or save an API key)",
  synopsis: "login [-]",
  leaf: {
    summary: "Sign in with your browser (OAuth2 + PKCE), or save an API key instead",
    usage: "easybits login [-|--with-token] [--no-browser]",
    options: {
      "no-browser": { type: "boolean", description: "Only print the sign-in URL (e.g. for an agent to relay it)" },
      "with-token": { type: "boolean", description: "Read an API key from stdin instead of the browser (same as -)" },
    },
    examples: [
      "easybits login                               # opens the browser; waits for you",
      "easybits login --json                        # agents: prints {\"event\":\"login_url\"} first",
      "easybits login - < key.txt                   # API key from stdin (validated first)",
      "printenv EB_KEY | easybits login --with-token",
      "EASYBITS_API_KEY=… easybits usage            # CI/agents: the env var needs no login at all",
    ],
    async run(ctx) {
      // La key por stdin, como `gh auth login --with-token`: en argv la verían `ps` y el
      // historial (clig.dev). `login <api-key>` sigue funcionando, pero ya no se anuncia.
      let key = ctx.args[0];
      if (key === "-" || bool(ctx, "with-token")) {
        if (process.stdin.isTTY) throw usageError(t("Pipe the API key on stdin: easybits login - < key.txt", "Pasa la API key por stdin: easybits login - < key.txt"), this.usage);
        key = (await readStdin()).toString("utf8").trim();
        if (!key) throw usageError(t("Empty API key on stdin.", "La API key llegó vacía por stdin."), this.usage);
      }
      if (key) {
        // Se valida antes de guardar: una key mala no debe reemplazar una sesión buena.
        const email = await fetchEmail(key);
        // Una key explícita reemplaza la sesión del navegador: queda una sola credencial.
        const { oauth: _drop, ...rest } = readRc();
        writeRc({ ...rest, apiKey: key });
        if (ctx.json) process.stdout.write(JSON.stringify({ event: "logged_in", email, method: "apiKey" }) + "\n");
        else console.log(t(`Logged in${email ? ` as ${email}` : ""}. API key saved to ~/.easybitsrc`, `Sesión iniciada${email ? ` como ${email}` : ""}. API key guardada en ~/.easybitsrc`));
        return;
      }
      const session = await oauthLogin(ctx, { openBrowser: !bool(ctx, "no-browser") });
      const email = await fetchEmail(session.accessToken);
      if (ctx.json) process.stdout.write(JSON.stringify({ event: "logged_in", email, method: "oauth" }) + "\n");
      else console.log(t(`Logged in${email ? ` as ${email}` : ""}. Session saved to ~/.easybitsrc`, `Sesión iniciada${email ? ` como ${email}` : ""}. Sesión guardada en ~/.easybitsrc`));
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
      emit(ctx, { ok: true }, () => console.log(t("Logged out. Removed credentials from ~/.easybitsrc", "Sesión cerrada. Se quitaron las credenciales de ~/.easybitsrc")));
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
          t(`Storage:  ${fmtBytes(u.storage.usedBytes)} of ${fmtBytes(u.storage.maxBytes)} (${u.storage.percentUsed}%)`, `Espacio:  ${fmtBytes(u.storage.usedBytes)} de ${fmtBytes(u.storage.maxBytes)} (${u.storage.percentUsed}%)`),
        );
        console.log(
          t(
            `Files:    ${u.counts.files}  (trash: ${u.counts.deletedFiles})\nWebsites: ${u.counts.websites}\nWebhooks: ${u.counts.webhooks}`,
            `Archivos: ${u.counts.files}  (papelera: ${u.counts.deletedFiles})\nSitios:   ${u.counts.websites}\nWebhooks: ${u.counts.webhooks}`,
          ),
        );
      });
    },
  },
};

export const websites: Command = {
  name: "websites",
  group: "Storage",
  summary: "Static websites: list, create, change slug",
  synopsis: "websites <ls|create|slug>",
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
            t("No websites yet.", "Todavía no hay sitios."),
          ),
        );
      },
    },
    create: {
      summary: "Create an empty static website (optionally with your own slug)",
      usage: "easybits websites create <name> [--slug <slug>]",
      options: { slug: { type: "string", value: "slug", description: "Public slug: /s/<slug>/ (a-z, 0-9, hyphens, 3-60 chars)" } },
      examples: ["easybits websites create \"Mi tienda\" --slug mi-tienda"],
      async run(ctx) {
        const name = need(ctx, 0, "name", this.usage);
        const slug = str(ctx, "slug");
        const { website } = await api<{ website: WebsiteRow }>(ctx, "POST", "/websites", { name, ...(slug ? { slug } : {}) });
        emit(ctx, website, () => console.log(t(`Created ${website.slug} → ${website.url}`, `Creado ${website.slug} → ${website.url}`)));
      },
    },
    slug: {
      summary: "Change a website's slug (the old URL redirects 301 to the new one)",
      usage: "easybits websites slug <websiteId|slug> <new-slug>",
      examples: ["easybits websites slug rio-durmiente mi-tienda"],
      async run(ctx) {
        const ref = need(ctx, 0, "website", this.usage);
        const slug = need(ctx, 1, "new-slug", this.usage);
        const websiteId = await resolveWebsiteId(ctx, ref);
        const { website } = await api<{ ok: boolean; website: WebsiteRow }>(ctx, "PATCH", `/websites/${websiteId}`, { slug });
        emit(ctx, website, () => console.log(t(`Slug changed → ${website.url}`, `Slug cambiado → ${website.url}`)));
      },
    },
  },
  defaultSub: "ls",
};

type WebsiteRow = { id: string; name: string; slug: string; url: string };

/** Un id de Mongo (24 hex) pasa directo; si no, se busca por slug en tus sitios. */
export function matchWebsite(ref: string, items: WebsiteRow[]): string | null {
  if (/^[0-9a-f]{24}$/i.test(ref)) return ref;
  const r = ref.trim().toLowerCase();
  return items.find((w) => w.slug === r)?.id ?? null;
}

async function resolveWebsiteId(ctx: Ctx, ref: string): Promise<string> {
  if (/^[0-9a-f]{24}$/i.test(ref)) return ref;
  // La API pagina de 100 en 100; se recorre hasta encontrarlo.
  for (let offset = 0; ; offset += 100) {
    const page = await api<{ items: WebsiteRow[]; total: number }>(ctx, "GET", `/websites?limit=100&offset=${offset}`);
    const id = matchWebsite(ref, page.items);
    if (id) return id;
    if (page.items.length < 100 || offset + 100 >= page.total) break;
  }
  throw new CliError(
    t(`No website with id or slug "${ref}".`, `No hay sitio con id o slug "${ref}".`),
    EXIT.API,
    `${t("List them with", "Enlístalos con")}: easybits websites ls`,
    "not_found",
    404,
  );
}

export const providers: Command = {
  name: "providers",
  group: "Storage",
  summary: "Show storage providers",
  synopsis: "providers",
  leaf: {
    summary: "Show storage providers",
    usage: "easybits providers",
    examples: ["easybits providers", "easybits providers --json"],
    async run(ctx) {
      const data = {
        defaultProvider: "tigris",
        note: "Use the Developer Dashboard to add custom providers.",
      };
      emit(ctx, data, () => {
        console.log(t("Default provider: Tigris (platform)", "Proveedor por default: Tigris (plataforma)"));
        console.log(t("Use the Developer Dashboard to add custom providers.", "Agrega proveedores propios en el Developer Dashboard."));
      });
    },
  },
};

/** Config MCP: streamable HTTP (default) o stdio con el proxy npm. Antes eran `config` y `mcp`. */
export const mcp: Command = {
  name: "mcp",
  group: "MCP",
  summary: "Print the MCP config JSON for your agent or editor",
  synopsis: "mcp",
  subs: {
    config: {
      summary: "Print MCP config JSON: streamable HTTP with your key, or stdio (npx @easybits.cloud/mcp)",
      usage: "easybits mcp config [--stdio]",
      options: { stdio: { type: "boolean", description: "stdio config (npx @easybits.cloud/mcp) instead of streamable HTTP" } },
      examples: ["easybits mcp config > .mcp.json", "easybits mcp config --stdio"],
      async run(ctx) {
        // Siempre JSON: es su salida natural, con o sin --json.
        if (bool(ctx, "stdio")) {
          const config = {
            mcpServers: {
              easybits: { command: "npx", args: ["-y", "@easybits.cloud/mcp"], env: { EASYBITS_API_KEY: "eb_sk_live_YOUR_KEY" } },
            },
          };
          console.log(JSON.stringify(config, null, 2));
          return;
        }
        // Sólo una API key: el access token del navegador vence en una hora.
        const apiKey = resolveApiKey(ctx);
        const baseUrl = await resolveBaseUrl();
        const config = {
          mcpServers: {
            easybits: {
              type: "streamable-http",
              url: `${baseUrl}/api/mcp`,
              headers: { Authorization: `Bearer ${apiKey || "eb_sk_live_YOUR_KEY"}` },
            },
          },
        };
        console.log(JSON.stringify(config, null, 2));
      },
    },
  },
};

export const whoami: Command = {
  name: "whoami",
  group: "Account",
  summary: "Show which account and credential the CLI is using",
  synopsis: "whoami",
  leaf: {
    summary: "Show the account email and where the credential comes from",
    usage: "easybits whoami",
    examples: ["easybits whoami", "easybits whoami --json"],
    async run(ctx) {
      const source = process.env.EASYBITS_API_KEY
        ? "env EASYBITS_API_KEY"
        : ctx.token
          ? "--token"
          : readRc().oauth?.accessToken
            ? "browser session (~/.easybitsrc)"
            : readRc().apiKey
              ? "API key (~/.easybitsrc)"
              : undefined;
      if (!source) throw notLoggedIn();
      const email = await fetchEmail(await resolveCredential(ctx));
      emit(ctx, { email, source, baseUrl: await resolveBaseUrl() }, () => console.log(`${email ?? t("(unknown email)", "(correo desconocido)")}  ${t("via", "por")} ${source}`));
    },
  },
};
