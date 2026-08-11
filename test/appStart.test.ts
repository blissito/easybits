import { describe, it, expect } from "vitest";
import { buildStartScript, runspecSchema, PID_FILE } from "~/.server/core/releaseOperations";

// Un deploy que arranca la app SIN parar la anterior no despliega nada: el
// `nohup … &` devuelve 0, se publica el release y todo parece bien, pero el
// puerto sigue tomado por el proceso viejo —con su código y su entorno
// viejos— y el nuevo muere sin poder escuchar. Se ve como "desplegado" y el
// visitante sigue viendo lo de antes.
describe("arranque de la app", () => {
  const spec = runspecSchema.parse({
    appDir: "/srv/store",
    startCommand: "npm start",
    port: 3000,
    secretNames: ["DATABASE_URL"],
  });
  const script = buildStartScript(spec, true);

  it("para la instancia anterior antes de arrancar", () => {
    expect(script).toContain(`kill "$OLD"`);
    expect(script).toContain(`fuser -k 3000/tcp`);
    // El orden importa: matar DESPUÉS de arrancar mataría al nuevo.
    expect(script.indexOf("fuser -k 3000/tcp")).toBeLessThan(script.indexOf("nohup"));
  });

  it("anota el pid del proceso de la app, no el de un shell padre", () => {
    // Sin `exec`, el pid guardado es el del sh, y matarlo deja al hijo
    // huérfano y escuchando: el siguiente deploy vuelve a no reemplazar nada.
    expect(script).toContain("exec ");
    expect(script).toContain(`echo $! > '${PID_FILE}'`);
  });

  it("confirma que quedó vivo, en vez de fiarse del código de salida", () => {
    expect(script).toContain("kill -0");
    expect(script).toContain("STARTED");
    // Y si no arrancó, el log dice por qué en la misma respuesta.
    expect(script).toContain("tail -30 /var/log/easybits-app.log");
    expect(script).toContain("exit 1");
  });

  it("carga los secretos en el arranque", () => {
    expect(script).toContain(".easybits.env");
    const sinSecretos = buildStartScript(
      runspecSchema.parse({ appDir: "/srv/store", startCommand: "npm start" }),
      false
    );
    expect(sinSecretos).not.toContain(".easybits.env");
  });
});
