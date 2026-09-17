import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createClient } from '@libsql/client';
import { createWorld, type LibsqlWorld } from '../src/index.js';
import { _resetSchemaCacheForTests } from '../src/migrations.js';

export function tempDbUrl() {
  const dir = mkdtempSync(join(tmpdir(), 'eve-world-'));
  return { url: `file:${join(dir, 'world.db')}`, cleanup: () => rmSync(dir, { recursive: true, force: true }) };
}

export function makeWorld(overrides: Parameters<typeof createWorld>[0] = {}) {
  const { url, cleanup } = tempDbUrl();
  _resetSchemaCacheForTests();
  const world: LibsqlWorld = createWorld({ url, queuePollMs: 20, ...overrides });
  return { world, url, cleanup: async () => { await world.close(); cleanup(); } };
}

export { createClient };
export const bytes = (s: string) => new TextEncoder().encode(s);
