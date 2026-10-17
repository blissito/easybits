import { existsSync, readFileSync, statSync } from "node:fs";
import { basename } from "node:path";
import { resolveBaseUrl } from "@easybits.cloud/sdk";
import type { Command, Ctx } from "../types.js";
import { bool, need, readStdin, str } from "../args.js";
import { CliError, EXIT, notLoggedIn, usageError } from "../errors.js";
import { emit, fmtBytes, table, fmtDate } from "../output.js";
import { api } from "../api.js";
import { getClient, resolveApiKey, resolveCredential } from "../client.js";
import { fetchEmail, oauthLogin, readRc, writeRc } from "../auth.js";
import { t } from "../i18n.js";
import { YES_OPTION, confirm, requireYesIfHeadless } from "../prompt.js";
import { mimeOf, sitePath, walkSite } from "../sitefiles.js";

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
  summary: "Static websites: list, create, upload, deploy a folder, delete",
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
    get: {
      aliases: ["show"],
      summary: "Show one website (by slug or id)",
      usage: "easybits websites get <website>",
      examples: ["easybits websites get mi-tienda", "easybits websites get mi-tienda --json"],
      async run(ctx) {
        const w = await api<WebsiteDetail>(ctx, "GET", `/websites/${await resolveWebsiteId(ctx, need(ctx, 0, "website", this.usage))}`);
        emit(ctx, w, () => {
          console.log(`ID:        ${w.id}`);
          console.log(`${t("Name:     ", "Nombre:   ")} ${w.name}`);
          console.log(`Slug:      ${w.slug}`);
          console.log(`${t("Status:   ", "Estado:   ")} ${w.status}`);
          console.log(`${t("Files:    ", "Archivos: ")} ${w.fileCount ?? 0} (${fmtBytes(w.totalSize ?? 0)})`);
          console.log(`URL:       ${w.url}`);
          console.log(`${t("Created:  ", "Creado:   ")} ${fmtDate(w.createdAt)}`);
        });
      },
    },
    files: {
      summary: "List a website's files (paths inside the site)",
      usage: "easybits websites files [ls] <website>",
      examples: ["easybits websites files ls mi-tienda", "easybits websites files mi-tienda --json"],
      async run(ctx) {
        // `files ls <sitio>` y `files <sitio>` son lo mismo (como `sandboxes files ls`).
        if (ctx.args[0] === "ls" || ctx.args[0] === "list") ctx.args.shift();
        const id = await resolveWebsiteId(ctx, need(ctx, 0, "website", this.usage));
        const w = await api<WebsiteDetail>(ctx, "GET", `/websites/${id}`);
        const items: SiteFile[] = [];
        for (let cursor: string | undefined; ; ) {
          const page = await api<{ items: SiteFile[]; nextCursor?: string; hasMore?: boolean }>(ctx, "GET", `/websites/${id}/files?limit=100${cursor ? `&cursor=${cursor}` : ""}`);
          items.push(...page.items);
          if (!page.hasMore || !page.nextCursor) break;
          cursor = page.nextCursor;
        }
        const rows = items
          .map((f) => ({ ...f, path: w.prefix && f.name.startsWith(w.prefix) ? f.name.slice(w.prefix.length) : f.name }))
          .sort((a, b) => a.path.localeCompare(b.path));
        emit(ctx, rows, () =>
          table(
            rows.map((f) => ({ ...f, size: fmtBytes(f.size), createdAt: fmtDate(f.createdAt) })),
            [["path", "PATH"], ["size", "SIZE"], ["contentType", "TYPE"], ["createdAt", "CREATED"]],
            t(`No files yet. Upload a folder: easybits websites deploy ${w.slug} ./dist`, `Todavía no hay archivos. Sube una carpeta: easybits websites deploy ${w.slug} ./dist`),
          ),
        );
      },
    },
    upload: {
      summary: "Upload one file to a website (public; replaces the same path)",
      usage: "easybits websites upload <website> <local-file> [--path <path-in-site>]",
      options: { path: { type: "string", value: "path", description: "Path inside the site (default: the file name), e.g. img/hero.jpg" } },
      examples: ["easybits websites upload mi-tienda ./index.html", "easybits websites upload mi-tienda ./hero.jpg --path img/hero.jpg"],
      async run(ctx) {
        const ref = need(ctx, 0, "website", this.usage);
        const local = need(ctx, 1, "local-file", this.usage);
        if (!existsSync(local) || !statSync(local).isFile()) throw usageError(t(`File not found: ${local}`, `No existe el archivo: ${local}`), this.usage);
        const path = sitePath(str(ctx, "path") ?? basename(local));
        if (!path) throw usageError(t("--path must be a relative path inside the site (no ..).", "--path debe ser una ruta relativa dentro del sitio (sin ..)."), this.usage);
        const size = statSync(local).size;
        if (size === 0) throw usageError(t(`${local} is empty.`, `${local} está vacío.`), this.usage);
        const id = await resolveWebsiteId(ctx, ref);
        const r = await putSiteFile(ctx, id, path, local, size);
        emit(ctx, r, () => console.log(t(`Uploaded ${path} (${fmtBytes(size)}) → ${r.url}`, `Subido ${path} (${fmtBytes(size)}) → ${r.url}`)));
      },
    },
    deploy: {
      summary: "Upload a whole folder (e.g. your build) keeping its paths; same paths are replaced",
      usage: "easybits websites deploy <website> <dir> [--dry-run]",
      options: { "dry-run": { type: "boolean", description: "List what would be uploaded; upload nothing" } },
      examples: ["easybits websites deploy mi-tienda ./dist", "easybits websites deploy mi-tienda ./dist --dry-run"],
      async run(ctx) {
        const ref = need(ctx, 0, "website", this.usage);
        const dir = need(ctx, 1, "dir", this.usage);
        if (!existsSync(dir) || !statSync(dir).isDirectory()) throw usageError(t(`Not a folder: ${dir}`, `No es una carpeta: ${dir}`), this.usage);
        const all = walkSite(dir);
        const files = all.filter((f) => f.size > 0);
        const empty = all.filter((f) => f.size === 0).map((f) => f.path);
        if (!files.length) throw usageError(t(`Nothing to upload in ${dir} (hidden files and node_modules are skipped).`, `Nada que subir en ${dir} (se saltan los ocultos y node_modules).`), this.usage);
        if (!files.some((f) => f.path === "index.html")) console.error(t("Note: no index.html at the top of the folder; /s/<slug>/ will not have a home page.", "Ojo: no hay index.html en la raíz de la carpeta; /s/<slug>/ no tendrá página de inicio."));
        const id = await resolveWebsiteId(ctx, ref);
        if (bool(ctx, "dry-run")) {
          emit(ctx, { websiteId: id, files: files.map(({ path, size }) => ({ path, size })), skippedEmpty: empty }, () => {
            for (const f of files) console.log(`  ${f.path}  ${fmtBytes(f.size)}`);
            console.log(t(`${files.length} files, ${fmtBytes(files.reduce((s, f) => s + f.size, 0))}. Nothing uploaded (--dry-run).`, `${files.length} archivos, ${fmtBytes(files.reduce((s, f) => s + f.size, 0))}. No se subió nada (--dry-run).`));
          });
          return;
        }
        // De 4 en 4: rápido sin saturar la API ni el storage.
        const done: Awaited<ReturnType<typeof putSiteFile>>[] = [];
        let next = 0;
        const worker = async () => {
          while (next < files.length) {
            const f = files[next++];
            done.push(await putSiteFile(ctx, id, f.path, f.local, f.size));
            if (!ctx.json) process.stderr.write(`  ${f.path}\n`);
          }
        };
        await Promise.all(Array.from({ length: Math.min(4, files.length) }, worker));
        const w = await api<WebsiteDetail>(ctx, "GET", `/websites/${id}`);
        emit(ctx, { websiteId: id, url: w.url, uploaded: done.sort((a, b) => a.path.localeCompare(b.path)), skippedEmpty: empty }, () => {
          if (empty.length) console.error(t(`Skipped empty files: ${empty.join(", ")}`, `Se saltaron archivos vacíos: ${empty.join(", ")}`));
          console.log(t(`Deployed ${done.length} files → ${w.url}`, `Publicados ${done.length} archivos → ${w.url}`));
        });
      },
    },
    rm: {
      aliases: ["delete", "remove"],
      summary: "Delete a website and its files (asks you to type the slug)",
      usage: "easybits websites rm <website> [--yes]",
      options: { ...YES_OPTION },
      examples: ["easybits websites rm mi-tienda", "easybits websites rm mi-tienda --yes"],
      async run(ctx) {
        const ref = need(ctx, 0, "website", this.usage);
        requireYesIfHeadless(ctx);
        const id = await resolveWebsiteId(ctx, ref);
        const w = await api<WebsiteDetail>(ctx, "GET", `/websites/${id}`);
        // Se lleva todos sus archivos: se teclea el slug (como `gh repo delete`).
        await confirm(ctx, t(`Delete website ${w.slug} (${w.fileCount ?? 0} files) at ${w.url}?`, `¿Borrar el sitio ${w.slug} (${w.fileCount ?? 0} archivos) en ${w.url}?`), { typeName: w.slug });
        const r = await api<{ ok: boolean }>(ctx, "DELETE", `/websites/${id}`);
        emit(ctx, { ...r, id, slug: w.slug }, () => console.log(t(`Deleted ${w.slug}`, `Borrado ${w.slug}`)));
      },
    },
  },
  defaultSub: "ls",
};

type WebsiteRow = { id: string; name: string; slug: string; url: string };
type WebsiteDetail = WebsiteRow & { status: string; fileCount?: number; totalSize?: number; prefix?: string; createdAt: string };
type SiteFile = { id: string; name: string; size: number; contentType: string; status: string; createdAt: string };

/** Reserva la ruta en el sitio y sube los bytes a la URL firmada que devuelve la API. */
async function putSiteFile(ctx: Ctx, websiteId: string, path: string, local: string, size: number) {
  const contentType = mimeOf(path);
  const r = await api<{ file: { id: string; url?: string }; putUrl: string }>(ctx, "POST", `/websites/${websiteId}/files`, { fileName: path, contentType, size });
  const res = await fetch(r.putUrl, { method: "PUT", body: readFileSync(local), headers: { "Content-Type": contentType } });
  if (!res.ok) throw new CliError(t(`Upload of ${path} failed: storage answered ${res.status}`, `Falló la subida de ${path}: el almacenamiento contestó ${res.status}`), EXIT.API, undefined, "upload_failed", res.status);
  return { path, fileId: r.file.id, url: r.file.url, size, contentType };
}

/** Un id de Mongo (24 hex) pasa directo; si no, se busca por slug en tus sitios. */
export function matchWebsite(ref: string, items: WebsiteRow[]): string | null {
  if (/^[0-9a-f]{24}$/i.test(ref)) return ref;
  const r = ref.trim().toLowerCase();
  return items.find((w) => w.slug === r)?.id ?? null;
}

export async function resolveWebsiteId(ctx: Ctx, ref: string): Promise<string> {
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
