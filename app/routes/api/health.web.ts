import { readWebCanary } from "~/.server/core/webJobsOperations";

// Más de 3 periodos del canario (15 min) sin dato = no sabemos, y se dice.
const STALE_MS = 45 * 60_000;

// GET /api/health/web — último resultado del canario del toolset web. Público y barato:
// no sale a internet, sólo lee lo que guardó el cron `check-web`.
// Ruta de RECURSO: sin `export default` (si no, React Router sirve el shell de la SPA).
export async function loader() {
  const c = await readWebCanary().catch(() => null);
  const stale = !c || Date.now() - new Date(c.at).getTime() > STALE_MS;
  const status = stale ? "unknown" : c.status;
  const probe = (p?: { ok: boolean; ms: number }) => (p ? { ok: p.ok, ms: p.ms } : null);
  return Response.json(
    {
      status,
      checkedAt: c?.at ?? null,
      search: probe(c?.search),
      fetch: probe(c?.fetch),
      extract: probe(c?.meli),
    },
    {
      status: status === "down" ? 503 : 200,
      headers: { "Cache-Control": "public, max-age=60" },
    },
  );
}
