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
  previewUserCron,
  runUserCronNow,
  updateUserCron,
  waitUserCronRun,
} from "../../core/userCronOperations";
import { proposeUserCronAction, type UserCronTool } from "../../core/agentActions";
import { needsConfirmation } from "./adminCrons";
import { ok, paginate } from "../responses";

export const USER_CRON_TOOLS = ["list_my_crons", "create_cron", "update_cron", "delete_cron", "run_my_cron", "wait_cron_run"] as const;

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
      prompt: z.string().describe("lo que se le dice al agente en cada ejecución"),
      groupId: z.string().optional().describe("conversación; default `cron:<id>` (una propia por cron)"),
    }),
    z.object({
      type: z.literal("exec"),
      command: z.string().describe("comando de shell; se ejecuta en /root/job dentro de una caja efímera que se destruye al terminar. Éxito = exit 0"),
      files: z
        .array(z.object({ path: z.string(), content: z.string(), encoding: z.enum(["utf8", "base64"]).optional() }))
        .optional()
        .describe("archivos a montar antes de ejecutar (ruta relativa = dentro de /root/job, `~/` = /root); hasta 20 y 512 KB en total"),
      secrets: z
        .array(z.object({ name: z.string(), file: z.string().optional() }))
        .optional()
        .describe("secretos: sin `file` llegan como variable de entorno NAME; con `file` se escriben en esa ruta (p. ej. un .p8) y NAME_FILE apunta a ella. Valor: el de `secretValues` (acotado a este cron) o el de tu bóveda"),
      template: z.enum(["python", "node", "bun", "ubuntu"]).optional().describe("imagen de la caja; default python"),
      timeoutSeconds: z.number().int().optional().describe("default 300, máximo 600"),
      machine: z
        .string()
        .optional()
        .describe("id o nombre de una de TUS máquinas: el comando corre con su configuración (runspec.env + sus secretos, p. ej. DATABASE_URL / EASYBITS_DB_URL), resuelta en cada ejecución. Así un cron lee los datos de una app sin copiar credenciales"),
    }),
  ])
  .describe("qué hace: pegarle a una URL (`http`), mandarle un turno a un agente (`agent_turn`) o ejecutar un comando en una caja efímera (`exec`)");
const secretValuesShape = z
  .record(z.string())
  .optional()
  .describe("valores de secretos SÓLO para este cron (`{ NOMBRE: valor }`, p. ej. el contenido de un .p8): se guardan cifrados como acotados al cron, ningún otro cron los lee, se borran con el cron y nunca regresan. Los nombres deben estar en action.secrets");

const notifyShape = z
  .object({
    on: z.enum(["failure", "always"]).optional().describe("default failure: sólo cuando falla"),
    push: z.union([z.literal(true), z.object({ secret: z.string() })]).optional().describe("aviso a la app de Ghosty; usa el token personal del secreto GHOSTY_PUSH_TOKEN (o el que digas)"),
    email: z.literal(true).optional().describe("correo a la cuenta dueña (nunca a otra dirección)"),
    inbox: z.string().optional().describe("id o nombre de un buzón tuyo (inbox_create); se guarda su id. El resultado de cada ejecución llega ahí como evento"),
  })
  .nullable()
  .optional()
  .describe("avisos por ejecución; null los quita. Además, cada ejecución emite los webhooks cron.run.succeeded / cron.run.failed");

const cronShape = z
  .string()
  .describe("cron de 5 campos (min hora díaMes mes díaSemana), p. ej. `30 8 * * *` = diario 8:30; mínimo cada 5 min");
const tzShape = z.string().optional().describe("zona IANA; default America/Mexico_City");
const whenShapes = {
  at: z.string().optional().describe("UNA SOLA VEZ, en lugar de `cron`: ISO (`2026-10-18T23:00`, sin zona se lee en `timezone`) o `23:00` (hoy). Al ejecutarse se apaga y queda en el historial"),
  in: z.string().optional().describe("una sola vez, relativo a ahora: `10m`, `2h`, `1h30m`, `1d`"),
  until: z.string().nullable().optional().describe("recurrente que termina solo: última fecha (misma forma que `at`); null lo quita"),
  times: z.number().int().nullable().optional().describe("recurrente que termina solo: cuántas ejecuciones más; null lo quita"),
};
const idShape = z.string().describe("id del cron (los crons se nombran por id; sácalo de list_my_crons)");

async function maybePropose(ctx: AuthContext, tool: UserCronTool, args: Record<string, unknown>, run: () => Promise<unknown>) {
  if (isCopilot(ctx)) return needsConfirmation(await proposeUserCronAction(ctx.user.id, tool, args));
  return ok(await run());
}

export function registerUserCronTools(server: McpServer, wrapHandler: Wrap) {
  server.tool(
    "list_my_crons",
    "Tus crons (tareas programadas de TU cuenta): { items:[{ id, name, kind (once|recurring), cron, at, until, timesLeft, timezone, schedule, enabled, done, action, nextRunAt, nextRunLocal, in, lastRunAt, lastOk, lastStatus, lastError, failCount }] }. Con `id` (los crons se nombran por id), devuelve además sus últimas ejecuciones en `runs` (con `error` completo).",
    {
      id: z.string().optional().describe("si lo pasas, incluye las últimas ejecuciones de ese cron (20 por default)"),
      limit: z.number().int().optional().describe("con `id`: cuántas ejecuciones (1-50, default 20)"),
      logs: z.boolean().optional().describe("con `id`: incluye stdout/stderr (cola de 64 KB) de cada ejecución `exec`"),
    },
    wrapHandler(async (p: { id?: string; limit?: number; logs?: boolean }, extra) => {
      const ctx = authOf(extra);
      const items = await listUserCrons(ctx);
      if (!p.id) return ok(paginate(items, { total: items.length }));
      const runs = await listUserCronRuns(ctx, p.id, p.limit ?? 20, { logs: p.logs });
      return ok({ ...paginate(items.filter((c) => c.id === p.id), { total: 1 }), runs });
    })
  );

  server.tool(
    "create_cron",
    "Crea un cron en TU cuenta: le pega a una URL https pública, le manda un turno a uno de tus agentes o ejecuta un comando (`exec`) en una caja efímera con tus archivos y secretos (p. ej. `python3 asc.py` con un .p8 en `secretValues`). Se repite (`cron`, mínimo cada 5 min, puede terminar con `until`/`times`) o se ejecuta UNA SOLA VEZ (`at` o `in`). Límite por plan (Byte 3, Mega 20, Tera 100; los de una sola vez que ya se ejecutaron no cuentan). Devuelve el cron con `nextRunAt` (ISO), `nextRunLocal` (en su zona) e `in` (cuánto falta). Con `dryRun:true` sólo valida y regresa las próximas 3 ejecuciones. Ejemplos: diario 8:30 en CDMX → cron `30 8 * * *`; hoy a las 11 pm → at `23:00`.",
    {
      name: z.string().describe("nombre corto"),
      cron: cronShape.optional(),
      ...whenShapes,
      timezone: tzShape,
      enabled: z.boolean().optional().describe("default true"),
      action: actionShape,
      secretValues: secretValuesShape,
      notify: notifyShape,
      dryRun: z.boolean().optional().describe("sólo valida y dice cuándo se ejecutaría; no crea nada"),
    },
    wrapHandler(async (p: Record<string, unknown>, extra) => {
      const ctx = authOf(extra);
      if (p.dryRun) return ok(await previewUserCron(ctx, p));
      return maybePropose(ctx, "create_cron", p, () => createUserCron(ctx, p));
    })
  );

  server.tool(
    "update_cron",
    "Cambia un cron tuyo por su id (de list_my_crons; sólo los campos que pases). `enabled:false` lo pausa, `enabled:true` lo reanuda. Pasar `at`/`in` lo vuelve de una sola vez; pasar `cron`, recurrente.",
    {
      id: idShape,
      name: z.string().optional(),
      cron: cronShape.optional(),
      ...whenShapes,
      timezone: tzShape,
      enabled: z.boolean().optional(),
      action: actionShape.optional(),
      secretValues: secretValuesShape,
      notify: notifyShape,
    },
    wrapHandler(async (p: { id: string } & Record<string, unknown>, extra) => {
      const ctx = authOf(extra);
      const { id, ...patch } = p;
      return maybePropose(ctx, "update_cron", p, () => updateUserCron(ctx, id, patch));
    })
  );

  server.tool(
    "delete_cron",
    "Borra un cron tuyo por su id (de list_my_crons; el historial de ejecuciones se queda hasta su purga de 90 días).",
    { id: idShape },
    wrapHandler(async (p: { id: string }, extra) => {
      const ctx = authOf(extra);
      return maybePropose(ctx, "delete_cron", p, () => deleteUserCron(ctx, p.id));
    })
  );

  server.tool(
    "wait_cron_run",
    "Espera a que termine la SIGUIENTE ejecución de un cron tuyo, por su id (la que va en curso, o la próxima programada) y la regresa con `ok`, `exitCode` y `logs`. Long-poll de hasta 50 s: si responde `run: null`, vuelve a llamar con el mismo `after` que te regresó. 409 si no hay nada que esperar (apagado o ya terminó).",
    {
      id: idShape,
      timeoutSeconds: z.number().int().optional().describe("cuánto esperar en esta llamada; máximo 50"),
      after: z.string().optional().describe("el `after` de la respuesta anterior (para no perder la ejecución entre llamadas)"),
    },
    wrapHandler(async (p: { id: string; timeoutSeconds?: number; after?: string }, extra) => {
      const ctx = authOf(extra);
      return ok(await waitUserCronRun(ctx, p.id, { after: p.after, waitS: p.timeoutSeconds }));
    })
  );

  server.tool(
    "run_my_cron",
    "Ejecuta ahora un cron tuyo por su id (en segundo plano, trigger «manual»; no mueve su próxima ejecución). El resultado sale en list_my_crons con `id`.",
    { id: idShape },
    wrapHandler(async (p: { id: string }, extra) => {
      const ctx = authOf(extra);
      return maybePropose(ctx, "run_my_cron", p, () => runUserCronNow(ctx, p.id));
    })
  );
}
