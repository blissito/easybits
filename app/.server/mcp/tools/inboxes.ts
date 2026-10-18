// Tools de los buzones de eventos (inboxOperations.ts). Grupo `core`.
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { AuthContext } from "../../apiAuth";
import { createInbox, deleteInbox, listInboxes, readInboxEvents, rotateInboxToken, updateInbox } from "../../core/inboxOperations";
import { ok, paginate } from "../responses";

export const INBOX_TOOLS = ["inbox_create", "inbox_list", "inbox_read", "inbox_update", "inbox_rotate", "inbox_delete"] as const;

type Wrap = <T>(fn: (params: T, extra: any) => Promise<any>) => (params: T, extra: any) => Promise<any>;

const authOf = (extra: any): AuthContext => {
  const ctx = extra?.authInfo as AuthContext | undefined;
  if (!ctx?.user) throw Response.json({ error: "Unauthorized" }, { status: 401 });
  return ctx;
};
const refShape = z.string().describe("id o nombre del buzón");

export function registerInboxTools(server: McpServer, wrapHandler: Wrap) {
  server.tool(
    "inbox_create",
    "Crea un buzón de eventos: una URL de webhook pública (`url`) donde cualquiera puede escribir con POST (tu cron con notify.inbox, Stripe, GitHub, un formulario). Lo que llega se guarda (retención 7 días por default, máximo 1000 eventos) y lo lees con inbox_read; desde una terminal, `easybits inbox listen <nombre>` lo recibe en vivo. Quien tenga la URL puede escribir: no la publiques.",
    {
      name: z.string().describe("nombre corto y único en tu cuenta"),
      retentionDays: z.number().int().optional().describe("días que se guardan los eventos (1-30, default 7)"),
    },
    wrapHandler(async (p: { name: string; retentionDays?: number }, extra) => ok(await createInbox(authOf(extra), p)))
  );

  server.tool(
    "inbox_list",
    "Tus buzones de eventos: { items:[{ id, name, url, unread, lastSeq, lastEventAt, retentionDays, createdAt }] }. `unread` = eventos que llegaron y nadie ha leído con inbox_read.",
    {},
    wrapHandler(async (_p, extra) => {
      const items = await listInboxes(authOf(extra));
      return ok(paginate(items, { total: items.length }));
    })
  );

  server.tool(
    "inbox_read",
    "Lee los eventos de un buzón. Sin `since` regresa lo NO leído y marca como leído (la siguiente llamada trae sólo lo nuevo). Cada evento: { seq, source (http|cron), method, contentType, headers, body, json?, receivedAt }. Úsalo al empezar una sesión para ver qué llegó mientras no estabas.",
    {
      id: refShape,
      since: z.number().int().optional().describe("trae los eventos con seq mayor a éste (p. ej. 0 = todo lo guardado)"),
      limit: z.number().int().optional().describe("máximo de eventos (default 50, tope 200)"),
      ack: z.boolean().optional().describe("false = sólo mirar, sin marcar como leído (default true)"),
    },
    wrapHandler(async (p: { id: string; since?: number; limit?: number; ack?: boolean }, extra) =>
      ok(await readInboxEvents(authOf(extra), p.id, { since: p.since, limit: p.limit, ack: p.ack }))
    )
  );

  server.tool(
    "inbox_update",
    "Cambia el nombre o la retención de un buzón (sólo lo que pases). Su URL no cambia.",
    {
      id: refShape,
      name: z.string().optional().describe("nombre nuevo, único en tu cuenta"),
      retentionDays: z.number().int().optional().describe("días que se guardan los eventos (1-30)"),
    },
    wrapHandler(async (p: { id: string; name?: string; retentionDays?: number }, extra) =>
      ok(await updateInbox(authOf(extra), p.id, { name: p.name, retentionDays: p.retentionDays }))
    )
  );

  server.tool(
    "inbox_rotate",
    "Le da al buzón una URL nueva (`url`); la vieja deja de aceptar eventos de inmediato. Úsalo si la URL se filtró. Los eventos guardados se quedan.",
    { id: refShape },
    wrapHandler(async (p: { id: string }, extra) => ok(await rotateInboxToken(authOf(extra), p.id)))
  );

  server.tool(
    "inbox_delete",
    "Borra un buzón y sus eventos. Su URL deja de aceptar escrituras de inmediato.",
    { id: refShape },
    wrapHandler(async (p: { id: string }, extra) => ok(await deleteInbox(authOf(extra), p.id)))
  );
}
