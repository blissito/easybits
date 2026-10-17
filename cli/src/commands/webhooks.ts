import type { ApiKey } from "@easybits.cloud/sdk";
import type { Command, Ctx } from "../types.js";
import { bool, list, need, str } from "../args.js";
import { emit, fmtDate, table } from "../output.js";
import { api } from "../api.js";
import { getClient, resolveCredential } from "../client.js";
import { CliError, EXIT, usageError } from "../errors.js";
import { YES_OPTION, confirm, requireYesIfHeadless } from "../prompt.js";
import { t } from "../i18n.js";

/** `--event a --event b,c` → ["a","b","c"] (sin repetidos). Puro, con test. */
export function eventList(values: string[]): string[] {
  return [...new Set(values.flatMap((v) => v.split(",")).map((s) => s.trim()).filter(Boolean))];
}

/** `READ,write` → ["READ","WRITE"]; vacío = undefined (la API pone READ/WRITE/DELETE). */
export function scopeList(value: string | undefined): string[] | undefined {
  if (value == null) return undefined;
  const out = [...new Set(value.split(",").map((s) => s.trim().toUpperCase()).filter(Boolean))];
  return out.length ? out : undefined;
}

/** Una key por id, nombre exacto o prefijo (`eb_sk_live_abcd1234`). Ambiguo → null + lista. */
export function matchKey(ref: string, keys: Pick<ApiKey, "id" | "name" | "prefix" | "status">[]): { id: string } | { matches: typeof keys } {
  const byId = keys.find((k) => k.id === ref);
  if (byId) return { id: byId.id };
  const r = ref.trim();
  const found = keys.filter((k) => k.status !== "REVOKED" && (k.prefix === r || k.name.toLowerCase() === r.toLowerCase()));
  return found.length === 1 ? { id: found[0].id } : { matches: found };
}

const EVENT_OPTION = {
  event: { type: "string", multiple: true, value: "name", description: "Event to deliver (repeatable or comma-separated): file.created, website.deleted, form.submitted…" },
} as const;

export const webhooks: Command = {
  name: "webhooks",
  aliases: ["webhook"],
  group: "Account",
  summary: "Webhooks: HTTPS POSTs signed with HMAC when your files, websites or forms change",
  synopsis: "webhooks",
  subs: {
    ls: {
      aliases: ["list"],
      summary: "List your webhooks",
      usage: "easybits webhooks ls",
      examples: ["easybits webhooks ls", "easybits webhooks ls --json"],
      async run(ctx) {
        const { items } = await (await getClient(ctx)).listWebhooks();
        emit(ctx, items, () =>
          table(
            items.map((w) => ({ ...w, events: w.events.join(","), fails: w.failCount })),
            [["id", "ID"], ["url", "URL"], ["events", "EVENTS"], ["status", "STATUS"], ["fails", "FAILS"]],
            t("No webhooks. Create one: easybits webhooks create https://example.com/hook --event file.created", "Sin webhooks. Crea uno: easybits webhooks create https://ejemplo.com/hook --event file.created"),
          ),
        );
      },
    },
    create: {
      summary: "Create a webhook; prints its signing secret ONCE",
      usage: "easybits webhooks create <https-url> --event <name>...",
      options: { ...EVENT_OPTION },
      examples: [
        "easybits webhooks create https://example.com/hook --event file.created --event file.deleted",
        "easybits webhooks create https://example.com/hook --event form.submitted --json | jq -r .secret",
      ],
      async run(ctx) {
        const url = need(ctx, 0, "https-url", this.usage);
        const events = eventList(list(ctx, "event"));
        if (!events.length) throw usageError(t("Missing --event (at least one).", "Falta --event (al menos uno)."), this.usage);
        const w = await (await getClient(ctx)).createWebhook({ url, events });
        emit(ctx, w, () => {
          console.log(t(`Created ${w.id} → ${w.url} (${w.events.join(", ")})`, `Creado ${w.id} → ${w.url} (${w.events.join(", ")})`));
          console.log(`${t("Signing secret", "Secreto de firma")}: ${w.secret}`);
          console.error(
            t(
              "Save it now: it is not shown again. Verify X-Easybits-Signature (HMAC-SHA256 of the body) with it.",
              "Guárdalo ya: no se vuelve a mostrar. Con él verificas X-Easybits-Signature (HMAC-SHA256 del cuerpo).",
            ),
          );
        });
      },
    },
    update: {
      summary: "Change a webhook's URL or events, or pause/resume it",
      usage: "easybits webhooks update <id> [--url <https-url>] [--event <name>...] [--pause|--resume]",
      options: {
        url: { type: "string", value: "https-url", description: "New destination URL" },
        ...EVENT_OPTION,
        pause: { type: "boolean", description: "Stop deliveries (status PAUSED)" },
        resume: { type: "boolean", description: "Deliver again and reset the failure count (status ACTIVE)" },
      },
      examples: ["easybits webhooks update 66f0c2a1b2c3d4e5f6a7b8c9 --event file.created,file.updated", "easybits webhooks update 66f0c2a1b2c3d4e5f6a7b8c9 --resume"],
      async run(ctx) {
        const id = need(ctx, 0, "id", this.usage);
        if (bool(ctx, "pause") && bool(ctx, "resume")) throw usageError(t("Pass --pause or --resume, not both.", "Pasa --pause o --resume, no ambos."), this.usage);
        const events = eventList(list(ctx, "event"));
        const params = {
          ...(str(ctx, "url") ? { url: str(ctx, "url") } : {}),
          ...(events.length ? { events } : {}),
          ...(bool(ctx, "pause") ? { status: "PAUSED" as const } : bool(ctx, "resume") ? { status: "ACTIVE" as const } : {}),
        };
        if (!Object.keys(params).length) throw usageError(t("Nothing to change: pass --url, --event, --pause or --resume.", "Nada que cambiar: pasa --url, --event, --pause o --resume."), this.usage);
        const w = await (await getClient(ctx)).updateWebhook(id, params);
        emit(ctx, w, () => console.log(t(`Updated ${w.id}: ${w.url} (${w.events.join(", ")}) ${w.status}`, `Actualizado ${w.id}: ${w.url} (${w.events.join(", ")}) ${w.status}`)));
      },
    },
    rm: {
      aliases: ["remove", "delete"],
      summary: "Delete a webhook",
      usage: "easybits webhooks rm <id> [--yes]",
      options: { ...YES_OPTION },
      examples: ["easybits webhooks rm 66f0c2a1b2c3d4e5f6a7b8c9 --yes"],
      async run(ctx) {
        const id = need(ctx, 0, "id", this.usage);
        requireYesIfHeadless(ctx);
        await confirm(ctx, t(`Delete webhook ${id}? Deliveries stop right away.`, `¿Borrar el webhook ${id}? Las entregas paran de inmediato.`));
        const r = await (await getClient(ctx)).deleteWebhook(id);
        emit(ctx, { ...r, id }, () => console.log(t(`Deleted ${id}`, `Borrado ${id}`)));
      },
    },
  },
};

type NewKey = { id: string; prefix: string; raw: string; scopes: string[]; name: string; expiresAt?: string | null };

async function resolveKey(ctx: Ctx, ref: string): Promise<ApiKey> {
  const { keys } = await (await getClient(ctx)).listKeys();
  const m = matchKey(ref, keys);
  if ("id" in m) return keys.find((k) => k.id === m.id)!;
  if (!m.matches.length) {
    throw new CliError(t(`No active key with id, name or prefix "${ref}".`, `No hay key activa con id, nombre o prefijo "${ref}".`), EXIT.API, `${t("List them with", "Enlístalas con")}: easybits keys ls`, "not_found", 404);
  }
  throw new CliError(
    t(`"${ref}" matches ${m.matches.length} keys. Use the id:`, `"${ref}" coincide con ${m.matches.length} keys. Usa el id:`),
    EXIT.USAGE,
    m.matches.map((k) => `  ${k.id}  ${k.prefix}…  ${k.name}`).join("\n"),
    "ambiguous",
  );
}

export const keys: Command = {
  name: "keys",
  aliases: ["key"],
  group: "Account",
  summary: "API keys of your account: list, create, revoke",
  synopsis: "keys",
  subs: {
    ls: {
      aliases: ["list"],
      summary: "List your API keys (prefix only; the full key is never shown again)",
      usage: "easybits keys ls",
      examples: ["easybits keys ls", "easybits keys ls --json"],
      async run(ctx) {
        const { keys: items } = await (await getClient(ctx)).listKeys();
        emit(ctx, items, () =>
          table(
            items.map((k) => ({ ...k, prefix: `${k.prefix}…`, scopes: k.scopes.join(","), createdAt: fmtDate(k.createdAt), expiresAt: k.expiresAt ? fmtDate(k.expiresAt) : t("never", "nunca") })),
            [["id", "ID"], ["name", "NAME"], ["prefix", "PREFIX"], ["scopes", "SCOPES"], ["status", "STATUS"], ["expiresAt", "EXPIRES"]],
            t("No API keys.", "Sin API keys."),
          ),
        );
      },
    },
    create: {
      summary: "Create an API key; prints it ONCE",
      usage: "easybits keys create <name> [--scopes READ,WRITE,DELETE] [--expires <date>]",
      options: {
        scopes: { type: "string", value: "list", description: "Comma-separated: READ, WRITE, DELETE, ADMIN (default READ,WRITE,DELETE; never more than your own credential has)" },
        expires: { type: "string", value: "date", description: "Expiry date (ISO, e.g. 2027-01-31); default never" },
      },
      examples: [
        "easybits keys create ci-deploy",
        "easybits keys create dashboard-readonly --scopes READ --expires 2027-01-31",
        "KEY=$(easybits keys create ci --json | jq -r .raw)",
      ],
      async run(ctx) {
        const name = need(ctx, 0, "name", this.usage);
        const expires = str(ctx, "expires");
        if (expires && Number.isNaN(new Date(expires).getTime())) throw usageError(t(`--expires must be a date (2027-01-31), got "${expires}".`, `--expires debe ser una fecha (2027-01-31), llegó "${expires}".`), this.usage);
        const k = await api<NewKey>(ctx, "POST", "/keys", { name, scopes: scopeList(str(ctx, "scopes")), ...(expires ? { expiresAt: new Date(expires).toISOString() } : {}) });
        emit(ctx, k, () => {
          console.log(t(`Created ${k.name} (${k.id}) — ${k.scopes.join(", ")}`, `Creada ${k.name} (${k.id}) — ${k.scopes.join(", ")}`));
          console.log(k.raw);
          console.error(t("Save it now: it is not shown again (keys ls only shows the prefix).", "Guárdala ya: no se vuelve a mostrar (keys ls sólo muestra el prefijo)."));
        });
      },
    },
    revoke: {
      aliases: ["rm", "delete"],
      summary: "Revoke an API key (by id, name or prefix); anything using it stops working",
      usage: "easybits keys revoke <id|name|prefix> [--yes]",
      options: { ...YES_OPTION },
      examples: ["easybits keys revoke ci-deploy", "easybits keys revoke eb_sk_live_abcd1234 --yes"],
      async run(ctx) {
        const ref = need(ctx, 0, "key", this.usage);
        requireYesIfHeadless(ctx);
        const k = await resolveKey(ctx, ref);
        // La que usa este mismo CLI: revocarla cierra la sesión aquí también.
        const self = (await resolveCredential(ctx)).startsWith(k.prefix);
        await confirm(
          ctx,
          self
            ? t(`Revoke ${k.name} (${k.prefix}…)? It is the key THIS CLI is using: you will need easybits login after.`, `¿Revocar ${k.name} (${k.prefix}…)? Es la key que usa ESTE CLI: después tendrás que correr easybits login.`)
            : t(`Revoke ${k.name} (${k.prefix}…)? Anything using it stops working right away.`, `¿Revocar ${k.name} (${k.prefix}…)? Lo que la use deja de funcionar de inmediato.`),
        );
        const r = await api<{ success: boolean }>(ctx, "DELETE", `/keys/${encodeURIComponent(k.id)}`);
        emit(ctx, { ...r, id: k.id, name: k.name, prefix: k.prefix }, () => console.log(t(`Revoked ${k.name} (${k.prefix}…)`, `Revocada ${k.name} (${k.prefix}…)`)));
      },
    },
  },
};
