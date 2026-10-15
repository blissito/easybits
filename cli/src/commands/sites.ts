import type { Command } from "../types.js";
import { emit, fmtDate, table } from "../output.js";
import { api } from "../api.js";
import { t } from "../i18n.js";

/** Un sitio del creador de sitios (/dash/sitios), como lo devuelve GET /api/v2/sites. */
export type SiteRow = {
  id: string;
  name: string;
  kind: "static" | "webapp";
  engine: string;
  stack: string | null;
  url: string | null;
  createdAt: string;
};

/** Filas para la tabla: tipo legible (con su stack) y la URL o «sin publicar». */
export function siteRows(items: SiteRow[]) {
  return items.map((s) => ({
    ...s,
    kind: s.kind === "webapp" ? `webapp${s.stack ? ` (${s.stack})` : ""}` : "static",
    url: s.url ?? t("(not published)", "(sin publicar)"),
    createdAt: fmtDate(s.createdAt),
  }));
}

export const sites: Command = {
  name: "sites",
  group: "Hosting",
  summary: "Your site-builder sites (/dash/sitios): static and web apps",
  synopsis: "sites <ls>",
  subs: {
    ls: {
      aliases: ["list"],
      summary: "List your sites with their kind, engine and public URL",
      usage: "easybits sites ls",
      examples: ["easybits sites ls", "easybits sites ls --json"],
      async run(ctx) {
        const { items } = await api<{ items: SiteRow[] }>(ctx, "GET", "/sites");
        emit(ctx, items, () =>
          table(
            siteRows(items),
            [["id", "ID"], ["name", "NAME"], ["kind", "KIND"], ["engine", "ENGINE"], ["url", "URL"]],
            t("No sites yet. Create one at https://www.easybits.cloud/dash/sitios", "Todavía no hay sitios. Crea uno en https://www.easybits.cloud/dash/sitios"),
          ),
        );
      },
    },
  },
  defaultSub: "ls",
};
