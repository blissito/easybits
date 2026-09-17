import type { Client } from '@libsql/client';
import { drizzle } from 'drizzle-orm/libsql';
import * as Schema from './schema.js';

export { Schema };

export function createDrizzle(client: Client) {
  return drizzle(client, { schema: Schema });
}

export type Drizzle = ReturnType<typeof createDrizzle>;
// Lo que aceptan las funciones de storage: la conexión o una transacción.
export type Db = Drizzle | Parameters<Parameters<Drizzle['transaction']>[0]>[0];
