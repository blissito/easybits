import { writeFileSync } from "node:fs";
import { EasybitsError } from "@easybits.cloud/sdk";
import type { Command, Ctx } from "../types.js";
import { bool, int, list, need, str } from "../args.js";
import { emit, fmtBytes, table } from "../output.js";
import { getClient } from "../client.js";
import { CliError, EXIT, usageError } from "../errors.js";
import { t } from "../i18n.js";

// Toolset `web` (buscar, leer, extraer, rastrear). Se mide en consultas, no en créditos:
// sin saldo la API responde 402 con la liga de compra; aquí se da esa liga, no la del plan.

const ENGINES = ["google", "bing", "yandex", "duckduckgo"];
const PACKS_URL = "https://www.easybits.cloud/dash/packs?tab=web";

async function web<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (e) {
    if (e instanceof EasybitsError && e.status === 402) {
      const buy = /"buy"\s*:\s*"([^"]+)"/.exec(String(e.body ?? ""))?.[1] ?? PACKS_URL;
      throw new CliError(t("No web queries left.", "Ya no te quedan consultas web."), EXIT.API, t(`Buy a pack: ${buy}`, `Compra un paquete: ${buy}`), "quota_exceeded", 402);
    }
    if (e instanceof EasybitsError && e.status === 429) {
      throw new CliError(t("The source is cooling down that query.", "La fuente puso esa consulta en pausa."), EXIT.API, t("Try again in about a minute.", "Vuelve a intentar en un minuto."), "upstream_cooldown", 429);
    }
    throw e;
  }
}

type Organic = { title?: string; link?: string; url?: string; description?: string };

/** Los resultados orgánicos de un SERP, sea cual sea el motor. Puro, con test. */
export function organicResults(results: unknown): Array<{ rank: number; title: string; url: string }> {
  const r = (results ?? {}) as { organic?: Organic[] };
  const items = Array.isArray(r.organic) ? r.organic : Array.isArray(results) ? (results as Organic[]) : [];
  return items
    .map((o, i) => ({ rank: i + 1, title: (o.title ?? "").trim(), url: o.link ?? o.url ?? "" }))
    .filter((o) => o.url);
}

/** `--input` (JSON) o `--url` repetido → el `input` que pide extract. */
export function extractInput(inputJson: string | undefined, urls: string[], usage: string): Record<string, unknown> | Record<string, unknown>[] {
  if (inputJson && urls.length) throw usageError(t("Pass --input or --url, not both.", "Pasa --input o --url, no ambos."), usage);
  if (urls.length) return urls.map((url) => ({ url }));
  if (!inputJson) throw usageError(t("Missing --input <json> (or --url <url>).", "Falta --input <json> (o --url <url>)."), usage);
  try {
    const v = JSON.parse(inputJson);
    if (v && typeof v === "object") return v;
  } catch {
    /* abajo */
  }
  throw usageError(t(`--input must be a JSON object or array, got: ${inputJson}`, `--input debe ser un objeto o arreglo JSON, llegó: ${inputJson}`), usage);
}

function printJob(ctx: Ctx, job: { jobId: string; status: string; source: string; records?: unknown[]; total?: number; error?: string }) {
  emit(ctx, job, () => {
    if (job.status === "running") {
      console.log(t(`Job ${job.jobId} running (${job.source}). Check it with: easybits web extract-status ${job.jobId}`, `Trabajo ${job.jobId} corriendo (${job.source}). Revísalo con: easybits web extract-status ${job.jobId}`));
    } else if (job.status === "error") {
      console.log(t(`Job ${job.jobId} failed: ${job.error ?? "unknown error"}`, `El trabajo ${job.jobId} falló: ${job.error ?? "error desconocido"}`));
    } else {
      // Los registros cambian de forma por fuente: JSON, uno por renglón (jq-friendly).
      for (const r of job.records ?? []) console.log(JSON.stringify(r));
      console.error(t(`${job.records?.length ?? 0} records (${job.source}).`, `${job.records?.length ?? 0} registros (${job.source}).`));
    }
  });
  if (job.status === "error") process.exitCode = EXIT.API;
}

export const webCmd: Command = {
  name: "web",
  group: "Web",
  summary: "Search, read, extract and crawl the web (metered in web queries)",
  synopsis: "web",
  subs: {
    search: {
      summary: "Search Google, Bing, Yandex or DuckDuckGo (1 query)",
      usage: "easybits web search <query...> [--engine google|bing|yandex|duckduckgo] [--country <cc>]",
      options: {
        engine: { type: "string", value: "name", description: "google (default), bing, yandex or duckduckgo" },
        country: { type: "string", value: "cc", description: "ISO country for localized results (mx, us…)" },
      },
      examples: ["easybits web search dentista polanco --country mx", "easybits web search \"react router 7 loaders\" --json | jq '.results.organic[0]'"],
      async run(ctx) {
        const query = ctx.args.join(" ").trim();
        if (!query) throw usageError(t("Missing <query>.", "Falta <query>."), this.usage);
        const engine = str(ctx, "engine");
        if (engine && !ENGINES.includes(engine)) throw usageError(t(`--engine must be one of: ${ENGINES.join(", ")}.`, `--engine debe ser uno de: ${ENGINES.join(", ")}.`), this.usage);
        const eb = await getClient(ctx);
        const r = await web(() => eb.webSearch({ query, engine: engine as any, country: str(ctx, "country") }));
        emit(ctx, r, () => table(organicResults(r.results), [["rank", "#"], ["title", "TITLE"], ["url", "URL"]], t("No results.", "Sin resultados.")));
      },
    },
    fetch: {
      summary: "Read a page even if it blocks bots: raw HTML or clean markdown (1 query)",
      usage: "easybits web fetch <url> [--markdown] [--main] [--country <cc>] [--out <file>]",
      options: {
        markdown: { type: "boolean", description: "Clean markdown instead of raw HTML" },
        main: { type: "boolean", description: "With --markdown: drop nav, footer and icons" },
        country: { type: "string", value: "cc", description: "ISO country to fetch from (mx, us…)" },
        out: { type: "string", value: "file", description: "Save the body to a file instead of stdout" },
      },
      examples: ["easybits web fetch https://example.com --markdown --main", "easybits web fetch https://example.com --out page.html"],
      async run(ctx) {
        const url = need(ctx, 0, "url", this.usage);
        const asMarkdown = bool(ctx, "markdown");
        if (bool(ctx, "main") && !asMarkdown) throw usageError(t("--main only works with --markdown.", "--main sólo funciona con --markdown."), this.usage);
        const eb = await getClient(ctx);
        const r = await web(() => eb.webFetch({ url, asMarkdown, onlyMainContent: bool(ctx, "main") || undefined, country: str(ctx, "country") }));
        const out = str(ctx, "out");
        if (out) {
          writeFileSync(out, r.body);
          const { body: _b, ...meta } = r;
          emit(ctx, { ...meta, out, bytes: Buffer.byteLength(r.body) }, () => console.error(t(`Saved ${fmtBytes(Buffer.byteLength(r.body))} to ${out} (HTTP ${r.statusCode})`, `Guardé ${fmtBytes(Buffer.byteLength(r.body))} en ${out} (HTTP ${r.statusCode})`)));
          return;
        }
        emit(ctx, r, () => process.stdout.write(r.body.endsWith("\n") ? r.body : r.body + "\n"));
      },
    },
    extract: {
      summary: "Structured records from a known source (Google Maps, Mercado Libre…); 1 query per record",
      usage: "easybits web extract <source> (--input <json> | --url <url>...) [--limit <n>] [--wait]",
      options: {
        input: { type: "string", value: "json", description: 'Input for the source: [{"keyword":"…","country":"MX"}], {"query":"…"} or [{"url":"…"}]' },
        url: { type: "string", multiple: true, value: "url", description: "Shortcut for --input '[{\"url\":…}]' (repeatable)" },
        limit: { type: "string", value: "n", description: "Max records per input (default 20, max 200)" },
        dataset: { type: "string", value: "id", description: "Catalog dataset id, for sources not on the list (source becomes optional)" },
        wait: { type: "boolean", description: "Wait for the job to finish (polls every 15 s, up to 5 min)" },
      },
      examples: [
        "easybits web extract google_maps --input '[{\"keyword\":\"dentista Polanco CDMX\",\"country\":\"MX\"}]' --limit 50 --wait",
        "easybits web extract mercadolibre --input '{\"query\":\"iphone 15\"}' --json",
        "easybits web extract instagram_profiles --url https://instagram.com/easybits --wait",
      ],
      async run(ctx) {
        const dataset = str(ctx, "dataset");
        const source = ctx.args[0];
        if (!source && !dataset) throw usageError(t("Missing <source> (or --dataset <id>).", "Falta <source> (o --dataset <id>)."), this.usage);
        const input = extractInput(str(ctx, "input"), list(ctx, "url"), this.usage);
        const limit = int(ctx, "limit", this.usage);
        const params = { source, datasetId: dataset, input, limit };
        const eb = await getClient(ctx);
        const job = await web(() => (bool(ctx, "wait") ? eb.webExtractAndWait(params) : eb.webExtract(params)));
        printJob(ctx, job);
      },
    },
    "extract-status": {
      summary: "Check an extract job; when done, prints its records",
      usage: "easybits web extract-status <jobId>",
      examples: ["easybits web extract-status j_abc123", "easybits web extract-status j_abc123 --json | jq '.records | length'"],
      async run(ctx) {
        const jobId = need(ctx, 0, "jobId", this.usage);
        const eb = await getClient(ctx);
        printJob(ctx, await web(() => eb.webExtractStatus(jobId)));
      },
    },
    crawl: {
      summary: "Read a page and follow its internal links as markdown (1 query per page)",
      usage: "easybits web crawl <url> [--max-pages <n>] [--main] [--country <cc>]",
      options: {
        "max-pages": { type: "string", value: "n", description: "Pages to read, 1-20 (default 10)" },
        main: { type: "boolean", description: "Drop nav, footer and icons from each page (good for RAG)" },
        country: { type: "string", value: "cc", description: "ISO country to fetch from (mx, us…)" },
      },
      examples: ["easybits web crawl https://docs.example.com --max-pages 5 --main", "easybits web crawl https://example.com --json | jq '.pages[].url'"],
      async run(ctx) {
        const url = need(ctx, 0, "url", this.usage);
        const maxPages = int(ctx, "max-pages", this.usage);
        if (maxPages != null && (maxPages < 1 || maxPages > 20)) throw usageError(t("--max-pages must be 1-20.", "--max-pages debe ser de 1 a 20."), this.usage);
        const eb = await getClient(ctx);
        const r = await web(() => eb.webCrawl({ url, maxPages, onlyMainContent: bool(ctx, "main") || undefined, country: str(ctx, "country") }));
        emit(ctx, r, () => {
          for (const p of r.pages) console.log(`<!-- ${p.url} -->\n${p.markdown.trim()}\n`);
          console.error(
            t(`${r.pages.length} pages; ${r.pending.length} links not visited (--json to get them).`, `${r.pages.length} páginas; ${r.pending.length} links sin visitar (--json para verlos).`),
          );
        });
      },
    },
  },
};
