// Documentos (los del editor /dash/documents): cada página es HTML que tú escribes. El CLI
// no expone la generación con IA a propósito: el camino que funciona es escribir el HTML y
// fijarlo con `pages set` (o `add-page`), igual que set_page_html por MCP.
import type { Command, Ctx } from "../types.js";
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { EasybitsError, resolveBaseUrl } from "@easybits.cloud/sdk";
import { list, need, readStdin, str } from "../args.js";
import { emit, fmtBytes, fmtDate, table } from "../output.js";
import { api } from "../api.js";
import { resolveCredential } from "../client.js";
import { usageError } from "../errors.js";
import { confirm, requireYesIfHeadless, YES_OPTION } from "../prompt.js";
import { download, withProgress } from "../progress.js";
import { t } from "../i18n.js";

/** Un documento en GET /api/v2/documents. */
export type DocRow = {
  id: string;
  name: string;
  status: string;
  pageCount: number;
  shareUrl: string | null;
  pdfUrl: string | null;
  createdAt: string;
  updatedAt: string;
};

/** Una página (sección) del documento. */
export type DocPage = { id: string; order: number; html?: string; label?: string; name?: string; type?: string };

/** GET /api/v2/documents/:id: el registro con sus páginas. */
export type DocFull = {
  id: string;
  name: string;
  status: string;
  theme: string;
  metadata?: { format?: { width: number; height: number }; intent?: string; theme?: string } | null;
  sections: DocPage[] | null;
  shareUrl: string | null;
  pdfUrl: string | null;
  slug: string | null;
  updatedAt: string;
};

// Espejo de app/.server/core/socialPresets.ts (documents.test.ts los compara). `letter` = sin
// formato: el tamaño carta de siempre.
export const DOC_PRESETS: Record<string, { width: number; height: number } | null> = {
  "ig-square": { width: 1080, height: 1080 },
  "fb-square": { width: 1080, height: 1080 },
  "ig-feed": { width: 1080, height: 1350 },
  "li-feed": { width: 1080, height: 1350 },
  "ig-story": { width: 1080, height: 1920 },
  "wsp-status": { width: 1080, height: 1920 },
  tiktok: { width: 1080, height: 1920 },
  "slide-16-9": { width: 1920, height: 1080 },
  letter: null,
  "1080x1080": { width: 1080, height: 1080 },
  "1080x1350": { width: 1080, height: 1350 },
};

/** `WxH` → dimensiones; null si no tiene esa forma. */
export function parseSize(s: string): { width: number; height: number } | null {
  const m = /^(\d{2,5})x(\d{2,5})$/i.exec(s.trim());
  return m ? { width: Number(m[1]), height: Number(m[2]) } : null;
}

/**
 * `--format` es un preset o `WxH` (100-10000 px, como la tool create_document). Devuelve el
 * cuerpo `format` de POST /documents y las dimensiones para la página en blanco.
 */
export function docFormat(
  input: string | undefined,
  usage: string,
): { body?: { preset: string } | { width: number; height: number }; dims: { width: number; height: number } | null } {
  if (!input) return { dims: null };
  if (input in DOC_PRESETS) return { body: { preset: input }, dims: DOC_PRESETS[input] };
  const size = parseSize(input);
  if (!size) {
    throw usageError(
      t(`Unknown --format "${input}". One of: ${Object.keys(DOC_PRESETS).join(", ")}, or WxH in px.`, `--format desconocido "${input}". Uno de: ${Object.keys(DOC_PRESETS).join(", ")}, o WxH en px.`),
      usage,
    );
  }
  if ([size.width, size.height].some((n) => n < 100 || n > 10000)) {
    throw usageError(t("--format WxH goes from 100 to 10000 px per side.", "--format WxH va de 100 a 10000 px por lado."), usage);
  }
  return { body: size, dims: size };
}

/** Página en blanco del tamaño del documento (la de la API es carta aunque el doc sea 1080×1350). */
export function blankPageHtml(dims: { width: number; height: number } | null): string | undefined {
  if (!dims) return undefined;
  return `<section class="w-[${dims.width}px] h-[${dims.height}px] flex flex-col relative overflow-hidden bg-surface"></section>`;
}

/** Páginas en orden. */
export const pagesOf = (doc: Pick<DocFull, "sections">): DocPage[] => [...(doc.sections ?? [])].sort((a, b) => a.order - b.order);

/**
 * Una página por id o por número (1 = la primera, como se ven en el editor). Un número que no
 * existe y un id que no está son errores de uso con la lista de páginas.
 */
export function pageRef(pages: DocPage[], ref: string, usage: string): DocPage {
  const byId = pages.find((p) => p.id === ref);
  if (byId) return byId;
  if (/^\d+$/.test(ref)) {
    const n = Number(ref);
    if (n >= 1 && n <= pages.length) return pages[n - 1];
  }
  throw usageError(
    t(`No page "${ref}" in this document (${pages.length} pages: use 1-${pages.length} or a page id).`, `No hay página "${ref}" en este documento (${pages.length} páginas: usa 1-${pages.length} o el id de la página).`),
    usage,
  );
}

/** El orden nuevo completo: cada página una vez (por número o id). */
export function reorderIds(pages: DocPage[], refs: string[], usage: string): string[] {
  const ids = refs.map((r) => pageRef(pages, r, usage).id);
  if (ids.length !== pages.length || new Set(ids).size !== ids.length) {
    throw usageError(t(`Give every page exactly once (${pages.length} pages).`, `Pasa cada página exactamente una vez (${pages.length} páginas).`), usage);
  }
  return ids;
}

export function pageRows(pages: DocPage[]) {
  return pages.map((p, i) => ({ n: i + 1, id: p.id, label: p.label || p.name || "-", bytes: (p.html ?? "").length }));
}

const sized = (rows: ReturnType<typeof pageRows>) => rows.map((r) => ({ ...r, size: fmtBytes(r.bytes) }));

/** Nombre de archivo sin caracteres raros (lo que el servidor también hace con el PDF). */
export const safeName = (s: string) => s.replace(/[^\w\-. ]+/g, "_").trim().slice(0, 80) || "document";

/** HTML de un archivo local o de stdin (`-`). */
function readHtml(path: string, usage: string): Promise<string> | string {
  if (path === "-") {
    if (process.stdin.isTTY) throw usageError(t("Expected the HTML on stdin.", "Se esperaba el HTML por stdin."), usage);
    return readStdin().then((b) => b.toString("utf8"));
  }
  if (!existsSync(path)) throw usageError(t(`File not found: ${path}`, `No existe el archivo: ${path}`), usage);
  return readFileSync(path, "utf8");
}

const getDoc = (ctx: Ctx, id: string) => api<DocFull>(ctx, "GET", `/documents/${encodeURIComponent(id)}`);
const docPath = (id: string) => `/documents/${encodeURIComponent(id)}`;

async function editorUrl(id: string) {
  return `${(await resolveBaseUrl()).replace(/\/$/, "")}/dash/documents/${id}`;
}

/** GET autenticado que devuelve bytes (el PDF); `api()` sólo sabe de texto. */
async function getBytes(ctx: Ctx, path: string): Promise<Buffer> {
  const token = await resolveCredential(ctx);
  const base = (await resolveBaseUrl()).replace(/\/$/, "");
  const res = await fetch(`${base}/api/v2${path}`, { headers: { Authorization: `Bearer ${token}` } });
  if (!res.ok) throw new EasybitsError(res.status, await res.text());
  return Buffer.from(await res.arrayBuffer());
}

const PAGES_USAGE = "easybits documents pages <ls|get|set> <document> [<page>] [<file.html|->] [--out FILE]";
const EXPORT_USAGE = "easybits documents export <pdf|png> <document> [--out PATH] [--pages 1,3]";

export const documents: Command = {
  name: "documents",
  aliases: ["document", "doc"],
  group: "Content",
  summary: "Documents (/dash/documents): pages of HTML you write, published and exported to PDF/PNG",
  synopsis: "documents <ls|get|create|…>",
  subs: {
    ls: {
      aliases: ["list"],
      summary: "List your documents, newest first",
      usage: "easybits documents ls [--search TEXT] [--limit N]",
      options: {
        search: { type: "string", value: "text", description: "Only documents whose name contains this" },
        limit: { type: "string", value: "n", description: "How many (default 20, max 100)" },
      },
      examples: ["easybits documents ls", 'easybits documents ls --search cotización --json'],
      async run(ctx) {
        const q = new URLSearchParams();
        const search = str(ctx, "search");
        const limit = str(ctx, "limit");
        if (search) q.set("search", search);
        if (limit) q.set("limit", limit);
        const r = await api<{ total: number; items: DocRow[] }>(ctx, "GET", `/documents${q.size ? `?${q}` : ""}`);
        emit(ctx, r, () => {
          table(
            r.items.map((d) => ({ ...d, url: d.shareUrl ?? t("(not published)", "(sin publicar)"), updatedAt: fmtDate(d.updatedAt) })),
            [["id", "ID"], ["name", "NAME"], ["pageCount", "PAGES"], ["updatedAt", "MODIFIED"], ["url", "URL"]],
            t('No documents yet. Create one: easybits documents create --name "…" --html page.html', 'Todavía no hay documentos. Crea uno: easybits documents create --name "…" --html pagina.html'),
          );
          if (r.total > r.items.length) console.log(t(`(${r.items.length} of ${r.total}; --limit up to 100 or --search)`, `(${r.items.length} de ${r.total}; --limit hasta 100 o --search)`));
        });
      },
    },
    get: {
      summary: "Show one document: format, URL and its pages",
      usage: "easybits documents get <document>",
      examples: ["easybits documents get 'Cotización ACME'", "easybits documents get 6650f0c2a1b2c3d4e5f60718 --json"],
      async run(ctx) {
        const id = need(ctx, 0, "document", this.usage);
        const doc = await getDoc(ctx, id);
        emit(ctx, doc, () => {
          const f = doc.metadata?.format;
          console.log(`${doc.name}  (${doc.id})`);
          console.log(`${t("Format", "Formato")}: ${f ? `${f.width}×${f.height}px` : t("letter", "carta")}   ${t("Theme", "Tema")}: ${doc.metadata?.theme || doc.theme}`);
          console.log(`URL: ${doc.shareUrl ?? t("(not published: easybits documents deploy)", "(sin publicar: easybits documents deploy)")}`);
          if (doc.pdfUrl) console.log(`PDF: ${doc.pdfUrl}`);
          console.log("");
          table(sized(pageRows(pagesOf(doc))), [["n", "#"], ["id", "ID"], ["label", "NAME"], ["size", "SIZE"]], t("No pages.", "Sin páginas."));
        });
      },
    },
    create: {
      aliases: ["new"],
      summary: "Create a document from HTML files (one page each) or a blank page",
      usage: "easybits documents create --name <name> [--html <file>…] [--format <preset|WxH>] [--theme <theme>] [--brand-kit <id>]",
      options: {
        name: { type: "string", value: "name", description: "Document name" },
        html: { type: "string", multiple: true, value: "file", description: "A page's HTML, in order (repeatable; - reads stdin). Without it: one blank page" },
        format: { type: "string", value: "preset|WxH", description: "letter (default), ig-feed, ig-square, ig-story, li-feed, slide-16-9, tiktok… or WxH in px" },
        theme: { type: "string", value: "theme", description: "Theme name (default: your brand kit or default)" },
        "brand-kit": { type: "string", value: "id", description: "Brand kit to apply (default: your default kit)" },
      },
      examples: [
        'easybits documents create --name "Cotización ACME" --html portada.html --html precios.html',
        'easybits documents create --name "Carrusel" --format ig-feed --json   # one blank 1080x1350 page',
      ],
      async run(ctx) {
        const name = str(ctx, "name");
        if (!name?.trim()) throw usageError(t("Missing --name.", "Falta --name."), this.usage);
        const { body: format, dims } = docFormat(str(ctx, "format"), this.usage);
        // Leer todo antes de crear nada: un archivo que falta no deja un documento a medias.
        const pagesHtml: string[] = [];
        for (const f of list(ctx, "html")) pagesHtml.push(await readHtml(f, this.usage));
        const body: Record<string, unknown> = { name };
        if (format) body.format = format;
        const theme = str(ctx, "theme");
        const kit = str(ctx, "brand-kit");
        if (theme) body.theme = theme;
        if (kit) body.brandKitId = kit;
        const { document: doc } = await api<{ document: { id: string; name: string } }>(ctx, "POST", "/documents", body);
        // Las páginas por la ruta de páginas: ahí se normaliza el HTML (doctype, estilos) al
        // alto del documento, igual que con set_page_html.
        const htmls = pagesHtml.length ? pagesHtml : [blankPageHtml(dims)];
        const pages: DocPage[] = [];
        for (const html of htmls) pages.push(await api<DocPage>(ctx, "POST", `${docPath(doc.id)}/pages`, html ? { html } : {}));
        const out = { id: doc.id, name: doc.name, format: dims, pages: pages.map((p) => ({ id: p.id, label: p.label })), editorUrl: await editorUrl(doc.id) };
        emit(ctx, out, () => {
          console.log(t(`Created ${doc.name} (${doc.id}) with ${pages.length} page(s).`, `Creado ${doc.name} (${doc.id}) con ${pages.length} página(s).`));
          console.log(`${t("Editor", "Editor")}: ${out.editorUrl}`);
          console.log(t(`Next: easybits documents pages set ${doc.id} 1 page.html  ·  easybits documents deploy ${doc.id}`, `Sigue: easybits documents pages set ${doc.id} 1 pagina.html  ·  easybits documents deploy ${doc.id}`));
        });
      },
    },
    pages: {
      summary: "List pages, print one page's HTML, or replace it with a file",
      usage: PAGES_USAGE,
      options: {
        out: { type: "string", value: "file", description: "get: write the HTML to this file instead of stdout" },
      },
      examples: [
        "easybits documents pages ls 'Cotización ACME'",
        "easybits documents pages get 'Cotización ACME' 2 --out precios.html",
        "easybits documents pages set 'Cotización ACME' 2 precios.html",
        "cat page.html | easybits documents pages set 'Cotización ACME' 1 -",
      ],
      async run(ctx) {
        const action = need(ctx, 0, "ls|get|set", PAGES_USAGE);
        const id = need(ctx, 1, "document", PAGES_USAGE);
        if (!["ls", "get", "set"].includes(action)) throw usageError(t(`Unknown pages action "${action}".`, `Acción de pages desconocida "${action}".`), PAGES_USAGE);
        const doc = await getDoc(ctx, id);
        const pages = pagesOf(doc);
        if (action === "ls") {
          const rows = pageRows(pages);
          emit(ctx, rows, () => table(sized(rows), [["n", "#"], ["id", "ID"], ["label", "NAME"], ["size", "SIZE"]], t("No pages.", "Sin páginas.")));
          return;
        }
        const page = pageRef(pages, need(ctx, 2, "page", PAGES_USAGE), PAGES_USAGE);
        if (action === "get") {
          const p = await api<DocPage>(ctx, "GET", `${docPath(id)}/pages/${encodeURIComponent(page.id)}`);
          const out = str(ctx, "out");
          if (out) {
            writeFileSync(out, p.html ?? "");
            emit(ctx, { id: p.id, out, bytes: (p.html ?? "").length }, () => console.log(t(`Wrote ${fmtBytes((p.html ?? "").length)} to ${out}`, `Escribí ${fmtBytes((p.html ?? "").length)} en ${out}`)));
          } else emit(ctx, p, () => process.stdout.write((p.html ?? "") + "\n"));
          return;
        }
        const html = await readHtml(need(ctx, 3, "file.html|-", PAGES_USAGE), PAGES_USAGE);
        const r = await api<{ success: boolean; pageId: string; noop?: boolean }>(ctx, "PATCH", `${docPath(id)}/pages/${encodeURIComponent(page.id)}`, { html });
        emit(ctx, r, () =>
          console.log(r.noop ? t("No change: the page already had that HTML.", "Sin cambios: la página ya tenía ese HTML.") : t(`Page ${pages.indexOf(page) + 1} updated (${page.id}).`, `Página ${pages.indexOf(page) + 1} actualizada (${page.id}).`)),
        );
      },
    },
    "add-page": {
      summary: "Add a page from an HTML file (blank without one)",
      usage: "easybits documents add-page <document> [<file.html|->] [--after N] [--label NAME]",
      options: {
        after: { type: "string", value: "n", description: "Insert after page N (0 = first; default: at the end)" },
        label: { type: "string", value: "name", description: "Page name in the editor" },
      },
      examples: ["easybits documents add-page 'Cotización ACME' anexo.html", "easybits documents add-page 'Cotización ACME' portada.html --after 0 --label Portada"],
      async run(ctx) {
        const id = need(ctx, 0, "document", this.usage);
        const file = ctx.args[1];
        const body: Record<string, unknown> = {};
        if (file) body.html = await readHtml(file, this.usage);
        const after = str(ctx, "after");
        if (after != null) {
          if (!/^\d+$/.test(after)) throw usageError(t("--after must be a page number (0 = first).", "--after debe ser un número de página (0 = al inicio)."), this.usage);
          body.afterPageIndex = Number(after) - 1;
        }
        const label = str(ctx, "label");
        if (label) body.label = label;
        if (!file) {
          // Sin archivo: página en blanco del tamaño del documento (la de la API es carta).
          const doc = await getDoc(ctx, id);
          const html = blankPageHtml(doc.metadata?.format ?? null);
          if (html) body.html = html;
        }
        const p = await api<DocPage>(ctx, "POST", `${docPath(id)}/pages`, body);
        emit(ctx, p, () => console.log(t(`Added page ${p.label ?? ""} (${p.id}).`, `Agregué la página ${p.label ?? ""} (${p.id}).`)));
      },
    },
    "rm-page": {
      summary: "Delete one page (a document keeps at least one)",
      usage: "easybits documents rm-page <document> <page> [--yes]",
      options: { ...YES_OPTION },
      examples: ["easybits documents rm-page 'Cotización ACME' 3 --yes"],
      async run(ctx) {
        const id = need(ctx, 0, "document", this.usage);
        const ref = need(ctx, 1, "page", this.usage);
        requireYesIfHeadless(ctx);
        const pages = pagesOf(await getDoc(ctx, id));
        const page = pageRef(pages, ref, this.usage);
        await confirm(ctx, t(`Delete page ${pages.indexOf(page) + 1} (${page.label || page.id})?`, `¿Borrar la página ${pages.indexOf(page) + 1} (${page.label || page.id})?`));
        const r = await api<{ success: boolean; remainingPages: number }>(ctx, "DELETE", `${docPath(id)}/pages/${encodeURIComponent(page.id)}`);
        emit(ctx, r, () => console.log(t(`Deleted. ${r.remainingPages} page(s) left.`, `Borrada. Quedan ${r.remainingPages} página(s).`)));
      },
    },
    reorder: {
      summary: "Put the pages in a new order (every page, by number or id)",
      usage: "easybits documents reorder <document> <page>…",
      examples: ["easybits documents reorder 'Cotización ACME' 1 3 2   # swap pages 2 and 3"],
      async run(ctx) {
        const id = need(ctx, 0, "document", this.usage);
        if (ctx.args.length < 2) throw usageError(t("Give the new order: every page by number or id.", "Pasa el orden nuevo: cada página por número o id."), this.usage);
        const pageIds = reorderIds(pagesOf(await getDoc(ctx, id)), ctx.args.slice(1), this.usage);
        const r = await api<Array<{ id: string; order: number; label?: string }>>(ctx, "PUT", `${docPath(id)}/pages/reorder`, { pageIds });
        emit(ctx, r, () => table(r.map((p) => ({ n: p.order + 1, id: p.id, label: p.label ?? "-" })), [["n", "#"], ["id", "ID"], ["label", "NAME"]]));
      },
    },
    deploy: {
      aliases: ["publish"],
      summary: "Publish (or republish) the document at its public URL",
      usage: "easybits documents deploy <document>",
      examples: ["easybits documents deploy 'Cotización ACME'"],
      async run(ctx) {
        const id = need(ctx, 0, "document", this.usage);
        const r = await withProgress(ctx, t("Publishing…", "Publicando…"), () =>
          api<{ url: string; slug: string; websiteId: string; customUrl?: string; pdfUrl?: string | null }>(ctx, "POST", `${docPath(id)}/deploy`),
        );
        emit(ctx, r, () => {
          console.log(`URL: ${r.customUrl ?? r.url}`);
          if (r.pdfUrl) console.log(`PDF: ${r.pdfUrl}`);
        });
      },
    },
    export: {
      summary: "Render to a PDF file or to one PNG per page (rendered on the server)",
      usage: EXPORT_USAGE,
      options: {
        out: { type: "string", value: "path", description: "pdf: the file (default <name>.pdf); png: the folder (default .)" },
        pages: { type: "string", value: "1,3", description: "Only these pages (numbers or ids, comma-separated)" },
      },
      examples: [
        "easybits documents export pdf 'Cotización ACME' --out cotizacion.pdf",
        "easybits documents export png Carrusel --out ./slides   # one PNG per page at its exact size",
      ],
      async run(ctx) {
        const kind = need(ctx, 0, "pdf|png", EXPORT_USAGE);
        if (kind !== "pdf" && kind !== "png") throw usageError(t(`Export as pdf or png, not "${kind}".`, `Exporta como pdf o png, no "${kind}".`), EXPORT_USAGE);
        const id = need(ctx, 1, "document", EXPORT_USAGE);
        const doc = await getDoc(ctx, id);
        const pages = pagesOf(doc);
        const only = str(ctx, "pages");
        const ids = only ? only.split(",").map((r) => pageRef(pages, r.trim(), EXPORT_USAGE).id) : [];
        const qs = ids.length ? `?sections=${ids.map(encodeURIComponent).join(",")}` : "";
        const out = str(ctx, "out");
        if (kind === "pdf") {
          const file = out ?? `${safeName(doc.name)}.pdf`;
          const pdf = await withProgress(ctx, t("Rendering the PDF…", "Renderizando el PDF…"), () => getBytes(ctx, `${docPath(id)}/pdf${qs}`));
          writeFileSync(file, pdf);
          emit(ctx, { file, bytes: pdf.length }, () => console.log(t(`Wrote ${fmtBytes(pdf.length)} to ${file}`, `Escribí ${fmtBytes(pdf.length)} en ${file}`)));
          return;
        }
        const dir = out ?? ".";
        if (existsSync(dir) && !statSync(dir).isDirectory()) throw usageError(t(`--out for png is a folder; ${dir} is a file.`, `--out para png es una carpeta; ${dir} es un archivo.`), EXPORT_USAGE);
        mkdirSync(dir, { recursive: true });
        const files = await withProgress(ctx, t(`Rendering ${ids.length || pages.length} page(s)…`, `Renderizando ${ids.length || pages.length} página(s)…`), async (p) => {
          const r = await api<{ files: Array<{ id: string; url: string; width?: number; height?: number; sectionId?: string }> }>(ctx, "GET", `${docPath(id)}/images${qs}`);
          const saved: Array<{ page: number; file: string; url: string; fileId: string; bytes: number }> = [];
          for (const [i, f] of r.files.entries()) {
            p.update(t(`Downloading ${i + 1}/${r.files.length}…`, `Bajando ${i + 1}/${r.files.length}…`));
            // El archivo lleva el número de página del editor, no el orden de la exportación.
            const page = pages.findIndex((x) => x.id === f.sectionId) + 1 || i + 1;
            const file = join(dir, `${safeName(doc.name)}-${String(page).padStart(2, "0")}.png`);
            saved.push({ page, file, url: f.url, fileId: f.id, bytes: await download(f.url, file) });
          }
          return saved;
        });
        emit(ctx, { files }, () => {
          for (const f of files) console.log(`${f.file}  ${fmtBytes(f.bytes)}`);
        });
      },
    },
    rm: {
      aliases: ["delete"],
      summary: "Delete a document (irreversible)",
      usage: "easybits documents rm <document> [--yes]",
      options: { ...YES_OPTION },
      examples: ["easybits documents rm 'Borrador viejo' --yes"],
      async run(ctx) {
        const id = need(ctx, 0, "document", this.usage);
        requireYesIfHeadless(ctx);
        const doc = await getDoc(ctx, id);
        await confirm(ctx, t(`Delete the document "${doc.name}" (${pagesOf(doc).length} pages)? This cannot be undone.`, `¿Borrar el documento "${doc.name}" (${pagesOf(doc).length} páginas)? No se puede deshacer.`));
        const r = await api<{ success: boolean }>(ctx, "DELETE", docPath(id));
        emit(ctx, { ...r, id }, () => console.log(t(`Deleted ${doc.name}.`, `Borré ${doc.name}.`)));
      },
    },
  },
};
