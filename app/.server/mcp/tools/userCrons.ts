// Tools de los crons del USUARIO (userCronOperations.ts). Grupo `core` y también el copiloto
// del panel (`admin-crons`). Con cualquier llave ejecutan directo; con la llave del copiloto
// (vive en su microVM) crear/editar/borrar/correr sólo PROPONEN y el humano aprueba la tarjeta.
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { AuthContext } from "../../apiAuth";
import {
  COPILOT_KEY_NAME,
  createUserCron,
  deleteUserCron,
  listUserCronRuns,
  listUserCrons,
  runUserCronNow,
  updateUserCron,
} from "../../core/userCronOperations";
import { proposeUserCronAction, type UserCronTool } from "../../core/agentActions";
import { needsConfirmation } from "./adminCrons";
import { ok, paginate } from "../responses";

export const USER_CRON_TOOLS = ["list_my_crons", "create_cron", "update_cron", "delete_cron", "run_my_cron"] as const;

type Wrap = <T>(fn: (params: T, extra: any) => Promise<any>) => (params: T, extra: any) => Promise<any>;

const authOf = (extra: any): AuthContext => {
  const ctx = extra?.authInfo as AuthContext | undefined;
  if (!ctx?.user) throw Response.json({ error: "Unauthorized" }, { status: 401 });
  return ctx;
};
const isCopilot = (ctx: AuthContext) => ctx.apiKey?.name === COPILOT_KEY_NAME;

const actionShape = z
  .union([
    z.object({
      type: z.literal("http"),
      url: z.string().describe("URL https pública"),
      method: z.enum(["GET", "POST", "PUT", "PATCH", "DELETE"]).optional().describe("default GET"),
      body: z.union([z.string(), z.record(z.any())]).optional().describe("cuerpo (objeto → JSON); no con GET; máx 16 KB"),
      secretName: z.string().optional().describe("secreto de TU vault que viaja como header (nunca se muestra)"),
      secretHeader: z.string().optional().describe("header del secreto; default `Authorization` (con `Bearer ` si el valor no trae esquema)"),
    }),
    z.object({
      type: z.literal("agent_turn"),
      fleetAgentId: z.string().describe("id de un agente de TU flota"),
      prompt: z.string().describe("lo que se le dice al agente en cada corrida"),
      groupId: z.string().optional().describe("conversación; default `cron:<id>` (una propia por cron)"),
    }),
  ])
  .describe("qué hace: pegarle a una URL (`http`) o mandarle un turno a un agente (`agent_turn`)");

const cronShape = z
  .string()
  .describe("cron de 5 campos (min hora díaMes mes díaSemana), p. ej. `30 8 * * *` = diario 8:30; mínimo cada 5 min");
const tzShape = z.string().optional().describe("zona IANA; default America/Mexico_City");
const idShape = z.string().describe("id del cron (de list_my_crons)");

async function maybePropose(ctx: AuthContext, tool: UserCronTool, args: Record<string, unknown>, run: () => Promise<unknown>) {
  if (isCopilot(ctx)) return needsConfirmation(await proposeUserCronAction(ctx.user.id, tool, args));
  return ok(await run());
}

export function registerUserCronTools(server: McpServer, wrapHandler: Wrap) {
  server.tool(
    "list_my_crons",
    "Tus crons (tareas programadas de TU cuenta): { items:[{ id, name, cron, timezone, schedule, enabled, action, nextRunAt, lastRunAt, lastOk, lastStatus, lastError, failCount }] }. Con `id`, devuelve además sus últimas corridas en `runs` (con `error` completo).",
    { id: z.string().optional().describe("si lo pasas, incluye las últimas 20 corridas de ese cron") },
    wrapHandler(async (p: { id?: string }, extra) => {
      const ctx = authOf(extra);
      const items = await listUserCrons(ctx);
      if (!p.id) return ok(paginate(items, { total: items.length }));
      const runs = await listUserCronRuns(ctx, p.id, 20);
      return ok({ ...paginate(items.filter((c) => c.id === p.id), { total: 1 }), runs });
    })
  );

  server.tool(
    "create_cron",
    "Crea un cron en TU cuenta: cada vez que toca, le pega a una URL https pública o le manda un turno a uno de tus agentes. Mínimo cada 5 min; límite por plan (Byte 3, Mega 20, Tera 100). Devuelve el cron con `nextRunAt`. Ejemplo: diario 8:30 en CDMX → cron `30 8 * * *`.",
    {
      name: z.string().describe("nombre corto"),
      cron: cronShape,
      timezone: tzShape,
      enabled: z.boolean().optional().describe("default true"),
      action: actionShape,
    },
    wrapHandler(async (p: Record<string, unknown>, extra) => {
      const ctx = authOf(extra);
      return maybePropose(ctx, "create_cron", p, () => createUserCron(ctx, p));
    })
  );

  server.tool(
    "update_cron",
    "Cambia un cron tuyo (sólo los campos que pases). `enabled:false` lo pausa, `enabled:true` lo reanuda.",
    {
      id: idShape,
      name: z.string().optional(),
      cron: cronShape.optional(),
      timezone: tzShape,
      enabled: z.boolean().optional(),
      action: actionShape.optional(),
    },
    wrapHandler(async (p: { id: string } & Record<string, unknown>, extra) => {
      const ctx = authOf(extra);
      const { id, ...patch } = p;
      return maybePropose(ctx, "update_cron", p, () => updateUserCron(ctx, id, patch));
    })
  );

  server.tool(
    "delete_cron",
    "Borra un cron tuyo (el historial de corridas se queda hasta su purga de 90 días).",
    { id: idShape },
    wrapHandler(async (p: { id: string }, extra) => {
      const ctx = authOf(extra);
      return maybePropose(ctx, "delete_cron", p, () => deleteUserCron(ctx, p.id));
    })
  );

  server.tool(
    "run_my_cron",
    "Ejecuta ahora un cron tuyo (en segundo plano, trigger «manual»; no mueve su próxima corrida). El resultado sale en list_my_crons con `id`.",
    { id: idShape },
    wrapHandler(async (p: { id: string }, extra) => {
      const ctx = authOf(extra);
      return maybePropose(ctx, "run_my_cron", p, () => runUserCronNow(ctx, p.id));
    })
  );
}
