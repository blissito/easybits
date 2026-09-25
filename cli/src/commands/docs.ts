import { spawn } from "node:child_process";
import { resolveBaseUrl } from "@easybits.cloud/sdk";
import type { Command } from "../types.js";
import { bool } from "../args.js";
import { emit } from "../output.js";
import { CliError } from "../errors.js";

export const docs: Command = {
  name: "docs",
  group: "Help",
  summary: "Print the docs URL, or a docs section as markdown",
  synopsis: "docs [section]",
  leaf: {
    summary: "Print the docs URL, or a docs section as markdown",
    usage: "easybits docs [section] [--en] [--open]",
    options: {
      en: { type: "boolean", description: "English docs" },
      open: { type: "boolean", description: "Open the docs in your browser" },
    },
    examples: ["easybits docs", "easybits docs cli --en", "easybits docs hosting", "easybits docs --open"],
    async run(ctx) {
      const base = await resolveBaseUrl();
      const prefix = bool(ctx, "en") ? "/en/docs" : "/docs";
      const section = ctx.args[0];
      if (!section) {
        const url = `${base}${prefix}`;
        if (bool(ctx, "open")) {
          const opener = process.platform === "darwin" ? "open" : process.platform === "win32" ? "explorer" : "xdg-open";
          spawn(opener, [url], { stdio: "ignore", detached: true }).unref();
        }
        emit(ctx, { url, markdown: `${url}.md`, llms: `${base}/llms.txt` }, () => console.log(url));
        return;
      }
      // Las secciones son públicas: no hace falta key.
      const url = `${base}${prefix}/${encodeURIComponent(section)}.md`;
      const res = await fetch(url);
      if (!res.ok) {
        throw new CliError(
          `Docs section "${section}" not found (${res.status}).`,
          2,
          `See the section list: ${base}/llms.txt`,
          "usage",
          res.status,
        );
      }
      const markdown = await res.text();
      emit(ctx, { section, url, markdown }, () => process.stdout.write(markdown.endsWith("\n") ? markdown : markdown + "\n"));
    },
  },
};
