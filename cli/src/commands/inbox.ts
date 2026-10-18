import type { Command, Ctx } from "../types.js";
import { bool, need, str } from "../args.js";
import { emit, fmtDate, table } from "../output.js";
import { api } from "../api.js";
import { resolveCredential } from "../client.js";
import { resolveBaseUrl } from "@easybits.cloud/sdk";
import { CliError, EXIT, usageError } from "../errors.js";
import { YES_OPTION, confirm, requireYesIfHeadless } from "../prompt.js";
import { t } from "../i18n.js";

// Buzones de eventos: una URL de webhook propia de EasyBits. Lo que llega se escucha en vivo
// (`listen`, una línea JSON por evento: sirve tal cual para Monitor de Claude Code o `jq`) o se
// lee después (`read`: sólo lo no leído, y marca como leído). Se nombran por id o por nombre.

type Inbox = { id: string; name: string; url: string; unread: number; lastSeq: number; lastEventAt: string | null; retentionDays: number };
type InboxEvent = { seq: number; source: string; method: string | null; contentType: string | null; body: string; json?: unknown; receivedAt: string };

const ref = (r: string) => encodeURIComponent(r);

/** Una línea legible de un evento: «#3 11:04 http {"hola":1}». Pura, con test. */
export function eventLine(e: InboxEvent, width = 100): string {
  const body = (e.json !== undefined ? JSON.stringify(e.json) : e.body).replace(/\s+/g, " ");
  const head = `#${e.seq} ${fmtDate(e.receivedAt)} ${e.source}`;
  const room = Math.max(width - head.length - 1, 10);
  return `${head} ${body.length > room ? body.slice(0, room - 1) + "…" : body}`;
}

/** Eventos de un bloque SSE (`id:`/`event:`/`data:` separados por línea en blanco). Pura, con test. */
export function parseSse(buffer: string): { events: { event: string; data: string; id?: string }[]; rest: string } {
  const blocks = buffer.split(/\r?\n\r?\n/);
  const rest = blocks.pop() ?? "";
  const events: { event: string; data: string; id?: string }[] = [];
  for (const block of blocks) {
    let event = "message";
    let id: string | undefined;
    const data: string[] = [];
    for (const line of block.split(/\r?\n/)) {
      if (line.startsWith(":")) continue;
      const i = line.indexOf(":");
      const k = i < 0 ? line : line.slice(0, i);
      const v = i < 0 ? "" : line.slice(i + 1).replace(/^ /, "");
      if (k === "event") event = v;
      else if (k === "data") data.push(v);
      else if (k === "id") id = v;
    }
    if (data.length) events.push({ event, data: data.join("\n"), id });
  }
  return { events, rest };
}

async function listen(ctx: Ctx, name: string, since?: number) {
  const base = (await resolveBaseUrl()).replace(/\/$/, "");
  let last = since;
  let backoff = 1000;
  for (;;) {
    const token = await resolveCredential(ctx);
    const q = last != null ? `?since=${last}` : "";
    let res: Response;
    try {
      res = await fetch(`${base}/api/v2/inboxes/${ref(name)}/events/stream${q}`, { headers: { Authorization: `Bearer ${token}`, Accept: "text/event-stream" } });
    } catch {
      await new Promise((r) => setTimeout(r, backoff));
      backoff = Math.min(backoff * 2, 30_000);
      continue;
    }
    if (res.status === 401 || res.status === 403 || res.status === 404) {
      throw new CliError(t(`Can't listen to "${name}" (HTTP ${res.status}).`, `No se puede escuchar «${name}» (HTTP ${res.status}).`), res.status === 404 ? EXIT.API : EXIT.AUTH, "easybits inbox ls");
    }
    if (!res.ok || !res.body) {
      await new Promise((r) => setTimeout(r, backoff));
      backoff = Math.min(backoff * 2, 30_000);
      continue;
    }
    backoff = 1000;
    const reader = res.body.getReader();
    const dec = new TextDecoder();
    let buf = "";
    try {
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        buf += dec.decode(value, { stream: true });
        const { events, rest } = parseSse(buf);
        buf = rest;
        for (const ev of events) {
          if (ev.event === "ready") {
            const r = JSON.parse(ev.data) as { name: string; since: number };
            if (last == null) last = r.since;
            process.stderr.write(t(`Listening to «${r.name}» from #${r.since}. One JSON line per event.\n`, `Escuchando «${r.name}» desde #${r.since}. Una línea JSON por evento.\n`));
          } else if (ev.event === "inbox") {
            const e = JSON.parse(ev.data) as InboxEvent;
            last = e.seq;
            process.stdout.write(JSON.stringify(e) + "\n");
          }
        }
      }
    } catch {
      /* se cortó: reconecta abajo */
    }
    process.stderr.write(t("Connection dropped; reconnecting…\n", "Se cortó la conexión; reconectando…\n"));
  }
}

export const inbox: Command = {
  name: "inbox",
  aliases: ["inboxes"],
  group: "Account",
  summary: "Event inboxes: your own webhook URL whose events reach your terminal live or wait for you to read them",
  synopsis: "inbox <ls|create|listen|read|update|rotate|rm>",
  subs: {
    ls: {
      aliases: ["list"],
      summary: "List your inboxes with their URL and unread events",
      usage: "easybits inbox ls",
      examples: ["easybits inbox ls", "easybits inbox ls --json"],
      async run(ctx) {
        const { items } = await api<{ items: Inbox[] }>(ctx, "GET", "/inboxes");
        emit(ctx, { items }, () =>
          table(
            items.map((b) => ({ name: b.name, unread: b.unread, last: b.lastEventAt ? fmtDate(b.lastEventAt) : "—", url: b.url })),
            [["name", "NAME"], ["unread", "UNREAD"], ["last", "LAST EVENT"], ["url", "URL"]],
            t('No inboxes. Create one: easybits inbox create builds', 'Sin buzones. Crea uno: easybits inbox create builds'),
          ),
        );
      },
    },
    create: {
      aliases: ["add"],
      summary: "Create an inbox and print its webhook URL (anyone with it can write: keep it private)",
      usage: "easybits inbox create <name> [--retention <days>]",
      options: { retention: { type: "string", value: "days", description: "Days events are kept (1-30, default 7)" } },
      examples: ["easybits inbox create builds", "easybits inbox create stripe --retention 30 --json"],
      async run(ctx) {
        const name = need(ctx, 0, "name", this.usage);
        const days = str(ctx, "retention");
        if (days != null && !/^\d+$/.test(days)) throw usageError(t("--retention is whole days.", "--retention son días enteros."), this.usage);
        const b = await api<Inbox>(ctx, "POST", "/inboxes", { name, ...(days ? { retentionDays: Number(days) } : {}) });
        emit(ctx, b, () => {
          console.log(t(`Inbox «${b.name}» ready. POST anything to:`, `Buzón «${b.name}» listo. Manda cualquier cosa con POST a:`));
          console.log(`  ${b.url}`);
          console.log(t(`Listen live: easybits inbox listen ${b.name}   ·   Read later: easybits inbox read ${b.name}`, `En vivo: easybits inbox listen ${b.name}   ·   Después: easybits inbox read ${b.name}`));
        });
      },
    },
    listen: {
      aliases: ["tail", "follow"],
      summary: "Stream an inbox: one JSON line per event as it arrives (reconnects on its own)",
      usage: "easybits inbox listen <id|name> [--since <seq>]",
      options: { since: { type: "string", value: "seq", description: "Start after this event (0 = everything kept; default: unread)" } },
      examples: ["easybits inbox listen builds", "easybits inbox listen builds --since 0 | jq .json"],
      async run(ctx) {
        const name = need(ctx, 0, "id|name", this.usage);
        const since = str(ctx, "since");
        if (since != null && !/^\d+$/.test(since)) throw usageError(t("--since is an event number.", "--since es un número de evento."), this.usage);
        await listen(ctx, name, since != null ? Number(since) : undefined);
      },
    },
    read: {
      summary: "Show the events you haven't read yet and mark them read (the next read brings only new ones)",
      usage: "easybits inbox read <id|name> [--all | --since <seq>] [--no-ack] [--limit N]",
      options: {
        all: { type: "boolean", description: "Everything still kept, read or not" },
        since: { type: "string", value: "seq", description: "Events after this one, read or not (the cursor of a previous read)" },
        "no-ack": { type: "boolean", description: "Just look; don't mark them read" },
        limit: { type: "string", value: "N", description: "At most N events (default 50, max 200)" },
      },
      examples: ["easybits inbox read builds", "easybits inbox read builds --all --no-ack --json", "easybits inbox read builds --since 12 --no-ack"],
      async run(ctx) {
        const name = need(ctx, 0, "id|name", this.usage);
        const since = str(ctx, "since");
        if (since != null && !/^\d+$/.test(since)) throw usageError(t("--since is an event number.", "--since es un número de evento."), this.usage);
        if (since != null && bool(ctx, "all")) throw usageError(t("--all and --since are exclusive.", "--all y --since no van juntos."), this.usage);
        const q = new URLSearchParams();
        if (bool(ctx, "all")) q.set("since", "0");
        if (since != null) q.set("since", since);
        if (bool(ctx, "no-ack")) q.set("ack", "0");
        if (str(ctx, "limit")) q.set("limit", str(ctx, "limit")!);
        const r = await api<{ items: InboxEvent[]; cursor: number; unread: number }>(ctx, "GET", `/inboxes/${ref(name)}/events${q.size ? `?${q}` : ""}`);
        emit(ctx, r, () => {
          if (!r.items.length) return console.log(t("Nothing new.", "Nada nuevo."));
          for (const e of r.items) console.log(eventLine(e, process.stdout.columns || 100));
          if (r.unread) console.log(t(`\n${r.unread} more unread: easybits inbox read ${name}`, `\nQuedan ${r.unread} sin leer: easybits inbox read ${name}`));
        });
      },
    },
    update: {
      aliases: ["edit", "set"],
      summary: "Rename an inbox or change how long it keeps events (its URL stays the same)",
      usage: "easybits inbox update <id|name> [--name <new>] [--retention <days>]",
      options: {
        name: { type: "string", value: "new", description: "New name, unique in your account" },
        retention: { type: "string", value: "days", description: "Days events are kept (1-30)" },
      },
      examples: ["easybits inbox update builds --retention 30", "easybits inbox update builds --name ci --json"],
      async run(ctx) {
        const name = need(ctx, 0, "id|name", this.usage);
        const days = str(ctx, "retention");
        if (days != null && !/^\d+$/.test(days)) throw usageError(t("--retention is whole days.", "--retention son días enteros."), this.usage);
        const patch = { ...(str(ctx, "name") ? { name: str(ctx, "name") } : {}), ...(days ? { retentionDays: Number(days) } : {}) };
        if (!Object.keys(patch).length) throw usageError(t("Nothing to change: pass --name or --retention.", "No hay nada que cambiar: pasa --name o --retention."), this.usage);
        const b = await api<Inbox>(ctx, "PATCH", `/inboxes/${ref(name)}`, patch);
        emit(ctx, b, () => console.log(t(`Updated «${b.name}»: keeps events ${b.retentionDays} days.`, `Actualizado «${b.name}»: guarda los eventos ${b.retentionDays} días.`)));
      },
    },
    rotate: {
      summary: "Give an inbox a new URL and print it; the old one stops accepting writes right away (stored events stay)",
      usage: "easybits inbox rotate <id|name> [--yes]",
      options: { ...YES_OPTION },
      examples: ["easybits inbox rotate builds --yes", "easybits inbox rotate builds --yes --json"],
      async run(ctx) {
        const name = need(ctx, 0, "id|name", this.usage);
        requireYesIfHeadless(ctx);
        await confirm(ctx, t(`New URL for «${name}»? Whoever uses the old one stops getting through.`, `¿URL nueva para «${name}»? Quien use la vieja deja de poder escribir.`));
        const b = await api<Inbox>(ctx, "POST", `/inboxes/${ref(name)}/rotate`);
        emit(ctx, b, () => {
          console.log(t(`New URL for «${b.name}» (the old one no longer works):`, `URL nueva de «${b.name}» (la vieja ya no sirve):`));
          console.log(`  ${b.url}`);
        });
      },
    },
    rm: {
      aliases: ["remove", "delete"],
      summary: "Delete an inbox and its events; its URL stops accepting writes",
      usage: "easybits inbox rm <id|name> [--yes]",
      options: { ...YES_OPTION },
      examples: ["easybits inbox rm builds --yes"],
      async run(ctx) {
        const name = need(ctx, 0, "id|name", this.usage);
        requireYesIfHeadless(ctx);
        await confirm(ctx, t(`Delete inbox «${name}» and its events?`, `¿Borrar el buzón «${name}» y sus eventos?`));
        const r = await api<{ deleted: true; id: string }>(ctx, "DELETE", `/inboxes/${ref(name)}`);
        emit(ctx, r, () => console.log(t(`Deleted «${name}»`, `Borrado «${name}»`)));
      },
    },
  },
  defaultSub: "ls",
};
