import { useFetcher, useLoaderData, data } from "react-router";
import { getUserOrRedirect } from "~/.server/getters";
import { db } from "~/.server/db";
import { useState, useEffect, useRef } from "react";
import { BrutalButton } from "~/components/common/BrutalButton";
import {
  createDatabase,
  deleteDatabase,
  queryDatabase,
} from "~/.server/core/databaseOperations";
import { createAnthropic } from "@ai-sdk/anthropic";
import { generateObject } from "ai";
import { z } from "zod";
import type { Route } from "./+types/databases";

export const meta = () => [
  { title: "Databases — EasyBits" },
  { name: "robots", content: "noindex" },
];

export const loader = async ({ request }: Route.LoaderArgs) => {
  const user = await getUserOrRedirect(request);
  const databases = await db.database.findMany({
    where: { userId: user.id },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      name: true,
      namespace: true,
      description: true,
      createdAt: true,
    },
  });
  return { databases };
};

export const action = async ({ request }: Route.ActionArgs) => {
  const user = await getUserOrRedirect(request);
  const formData = await request.formData();
  const intent = formData.get("intent");
  const ctx = { user, scopes: ["READ", "WRITE", "DELETE"] as any };

  if (intent === "create") {
    const name = (formData.get("name") as string)?.trim();
    const description = (formData.get("description") as string)?.trim() || undefined;
    try {
      const database = await createDatabase(ctx, { name, description });
      return { created: database };
    } catch (err) {
      if (err instanceof Response) {
        const body = await err.json();
        return data({ error: body.error }, { status: err.status });
      }
      throw err;
    }
  }

  if (intent === "delete") {
    const dbId = formData.get("dbId") as string;
    try {
      await deleteDatabase(ctx, dbId);
      return { deleted: true };
    } catch (err) {
      if (err instanceof Response) {
        const body = await err.json();
        return data({ error: body.error }, { status: err.status });
      }
      throw err;
    }
  }

  if (intent === "generate_sql") {
    const dbId = formData.get("dbId") as string;
    const prompt = formData.get("prompt") as string;
    if (!prompt?.trim()) {
      return data({ generateError: "Prompt is required", generateDbId: dbId }, { status: 400 });
    }
    try {
      const schemaResult = await queryDatabase(ctx, dbId, "SELECT name, sql FROM sqlite_master WHERE type IN ('table','view') ORDER BY name");
      const schemaText = schemaResult.rows.map((r: unknown[]) => r[1]).filter(Boolean).join("\n");
      const anthropic = createAnthropic();
      const { object } = await generateObject({
        model: anthropic("claude-haiku-4-5-20251001"),
        schema: z.object({ sql: z.string() }),
        prompt: `Database schema:\n${schemaText || "(empty database — no tables yet)"}\n\nUser request: ${prompt}\n\nGenerate valid SQLite SQL. Format with line breaks and indentation for readability. Separate multiple statements with a blank line.`,
        system: "You are a SQL assistant for SQLite databases. Given the database schema and a user request in natural language, generate valid SQL. Always format the SQL with proper line breaks and indentation (e.g. each column on its own line in CREATE TABLE, each VALUES on its own line). For empty databases, generate CREATE TABLE statements as appropriate. Return only SQL, no explanations.",
      });
      return { generatedSql: object.sql, generateDbId: dbId };
    } catch (err) {
      const message = err instanceof Error ? err.message : "SQL generation failed";
      return { generateError: message, generateDbId: dbId };
    }
  }

  if (intent === "query") {
    const dbId = formData.get("dbId") as string;
    const sql = formData.get("sql") as string;
    if (!sql?.trim()) {
      return data({ queryError: "SQL query is required" }, { status: 400 });
    }
    try {
      const result = await queryDatabase(ctx, dbId, sql);
      return { queryResult: result, queryDbId: dbId };
    } catch (err) {
      const message = err instanceof Error ? err.message : "Query failed";
      return { queryError: message, queryDbId: dbId };
    }
  }

  return null;
};

export default function DatabasesPage() {
  const { databases } = useLoaderData<typeof loader>();
  const crudFetcher = useFetcher<typeof action>();
  const queryFetcher = useFetcher<typeof action>();
  const [showCreate, setShowCreate] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const [queryOpen, setQueryOpen] = useState<string | null>(null);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        if (confirmDelete) setConfirmDelete(null);
        else if (showCreate) setShowCreate(false);
        else if (queryOpen) setQueryOpen(null);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [showCreate, confirmDelete, queryOpen]);

  const error =
    crudFetcher.data && "error" in crudFetcher.data
      ? (crudFetcher.data as { error: string }).error
      : null;

  return (
    <div>
      <div className="flex justify-between items-center mb-4">
        <h2 className="text-lg font-black uppercase tracking-tight">
          Databases
        </h2>
        <BrutalButton
          size="chip"
          onClick={() => setShowCreate(true)}
          className="text-sm px-4 py-1.5"
        >
          + Create Database
        </BrutalButton>
      </div>

      {/* Create modal */}
      {showCreate && (
        <div
          className="fixed inset-0 bg-black/60 flex items-center justify-center z-50"
          role="dialog"
          aria-modal="true"
          aria-labelledby="create-db-title"
          onClick={(e) => {
            if (e.target === e.currentTarget) setShowCreate(false);
          }}
        >
          <div className="bg-white border-3 border-black rounded-xl p-6 w-full max-w-md shadow-[6px_6px_0px_0px_rgba(0,0,0,1)]">
            <h3
              id="create-db-title"
              className="text-lg font-black uppercase mb-4"
            >
              Create Database
            </h3>
            <crudFetcher.Form
              method="post"
              onSubmit={() => setShowCreate(false)}
            >
              <input type="hidden" name="intent" value="create" />
              <label className="block mb-4">
                <span className="text-sm font-bold">Name</span>
                <input
                  name="name"
                  type="text"
                  placeholder="my-app-db"
                  required
                  pattern="^[a-zA-Z0-9_-]+$"
                  maxLength={64}
                  className="mt-1 block w-full border-2 border-black rounded-lg px-3 py-2 text-sm font-mono"
                  autoFocus
                />
                <span className="text-xs text-gray-500 mt-1 block">
                  Alphanumeric, dashes, underscores. Max 64 chars.
                </span>
              </label>
              <label className="block mb-4">
                <span className="text-sm font-bold">Description (optional)</span>
                <input
                  name="description"
                  type="text"
                  placeholder="What this database is for"
                  maxLength={256}
                  className="mt-1 block w-full border-2 border-black rounded-lg px-3 py-2 text-sm"
                />
              </label>
              <div className="flex gap-2 justify-end">
                <BrutalButton
                  mode="ghost"
                  size="chip"
                  onClick={() => setShowCreate(false)}
                  className="text-sm px-4 py-1.5"
                >
                  Cancel
                </BrutalButton>
                <BrutalButton
                  type="submit"
                  size="chip"
                  className="text-sm px-4 py-1.5"
                >
                  Create
                </BrutalButton>
              </div>
            </crudFetcher.Form>
          </div>
        </div>
      )}

      {/* Delete confirm modal */}
      {confirmDelete && (
        <div
          className="fixed inset-0 bg-black/60 flex items-center justify-center z-50"
          role="dialog"
          aria-modal="true"
          onClick={(e) => {
            if (e.target === e.currentTarget) setConfirmDelete(null);
          }}
        >
          <div className="bg-white border-3 border-black rounded-xl p-6 w-full max-w-sm shadow-[6px_6px_0px_0px_rgba(0,0,0,1)]">
            <h3 className="text-lg font-black uppercase mb-2">
              Eliminar database
            </h3>
            <p className="text-sm mb-4">
              Esta accion no se puede deshacer. Se eliminara la base de datos y todos sus datos permanentemente.
            </p>
            <div className="flex gap-2 justify-end">
              <BrutalButton
                mode="ghost"
                size="chip"
                onClick={() => setConfirmDelete(null)}
                className="text-sm px-4 py-1.5"
              >
                Cancelar
              </BrutalButton>
              <crudFetcher.Form
                method="post"
                onSubmit={() => setConfirmDelete(null)}
              >
                <input type="hidden" name="intent" value="delete" />
                <input type="hidden" name="dbId" value={confirmDelete} />
                <BrutalButton
                  mode="danger"
                  size="chip"
                  type="submit"
                  className="text-sm px-4 py-1.5"
                >
                  Eliminar
                </BrutalButton>
              </crudFetcher.Form>
            </div>
          </div>
        </div>
      )}

      {/* Error display */}
      {error && (
        <div className="mb-4 p-3 bg-brand-red/10 border-2 border-brand-red rounded-xl text-sm font-bold text-brand-red">
          {error}
        </div>
      )}

      {/* Databases table */}
      <div className="border-2 border-black rounded-xl overflow-hidden shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] bg-white">
        <table className="w-full text-sm">
          <thead className="bg-black text-white">
            <tr>
              <th scope="col" className="text-left px-4 py-3 font-bold text-xs uppercase tracking-wider">Name</th>
              <th scope="col" className="text-left px-4 py-3 font-bold text-xs uppercase tracking-wider hidden md:table-cell">Description</th>
              <th scope="col" className="text-left px-4 py-3 font-bold text-xs uppercase tracking-wider hidden md:table-cell">Created</th>
              <th scope="col" className="px-4 py-3"></th>
            </tr>
          </thead>
          <tbody>
            {databases.map((dbItem) => (
              <DatabaseRow
                key={dbItem.id}
                db={dbItem}
                queryOpen={queryOpen === dbItem.id}
                onToggleQuery={() =>
                  setQueryOpen(queryOpen === dbItem.id ? null : dbItem.id)
                }
                onDelete={() => setConfirmDelete(dbItem.id)}
                queryFetcher={queryFetcher}
              />
            ))}
            {databases.length === 0 && (
              <tr>
                <td
                  colSpan={4}
                  className="px-4 py-12 text-center font-bold text-gray-400 uppercase tracking-wider"
                >
                  No databases yet
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function DatabaseRow({
  db: dbItem,
  queryOpen,
  onToggleQuery,
  onDelete,
  queryFetcher,
}: {
  db: { id: string; name: string; description: string | null; createdAt: string | Date };
  queryOpen: boolean;
  onToggleQuery: () => void;
  onDelete: () => void;
  queryFetcher: ReturnType<typeof useFetcher<typeof action>>;
}) {
  const generateFetcher = useFetcher<typeof action>();
  const [sqlValue, setSqlValue] = useState("");
  const [nlPrompt, setNlPrompt] = useState("");
  const queryFormRef = useRef<HTMLFormElement>(null);

  const qData = queryFetcher.data as Record<string, unknown> | null | undefined;
  const isThisDb = qData?.queryDbId === dbItem.id;

  const gData = generateFetcher.data as Record<string, unknown> | null | undefined;
  const isGenThisDb = gData?.generateDbId === dbItem.id;
  const isGenerating = generateFetcher.state !== "idle";

  // When AI returns generated SQL, put it in the textarea
  useEffect(() => {
    if (isGenThisDb && gData?.generatedSql) {
      setSqlValue(gData.generatedSql as string);
    }
  }, [gData, isGenThisDb]);

  const queryResult = isThisDb && qData?.queryResult
    ? (qData.queryResult as {
        cols: string[];
        rows: unknown[][];
        affected_row_count: number;
        last_insert_rowid: string | null;
      })
    : null;

  const queryError = isThisDb && qData?.queryError
    ? (qData.queryError as string)
    : null;

  const generateError = isGenThisDb && gData?.generateError
    ? (gData.generateError as string)
    : null;

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
      e.preventDefault();
      queryFormRef.current?.requestSubmit();
    }
  };

  return (
    <>
      <tr className="border-t-2 border-black hover:bg-brand-100 transition-colors">
        <td className="px-4 py-3 font-mono text-xs font-bold">{dbItem.name}</td>
        <td className="px-4 py-3 text-xs text-gray-500 max-w-[200px] truncate hidden md:table-cell">
          {dbItem.description || "—"}
        </td>
        <td className="px-4 py-3 font-mono text-xs hidden md:table-cell">
          {new Date(dbItem.createdAt).toLocaleDateString()}
        </td>
        <td className="px-4 py-3 flex gap-2 justify-end">
          <BrutalButton size="chip" onClick={onToggleQuery}>
            {queryOpen ? "Close" : "Query"}
          </BrutalButton>
          <BrutalButton mode="danger" size="chip" onClick={onDelete}>
            Delete
          </BrutalButton>
        </td>
      </tr>
      {queryOpen && (
        <tr className="border-t border-gray-200">
          <td colSpan={4} className="px-4 py-4 bg-gray-50">
            {/* AI prompt bar */}
            <generateFetcher.Form method="post" className="flex items-stretch gap-2 mb-2">
              <input type="hidden" name="intent" value="generate_sql" />
              <input type="hidden" name="dbId" value={dbItem.id} />
              <div className="flex-1 relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-brand-500 font-bold text-sm">✦</span>
                <input
                  name="prompt"
                  type="text"
                  value={nlPrompt}
                  onChange={(e) => setNlPrompt(e.target.value)}
                  placeholder="Describe what you need in plain language..."
                  className="w-full h-full border-2 border-brand-200 bg-brand-50 rounded-lg pl-8 pr-3 text-xs"
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault();
                      e.currentTarget.form?.requestSubmit();
                    }
                  }}
                />
              </div>
              <BrutalButton
                type="submit"
                size="chip"
                isLoading={isGenerating}
                isDisabled={!nlPrompt.trim()}
              >
                {isGenerating ? "Generating..." : "Generate SQL"}
              </BrutalButton>
            </generateFetcher.Form>

            {generateError && (
              <div className="mb-2 p-2 bg-brand-red/10 border border-brand-red rounded-lg text-xs font-mono text-brand-red">
                {generateError}
              </div>
            )}

            {/* SQL editor + Run */}
            <queryFetcher.Form method="post" ref={queryFormRef}>
              <input type="hidden" name="intent" value="query" />
              <input type="hidden" name="dbId" value={dbItem.id} />
              <textarea
                name="sql"
                value={sqlValue}
                onChange={(e) => setSqlValue(e.target.value)}
                placeholder="SELECT * FROM ..."
                rows={3}
                className="w-full border-2 border-black rounded-lg px-3 py-2 text-sm font-mono mb-2 resize-y"
                onKeyDown={handleKeyDown}
              />
              <div className="flex items-center gap-3">
                <BrutalButton
                  type="submit"
                  size="chip"
                  isLoading={queryFetcher.state !== "idle"}
                  isDisabled={!sqlValue.trim()}
                >
                  ▶ Run
                </BrutalButton>
                <span className="text-xs text-gray-400">⌘+Enter to run</span>
              </div>
            </queryFetcher.Form>

            {queryError && (
              <div className="mt-3 p-3 bg-brand-red/10 border-2 border-brand-red rounded-lg text-sm font-mono text-brand-red">
                {queryError}
              </div>
            )}

            {queryResult && (
              <div className="mt-3 overflow-x-auto">
                {queryResult.cols.length > 0 ? (
                  <table className="w-full text-xs border-2 border-black rounded-lg overflow-hidden">
                    <thead className="bg-black text-white">
                      <tr>
                        {queryResult.cols.map((col) => (
                          <th key={col} className="text-left px-3 py-2 font-bold">
                            {col}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {queryResult.rows.map((row, i) => (
                        <tr key={i} className="border-t border-gray-200">
                          {row.map((cell, j) => (
                            <td key={j} className="px-3 py-1.5 font-mono">
                              {cell === null ? (
                                <span className="text-gray-400">NULL</span>
                              ) : (
                                String(cell)
                              )}
                            </td>
                          ))}
                        </tr>
                      ))}
                      {queryResult.rows.length === 0 && (
                        <tr>
                          <td
                            colSpan={queryResult.cols.length}
                            className="px-3 py-4 text-center text-gray-400"
                          >
                            No rows returned
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                ) : (
                  <div className="p-3 bg-lime/30 border-2 border-black rounded-lg text-sm font-mono">
                    OK — {queryResult.affected_row_count} row(s) affected
                    {queryResult.last_insert_rowid &&
                      `, last insert id: ${queryResult.last_insert_rowid}`}
                  </div>
                )}
              </div>
            )}
          </td>
        </tr>
      )}
    </>
  );
}
