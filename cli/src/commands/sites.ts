import type { Command } from "../types.js";
import { existsSync, readFileSync } from "node:fs";
import { resolveBaseUrl } from "@easybits.cloud/sdk";
import { need, readStdin, str } from "../args.js";
import { emit, fmtDate, table } from "../output.js";
import { api } from "../api.js";
import { usageError } from "../errors.js";
import { t } from "../i18n.js";

/** Un sitio del creador de sitios (/dash/sitios), como lo devuelve GET /api/v2/sites. */
export type SiteRow = {
  id: string;
  name: string;
  kind: "static" | "webapp";
  engine: string;
  stack: string | null;
  url: string | null;
  /** Estático: el website con sus archivos. */
  websiteId: string | null;
  /** Web app: la máquina con su código. */
  sandboxId: string | null;
  createdAt: string;
  /** Web app sin publicar archivada por inactividad (revive al abrirla o mandarle un mensaje). */
  archivedAt: string | null;
};

/** Lo que devuelve POST /api/v2/sites. */
export type CreatedSite = {
  id: string;
  name: string;
  kind: "static" | "webapp";
  stack: string | null;
  template: string | null;
  previewUrl: string | null;
  url: string | null;
  editorUrl: string;
};

// Espejo de app/lib/siteStacks.ts y app/lib/siteTemplates.ts (sites.test.ts los compara).
// El servidor cae en silencio a tanstack con un stack desconocido: aquí se rechaza antes.
export const SITE_STACKS = ["tanstack", "next", "react-router", "remix", "nuxt", "sveltekit", "astro", "elysia"] as const;
export const SITE_TEMPLATES = ["consultorio", "despacho", "portafolio", "lanzamiento"] as const;
/** Stacks cuya caja trae las plantillas; el resto arranca con su starter vacío. */
export const TEMPLATE_STACKS = ["tanstack", "react-router"] as const;

/** Filas para la tabla: tipo legible (con su stack) y la URL o «sin publicar». */
export function siteRows(items: SiteRow[]) {
  return items.map((s) => ({
    ...s,
    kind: s.kind === "webapp" ? `webapp${s.stack ? ` (${s.stack})` : ""}` : "static",
    url: s.url ?? (s.archivedAt ? t("(archived)", "(archivada)") : t("(not published)", "(sin publicar)")),
    createdAt: fmtDate(s.createdAt),
  }));
}

/** Valida kind/stack/template y arma el cuerpo de POST /sites. Puro para probarlo. */
export function createBody(
  o: { prompt?: string; name?: string; kind?: string; stack?: string; template?: string },
  usage: string,
): Record<string, string> {
  const kind = o.kind ?? "webapp";
  if (kind !== "static" && kind !== "webapp") throw usageError(t(`--kind is static or webapp, not "${kind}".`, `--kind es static o webapp, no "${kind}".`), usage);
  if (kind === "static" && (o.stack || o.template)) {
    throw usageError(t("--stack and --template are only for --kind webapp.", "--stack y --template sólo aplican a --kind webapp."), usage);
  }
  if (o.stack && !(SITE_STACKS as readonly string[]).includes(o.stack)) {
    throw usageError(t(`Unknown stack "${o.stack}". One of: ${SITE_STACKS.join(", ")}.`, `Stack desconocido "${o.stack}". Uno de: ${SITE_STACKS.join(", ")}.`), usage);
  }
  if (o.template) {
    if (!(SITE_TEMPLATES as readonly string[]).includes(o.template)) {
      throw usageError(t(`Unknown template "${o.template}". One of: ${SITE_TEMPLATES.join(", ")}.`, `Plantilla desconocida "${o.template}". Una de: ${SITE_TEMPLATES.join(", ")}.`), usage);
    }
    if (!(TEMPLATE_STACKS as readonly string[]).includes(o.stack ?? "tanstack")) {
      throw usageError(t(`--template only works with stack ${TEMPLATE_STACKS.join(" or ")}.`, `--template sólo funciona con el stack ${TEMPLATE_STACKS.join(" o ")}.`), usage);
    }
  }
  if (!o.prompt && !o.name) throw usageError(t("Give --prompt (what to build) or --name.", "Pasa --prompt (qué construir) o --name."), usage);
  const body: Record<string, string> = { kind };
  for (const k of ["prompt", "name", "stack", "template"] as const) if (o[k]) body[k] = o[k]!;
  return body;
}

const THEME_USAGE = "easybits sites theme <get|set> <site> [--theme <id> | --colors <file.json|->]";

async function readColors(path: string): Promise<unknown> {
  let text: string;
  if (path === "-") text = (await readStdin()).toString("utf8");
  else {
    if (!existsSync(path)) throw usageError(t(`File not found: ${path}`, `No existe el archivo: ${path}`), THEME_USAGE);
    text = readFileSync(path, "utf8");
  }
  try {
    return JSON.parse(text);
  } catch {
    throw usageError(t(`${path === "-" ? "stdin" : path} is not valid JSON.`, `${path === "-" ? "stdin" : path} no es JSON válido.`), THEME_USAGE);
  }
}

function printColors(colors: Record<string, string> | null) {
  table(Object.entries(colors ?? {}).map(([token, value]) => ({ token, value })), [["token", "TOKEN"], ["value", "VALUE"]]);
}

export const sites: Command = {
  name: "sites",
  aliases: ["site"],
  group: "Hosting",
  summary: "Your site-builder sites (/dash/sitios): static and web apps",
  synopsis: "sites <ls|create|theme>",
  subs: {
    ls: {
      aliases: ["list"],
      summary: "List your sites with their kind, engine and public URL",
      usage: "easybits sites ls",
      examples: ["easybits sites ls", "easybits sites ls --json"],
      async run(ctx) {
        const { items } = await api<{ items: SiteRow[] }>(ctx, "GET", "/sites");
        emit(ctx, items, () =>
          table(
            siteRows(items),
            [["id", "ID"], ["name", "NAME"], ["kind", "KIND"], ["engine", "ENGINE"], ["url", "URL"]],
            t("No sites yet. Create one: easybits sites create --prompt \"…\"", "Todavía no hay sitios. Crea uno: easybits sites create --prompt \"…\""),
          ),
        );
      },
    },
    create: {
      aliases: ["new"],
      summary: "Create a site from a prompt; its builder agent picks it up in the editor",
      usage: "easybits sites create (--prompt <text> | --name <name>) [--kind webapp|static] [--stack <stack>] [--template <key>]",
      options: {
        prompt: { type: "string", value: "text", description: "What to build; also names the site if --name is missing" },
        name: { type: "string", value: "name", description: "Site name" },
        kind: { type: "string", value: "kind", description: "webapp (default: its own machine, published later) or static (CDN website)" },
        stack: { type: "string", value: "stack", description: "Web app stack: tanstack (default), next, react-router, remix, nuxt, sveltekit, astro, elysia" },
        template: { type: "string", value: "key", description: "Starting template (tanstack/react-router): consultorio, despacho, portafolio, lanzamiento" },
      },
      examples: [
        'easybits sites create --prompt "Landing for my dental clinic in Puebla"',
        'easybits sites create --prompt "Task tracker with login" --stack next --json',
        'easybits sites create --name "Promo" --kind static',
      ],
      async run(ctx) {
        const body = createBody(
          { prompt: str(ctx, "prompt"), name: str(ctx, "name"), kind: str(ctx, "kind"), stack: str(ctx, "stack"), template: str(ctx, "template") },
          this.usage,
        );
        const site = await api<CreatedSite>(ctx, "POST", "/sites", body);
        const base = (await resolveBaseUrl()).replace(/\/$/, "");
        const editorUrl = site.editorUrl.startsWith("http") ? site.editorUrl : `${base}${site.editorUrl}`;
        const out = { ...site, editorUrl };
        emit(ctx, out, () => {
          console.log(t(`Created ${site.name} (${site.id}) — ${site.kind}${site.stack ? ` ${site.stack}` : ""}`, `Creado ${site.name} (${site.id}) — ${site.kind}${site.stack ? ` ${site.stack}` : ""}`));
          console.log(`${t("Editor", "Editor")}:  ${editorUrl}`);
          if (site.previewUrl) console.log(`${t("Preview", "Vista previa")}: ${site.previewUrl}`);
          console.log(site.url ? `URL: ${site.url}` : t("Not published yet: publish it from the editor.", "Todavía sin publicar: publícalo desde el editor."));
        });
      },
    },
    theme: {
      summary: "Read or change a site's color theme without a model turn (the «Tema» button)",
      usage: THEME_USAGE,
      options: {
        theme: { type: "string", value: "id", description: "Palette id: minimal, calido, oceano, noche, dracula, nord, tokyo-night, github-light…" },
        colors: { type: "string", value: "file.json|-", description: "JSON with every token as #rrggbb (- reads stdin)" },
      },
      examples: [
        "easybits sites theme get my-shop",
        "easybits sites theme set my-shop --theme dracula",
        "easybits sites theme get my-shop --json > theme.json   # edit, then:",
        "jq .colors theme.json | easybits sites theme set my-shop --colors -",
      ],
      async run(ctx) {
        const action = need(ctx, 0, "get|set", THEME_USAGE);
        const id = need(ctx, 1, "site", THEME_USAGE);
        const path = `/sites/${encodeURIComponent(id)}/theme`;
        if (action === "get") {
          const r = await api<{ supported: boolean; colors: Record<string, string> | null }>(ctx, "GET", path);
          emit(ctx, r, () => {
            if (!r.supported) console.log(t("This site predates themes (literal colors): ask its builder agent to move it to tokens.", "Este sitio es anterior a los temas (colores literales): pídele a su agente que lo pase a tokens."));
            else printColors(r.colors);
          });
          return;
        }
        if (action !== "set") throw usageError(t(`Unknown theme action "${action}".`, `Acción de theme desconocida "${action}".`), THEME_USAGE);
        const themeId = str(ctx, "theme");
        const file = str(ctx, "colors");
        if (!themeId === !file) throw usageError(t("Give --theme <id> or --colors <file.json|->, one of them.", "Pasa --theme <id> o --colors <archivo.json|->, uno de los dos."), THEME_USAGE);
        const body = themeId ? { themeId } : { colors: await readColors(file!) };
        const r = await api<{ colors: Record<string, string> }>(ctx, "POST", path, body);
        emit(ctx, r, () => {
          console.log(t("Theme changed. The preview updates by itself.", "Tema cambiado. La vista previa se actualiza sola."));
          printColors(r.colors);
        });
      },
    },
  },
  defaultSub: "ls",
};

