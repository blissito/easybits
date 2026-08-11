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
    // El orden importa: matar DESPUÉS de arrancar mataría al nuevo.
    expect(script.indexOf("killPortHolders")).toBeLessThan(script.indexOf("nohup"));
  });

  it("mata al que tenga el puerto sin depender de paquetes opcionales", () => {
    // Una caja anterior a esto no tiene pidfile, y su proceso es justo el que
    // hay que reemplazar. Se hizo con `fuser` y no funcionaba: psmisc no viene
    // en el template y la guarda `command -v` saltaba el kill en silencio.
    expect(script).not.toContain("fuser");
    expect(script).toContain("ss -ltnp");
    expect(script).toContain(`grep ":3000 "`);
    expect(script).toContain("killPortHolders -9");
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

// El `exec` sirve para que el pid anotado sea el de la app y no el de un
// shell padre. Pero tiene que ir pegado al comando final: con secretos, el
// script empieza por `set -a`, y `exec set -a` revienta —`set` es un builtin,
// no un ejecutable— así que la app no llega ni a arrancar.
describe("exec y secretos en el mismo arranque", () => {
  const spec = runspecSchema.parse({
    appDir: "/srv/store",
    startCommand: "npm start",
    port: 3000,
    secretNames: ["DATABASE_URL"],
  });

  it("no antepone exec al `set` de los secretos", () => {
    const script = buildStartScript(spec, true);
    expect(script).not.toContain("exec set");
    expect(script).toContain("exec npm start");
    // Y el orden es: cargar secretos, luego exec.
    expect(script.indexOf("set -a")).toBeLessThan(script.indexOf("exec npm start"));
  });

  it("sin secretos, el exec sigue pegado al comando", () => {
    const sin = runspecSchema.parse({ appDir: "/srv/store", startCommand: "npm start", port: 3000 });
    expect(buildStartScript(sin, false)).toContain("exec npm start");
  });
});
