/**
 * Thin HTTP client for sqld (libsql-server) pipeline API.
 * Talks to sqld via Fly internal network or local instance.
 *
 * sqld pipeline docs: POST /v2/pipeline with x-namespace header
 * Each request contains an array of { type: "execute", stmt: { sql, args } }
 */

const SQLD_URL = process.env.SQLD_URL || "http://localhost:8080";

interface StmtArg {
  type: "integer" | "float" | "text" | "blob" | "null";
  value?: string | number;
}

function toSqldArg(v: unknown): StmtArg {
  if (v === null || v === undefined) return { type: "null" };
  if (typeof v === "number") {
    return Number.isInteger(v)
      ? { type: "integer", value: v }
      : { type: "float", value: v };
  }
  if (typeof v === "string") return { type: "text", value: v };
  return { type: "text", value: String(v) };
}

export interface SqldResult {
  cols: string[];
  rows: unknown[][];
  affected_row_count: number;
  last_insert_rowid: string | null;
}

interface PipelineResponse {
  results: Array<{
    type: "ok" | "error";
    response?: {
      type: "execute";
      result: {
        cols: Array<{ name: string }>;
        rows: Array<Array<{ type: string; value?: unknown }>>;
        affected_row_count: number;
        last_insert_rowid: string | null;
      };
    };
    error?: { message: string; code: string };
  }>;
}

function parseResult(raw: PipelineResponse["results"][0]): SqldResult {
  if (raw.type === "error") {
    throw new Error(raw.error?.message || "sqld error");
  }
  const r = raw.response!.result;
  return {
    cols: r.cols.map((c) => c.name),
    rows: r.rows.map((row) => row.map((cell) => cell.value ?? null)),
    affected_row_count: r.affected_row_count,
    last_insert_rowid: r.last_insert_rowid,
  };
}

/**
 * Execute a single SQL statement against a namespace.
 */
export async function sqldQuery(
  namespace: string,
  sql: string,
  args: unknown[] = []
): Promise<SqldResult> {
  const res = await fetch(`${SQLD_URL}/v2/pipeline`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-namespace": namespace,
    },
    body: JSON.stringify({
      requests: [
        { type: "execute", stmt: { sql, args: args.map(toSqldArg) } },
        { type: "close" },
      ],
    }),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`sqld error ${res.status}: ${text}`);
  }

  const data: PipelineResponse = await res.json();
  return parseResult(data.results[0]);
}

/**
 * Execute multiple SQL statements in a pipeline (batch).
 */
export async function sqldExec(
  namespace: string,
  statements: Array<{ sql: string; args?: unknown[] }>
): Promise<SqldResult[]> {
  const requests = statements.map((s) => ({
    type: "execute" as const,
    stmt: { sql: s.sql, args: (s.args || []).map(toSqldArg) },
  }));
  requests.push({ type: "close" as any, stmt: undefined as any });

  const res = await fetch(`${SQLD_URL}/v2/pipeline`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-namespace": namespace,
    },
    body: JSON.stringify({ requests }),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`sqld error ${res.status}: ${text}`);
  }

  const data: PipelineResponse = await res.json();
  // Last result is the "close" response, skip it
  return data.results.slice(0, -1).map(parseResult);
}
