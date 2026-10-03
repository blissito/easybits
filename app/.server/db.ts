import { PrismaClient } from "@prisma/client";
import { config } from "./config";

// FleetAgent.authKeys/authCreds = estado de Baileys (llaves Signal de WhatsApp).
// Crecen sin límite: hay filas de 1.4 MB y un findUnique completo tardaba 15 s.
// Como authFleetAgent lee la fila en CADA request de la flota, cada MCP del agente
// tardaba 15 s y el worker se rendía al conectar ("la tool ya no está activa").
// Incidente 2026-10-03. Se omiten por default; quien las necesite las pide explícito
// con `select: { authKeys: true }` (gana sobre este omit), como baileys.server.ts.
export const DB_OPTIONS = {
  omit: { fleetAgent: { authCreds: true, authKeys: true } },
} as const;

const makeClient = () => new PrismaClient(DB_OPTIONS);
type DbClient = ReturnType<typeof makeClient>;

let db: DbClient;

declare global {
  var __db: DbClient | undefined;
}

// this is needed because in development we don't want to restart
// the server with every change, but we want to make sure we don't
// create a new connection to the DB with every change either.
if (config.isProd) {
  db = makeClient();
} else {
  if (!global.__db) {
    global.__db = makeClient();
  }
  db = global.__db;
}

export { db };
