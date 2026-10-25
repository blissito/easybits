/**
 * Cajas ADOPTADAS (`machines adopt`): ya corrían antes de tener fila en EasyBits
 * (p. ej. migradas desde Fly por runbook). EasyBits les guarda el vault de secretos
 * y las reinicia; nada más. Su arranque lo define el runbook que las trajo (una
 * imagen de ghcr, un docker run), no un runspec, así que redesplegarlas,
 * reconstruirlas, respaldarlas por /app o liberarlas las tumbaría.
 *
 * Módulo aparte para que los barridos lo importen sin ciclos con machineOperations.
 */

/** Filtro de Prisma para los barridos. Sólo las adoptadas llevan el campo. */
export const NOT_EXTERNAL = { managedBy: { isSet: false } } as const;

export function isExternallyManaged(row: { managedBy?: string | null } | null | undefined): boolean {
  return row?.managedBy === "external";
}

/** 409 `ExternallyManaged` si la caja es adoptada. */
export function assertNotExternal(row: { managedBy?: string | null } | null | undefined, action: string): void {
  if (!isExternallyManaged(row)) return;
  throw new Response(
    JSON.stringify({
      error: "ExternallyManaged",
      message: `Esta máquina es adoptada: EasyBits sólo guarda sus secretos y la reinicia. «${action}» no aplica; se opera por su propio runbook.`,
    }),
    { status: 409, headers: { "content-type": "application/json" } }
  );
}
