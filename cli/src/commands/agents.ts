import type { Command } from "../types.js";
import { int, list, need, pairs, str } from "../args.js";
import { emit, fmtDate, table } from "../output.js";
import { getClient } from "../client.js";
import { usageError } from "../errors.js";

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
      usage: "easybits agents create --template <template> [--name <name>] [--env K=V]... [--timeout <s>]",
      options: {
        template: { type: "string", value: "template", description: "Agent template (see: easybits docs agents)" },
        name: { type: "string", value: "name", description: "Label" },
        env: { type: "string", multiple: true, value: "K=V", description: "Env for the agent (repeatable)" },
        timeout: { type: "string", value: "seconds", description: "Lifetime before auto-destroy" },
      },
      examples: [
        "easybits agents create --template goose --name helper",
        "easybits agents create --template chat-anthropic --env ANTHROPIC_API_KEY=sk-ant-… --json",
      ],
      async run(ctx) {
        const template = str(ctx, "template");
        if (!template) throw usageError("Missing --template.", this.usage);
        const eb = await getClient(ctx);
        const a = await eb.createAgent({
          template: template as any,
          name: str(ctx, "name"),
          env: pairs(list(ctx, "env"), this.usage),
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
      usage: "easybits agents destroy <agent-id>",
      examples: ["easybits agents destroy ag_123"],
      async run(ctx) {
        const id = need(ctx, 0, "agent-id", this.usage);
        const eb = await getClient(ctx);
        const r = await eb.destroyAgent(id);
        emit(ctx, { ...r, agentId: id }, () => console.log(`Destroyed ${id}`));
      },
    },
  },
};
