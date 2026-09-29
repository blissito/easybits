// Nombres en vez de ids: la parte PURA (sin I/O). Qué posicional de qué comando es un
// recurso y cómo se empata un nombre contra la lista. La parte con red vive en resolve.ts.
// Sin imports a propósito: el test lo carga directo con --experimental-strip-types.

export type RefKind = "agent" | "sandbox" | "db";

/** Lo mínimo de cada recurso para empatar: id, nombre y (si hay) estado. */
export type NamedRef = { id: string; name?: string | null; status?: string | null };

// Formato de id de cada recurso. Lo que empata pasa directo, sin listar nada.
// agent y db = ObjectId de Mongo; sandbox (y máquina) = `sb_<uuid>`.
const ID_FORMAT: Record<RefKind, RegExp> = {
  agent: /^[0-9a-f]{24}$/i,
  db: /^[0-9a-f]{24}$/i,
  sandbox: /^sb_[0-9a-z-]+$/i,
};

export const looksLikeId = (kind: RefKind, ref: string) => ID_FORMAT[kind].test(ref);

/**
 * La tabla: `"<comando> <subcomando>"` → qué posicional es el recurso. UN solo lugar;
 * index.ts la consulta antes de correr la hoja y reemplaza el nombre por el id.
 * Las máquinas son cajas permanentes: salen en la misma lista que los sandboxes.
 */
export const REF_ARGS: Record<string, { index: number; kind: RefKind }> = {
  "agents get": { index: 0, kind: "agent" },
  "agents message": { index: 0, kind: "agent" },
  "agents destroy": { index: 0, kind: "agent" },
  "sandboxes get": { index: 0, kind: "sandbox" },
  "sandboxes exec": { index: 0, kind: "sandbox" },
  "sandboxes logs": { index: 0, kind: "sandbox" },
  "sandboxes files": { index: 1, kind: "sandbox" },
  "sandboxes suspend": { index: 0, kind: "sandbox" },
  "sandboxes resume": { index: 0, kind: "sandbox" },
  "sandboxes destroy": { index: 0, kind: "sandbox" },
  "sandboxes snapshot": { index: 0, kind: "sandbox" },
  "machines deploy": { index: 0, kind: "sandbox" },
  "machines releases": { index: 0, kind: "sandbox" },
  "machines logs": { index: 0, kind: "sandbox" },
  "machines rollback": { index: 0, kind: "sandbox" },
  "machines secrets": { index: 1, kind: "sandbox" },
  "domains ls": { index: 0, kind: "sandbox" },
  "domains add": { index: 0, kind: "sandbox" },
  "domains verify": { index: 0, kind: "sandbox" },
  "domains rm": { index: 0, kind: "sandbox" },
  "db rm": { index: 0, kind: "db" },
  "db tables": { index: 0, kind: "db" },
  "db query": { index: 0, kind: "db" },
};

export type MatchResult =
  | { ok: true; id: string }
  | { ok: false; reason: "not_found" }
  | { ok: false; reason: "ambiguous"; matches: NamedRef[] };

/**
 * Id tal cual (si tiene el formato, o si existe en la lista) o nombre exacto sin
 * distinguir mayúsculas. Varios con el mismo nombre = ambiguo: nunca se adivina.
 */
export function matchRef(kind: RefKind, ref: string, items: NamedRef[] | null): MatchResult {
  if (looksLikeId(kind, ref)) return { ok: true, id: ref };
  const list = items ?? [];
  if (list.some((x) => x.id === ref)) return { ok: true, id: ref };
  const want = ref.trim().toLowerCase();
  const matches = list.filter((x) => (x.name ?? "").trim().toLowerCase() === want);
  if (matches.length === 1) return { ok: true, id: matches[0].id };
  if (matches.length === 0) return { ok: false, reason: "not_found" };
  return { ok: false, reason: "ambiguous", matches };
}
