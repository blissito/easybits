/**
 * Materialización de secretos DENTRO de una caja, sin pasar por el entorno.
 *
 * El patrón nació en el lado de hosting (`releaseOperations.ts`) y era el único
 * sitio del código donde una credencial no acababa en `/proc/<pid>/environ`:
 * los valores se resuelven del vault en cada arranque, se escriben a un archivo
 * 0600 y el proceso los lee de ahí. En el runspec —que viaja en Mongo y se
 * hornea en cada tarball— sólo quedan los NOMBRES.
 *
 * Vive aquí, y no en releaseOperations, porque el lado de AGENTES necesita
 * exactamente lo mismo y duplicarlo habría dejado dos verdades sobre cómo se
 * entrega una credencial. `releaseOperations` conserva sus wrappers para que
 * hosting no cambie de comportamiento.
 */
import type { AuthContext } from "../apiAuth";
import { getSecretValue } from "./secretOperations";
import { execSandboxRaw, shQuote, writeFile } from "./sandboxOperations";

/**
 * Nombre del archivo de secretos. En hosting vive en el appDir (y está en los
 * excludes del release, para que nunca viaje dentro de un tarball).
 */
export const SECRETS_FILE = ".easybits.env";

/** Error tipado — un 422 accionable vale más que un 500 genérico. */
export class SecretsMissingError extends Error {
  code = "SecretsMissing";
  status = 422;
  missing: string[];
  constructor(missing: string[], hint: string) {
    super(
      `Estos secretos están declarados pero no existen en el vault: ${missing.join(", ")}. ${hint}`
    );
    this.missing = missing;
  }
}

/**
 * Serializa pares nombre/valor con el quoting de shell correcto.
 *
 * Comillas simples con el escape habitual: un valor puede traer espacios, `$` o
 * comillas — una URL de Mongo con contraseña las trae todas.
 */
export function formatSecretsFile(values: Record<string, string>): string {
  return (
    Object.entries(values)
      .map(([name, value]) => `${name}='${value.replace(/'/g, `'\\''`)}'`)
      .join("\n") + "\n"
  );
}

/**
 * Resuelve los secretos del vault por NOMBRE y los deja en un archivo dentro de
 * la caja, legible sólo por root.
 *
 * Devuelve `written:false` si no había nada que escribir, para que quien llama
 * pueda saltarse el sourcing sin inventarse un archivo vacío.
 */
export async function writeSecretsFile(
  ctx: AuthContext,
  sandboxId: string,
  opts: { dir: string; names: string[]; fileName?: string; hint?: string }
): Promise<{ path: string; written: boolean }> {
  const fileName = opts.fileName ?? SECRETS_FILE;
  const path = `${opts.dir}/${fileName}`;
  if (!opts.names.length) return { path, written: false };

  const values: Record<string, string> = {};
  const missing: string[] = [];
  for (const name of opts.names) {
    const value = await getSecretValue(ctx.user.id, name).catch(() => null);
    if (value == null) missing.push(name);
    else values[name] = value;
  }

  // Arrancar sin un secreto declarado da un fallo mucho más oscuro (el proceso
  // revienta al conectar) que decirlo aquí.
  if (missing.length) {
    throw new SecretsMissingError(
      missing,
      opts.hint ?? "Cárgalos con `secret_set` o en /dash/developer/secrets."
    );
  }

  return writeSecretValues(ctx, sandboxId, { dir: opts.dir, values, fileName });
}

/**
 * Igual que `writeSecretsFile` pero con los valores YA resueltos. Es el camino
 * de `agent_run`, donde los secretos se resolvieron antes para poder expandir
 * los `$secret:` de los MCP hijos.
 */
export async function writeSecretValues(
  ctx: AuthContext,
  sandboxId: string,
  opts: { dir: string; values: Record<string, string>; fileName?: string }
): Promise<{ path: string; written: boolean }> {
  const fileName = opts.fileName ?? SECRETS_FILE;
  const path = `${opts.dir}/${fileName}`;
  const names = Object.keys(opts.values);
  if (!names.length) return { path, written: false };

  await writeFile(ctx, sandboxId, {
    path,
    content: formatSecretsFile(opts.values),
  });
  // El contenido es lo más sensible de la caja; que no lo lea nadie más.
  // El chmod va DESPUÉS del write, así que hay una ventana de milisegundos con
  // permisos por defecto. Es el mismo comportamiento que hosting lleva en
  // producción; cerrarla exigiría un modo en el endpoint de escritura del host.
  await execSandboxRaw(
    ctx.user.id,
    sandboxId,
    `mkdir -p ${shQuote(opts.dir)} && chmod 600 ${shQuote(path)}`,
    30
  ).catch(() => {});
  return { path, written: true };
}

/**
 * Envuelve un comando para que corra con los secretos ya en el entorno.
 *
 * `exec` va pegado al comando final, nunca delante de todo: `exec set -a`
 * revienta porque `set` es un builtin del shell y no un ejecutable, y el
 * arranque muere antes de llegar a la app.
 */
export function sourceSecrets(
  filePath: string,
  command: string,
  opts: { exec?: boolean; exports?: string } = {}
): string {
  const final = opts.exec ? `exec ${command}` : command;
  const secrets = filePath ? `set -a; . ${shQuote(filePath)}; set +a;` : "";
  return [opts.exports ?? "", secrets, final].filter(Boolean).join(" ");
}
