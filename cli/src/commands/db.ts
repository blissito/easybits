import type { Command } from "../types.js";
import { list, need, str } from "../args.js";
import { emit, fmtDate, table } from "../output.js";
import { getClient } from "../client.js";
import type { Ctx } from "../types.js";
import { listRefs } from "../resolve.js";
import { CliError } from "../errors.js";
import { YES_OPTION, confirm, requireYesIfHeadless } from "../prompt.js";
import { t } from "../i18n.js";

/**
 * La base ya resuelta (index.ts cambió el nombre por el id con refs.ts). Sin crear: un
 * typo no debe inventar una base nueva (db(name) sí crea). Reusa la lista de la corrida.
 */
async function findDb(ctx: Ctx, id: string) {
  const hit = (await listRefs(ctx, "db")).find((d) => d.id === id);
  if (!hit) throw new CliError(t(`No database "${id}".`, `No existe la base "${id}".`), 1, t("List them with: easybits db ls", "Enlístalas con: easybits db ls"), "not_found", 404);
  return { id, name: hit.name ?? id };
}

export const db: Command = {
  name: "db",
  aliases: ["databases", "database"],
  group: "Data",
  summary: "SQL databases (libSQL)",
  synopsis: "db",
  subs: {
    ls: {
      aliases: ["list"],
      summary: "List your databases",
      usage: "easybits db ls",
      examples: ["easybits db ls --json"],
      async run(ctx) {
        const eb = await getClient(ctx);
        const { items } = await eb.listDatabases();
        emit(ctx, items, () =>
          table(
            items.map((d) => ({ ...d, createdAt: fmtDate(d.createdAt) })),
            [["id", "ID"], ["name", "NAME"], ["createdAt", "CREATED"], ["description", "DESCRIPTION"]],
            t("No databases. Create one: easybits db create <name>", "No hay bases. Crea una: easybits db create <nombre>"),
          ),
        );
      },
    },
    create: {
      summary: "Create a database",
      usage: "easybits db create <name> [--description <text>]",
      options: { description: { type: "string", value: "text", description: "What it is for" } },
      examples: ["easybits db create leads --description 'CRM leads'"],
      async run(ctx) {
        const name = need(ctx, 0, "name", this.usage);
        const eb = await getClient(ctx);
        const d = await eb.createDatabase({ name, description: str(ctx, "description") });
        emit(ctx, d, () => console.log(t(`Created ${d.name} (${d.id})`, `Creada ${d.name} (${d.id})`)));
      },
    },
    rm: {
      aliases: ["delete", "drop"],
      summary: "Delete a database (irreversible)",
      usage: "easybits db rm <db-id|name> [--yes]",
      options: { ...YES_OPTION },
      examples: ["easybits db rm leads            # asks you to type the name", "easybits db rm leads --yes      # scripts and agents"],
      async run(ctx) {
        const ref = need(ctx, 0, "db-id|name", this.usage);
        requireYesIfHeadless(ctx);
                const eb = await getClient(ctx);
        const hit = await findDb(ctx, ref);
        // Irreversible: se teclea el nombre, como `gh repo delete` / `turso db destroy`.
        await confirm(ctx, t(`Delete database ${hit.name} (${hit.id}) and all its data?`, `¿Borrar la base ${hit.name} (${hit.id}) con todos sus datos?`), { typeName: hit.name });
        const r = await eb.deleteDatabase(hit.id);
        emit(ctx, { ...r, id: hit.id, name: hit.name }, () => console.log(t(`Deleted ${hit.name} (${hit.id})`, `Borrada ${hit.name} (${hit.id})`)));
      },
    },
    tables: {
      aliases: ["inspect", "schema"],
      summary: "List tables with row counts and columns",
      usage: "easybits db tables <db-id|name>",
      examples: ["easybits db tables leads", "easybits db tables leads --json"],
      // Patrón de `turso db inspect` / `.tables` + `.schema` de sqlite3, en una sola vista.
      async run(ctx) {
        const ref = need(ctx, 0, "db-id|name", this.usage);
        const eb = await getClient(ctx);
        const hit = await findDb(ctx, ref);
        const q = (sql: string, args?: unknown[]) => eb.queryDatabase(hit.id, sql, args);
        const names = (
          await q("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '_litestream_%' ORDER BY name")
        ).rows.map((r) => String(r[0]));
        const ident = (n: string) => `"${n.replace(/"/g, '""')}"`;
        const tables: Array<{ name: string; rows: number; columns: Array<{ name: string; type: string; pk: boolean }> }> = [];
        for (const name of names) {
          const info = await q(`PRAGMA table_info(${ident(name)})`);
          const col = (k: string) => info.cols.indexOf(k);
          const columns = info.rows.map((r) => ({ name: String(r[col("name")]), type: String(r[col("type")] ?? ""), pk: Number(r[col("pk")]) > 0 }));
          const count = await q(`SELECT count(*) FROM ${ident(name)}`);
          tables.push({ name, rows: Number(count.rows[0]?.[0] ?? 0), columns });
        }
        emit(ctx, tables, () =>
          table(
            tables.map((t) => ({
              name: t.name,
              rows: t.rows,
              columns: t.columns.map((c) => `${c.name}${c.type ? ` ${c.type}` : ""}${c.pk ? " PK" : ""}`).join(", "),
            })),
            [["name", "TABLE"], ["rows", "ROWS"], ["columns", "COLUMNS"]],
            `No tables in ${hit.name}. Create one: easybits db query ${hit.name} 'CREATE TABLE …'`,
          ),
        );
      },
    },
    query: {
      aliases: ["sql"],
      summary: "Run one SQL statement (by database id or name)",
      usage: "easybits db query <db-id|name> <sql> [--arg <value>]...",
      options: { arg: { type: "string", multiple: true, value: "value", description: "Positional ? parameter (repeatable)" } },
      examples: [
        "easybits db query leads 'SELECT * FROM leads LIMIT 10'",
        "easybits db query leads 'INSERT INTO leads(name) VALUES (?)' --arg Ana",
        "easybits db query leads 'SELECT count(*) AS n FROM leads' --json",
      ],
      async run(ctx) {
        const ref = need(ctx, 0, "db-id|name", this.usage);
        const sql = need(ctx, 1, "sql", this.usage);
        const eb = await getClient(ctx);
        const hit = await findDb(ctx, ref);
        const args = list(ctx, "arg");
        const r = await eb.queryDatabase(hit.id, sql, args.length ? args : undefined);
        emit(ctx, r, () => {
          if (r.cols.length) {
            table(
              r.rows.map((row) => Object.fromEntries(r.cols.map((c, i) => [c, row[i]]))),
              r.cols.map((c) => [c, c] as [string, string]),
              "(0 rows)",
            );
          } else {
            console.log(
              t(
                `OK, ${r.affected_row_count} row(s) affected${r.last_insert_rowid ? `, last id ${r.last_insert_rowid}` : ""}`,
                `OK, ${r.affected_row_count} fila(s) afectadas${r.last_insert_rowid ? `, último id ${r.last_insert_rowid}` : ""}`,
              ),
            );
          }
        });
      },
    },
  },
};
