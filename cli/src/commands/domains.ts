import type { Command, Ctx } from "../types.js";
import { int, need } from "../args.js";
import { emit, table } from "../output.js";
import { getClient } from "../client.js";
import { usageError } from "../errors.js";
import { YES_OPTION, confirm, requireYesIfHeadless } from "../prompt.js";
import { t } from "../i18n.js";

async function sandbox(ctx: Ctx, usage: string) {
  const id = need(ctx, 0, "sandbox", usage);
  return (await getClient(ctx)).sandboxes.get(id);
}

export const domains: Command = {
  name: "domains",
  aliases: ["domain"],
  group: "Hosting",
  summary: "Custom domains with auto TLS on a sandbox or machine",
  synopsis: "domains",
  subs: {
    ls: {
      aliases: ["list"],
      summary: "List domains attached to a sandbox",
      usage: "easybits domains ls <sandbox>",
      examples: ["easybits domains ls sb_abc123"],
      async run(ctx) {
        const items = await (await sandbox(ctx, this.usage)).listDomains();
        emit(ctx, items, () => table(items as any, [["domain", "DOMAIN"], ["port", "PORT"]], t("No custom domains.", "Sin dominios propios.")));
      },
    },
    add: {
      summary: "Attach a domain to a port; prints the DNS record to create",
      usage: "easybits domains add <sandbox> <domain> --port <port>",
      options: { port: { type: "string", value: "port", description: "Port inside the sandbox (required)" } },
      examples: ["easybits domains add sb_abc123 shop.example.com --port 3000"],
      async run(ctx) {
        const domain = need(ctx, 1, "domain", this.usage);
        const port = int(ctx, "port", this.usage);
        if (port == null) throw usageError(t("Missing --port.", "Falta --port."), this.usage);
        const r = await (await sandbox(ctx, this.usage)).addDomain(domain, port);
        emit(ctx, r, () => {
          console.log(t(`Attached ${r.domain} → port ${r.port}`, `Ligado ${r.domain} → puerto ${r.port}`));
          console.log(t(`Create this DNS record: ${JSON.stringify(r.dns)}`, `Crea este registro DNS: ${JSON.stringify(r.dns)}`));
          console.log(t(`Then run: easybits domains verify ${ctx.args[0]} ${r.domain}`, `Luego corre: easybits domains verify ${ctx.args[0]} ${r.domain}`));
        });
      },
    },
    verify: {
      summary: "Check DNS + HTTPS for a domain",
      usage: "easybits domains verify <sandbox> <domain>",
      examples: ["easybits domains verify sb_abc123 shop.example.com"],
      async run(ctx) {
        const domain = need(ctx, 1, "domain", this.usage);
        const r = await (await sandbox(ctx, this.usage)).verifyDomain(domain);
        emit(ctx, r, () => {
          console.log(`${r.domain}: ${r.ready ? t("ready", "listo") : t("not ready yet", "todavía no está listo")}`);
          console.log(t(`DNS resolved: ${r.dns.resolved}  HTTPS ok: ${r.https.ok}`, `DNS resuelve: ${r.dns.resolved}  HTTPS ok: ${r.https.ok}`));
          if (r.hint) console.log(r.hint);
        });
        // No listo = no es error de API, pero sí algo que un script debe notar.
        if (!r.ready) process.exitCode = 1;
      },
    },
    rm: {
      aliases: ["remove", "delete"],
      summary: "Detach a domain",
      usage: "easybits domains rm <sandbox> <domain> [--yes]",
      options: { ...YES_OPTION },
      examples: ["easybits domains rm sb_abc123 shop.example.com", "easybits domains rm sb_abc123 shop.example.com --yes"],
      async run(ctx) {
        need(ctx, 0, "sandbox", this.usage);
        const domain = need(ctx, 1, "domain", this.usage);
        requireYesIfHeadless(ctx);
        // Reversible (se vuelve a agregar), pero corta el tráfico: basta [y/N] (clig.dev).
        await confirm(ctx, t(`Detach ${domain} from ${ctx.args[0]}? It stops serving right away.`, `¿Desligar ${domain} de ${ctx.args[0]}? Deja de servir de inmediato.`));
        const r = await (await sandbox(ctx, this.usage)).removeDomain(domain);
        emit(ctx, r, () => console.log(t(`Removed ${domain}`, `Quitado ${domain}`)));
      },
    },
  },
};
