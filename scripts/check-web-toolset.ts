/**
 * Verificación REAL del toolset `web` contra el proveedor (no vitest: test/setup.ts
 * reemplaza process.env). Corre: npx tsx scripts/check-web-toolset.ts [userId]
 *
 * ⚠️ El unlocker (fetch/crawl/mercadolibre) NO pasa desde IP residencial de la
 * Mac (el proveedor la re-bloquea solo); desde Fly/OVH sí. SERP y extract con
 * esquema sí funcionan desde local. Con --fly se salta lo que necesita unlocker.
 */
import "dotenv/config";
import { getService } from "../app/.server/services/registry";

const skipUnlocker = process.argv.includes("--local");
const userId = process.argv.find((a) => /^[0-9a-f]{24}$/.test(a)) ?? "000000000000000000000000";
const ctx = { userId };
const t0 = Date.now();
const log = (s: string) => console.log(`[${((Date.now() - t0) / 1000).toFixed(1)}s] ${s}`);
let fails = 0;
const check = (name: string, ok: boolean, detail = "") => { log(`${ok ? "✅" : "❌"} ${name} ${detail}`); if (!ok) fails++; };

async function main() {
  // search
  const search = getService("research.brightdata.search")!;
  const s = (await search.execute({ query: "ubiquiti u6 mesh precio", country: "mx" }, ctx)) as any;
  const organic = s.data.results?.organic ?? [];
  check("web_search", organic.length > 0, `${organic.length} orgánicos, 1º: ${organic[0]?.link}`);

  // extract con esquema (Maps) — async
  const extract = getService("research.brightdata.extract")!;
  const status = getService("research.brightdata.extractStatus")!;
  const job = (await extract.execute({ source: "google_maps", input: [{ keyword: "dentista Polanco CDMX", country: "MX" }], limit: 3 }, ctx)) as any;
  check("web_extract trigger", job.data.status === "running" && !!job.data.jobId && job.cost === 0, job.data.jobId);
  let st: any;
  for (let i = 0; i < 12; i++) {
    await new Promise((r) => setTimeout(r, 15_000));
    st = await status.execute({ jobId: job.data.jobId }, ctx);
    log(`  status: ${st.data.status}`);
    if (st.data.status !== "running") break;
  }
  check("web_extract_status ready", st?.data.status === "done" && (st.data.total ?? 0) > 0, `${st?.data.total} registros, cobra ${st?.cost}; 1º: ${st?.data.records?.[0]?.name} ${st?.data.records?.[0]?.phone_number ?? ""}`);
  const again = (await status.execute({ jobId: job.data.jobId }, ctx)) as any;
  check("web_extract_status no cobra dos veces", again.cost === 0 && again.data.total === st.data.total);

  if (skipUnlocker) { log("(--local: fetch/crawl/mercadolibre saltados)"); return; }

  const scrape = getService("research.brightdata.scrape")!;
  const f = (await scrape.execute({ url: "https://www.amazon.com.mx/dp/B09YRZYB29", country: "mx", asMarkdown: true }, ctx)) as any;
  check("web_fetch", f.data.statusCode === 200 && /U6/.test(f.data.body), `${f.data.body.length} chars`);

  const meli = (await extract.execute({ source: "mercadolibre", input: { query: "iphone 15" }, limit: 48 }, ctx)) as any;
  check("web_extract mercadolibre", meli.data.status === "done" && meli.data.total >= 40 && meli.cost === meli.data.total, `${meli.data.total} productos, 1º: ${meli.data.records?.[0]?.title} $${meli.data.records?.[0]?.price}`);

  const crawl = getService("research.brightdata.crawl")!;
  const c = (await crawl.execute({ url: "https://www.easybits.cloud/docs", maxPages: 3 }, ctx)) as any;
  check("web_crawl", c.data.pages.length >= 1 && c.cost === c.data.pages.length, `${c.data.pages.length} páginas, ${c.data.pending.length} pendientes`);
}

main().then(() => { log(fails ? `${fails} fallos` : "todo ok"); process.exit(fails ? 1 : 0); }).catch((e) => { console.error(e); process.exit(1); });
