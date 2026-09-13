import { describe, it, expect } from "vitest";
import {
  buildStartScript,
  runspecSchema,
  PID_FILE,
  APP_UNIT,
  START_SCRIPT_FILE,
} from "~/.server/core/releaseOperations";

// La app arrancaba con `nohup … &`: sobrevivía al deploy, no a la caja. Al
// reiniciar la microVM (resume, reboot del fierro) nadie la relevantaba y el
// sitio quedaba en 502 hasta que alguien lo notara (brendago.studio, ~5h el
// 2026-09-12). Ahora la sostiene una unit de systemd con Restart=always.
describe("arranque de la app", () => {
  const spec = runspecSchema.parse({
    appDir: "/srv/store",
    startCommand: "npm start",
    port: 3000,
    secretNames: ["DATABASE_URL"],
  });
  const script = buildStartScript(spec, true);

  it("instala una unit enabled con Restart=always y la arranca", () => {
    expect(script).toContain(`/etc/systemd/system/${APP_UNIT}.service`);
    expect(script).toContain("Restart=always");
    expect(script).toContain("WantedBy=multi-user.target");
    expect(script).toContain(`systemctl enable ${APP_UNIT}`);
    expect(script).toContain(`systemctl restart ${APP_UNIT}`);
    expect(script).not.toContain("nohup");
  });

  it("para la instancia anterior (unit o proceso suelto) antes de arrancar", () => {
    expect(script).toContain(`systemctl stop ${APP_UNIT}`);
    expect(script).toContain(`kill "$OLD"`);
    expect(script).toContain(`rm -f '${PID_FILE}'`);
    expect(script.indexOf("killPortHolders")).toBeLessThan(script.indexOf("systemctl restart"));
  });

  it("mata al que tenga el puerto sin depender de paquetes opcionales", () => {
    expect(script).not.toContain("fuser");
    expect(script).toContain("ss -ltnp");
    expect(script).toContain(`grep ":3000 "`);
    expect(script).toContain("killPortHolders -9");
  });

  it("el script de arranque hace exec del comando con los secretos cargados", () => {
    expect(script).toContain(START_SCRIPT_FILE);
    expect(script).toContain("exec npm start");
    expect(script).not.toContain("exec set");
    expect(script.indexOf("set -a")).toBeLessThan(script.indexOf("exec npm start"));
    expect(script).toContain(".easybits.env");
    const sinSecretos = buildStartScript(
      runspecSchema.parse({ appDir: "/srv/store", startCommand: "npm start" }),
      false
    );
    expect(sinSecretos).not.toContain(".easybits.env");
    expect(sinSecretos).toContain("exec npm start");
  });

  it("confirma que quedó vivo, en vez de fiarse del código de salida", () => {
    expect(script).toContain(`systemctl is-active --quiet ${APP_UNIT}`);
    expect(script).toContain("STARTED");
    expect(script).toContain("tail -30 /var/log/easybits-app.log");
    expect(script).toContain("exit 1");
  });

  it("el log sigue en el archivo que lee readMachineLogs", () => {
    expect(script).toContain("StandardOutput=append:/var/log/easybits-app.log");
  });
});
