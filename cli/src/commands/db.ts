import type { Command } from "../types.js";
import { bool, list, need, str } from "../args.js";
import { emit, fmtDate, table } from "../output.js";
import { getClient } from "../client.js";
import type { Ctx } from "../types.js";
import { existsSync, readFileSync, statSync } from "node:fs";
import { WHATSAPP_MAX_BYTES, defaultPhotoColumn, linkStatsSql, parseLinkStats, photoFiles, planPhotos, type LinkStats } from "../photos.js";
import { usageError } from "../errors.js";
import { listRefs } from "../resolve.js";
import { CliError } from "../errors.js";
import { YES_OPTION, applyHint, confirm, requireYesIfHeadless } from "../prompt.js";
import { t } from "../i18n.js";
import { api } from "../api.js";
import { MACHINE_TEMPLATES } from "./agents-config.js";
import { findNameRefs, replaceName, type NameRef } from "../db-name-refs.js";

/**
 * La base ya resuelta (index.ts cambió el nombre por el id con refs.ts). Sin crear: un
 * typo no debe inventar una base nueva (db(name) sí crea). Reusa la lista de la corrida.
 */
async function findDb(ctx: Ctx, id: string) {
  const hit = (await listRefs(ctx, "db")).find((d) => d.id === id);
  if (!hit) throw new CliError(t(`No database "${id}".`, `No existe la base "${id}".`), 1, t("List them with: easybits db ls", "Enlístalas con: easybits db ls"), "not_found", 404);
  return { id, name: hit.name ?? id };
}

const ident = (n: string) => `"${n.replace(/"/g, '""')}"`;

/** Tablas y filas de una base (lo que se perdería al borrarla). */
async function tableCounts(ctx: Ctx, id: string) {
  const eb = await getClient(ctx);
  const q = (sql: string) => eb.queryDatabase(id, sql);
  const names = (await q("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '_litestream_%' AND name NOT LIKE '_easybits_%' ORDER BY name")).rows.map((r) => String(r[0]));
  const out: Array<{ name: string; rows: number }> = [];
  for (const name of names) out.push({ name, rows: Number((await q(`SELECT count(*) FROM ${ident(name)}`)).rows[0]?.[0] ?? 0) });
  return out;
}

type PromptRef = { agentId: string; agent: string; refs: NameRef[] };

/**
 * Los prompts de tus agentes con máquina (ghosty-lite, goose) que nombran la base. Las tools
 * `db_*` van por id y no se rompen al renombrar; lo que se queda viejo es el prompt que dice
 * «usa la base leads» y el agente la busca por nombre en `db_list`.
 */
async function promptRefs(ctx: Ctx, name: string) {
  const eb = await getClient(ctx);
  const found: PromptRef[] = [];
  const skipped: Array<{ agentId: string; agent: string; reason: string }> = [];
  for (const a of await eb.listAgents()) {
    if (!MACHINE_TEMPLATES.has(a.template)) continue;
    const agent = a.name ?? a.agentId;
    if (a.status === "lost" || a.status === "error") {
      skipped.push({ agentId: a.agentId, agent, reason: a.status });
      continue;
    }
    try {
      const p = await api<{ systemPrompt: string }>(ctx, "GET", `/agents/${a.agentId}/prompt`);
      const refs = findNameRefs(p.systemPrompt ?? "", name);
      if (refs.length) found.push({ agentId: a.agentId, agent, refs });
    } catch (e) {
      skipped.push({ agentId: a.agentId, agent, reason: (e as Error).message });
    }
  }
  return { found, skipped };
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
      usage: "easybits db rm <db-id|name> [--dry-run] [--yes]",
      options: { "dry-run": { type: "boolean", description: "Show its tables and rows; delete nothing" }, ...YES_OPTION },
      examples: [
        "easybits db rm leads --dry-run  # what would be lost",
        "easybits db rm leads            # asks you to type the name",
        "easybits db rm leads --yes      # scripts and agents",
      ],
      async run(ctx) {
        const ref = need(ctx, 0, "db-id|name", this.usage);
        if (bool(ctx, "dry-run")) {
          const hit = await findDb(ctx, ref);
          const tables = await tableCounts(ctx, hit.id);
          const rows = tables.reduce((n, x) => n + x.rows, 0);
          emit(ctx, { id: hit.id, name: hit.name, dryRun: true, tables }, () => {
            console.log(t(`${hit.name} (${hit.id}): ${tables.length} table(s), ${rows} row(s)`, `${hit.name} (${hit.id}): ${tables.length} tabla(s), ${rows} fila(s)`));
            for (const x of tables) console.log(`  ${x.name}: ${x.rows}`);
            console.log(t("(dry run: nothing deleted)", "(simulación: no se borró nada)"));
            console.log(applyHint(ctx, { needsYes: true }));
          });
          return;
        }
        requireYesIfHeadless(ctx);
        const eb = await getClient(ctx);
        const hit = await findDb(ctx, ref);
        // Irreversible: se teclea el nombre, como `gh repo delete` / `turso db destroy`.
        await confirm(ctx, t(`Delete database ${hit.name} (${hit.id}) and all its data?`, `¿Borrar la base ${hit.name} (${hit.id}) con todos sus datos?`), { typeName: hit.name });
        const r = await eb.deleteDatabase(hit.id);
        emit(ctx, { ...r, id: hit.id, name: hit.name }, () => console.log(t(`Deleted ${hit.name} (${hit.id})`, `Borrada ${hit.name} (${hit.id})`)));
      },
    },
    rename: {
      aliases: ["mv"],
      summary: "Rename a database and rewrite the agent prompts that name it",
      usage: "easybits db rename <db-id|name> <new-name> [--skip-prompts] [--dry-run]",
      options: {
        "skip-prompts": { type: "boolean", description: "Rename only; leave your agents' prompts as they are" },
        "dry-run": { type: "boolean", description: "Show the prompts that name it; change nothing" },
      },
      examples: [
        "easybits db rename totequim catalogo --dry-run   # which prompts name it",
        "easybits db rename totequim catalogo",
        "easybits db rename totequim catalogo --skip-prompts --json",
      ],
      // El id no cambia (las tools db_* van por id). Se reescribe el nombre como palabra suelta:
      // `totequim.com`, `@totequim`, `totequim_prueba` y «TOTEQUIM» se quedan (db-name-refs.ts).
      async run(ctx) {
        const ref = need(ctx, 0, "db-id|name", this.usage);
        const to = need(ctx, 1, "new-name", this.usage).trim();
        if (!/^[a-zA-Z0-9_-]{1,64}$/.test(to)) throw usageError(t("The name takes letters, digits, - and _ (max 64).", "El nombre lleva letras, dígitos, - y _ (máx 64)."), this.usage);
        const hit = await findDb(ctx, ref);
        const from = hit.name;
        if (to === from) throw usageError(t(`${from} already has that name.`, `${from} ya se llama así.`), this.usage);
        const taken = (await listRefs(ctx, "db")).find((d) => d.name === to);
        if (taken) throw new CliError(t(`A database named "${to}" already exists (${taken.id}).`, `Ya hay una base "${to}" (${taken.id}).`), 1, undefined, "conflict", 409);
        const scan = bool(ctx, "skip-prompts") ? { found: [], skipped: [] } : await promptRefs(ctx, from);
        const base = { id: hit.id, from, to, references: scan.found, skipped: scan.skipped };
        const printRefs = () => {
          if (bool(ctx, "skip-prompts")) return console.log(t("Prompts not checked (--skip-prompts).", "Prompts sin revisar (--skip-prompts)."));
          if (!scan.found.length) console.log(t("No agent prompt names it.", "Ningún prompt de tus agentes la nombra."));
          else console.log(t(`Named in ${scan.found.length} prompt(s):`, `La nombran ${scan.found.length} prompt(s):`));
          for (const r of scan.found) {
            console.log(`  ${r.agent} (${r.agentId})`);
            for (const l of r.refs.slice(0, 3)) console.log(`    ${l.line}: ${l.text}`);
            if (r.refs.length > 3) console.log(t(`    … +${r.refs.length - 3} more`, `    … +${r.refs.length - 3} más`));
          }
          for (const x of scan.skipped) console.log(t(`  ! ${x.agent} (${x.agentId}) not checked: ${x.reason}`, `  ! ${x.agent} (${x.agentId}) sin revisar: ${x.reason}`));
        };
        if (bool(ctx, "dry-run")) {
          emit(ctx, { ...base, dryRun: true }, () => {
            console.log(`${from} → ${to}`);
            printRefs();
            console.log(t("(dry run: nothing changed; without --dry-run those prompts are rewritten too)", "(simulación: no cambió nada; sin --dry-run también se reescriben esos prompts)"));
            console.log(applyHint(ctx));
          });
          return;
        }
        await api(ctx, "PATCH", `/databases/${hit.id}`, { name: to });
        // Un prompt que falla no deshace el nombre: se reporta y se dice cómo reintentarlo.
        const rewritten: string[] = [];
        const failed: Array<{ agentId: string; error: string }> = [];
        for (const r of scan.found) {
          try {
            const cur = await api<{ systemPrompt: string }>(ctx, "GET", `/agents/${r.agentId}/prompt`);
            await api(ctx, "PATCH", `/agents/${r.agentId}`, { systemPrompt: replaceName(cur.systemPrompt, from, to) });
            rewritten.push(r.agentId);
          } catch (e) {
            failed.push({ agentId: r.agentId, error: (e as Error).message });
          }
        }
        emit(ctx, { ...base, dryRun: false, rewritten, failed }, () => {
          console.log(t(`Renamed ${from} → ${to} (${hit.id}). ${rewritten.length} prompt(s) rewritten.`, `Renombrada ${from} → ${to} (${hit.id}). ${rewritten.length} prompt(s) reescritos.`));
          for (const f of failed) console.error(`! ${f.agentId}: ${f.error}`);
          for (const x of scan.skipped) console.log(t(`! ${x.agent} (${x.agentId}) not checked: ${x.reason}`, `! ${x.agent} (${x.agentId}) sin revisar: ${x.reason}`));
          console.log(`${t("Undo", "Deshacer")}: easybits db rename ${to} ${from}`);
        });
        if (failed.length) process.exitCode = 1;
      },
    },
    tables: {
      aliases: ["inspect", "schema"],
      summary: "List tables with row counts and columns, and how many links are permanent",
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
        const tables: Array<{
          name: string;
          rows: number;
          columns: Array<{ name: string; type: string; pk: boolean }>;
          links: LinkStats[];
        }> = [];
        for (const name of names) {
          const info = await q(`PRAGMA table_info(${ident(name)})`);
          const col = (k: string) => info.cols.indexOf(k);
          const columns = info.rows.map((r) => ({ name: String(r[col("name")]), type: String(r[col("type")] ?? ""), pk: Number(r[col("pk")]) > 0 }));
          const count = await q(`SELECT count(*) FROM ${ident(name)}`);
          // Columnas de texto: ¿cuántas ligas son permanentes, caducan, son de fuera o faltan?
          const textCols = columns.filter((c) => !c.type || /CHAR|TEXT|CLOB/i.test(c.type)).map((c) => c.name);
          const links = textCols.length ? parseLinkStats(textCols, (await q(linkStatsSql(name, textCols))).rows[0] ?? []) : [];
          tables.push({ name, rows: Number(count.rows[0]?.[0] ?? 0), columns, links });
        }
        emit(ctx, tables, () => {
          table(
            tables.map((t) => ({
              name: t.name,
              rows: t.rows,
              columns: t.columns.map((c) => `${c.name}${c.type ? ` ${c.type}` : ""}${c.pk ? " PK" : ""}`).join(", "),
            })),
            [["name", "TABLE"], ["rows", "ROWS"], ["columns", "COLUMNS"]],
            t(`No tables in ${hit.name}. Create one: easybits db query ${hit.name} 'CREATE TABLE …'`, `No hay tablas en ${hit.name}. Crea una: easybits db query ${hit.name} 'CREATE TABLE …'`),
          );
          const withLinks = tables.flatMap((tb) => tb.links.map((l) => ({ ...l, table: tb.name })));
          if (withLinks.length) {
            console.log("\n" + t("Links (permanent = EasyBits public storage; expiring = signed URL):", "Ligas (permanente = almacenamiento público de EasyBits; caduca = URL firmada):"));
            table(
              withLinks.map((l) => ({ where: `${l.table}.${l.column}`, permanent: l.permanent, expiring: l.expiring, external: l.external, empty: l.empty })),
              [["where", "COLUMN"], ["permanent", "PERMANENT"], ["expiring", "EXPIRING"], ["external", "EXTERNAL"], ["empty", "EMPTY"]],
            );
            if (withLinks.some((l) => l.external + l.expiring > 0)) {
              console.log(t("Make them permanent: easybits db photos put <db> --table T --key-column sku --dir photos/", "Hazlas permanentes: easybits db photos put <db> --table T --key-column sku --dir fotos/"));
            }
          }
        });
      },
    },
    photos: {
      summary: "Put catalog photos in a table: SKU-123.jpg → the row whose key is SKU-123, as a permanent public link",
      usage: "easybits db photos put <db> --table <table> --key-column <col> --dir <folder> [--column <col>] [--replace] [--dry-run]",
      options: {
        table: { type: "string", value: "table", description: "Table to update" },
        "key-column": { type: "string", value: "col", description: "Column that matches the file name (e.g. sku)" },
        dir: { type: "string", value: "folder", description: "Folder with the photos (JPEG, PNG or WebP, max 10 MB each)" },
        column: { type: "string", value: "col", description: "Column for the link (default: image_url, photo_url, imagen…)" },
        replace: { type: "boolean", description: "Also replace rows that already have a permanent link" },
        "dry-run": { type: "boolean", description: "Show the plan; upload nothing" },
      },
      examples: [
        "easybits db photos put catalogo --table productos --key-column sku --dir fotos/ --dry-run",
        "easybits db photos put catalogo --table productos --key-column sku --dir fotos/ --column foto",
        "easybits db tables catalogo                  # how many links are permanent, external or empty",
      ],
      async run(ctx) {
        const action = need(ctx, 0, "put", this.usage);
        if (action !== "put") throw usageError(t(`Unknown photos action "${action}".`, `Acción de photos desconocida "${action}".`), this.usage);
        const ref = need(ctx, 1, "db", this.usage);
        const tableName = str(ctx, "table");
        const keyCol = str(ctx, "key-column");
        const dir = str(ctx, "dir");
        if (!tableName || !keyCol || !dir) throw usageError(t("Missing --table, --key-column or --dir.", "Faltan --table, --key-column o --dir."), this.usage);
        if (!existsSync(dir) || !statSync(dir).isDirectory()) throw usageError(t(`Not a folder: ${dir}`, `No es una carpeta: ${dir}`), this.usage);
        const { photos, rejected } = photoFiles(dir);
        const eb = await getClient(ctx);
        const hit = await findDb(ctx, ref);
        const q = (sql: string, args?: unknown[]) => eb.queryDatabase(hit.id, sql, args);
        const info = await q(`PRAGMA table_info(${ident(tableName)})`);
        const cols = info.rows.map((r) => String(r[info.cols.indexOf("name")]));
        if (!cols.length) throw new CliError(t(`No table "${tableName}" in ${hit.name}.`, `No hay tabla "${tableName}" en ${hit.name}.`), 1, t(`See: easybits db tables ${hit.name}`, `Mira: easybits db tables ${hit.name}`), "not_found", 404);
        if (!cols.includes(keyCol)) throw usageError(t(`No column "${keyCol}" in ${tableName} (${cols.join(", ")}).`, `No hay columna "${keyCol}" en ${tableName} (${cols.join(", ")}).`), this.usage);
        const column = str(ctx, "column") ?? defaultPhotoColumn(cols);
        if (!column) throw usageError(t(`${tableName} has no photo column: pass --column (${cols.join(", ")}).`, `${tableName} no tiene columna de foto: pasa --column (${cols.join(", ")}).`), this.usage);
        if (!cols.includes(column)) throw usageError(t(`No column "${column}" in ${tableName} (${cols.join(", ")}).`, `No hay columna "${column}" en ${tableName} (${cols.join(", ")}).`), this.usage);
        // Lo que hay hoy en esas filas (de 100 en 100: tope de parámetros de SQLite).
        const current = new Map<string, unknown>();
        for (let i = 0; i < photos.length; i += 100) {
          const keys = photos.slice(i, i + 100).map((p) => p.key);
          const r = await q(`SELECT ${ident(keyCol)}, ${ident(column)} FROM ${ident(tableName)} WHERE ${ident(keyCol)} IN (${keys.map(() => "?").join(",")})`, keys);
          for (const row of r.rows) current.set(String(row[0]), row[1]);
        }
        const plan = planPhotos(photos, current, bool(ctx, "replace"));
        const big = photos.filter((p) => p.bytes > WHATSAPP_MAX_BYTES).map((p) => p.file);
        const summary = { db: hit.name, table: tableName, keyColumn: keyCol, column, plan, rejected, overWhatsappLimit: big };
        const count = (a: string) => plan.filter((p) => p.action === a).length;
        const why = (r: string) => (r === "not_an_image" ? t("not a JPEG/PNG/WebP", "no es JPEG/PNG/WebP") : r === "too_large" ? t("over 10 MB", "más de 10 MB") : t("empty file", "archivo vacío"));
        const printPlan = () => {
          for (const p of plan) {
            const what = p.action === "update" ? t("update", "actualizar") : p.action === "keep" ? t("keep (already permanent; --replace to redo)", "se queda (ya es permanente; --replace para rehacerla)") : t("no row with that key", "no hay fila con esa llave");
            console.log(`${p.action === "update" ? "~" : "!"} ${p.file} → ${keyCol}=${p.key}: ${what}`);
          }
          for (const r of rejected) console.log(`! ${r.file}: ${why(r.reason)}`);
          if (big.length) console.log(t(`Over 5 MB (WhatsApp won't send them by link): ${big.join(", ")}`, `Más de 5 MB (WhatsApp no las manda por liga): ${big.join(", ")}`));
        };
        if (bool(ctx, "dry-run") || !count("update")) {
          emit(ctx, { ...summary, dryRun: bool(ctx, "dry-run") }, () => {
            printPlan();
            console.log(count("update") ? t("(dry run: nothing uploaded)", "(simulación: no se subió nada)") : t("Nothing to update.", "Nada que actualizar."));
          });
          return;
        }
        // Una subida por foto DISTINTA (misma foto para dos filas = un archivo), pública y permanente.
        const urls = new Map<string, string>();
        const results: Array<{ key: string; file: string; url?: string; error?: string }> = [];
        for (const item of plan.filter((p) => p.action === "update")) {
          const photo = photos.find((p) => p.key === item.key)!;
          try {
            let url = urls.get(photo.sha);
            if (!url) {
              const up = await eb.uploadFile({ fileName: `${photo.sha.slice(0, 32)}.${photo.ext}`, contentType: photo.mime, size: photo.bytes, access: "public" } as never);
              const res = await fetch(up.putUrl, { method: "PUT", body: readFileSync(photo.path), headers: { "Content-Type": photo.mime } });
              if (!res.ok) throw new Error(t(`storage answered ${res.status}`, `el almacenamiento contestó ${res.status}`));
              url = (up.file as { url?: string }).url;
              if (!url) throw new Error(t("the API returned no public link", "la API no devolvió liga pública"));
              urls.set(photo.sha, url);
            }
            await q(`UPDATE ${ident(tableName)} SET ${ident(column)} = ? WHERE ${ident(keyCol)} = ?`, [url, item.key]);
            results.push({ key: item.key, file: item.file, url });
            if (!ctx.json) console.log(`~ ${item.file} → ${keyCol}=${item.key}: ${url}`);
          } catch (e) {
            results.push({ key: item.key, file: item.file, error: (e as Error).message });
            if (!ctx.json) console.error(`! ${item.file}: ${(e as Error).message}`);
          }
        }
        const failed = results.filter((r) => r.error).length;
        emit(ctx, { ...summary, results }, () => {
          for (const p of plan.filter((x) => x.action !== "update")) console.log(`! ${p.file} → ${keyCol}=${p.key}: ${p.action === "keep" ? t("kept", "se quedó") : t("no row with that key", "no hay fila con esa llave")}`);
          for (const r of rejected) console.log(`! ${r.file}: ${why(r.reason)}`);
          console.log(t(`Updated ${results.length - failed} row(s)${failed ? `, ${failed} failed` : ""}.`, `${results.length - failed} fila(s) actualizadas${failed ? `, ${failed} fallaron` : ""}.`));
        });
        if (failed) process.exitCode = 1;
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
