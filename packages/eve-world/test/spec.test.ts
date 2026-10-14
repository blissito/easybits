import { createServer } from 'node:net';
import { fileURLToPath } from 'node:url';
import { createTestSuite } from '@workflow/world-testing';
import { it } from 'vitest';

// Suite de conformidad del SDK: levanta servidores con WORKFLOW_TARGET_WORLD
// apuntando al build (`dist`) y corre workflows reales contra ellos. Necesita un
// sqld en WORKFLOW_LIBSQL_URL (p. ej. `http://127.0.0.1:8080`) y `npm run build`
// antes. Con `file:` las escrituras concurrentes de un proceso chocan en
// SQLITE_BUSY (ver storage.test.ts), así que sin sqld se omite.
const remote = /^(https?|wss?|libsql):/.test(process.env.WORKFLOW_LIBSQL_URL ?? '');

if (!remote) {
  it.skip('conformidad: requiere WORKFLOW_LIBSQL_URL apuntando a sqld', () => {});
} else {
  // La cola entrega por HTTP a localhost:$PORT. Los servidores de la suite
  // corren uno a la vez, así que todos pueden escuchar en el mismo puerto libre.
  process.env.PORT ??= await new Promise<string>((resolve) => {
    const srv = createServer().listen(0, () => {
      const { port } = srv.address() as { port: number };
      srv.close(() => resolve(String(port)));
    });
  });
  createTestSuite(fileURLToPath(new URL('../dist/index.js', import.meta.url)));
}
