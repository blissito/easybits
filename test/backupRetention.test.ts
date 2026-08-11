import { describe, it, expect } from "vitest";

/**
 * Las dos reglas de rotación, en tensión a propósito. Se prueban aquí como
 * lógica pura porque cada una, aplicada sola, produce un desastre distinto:
 *
 *  - Rotar a ciegas por fecha → el día que los backups llevan una semana
 *    fallando, borras el único que te quedaba. Por eso "nunca el más reciente".
 *  - Guardar siempre el más reciente → el último backup de una máquina
 *    DESTRUIDA es inmortal (nunca llega uno más nuevo que lo destrabe) y el
 *    bucket crece con cada cliente que se da de baja.
 *
 * La resolución: "nunca el más reciente" aplica a máquinas VIVAS; a las
 * destruidas las limpia la purga, pasada su ventana de gracia.
 */

type Backup = { id: string; sandboxId: string; createdAt: number; expired: boolean };

/** Espejo de pruneExpiredBackups: qué se borra en la rotación normal. */
function toDelete(backups: Backup[]): string[] {
  return backups
    .filter((b) => b.expired)
    .filter((b) =>
      backups.some((o) => o.sandboxId === b.sandboxId && o.createdAt > b.createdAt)
    )
    .map((b) => b.id);
}

/** Espejo de purgeDeletedMachineArtifacts: qué se lleva la purga. */
function toPurge(backups: Backup[], deadSandboxIds: string[]): string[] {
  return backups.filter((b) => deadSandboxIds.includes(b.sandboxId)).map((b) => b.id);
}

describe("rotación de backups", () => {
  it("borra los vencidos que ya tienen uno más nuevo", () => {
    const bks: Backup[] = [
      { id: "viejo", sandboxId: "sb1", createdAt: 1, expired: true },
      { id: "nuevo", sandboxId: "sb1", createdAt: 2, expired: false },
    ];
    expect(toDelete(bks)).toEqual(["viejo"]);
  });

  it("NUNCA borra el único backup de una máquina viva, aunque esté vencido", () => {
    // El escenario que importa: ocho días de backups fallando. El vencido es
    // justo lo único que te queda.
    const bks: Backup[] = [{ id: "unico", sandboxId: "sb1", createdAt: 1, expired: true }];
    expect(toDelete(bks)).toEqual([]);
  });

  it("no mezcla máquinas: el backup nuevo de OTRA caja no destraba el tuyo", () => {
    const bks: Backup[] = [
      { id: "solo-de-sb1", sandboxId: "sb1", createdAt: 1, expired: true },
      { id: "de-sb2", sandboxId: "sb2", createdAt: 9, expired: false },
    ];
    expect(toDelete(bks)).toEqual([]);
  });

  it("la purga SÍ se lleva el último backup de una máquina destruida", () => {
    // Sin esto sería inmortal, y cada baja dejaría residuo para siempre.
    const bks: Backup[] = [{ id: "huerfano", sandboxId: "sb-muerta", createdAt: 1, expired: true }];
    expect(toDelete(bks)).toEqual([]); // la rotación no puede tocarlo…
    expect(toPurge(bks, ["sb-muerta"])).toEqual(["huerfano"]); // …la purga sí.
  });

  it("la purga no toca máquinas vivas", () => {
    const bks: Backup[] = [{ id: "b1", sandboxId: "sb-viva", createdAt: 1, expired: true }];
    expect(toPurge(bks, ["sb-otra-muerta"])).toEqual([]);
  });
});
