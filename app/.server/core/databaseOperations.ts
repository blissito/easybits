import { db } from "../db";
import type { AuthContext } from "../apiAuth";
import { requireScope } from "../apiAuth";
import { sqldQuery, sqldExec, sqldCreateNamespace, sqldDeleteNamespace } from "../sqld";
import { dispatchWebhooks } from "../webhooks";

const MAX_DATABASES_PER_USER = 5;

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

  const count = await db.database.count({ where: { userId: ctx.user.id } });
  if (count >= MAX_DATABASES_PER_USER) {
    throw new Response(
      JSON.stringify({ error: `Max ${MAX_DATABASES_PER_USER} databases per account` }),
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

  const database = await db.database.create({
    data: {
      name,
      namespace: "", // placeholder, will update with id
      description: opts.description || null,
      userId: ctx.user.id,
    },
  });

  // Use the DB id as namespace (guaranteed unique)
  const namespace = database.id;
  await sqldCreateNamespace(namespace);

  const updated = await db.database.update({
    where: { id: database.id },
    data: { namespace },
  });

  dispatchWebhooks(ctx.user.id, "database.created", {
    id: updated.id,
    name: updated.name,
  });

  return {
    id: updated.id,
    name: updated.name,
    namespace: updated.namespace,
    description: updated.description,
    createdAt: updated.createdAt,
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
  args: unknown[] = []
) {
  requireScope(ctx, "WRITE");
  const database = await db.database.findUnique({ where: { id: dbId } });
  if (!database || database.userId !== ctx.user.id) {
    throw new Response(JSON.stringify({ error: "Database not found" }), {
      status: 404,
      headers: { "Content-Type": "application/json" },
    });
  }
  return sqldQuery(database.namespace, sql, args);
}

export async function execDatabase(
  ctx: AuthContext,
  dbId: string,
  statements: Array<{ sql: string; args?: unknown[] }>
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
  const results = await sqldExec(database.namespace, statements);
  return { results };
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
