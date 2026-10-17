import { EasybitsError } from "@easybits.cloud/sdk";
import type { Command, Ctx, Leaf } from "../types.js";
import { bool, int, need } from "../args.js";
import { emit, fmtDate, table } from "../output.js";
import { api } from "../api.js";
import { getClient } from "../client.js";
import { CliError, EXIT, usageError } from "../errors.js";
import { YES_OPTION, confirm, requireYesIfHeadless } from "../prompt.js";
import { t } from "../i18n.js";
import { resolveWebsiteId } from "./account.js";

// Dos clases de dominio propio:
// - de la CUENTA (`easybits domains …`, /api/v2/domains): midominio.com sirve tus sitios en
//   <slug>.midominio.com y, si le asignas uno, en la raíz;
// - de una CAJA (`easybits sandboxes domains …`): tienda.com → un puerto de un sandbox o máquina.
// Antes `domains` era sólo lo segundo; aliases.ts manda la forma vieja a `sandboxes domains`.

export type DnsRecord = { name: string; type: string; ttl?: number; values: string[] };

export type DomainRow = {
  id: string;
  domain: string;
  verified: boolean;
  txtToken: string;
  dnsProvider?: string | null;
  websites?: Array<{ id: string; name: string; slug: string }>;
  apexWebsite?: { id: string; name: string; slug: string } | null;
  dns?: DnsRecord[];
  createdAt?: string;
};

/** Un id de Mongo (24 hex) pasa directo; si no, se busca por nombre de dominio. Puro, con test. */
export function matchDomain(ref: string, items: Pick<DomainRow, "id" | "domain">[]): string | null {
  if (/^[0-9a-f]{24}$/i.test(ref)) return ref;
  const r = ref.trim().toLowerCase().replace(/^https?:\/\//, "").replace(/\/.*$/, "");
  return items.find((d) => d.domain === r)?.id ?? null;
}

async function listDomains(ctx: Ctx): Promise<DomainRow[]> {
  return (await api<{ domains: DomainRow[] }>(ctx, "GET", "/domains")).domains;
}

async function resolveDomain(ctx: Ctx, ref: string): Promise<{ id: string; row?: DomainRow }> {
  if (/^[0-9a-f]{24}$/i.test(ref)) return { id: ref };
  const items = await listDomains(ctx);
  const id = matchDomain(ref, items);
  if (id) return { id, row: items.find((d) => d.id === id) };
  throw new CliError(
    t(`No domain "${ref}" in your account.`, `No hay dominio "${ref}" en tu cuenta.`),
    EXIT.API,
    `${t("List them with", "Enlístalos con")}: easybits domains ls`,
    "not_found",
    404,
  );
}

/** Registros DNS en columnas, para copiarlos al panel del proveedor. */
export function dnsLines(records: DnsRecord[], apexNames: Set<string>): string[] {
  return records.map((r) => {
    const opt = apexNames.has(r.name) ? t("   (only to serve a site at the root)", "   (sólo para servir un sitio en la raíz)") : "";
    return `  ${r.type.padEnd(6)}${r.name.padEnd(40)}${r.values.join(" ")}${opt}`;
  });
}

function printDns(d: DomainRow) {
  if (!d.dns?.length) return;
  const apex = new Set([d.domain, `www.${d.domain}`]);
  console.log(t("Create these DNS records at your DNS provider:", "Crea estos registros DNS en tu proveedor de DNS:"));
  for (const l of dnsLines(d.dns, apex)) console.log(l);
}

export const domains: Command = {
  name: "domains",
  aliases: ["domain"],
  group: "Hosting",
  summary: "Your own domains for your websites (sandbox ports: sandboxes domains)",
  synopsis: "domains",
  subs: {
    ls: {
      aliases: ["list"],
      summary: "List the custom domains of your account",
      usage: "easybits domains ls",
      examples: ["easybits domains ls", "easybits domains ls --json"],
      async run(ctx) {
        const items = await listDomains(ctx);
        emit(ctx, items, () =>
          table(
            items.map((d) => ({
              ...d,
              status: d.verified ? t("verified", "verificado") : t("pending", "pendiente"),
              root: d.apexWebsite?.slug ?? "-",
              dnsBy: d.dnsProvider ?? t("manual", "a mano"),
              createdAt: fmtDate(d.createdAt),
            })),
            [["id", "ID"], ["domain", "DOMAIN"], ["status", "STATUS"], ["root", "ROOT"], ["dnsBy", "DNS"], ["createdAt", "CREATED"]],
            t("No custom domains. Add one: easybits domains add example.com", "Sin dominios propios. Agrega uno: easybits domains add midominio.com"),
          ),
        );
      },
    },
    add: {
      summary: "Register a domain; prints the DNS records to create",
      usage: "easybits domains add <domain>",
      examples: ["easybits domains add example.com", "easybits domains add example.com --json | jq .dns"],
      async run(ctx) {
        const name = need(ctx, 0, "domain", this.usage);
        const { domain } = await api<{ domain: DomainRow }>(ctx, "POST", "/domains", { domain: name });
        emit(ctx, domain, () => {
          console.log(t(`Added ${domain.domain} (${domain.id})`, `Agregado ${domain.domain} (${domain.id})`));
          printDns(domain);
          console.log(
            t(
              `Then run: easybits domains verify ${domain.domain}   (DNS in Mailmask? easybits domains dns-auto ${domain.domain})`,
              `Luego corre: easybits domains verify ${domain.domain}   (¿DNS en Mailmask? easybits domains dns-auto ${domain.domain})`,
            ),
          );
        });
      },
    },
    verify: {
      summary: "Check the TXT record and issue the certificate",
      usage: "easybits domains verify <domain>",
      examples: ["easybits domains verify example.com"],
      async run(ctx) {
        const { id } = await resolveDomain(ctx, need(ctx, 0, "domain", this.usage));
        // Sin el TXT la API responde 400 con el registro que falta: sale con 1 y ese mensaje.
        const { domain } = await api<{ domain: DomainRow }>(ctx, "POST", `/domains/${id}/verify`);
        emit(ctx, domain, () => console.log(t(`${domain.domain}: verified. Your sites answer at <slug>.${domain.domain}`, `${domain.domain}: verificado. Tus sitios responden en <slug>.${domain.domain}`)));
      },
    },
    "dns-auto": {
      summary: "Write the DNS records into your Mailmask zone and verify (--undo restores)",
      usage: "easybits domains dns-auto <domain> [--undo]",
      options: { undo: { type: "boolean", description: "Restore the records EasyBits wrote (keeps the ones you changed)" } },
      examples: ["easybits domains dns-auto example.com", "easybits domains dns-auto example.com --undo"],
      async run(ctx) {
        const { id } = await resolveDomain(ctx, need(ctx, 0, "domain", this.usage));
        const undo = bool(ctx, "undo");
        try {
          const r = await api<{ verified?: boolean; zone?: string; records?: string[]; nothing?: boolean; skipped?: string[] }>(ctx, undo ? "DELETE" : "POST", `/domains/${id}/dns-auto`);
          emit(ctx, r, () => {
            if (undo) {
              console.log(r.nothing ? t("Nothing to undo.", "Nada que deshacer.") : t("Records restored.", "Registros restaurados."));
              if (r.skipped?.length) console.log(t(`Left alone (you changed them): ${r.skipped.join(", ")}`, `Sin tocar (los cambiaste tú): ${r.skipped.join(", ")}`));
            } else {
              console.log(t(`Wrote ${r.records?.join(", ")} in zone ${r.zone}`, `Escribí ${r.records?.join(", ")} en la zona ${r.zone}`));
              console.log(r.verified ? t("Verified.", "Verificado.") : t("Not verified yet (DNS still propagating): run easybits domains verify in a minute.", "Todavía no verifica (el DNS sigue propagando): corre easybits domains verify en un minuto."));
            }
          });
        } catch (e) {
          // Sin conexión a Mailmask: el consentimiento es de navegador, se da la liga.
          const body = e instanceof EasybitsError && e.status === 409 ? String(e.body ?? "") : "";
          const m = /"connectUrl"\s*:\s*"([^"]+)"/.exec(body);
          if (m) {
            throw new CliError(
              t("Mailmask is not connected to your account.", "Mailmask no está conectado a tu cuenta."),
              EXIT.API,
              t(`Open this once in your browser to connect it, then run the command again:\n  ${m[1]}`, `Abre esto una vez en tu navegador para conectarlo y vuelve a correr el comando:\n  ${m[1]}`),
              "mailmask_not_connected",
              409,
            );
          }
          throw e;
        }
      },
    },
    apex: {
      aliases: ["assign"],
      summary: "Serve one of your websites at the root domain and www (--clear removes it)",
      usage: "easybits domains apex <domain> <website|--clear>",
      options: { clear: { type: "boolean", description: "Stop serving a website at the root" } },
      examples: ["easybits domains apex example.com mi-tienda", "easybits domains apex example.com --clear"],
      async run(ctx) {
        const ref = need(ctx, 0, "domain", this.usage);
        const clear = bool(ctx, "clear");
        if (!clear && !ctx.args[1]) throw usageError(t("Missing <website> (or pass --clear).", "Falta <website> (o pasa --clear)."), this.usage);
        if (clear && ctx.args[1]) throw usageError(t("Pass a <website> or --clear, not both.", "Pasa un <website> o --clear, no ambos."), this.usage);
        const { id } = await resolveDomain(ctx, ref);
        const websiteId = clear ? null : await resolveWebsiteId(ctx, ctx.args[1]);
        const { domain } = await api<{ domain: DomainRow }>(ctx, "POST", `/domains/${id}/apex`, { websiteId });
        emit(ctx, domain, () =>
          console.log(
            domain.apexWebsite
              ? t(`${domain.domain} and www.${domain.domain} → ${domain.apexWebsite.slug}`, `${domain.domain} y www.${domain.domain} → ${domain.apexWebsite.slug}`)
              : t(`${domain.domain}: no website at the root.`, `${domain.domain}: sin sitio en la raíz.`),
          ),
        );
      },
    },
    rm: {
      aliases: ["remove", "delete"],
      summary: "Remove a domain: unlinks its websites and deletes its certificates",
      usage: "easybits domains rm <domain> [--yes]",
      options: { ...YES_OPTION },
      examples: ["easybits domains rm example.com", "easybits domains rm example.com --yes"],
      async run(ctx) {
        const ref = need(ctx, 0, "domain", this.usage);
        requireYesIfHeadless(ctx);
        const { id, row } = await resolveDomain(ctx, ref);
        const name = row?.domain ?? ref;
        await confirm(ctx, t(`Remove ${name}? Its websites stop answering on it right away.`, `¿Quitar ${name}? Sus sitios dejan de responder en él de inmediato.`));
        const r = await api<{ ok: boolean }>(ctx, "DELETE", "/domains", { domainId: id });
        emit(ctx, { ...r, domainId: id, domain: name }, () => console.log(t(`Removed ${name}`, `Quitado ${name}`)));
      },
    },
  },
};

// ── Dominios de una caja: `easybits sandboxes domains <ls|add|verify|rm> <sandbox> …` ──

export const SANDBOX_DOMAINS_USAGE = "easybits sandboxes domains <ls|add|verify|rm> <sandbox> [domain] [--port <port>] [--yes]";

export const sandboxDomains: Leaf = {
  summary: "Custom domains with auto TLS on a sandbox or machine port",
  usage: SANDBOX_DOMAINS_USAGE,
  options: {
    port: { type: "string", value: "port", description: "add: port inside the sandbox (required)" },
    ...YES_OPTION,
  },
  examples: [
    "easybits sandboxes domains ls sb_abc123",
    "easybits sb domains add sb_abc123 shop.example.com --port 3000",
    "easybits sb domains verify sb_abc123 shop.example.com",
    "easybits sb domains rm sb_abc123 shop.example.com --yes",
  ],
  async run(ctx) {
    const action = need(ctx, 0, "ls|add|verify|rm", SANDBOX_DOMAINS_USAGE);
    const id = need(ctx, 1, "sandbox", SANDBOX_DOMAINS_USAGE);
    if (action === "ls" || action === "list") {
      const sb = await (await getClient(ctx)).sandboxes.get(id);
      const items = await sb.listDomains();
      emit(ctx, items, () => table(items as any, [["domain", "DOMAIN"], ["port", "PORT"]], t("No custom domains.", "Sin dominios propios.")));
      return;
    }
    const domain = need(ctx, 2, "domain", SANDBOX_DOMAINS_USAGE);
    if (action === "add") {
      const port = int(ctx, "port", SANDBOX_DOMAINS_USAGE);
      if (port == null) throw usageError(t("Missing --port.", "Falta --port."), SANDBOX_DOMAINS_USAGE);
      const r = await (await (await getClient(ctx)).sandboxes.get(id)).addDomain(domain, port);
      emit(ctx, r, () => {
        console.log(t(`Attached ${r.domain} → port ${r.port}`, `Ligado ${r.domain} → puerto ${r.port}`));
        console.log(t(`Create this DNS record: ${JSON.stringify(r.dns)}`, `Crea este registro DNS: ${JSON.stringify(r.dns)}`));
        console.log(t(`Then run: easybits sandboxes domains verify ${id} ${r.domain}`, `Luego corre: easybits sandboxes domains verify ${id} ${r.domain}`));
      });
    } else if (action === "verify") {
      const r = await (await (await getClient(ctx)).sandboxes.get(id)).verifyDomain(domain);
      emit(ctx, r, () => {
        console.log(`${r.domain}: ${r.ready ? t("ready", "listo") : t("not ready yet", "todavía no está listo")}`);
        console.log(t(`DNS resolved: ${r.dns.resolved}  HTTPS ok: ${r.https.ok}`, `DNS resuelve: ${r.dns.resolved}  HTTPS ok: ${r.https.ok}`));
        if (r.hint) console.log(r.hint);
      });
      // No listo = no es error de API, pero sí algo que un script debe notar.
      if (!r.ready) process.exitCode = 1;
    } else if (action === "rm" || action === "remove" || action === "delete") {
      requireYesIfHeadless(ctx);
      // Reversible (se vuelve a agregar), pero corta el tráfico: basta [y/N] (clig.dev).
      await confirm(ctx, t(`Detach ${domain} from ${id}? It stops serving right away.`, `¿Desligar ${domain} de ${id}? Deja de servir de inmediato.`));
      const r = await (await (await getClient(ctx)).sandboxes.get(id)).removeDomain(domain);
      emit(ctx, r, () => console.log(t(`Removed ${domain}`, `Quitado ${domain}`)));
    } else {
      throw usageError(t(`Unknown domains action "${action}".`, `Acción de domains desconocida "${action}".`), SANDBOX_DOMAINS_USAGE);
    }
  },
};
