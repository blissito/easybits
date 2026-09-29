// Nombres en vez de ids: la parte con red. index.ts llama `resolveRefs` antes de correr
// la hoja; la tabla y el empate viven en refs.ts (puro, con tests).
import type { Ctx } from "./types.js";
import { getClient } from "./client.js";
import { CliError, EXIT } from "./errors.js";
import { REF_ARGS, matchRef, looksLikeId, type NamedRef, type RefKind } from "./refs.js";

const LS_HINT: Record<RefKind, string> = {
  agent: "easybits agents ls",
  sandbox: "easybits sandboxes ls",
  db: "easybits db ls",
};

const NOUN: Record<RefKind, string> = { agent: "agent", sandbox: "sandbox or machine", db: "database" };

// Una lista por tipo y por corrida: dos referencias del mismo tipo no piden dos veces.
const cache = new Map<RefKind, Promise<NamedRef[]>>();

export function listRefs(ctx: Ctx, kind: RefKind): Promise<NamedRef[]> {
  let p = cache.get(kind);
  if (!p) {
    p = (async () => {
      const eb = await getClient(ctx);
      if (kind === "agent") return (await eb.listAgents()).map((a) => ({ id: a.agentId, name: a.name, status: a.status }));
      if (kind === "db") return (await eb.listDatabases()).items.map((d) => ({ id: d.id, name: d.name }));
      return (await eb.sandboxes.list()).map((s) => ({ id: s.sandboxId, name: s.name, status: s.status }));
    })();
    // Si falla (p. ej. 401 que luego se refresca), el reintento vuelve a pedir.
    p.catch(() => cache.delete(kind));
    cache.set(kind, p);
  }
  return p;
}

/** Nombre o id → id. Lanza CliError si no existe o si hay varios con ese nombre. */
export async function resolveRef(ctx: Ctx, kind: RefKind, ref: string): Promise<string> {
  if (looksLikeId(kind, ref)) return ref;
  const r = matchRef(kind, ref, await listRefs(ctx, kind));
  if (r.ok) return r.id;
  if (r.reason === "not_found") {
    throw new CliError(`No ${NOUN[kind]} with id or name "${ref}".`, EXIT.API, `List them with: ${LS_HINT[kind]}`, "not_found", 404);
  }
  const shown = r.matches.slice(0, 10).map((m) => `  ${m.id}${m.status ? `  (${m.status})` : ""}`);
  if (r.matches.length > 10) shown.push(`  …and ${r.matches.length - 10} more`);
  throw new CliError(
    `"${ref}" matches ${r.matches.length} ${kind === "db" ? "databases" : `${kind}s`}. Use the id:`,
    EXIT.USAGE,
    `${shown.join("\n")}\nList them with: ${LS_HINT[kind]}`,
    "ambiguous",
  );
}

/** Reemplaza en `ctx.args` el nombre por el id según la tabla de refs.ts. */
export async function resolveRefs(ctx: Ctx, key: string): Promise<void> {
  const spec = REF_ARGS[key];
  const ref = spec ? ctx.args[spec.index] : undefined;
  // Si falta, la hoja da su propio error de uso con la línea de uso.
  if (!spec || !ref) return;
  ctx.args[spec.index] = await resolveRef(ctx, spec.kind, ref);
}
