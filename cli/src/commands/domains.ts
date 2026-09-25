import type { Command, Ctx } from "../types.js";
import { int, need } from "../args.js";
import { emit, table } from "../output.js";
import { getClient } from "../client.js";
import { usageError } from "../errors.js";

async function sandbox(ctx: Ctx, usage: string) {
  const id = need(ctx, 0, "sandbox-id", usage);
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
      usage: "easybits domains ls <sandbox-id>",
      examples: ["easybits domains ls sb_abc123"],
      async run(ctx) {
        const items = await (await sandbox(ctx, this.usage)).listDomains();
        emit(ctx, items, () => table(items as any, [["domain", "DOMAIN"], ["port", "PORT"]], "No custom domains."));
      },
    },
    add: {
      summary: "Attach a domain to a port; prints the DNS record to create",
      usage: "easybits domains add <sandbox-id> <domain> --port <port>",
      options: { port: { type: "string", value: "port", description: "Port inside the sandbox (required)" } },
      examples: ["easybits domains add sb_abc123 shop.example.com --port 3000"],
      async run(ctx) {
        const domain = need(ctx, 1, "domain", this.usage);
        const port = int(ctx, "port", this.usage);
        if (port == null) throw usageError("Missing --port.", this.usage);
        const r = await (await sandbox(ctx, this.usage)).addDomain(domain, port);
        emit(ctx, r, () => {
          console.log(`Attached ${r.domain} → port ${r.port}`);
          console.log(`Create this DNS record: ${JSON.stringify(r.dns)}`);
          console.log(`Then run: easybits domains verify ${ctx.args[0]} ${r.domain}`);
        });
      },
    },
    verify: {
      summary: "Check DNS + HTTPS for a domain",
      usage: "easybits domains verify <sandbox-id> <domain>",
      examples: ["easybits domains verify sb_abc123 shop.example.com"],
      async run(ctx) {
        const domain = need(ctx, 1, "domain", this.usage);
        const r = await (await sandbox(ctx, this.usage)).verifyDomain(domain);
        emit(ctx, r, () => {
          console.log(`${r.domain}: ${r.ready ? "ready" : "not ready yet"}`);
          console.log(`DNS resolved: ${r.dns.resolved}  HTTPS ok: ${r.https.ok}`);
          if (r.hint) console.log(r.hint);
        });
        // No listo = no es error de API, pero sí algo que un script debe notar.
        if (!r.ready) process.exitCode = 1;
      },
    },
    rm: {
      aliases: ["remove", "delete"],
      summary: "Detach a domain",
      usage: "easybits domains rm <sandbox-id> <domain>",
      examples: ["easybits domains rm sb_abc123 shop.example.com"],
      async run(ctx) {
        const domain = need(ctx, 1, "domain", this.usage);
        const r = await (await sandbox(ctx, this.usage)).removeDomain(domain);
        emit(ctx, r, () => console.log(`Removed ${domain}`));
      },
    },
  },
};
