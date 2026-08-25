import { describe, it, expect } from "vitest";
import { classifyBackupTarget } from "~/.server/core/machineBackupOperations";
import { runspecSchema } from "~/.server/core/releaseOperations";

// Una máquina sin `runspec.dataPaths` NO se puede respaldar: backupMachine tira
// NoDataPaths. El problema es que tanto la corrida nocturna como la alerta de
// backups rancios hacían `continue` sobre ese caso, así que la máquina no salía
// en NINGUNA lista de fallos — se veía idéntica a una respaldándose bien.
//
// classifyBackupTarget es la mitad pura de ese reporte: separa "no hay nada que
// copiar" de "sí lo hay y se está copiando", para que el cron pueda nombrar las
// primeras en vez de tragárselas.
describe("clasificación de backup de una máquina", () => {
  it("sin runspec no hay nada que respaldar", () => {
    expect(classifyBackupTarget(null, null)).toEqual({
      kind: "unprotected",
      reason: "no-datapaths",
    });
  });

  it("con appDir pero sin dataPaths queda desprotegida — el caso de brendago.studio", () => {
    // Caja real: build en /srv/store, pedidos en un Mongo externo e imágenes en
    // S3. No hay estado local, así que su cero-backups es correcto… pero desde
    // aquí es indistinguible de un olvido, y por eso se reporta.
    const spec = runspecSchema.parse({ appDir: "/srv/store", startCommand: "npm start" });
    expect(classifyBackupTarget(spec, null).kind).toBe("unprotected");
  });

  it("dataPaths vacío tampoco protege", () => {
    const spec = runspecSchema.parse({ appDir: "/srv/store", dataPaths: [] });
    expect(classifyBackupTarget(spec, null).kind).toBe("unprotected");
  });

  it("los dataPaths relativos cuelgan de appDir, con la barra final normalizada", () => {
    const spec = runspecSchema.parse({ appDir: "/srv/store/", dataPaths: ["data", "uploads"] });
    expect(classifyBackupTarget(spec, null)).toEqual({
      kind: "protected",
      paths: ["/srv/store/data", "/srv/store/uploads"],
    });
  });

  it("los dataPaths absolutos se respetan tal cual", () => {
    const spec = runspecSchema.parse({ appDir: "/srv/store", dataPaths: ["/var/lib/app.sqlite"] });
    expect(classifyBackupTarget(spec, null)).toEqual({
      kind: "protected",
      paths: ["/var/lib/app.sqlite"],
    });
  });

  it("backupScope 'none' es opt-out aunque haya dataPaths", () => {
    const spec = runspecSchema.parse({ appDir: "/srv/store", dataPaths: ["data"] });
    expect(classifyBackupTarget(spec, "none")).toEqual({ kind: "opted-out" });
  });

  it("backupScope null NO es opt-out: sólo el 'none' explícito lo es", () => {
    // La mayoría de las filas no tienen el campo (sólo lo escriben createPermanent
    // y el redeploy), y Prisma lo lee como null. Tratar ese null como opt-out
    // borraría del reporte justo a las máquinas más viejas.
    //
    // Ojo con el espejo de esto en la QUERY: `NOT: {backupScope:"none"}` NO
    // matchea un campo ausente en Mongo — hace falta `isSet:false`, que es lo
    // que hace la constante NOT_OPTED_OUT. Sin ella estas máquinas ni siquiera
    // llegan a clasificarse.
    const spec = runspecSchema.parse({ appDir: "/srv/store", dataPaths: ["data"] });
    expect(classifyBackupTarget(spec, null).kind).toBe("protected");
  });
});
