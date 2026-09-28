import type { Command } from "../types.js";
import { ENV_FILE_OPTION, envFrom, int, need, str } from "../args.js";
import { emit, fmtDate, table } from "../output.js";
import { getClient } from "../client.js";
import { usageError } from "../errors.js";
import { YES_OPTION, confirm, requireYesIfHeadless } from "../prompt.js";

export const agents: Command = {
  name: "agents",
  aliases: ["agent"],
  group: "Compute",
  summary: "Agents running in their own sandbox",
  synopsis: "agents",
  subs: {
    ls: {
      aliases: ["list"],
      summary: "List your agents",
      usage: "easybits agents ls",
      examples: ["easybits agents ls --json"],
      async run(ctx) {
        const eb = await getClient(ctx);
        const items = await eb.listAgents();
        emit(ctx, items, () =>
          table(
            items.map((a) => ({ ...a, createdAt: fmtDate(a.createdAt) })),
            [["agentId", "ID"], ["name", "NAME"], ["template", "TEMPLATE"], ["status", "STATUS"], ["createdAt", "CREATED"]],
            "No agents. Create one: easybits agents create --template <template>",
          ),
        );
      },
    },
    create: {
      summary: "Create an agent from a template",
      usage: "easybits agents create --template <template> [--name <name>] [--dotenv <path>] [--env K=V]... [--timeout <s>]",
      options: {
        template: { type: "string", value: "template", description: "Agent template (see: easybits docs agents)" },
        name: { type: "string", value: "name", description: "Label" },
        env: { type: "string", multiple: true, value: "K=V", description: "Env for the agent, non-secret (repeatable)" },
        ...ENV_FILE_OPTION,
        timeout: { type: "string", value: "seconds", description: "Lifetime before auto-destroy" },
      },
      examples: [
        "easybits agents create --template goose --name helper",
        "easybits agents create --template chat-anthropic --dotenv .env --json",
        "op read op://vault/anthropic/env | easybits agents create --template chat-anthropic --dotenv -",
      ],
      async run(ctx) {
        const template = str(ctx, "template");
        if (!template) throw usageError("Missing --template.", this.usage);
        const env = await envFrom(ctx, this.usage);
        const eb = await getClient(ctx);
        const a = await eb.createAgent({
          template: template as any,
          name: str(ctx, "name"),
          env,
          timeoutSeconds: int(ctx, "timeout", this.usage),
        });
        emit(ctx, a, () => {
          console.log(`Agent:   ${a.agentId}`);
          console.log(`Sandbox: ${a.sandboxId}`);
          console.log(`URL:     ${a.agentUrl}`);
          console.log(`Talk to it: easybits agents message ${a.agentId} "hello"`);
        });
      },
    },
    message: {
      aliases: ["msg", "send"],
      summary: "Send a message; streams the reply",
      usage: "easybits agents message <agent-id> <text...> [--session <id>]",
      options: { session: { type: "string", value: "id", description: "Continue a conversation" } },
      examples: ['easybits agents message ag_123 "summarize /data/work/README.md"', "easybits agents message ag_123 hi --json"],
      async run(ctx) {
        const id = need(ctx, 0, "agent-id", this.usage);
        const content = ctx.args.slice(1).join(" ");
        if (!content) throw usageError("Missing <text>.", this.usage);
        const eb = await getClient(ctx);
        const params = { content, sessionId: str(ctx, "session") };
        if (ctx.json) {
          emit(ctx, await eb.messageAgent(id, params), () => {});
          return;
        }
        for await (const tok of eb.streamAgent(id, params)) process.stdout.write(tok);
        process.stdout.write("\n");
      },
    },
    destroy: {
      aliases: ["rm", "delete"],
      summary: "Destroy an agent and its sandbox",
      usage: "easybits agents destroy <agent-id> [--yes]",
      options: { ...YES_OPTION },
      examples: ["easybits agents destroy ag_123            # asks you to type the id", "easybits agents destroy ag_123 --yes"],
      async run(ctx) {
        const id = need(ctx, 0, "agent-id", this.usage);
        requireYesIfHeadless(ctx);
                // Se lleva su caja y su /data: se teclea el id (patrón de `gh repo delete`).
        await confirm(ctx, `Destroy agent ${id} and its sandbox (including /data)?`, { typeName: id });
        const eb = await getClient(ctx);
        const r = await eb.destroyAgent(id);
        emit(ctx, { ...r, agentId: id }, () => console.log(`Destroyed ${id}`));
      },
    },
  },
};
