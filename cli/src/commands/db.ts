import type { EasybitsClient } from "@easybits.cloud/sdk";
import type { Command } from "../types.js";
import { list, need, str } from "../args.js";
import { emit, fmtDate, table } from "../output.js";
import { getClient } from "../client.js";
import { CliError } from "../errors.js";

/** Por id o por nombre, sin crear: un typo no debe inventar una base nueva (db(name) sí crea). */
async function findDb(eb: EasybitsClient, ref: string) {
  const { items } = await eb.listDatabases();
  const hit = items.find((d) => d.id === ref) ?? items.find((d) => d.name === ref);
  if (!hit) throw new CliError(`No database "${ref}".`, 1, "List them with: easybits db ls", "not_found", 404);
  return hit;
}

export const db: Command = {
  name: "db",
  aliases: ["databases"],
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
            "No databases. Create one: easybits db create <name>",
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
        emit(ctx, d, () => console.log(`Created ${d.name} (${d.id})`));
      },
    },
    rm: {
      aliases: ["delete", "drop"],
      summary: "Delete a database (irreversible)",
      usage: "easybits db rm <db-id|name>",
      examples: ["easybits db rm leads"],
      async run(ctx) {
        const ref = need(ctx, 0, "db-id|name", this.usage);
        const eb = await getClient(ctx);
        const hit = await findDb(eb, ref);
        const r = await eb.deleteDatabase(hit.id);
        emit(ctx, { ...r, id: hit.id, name: hit.name }, () => console.log(`Deleted ${hit.name} (${hit.id})`));
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
        const hit = await findDb(eb, ref);
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
            console.log(`OK, ${r.affected_row_count} row(s) affected${r.last_insert_rowid ? `, last id ${r.last_insert_rowid}` : ""}`);
          }
        });
      },
    },
  },
};
