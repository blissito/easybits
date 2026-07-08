import crypto from "crypto";
import { db } from "../db";
import type { AuthContext } from "../apiAuth";
import { requireScope } from "../apiAuth";
import { sqldQuery, sqldExec, sqldCreateNamespace, sqldDeleteNamespace } from "../sqld";
import { dispatchWebhooks } from "../webhooks";
import { getUserPlan, PLANS, type PlanKey } from "~/lib/plans";

export const DB_LIMITS: Record<PlanKey, number> = { Byte: 3, Mega: 10, Tera: 20 };

const LOG_TABLE = "_easybits_query_log";
const CREATE_LOG_TABLE_SQL = `CREATE TABLE IF NOT EXISTS "${LOG_TABLE}" (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  sql_text TEXT NOT NULL,
  args TEXT,
  source TEXT NOT NULL DEFAULT 'api',
  rows_affected INTEGER DEFAULT 0,
  duration_ms INTEGER DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'ok',
  error TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
)`;

export type QuerySource = "ui" | "mcp" | "api" | "sdk";

function logQuery(
  namespace: string,
  sqlText: string,
  args: unknown[],
  source: QuerySource,
  durationMs: number,
  rowsAffected: number,
  status: "ok" | "error",
  error?: string
) {
  if (sqlText.includes(LOG_TABLE)) return; // prevent recursion
  sqldExec(namespace, [{
    sql: `INSERT INTO "${LOG_TABLE}" (sql_text, args, source, rows_affected, duration_ms, status, error) VALUES (?, ?, ?, ?, ?, ?, ?)`,
    args: [
      sqlText.slice(0, 4000),
      args.length ? JSON.stringify(args).slice(0, 2000) : null,
      source,
      rowsAffected,
      Math.round(durationMs),
      status,
      error?.slice(0, 1000) || null,
    ],
  }]).catch(() => {}); // fire-and-forget
}

export async function listDatabases(ctx: AuthContext) {
  requireScope(ctx, "READ");
  const databases = await db.database.findMany({
    where: { userId: ctx.user.id },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      name: true,
      namespace: true,
      description: true,
      createdAt: true,
      updatedAt: true,
    },
  });
  return { items: databases };
}

export async function createDatabase(
  ctx: AuthContext,
  opts: { name: string; description?: string }
) {
  requireScope(ctx, "WRITE");

  const name = opts.name.trim();
  if (!name || name.length > 64) {
    throw new Response(
      JSON.stringify({ error: "Name is required and must be ≤64 chars" }),
      { status: 400, headers: { "Content-Type": "application/json" } }
    );
  }

  if (!/^[a-zA-Z0-9_-]+$/.test(name)) {
    throw new Response(
      JSON.stringify({ error: "Name must be alphanumeric, dashes, or underscores" }),
      { status: 400, headers: { "Content-Type": "application/json" } }
    );
  }

  const planKey = getUserPlan(ctx.user);
  const maxDbs = DB_LIMITS[planKey];
  const count = await db.database.count({ where: { userId: ctx.user.id } });
  if (count >= maxDbs) {
    throw new Response(
      JSON.stringify({ error: `Max ${maxDbs} databases on plan ${planKey}. Upgrade at https://www.easybits.cloud/planes` }),
      { status: 400, headers: { "Content-Type": "application/json" } }
    );
  }

  // Check unique name per user
  const existing = await db.database.findUnique({
    where: { userId_name: { userId: ctx.user.id, name } },
  });
  if (existing) {
    throw new Response(
      JSON.stringify({ error: `Database "${name}" already exists` }),
      { status: 409, headers: { "Content-Type": "application/json" } }
    );
  }

  // Genera el id/namespace DEFINITIVO antes de insertar. Antes se insertaba
  // `namespace: ""` como placeholder y se actualizaba después; pero `namespace`
  // es @unique GLOBAL, así que si sqldCreateNamespace/Exec fallaba entre el
  // create y el update, la fila quedaba con "" y ENVENENABA TODA creación de DB
  // siguiente (toda insertaba "" → colisión → 500 global). Incidente 2026-07-08:
  // un solo huérfano tumbó el provisioning de TODOS los teams. Ahora el namespace
  // va desde el create (nunca ""), y si sqld falla borramos la fila (sin fantasma).
  const namespace = crypto.randomBytes(12).toString("hex"); // 24-hex = ObjectId válido
  const database = await db.database.create({
    data: {
      id: namespace,
      name,
      namespace,
      description: opts.description || null,
      userId: ctx.user.id,
    },
  });

  try {
    await sqldCreateNamespace(namespace);
    await sqldExec(namespace, [{ sql: CREATE_LOG_TABLE_SQL }]);
  } catch (e) {
    await db.database.delete({ where: { id: database.id } }).catch(() => {});
    throw e;
  }

  dispatchWebhooks(ctx.user.id, "database.created", {
    id: database.id,
    name: database.name,
  });

  return {
    id: database.id,
    name: database.name,
    namespace: database.namespace,
    description: database.description,
    createdAt: database.createdAt,
  };
}

export async function getDatabase(ctx: AuthContext, dbId: string) {
  requireScope(ctx, "READ");
  const database = await db.database.findUnique({ where: { id: dbId } });
  if (!database || database.userId !== ctx.user.id) {
    throw new Response(JSON.stringify({ error: "Database not found" }), {
      status: 404,
      headers: { "Content-Type": "application/json" },
    });
  }
  return {
    id: database.id,
    name: database.name,
    namespace: database.namespace,
    description: database.description,
    createdAt: database.createdAt,
    updatedAt: database.updatedAt,
  };
}

export async function deleteDatabase(ctx: AuthContext, dbId: string) {
  requireScope(ctx, "DELETE");
  const database = await db.database.findUnique({ where: { id: dbId } });
  if (!database || database.userId !== ctx.user.id) {
    throw new Response(JSON.stringify({ error: "Database not found" }), {
      status: 404,
      headers: { "Content-Type": "application/json" },
    });
  }
  await db.database.delete({ where: { id: dbId } });
  await sqldDeleteNamespace(database.namespace).catch(() => {});

  dispatchWebhooks(ctx.user.id, "database.deleted", {
    id: database.id,
    name: database.name,
  });

  return { success: true };
}

export async function queryDatabase(
  ctx: AuthContext,
  dbId: string,
  sql: string,
  args: unknown[] = [],
  source: QuerySource = "api"
) {
  requireScope(ctx, "WRITE");
  const database = await db.database.findUnique({ where: { id: dbId } });
  if (!database || database.userId !== ctx.user.id) {
    throw new Response(JSON.stringify({ error: "Database not found" }), {
      status: 404,
      headers: { "Content-Type": "application/json" },
    });
  }
  const start = performance.now();
  try {
    const result = await sqldQuery(database.namespace, sql, args);
    logQuery(database.namespace, sql, args, source, performance.now() - start, result.affected_row_count, "ok");
    return result;
  } catch (err) {
    logQuery(database.namespace, sql, args, source, performance.now() - start, 0, "error", err instanceof Error ? err.message : String(err));
    throw err;
  }
}

export async function execDatabase(
  ctx: AuthContext,
  dbId: string,
  statements: Array<{ sql: string; args?: unknown[] }>,
  source: QuerySource = "api"
) {
  requireScope(ctx, "WRITE");

  if (!statements.length || statements.length > 50) {
    throw new Response(
      JSON.stringify({ error: "Provide 1-50 statements" }),
      { status: 400, headers: { "Content-Type": "application/json" } }
    );
  }

  const database = await db.database.findUnique({ where: { id: dbId } });
  if (!database || database.userId !== ctx.user.id) {
    throw new Response(JSON.stringify({ error: "Database not found" }), {
      status: 404,
      headers: { "Content-Type": "application/json" },
    });
  }
  const start = performance.now();
  try {
    const results = await sqldExec(database.namespace, statements);
    const totalAffected = results.reduce((s, r) => s + (r.affected_row_count || 0), 0);
    const durationMs = performance.now() - start;
    const summary = statements.length === 1 ? statements[0].sql : `[batch: ${statements.length} statements]`;
    logQuery(database.namespace, summary, [], source, durationMs, totalAffected, "ok");
    return { results };
  } catch (err) {
    const summary = statements.length === 1 ? statements[0].sql : `[batch: ${statements.length} statements]`;
    logQuery(database.namespace, summary, [], source, performance.now() - start, 0, "error", err instanceof Error ? err.message : String(err));
    throw err;
  }
}

const IDENTIFIER_RE = /^[a-zA-Z_][a-zA-Z0-9_]*$/;
const MAX_IMPORT_ROWS = 10_000;

export async function importDatabase(
  ctx: AuthContext,
  dbId: string,
  table: string,
  columns: string[],
  rows: unknown[][],
  onConflict?: "ignore" | "replace"
) {
  requireScope(ctx, "WRITE");

  if (!IDENTIFIER_RE.test(table)) {
    throw new Response(
      JSON.stringify({ error: "Invalid table name. Use letters, digits, underscores only." }),
      { status: 400, headers: { "Content-Type": "application/json" } }
    );
  }

  if (!columns.length || columns.some((c) => !IDENTIFIER_RE.test(c))) {
    throw new Response(
      JSON.stringify({ error: "Invalid column names. Use letters, digits, underscores only." }),
      { status: 400, headers: { "Content-Type": "application/json" } }
    );
  }

  if (!rows.length || rows.length > MAX_IMPORT_ROWS) {
    throw new Response(
      JSON.stringify({ error: `Provide 1-${MAX_IMPORT_ROWS} rows` }),
      { status: 400, headers: { "Content-Type": "application/json" } }
    );
  }

  const database = await db.database.findUnique({ where: { id: dbId } });
  if (!database || database.userId !== ctx.user.id) {
    throw new Response(JSON.stringify({ error: "Database not found" }), {
      status: 404,
      headers: { "Content-Type": "application/json" },
    });
  }

  const verb = onConflict === "ignore"
    ? "INSERT OR IGNORE"
    : onConflict === "replace"
      ? "INSERT OR REPLACE"
      : "INSERT";

  const colList = columns.map((c) => `"${c}"`).join(", ");
  const placeholders = columns.map(() => "?").join(", ");
  const sql = `${verb} INTO "${table}" (${colList}) VALUES (${placeholders})`;

  const statements = rows.map((row) => ({ sql, args: row }));
  const results = await sqldExec(database.namespace, statements);

  const totalAffected = results.reduce(
    (sum, r) => sum + (r.affected_row_count || 0),
    0
  );

  return { imported: totalAffected, total: rows.length };
}

export async function getQueryHistory(
  ctx: AuthContext,
  dbId: string,
  opts: { limit?: number; offset?: number } = {}
) {
  requireScope(ctx, "READ");
  const database = await db.database.findUnique({ where: { id: dbId } });
  if (!database || database.userId !== ctx.user.id) {
    throw new Response(JSON.stringify({ error: "Database not found" }), {
      status: 404,
      headers: { "Content-Type": "application/json" },
    });
  }
  const limit = Math.min(opts.limit || 50, 200);
  const offset = opts.offset || 0;

  // Ensure log table exists (for DBs created before this feature)
  await sqldExec(database.namespace, [{ sql: CREATE_LOG_TABLE_SQL }]).catch(() => {});

  const result = await sqldQuery(
    database.namespace,
    `SELECT id, sql_text, args, source, rows_affected, duration_ms, status, error, created_at FROM "${LOG_TABLE}" ORDER BY id DESC LIMIT ? OFFSET ?`,
    [limit, offset]
  );
  const countResult = await sqldQuery(
    database.namespace,
    `SELECT COUNT(*) as total FROM "${LOG_TABLE}"`,
    []
  );
  return {
    items: result.rows.map((r) => ({
      id: r[0],
      sql: r[1],
      args: r[2],
      source: r[3],
      rowsAffected: r[4],
      durationMs: r[5],
      status: r[6],
      error: r[7],
      createdAt: r[8],
    })),
    total: (countResult.rows[0]?.[0] as number) || 0,
  };
}
