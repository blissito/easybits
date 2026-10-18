import { describe, it, expect } from "vitest";
import { matchTarget, parseDirectCommand } from "~/.server/core/copilotFastPath";
import { CRON_JOBS } from "~/lib/cronJobs";

// Vía rápida del piloto: órdenes directas reconocidas sin modelo, y nada ambiguo.
const platform = CRON_JOBS.map((j) => ({ kind: "platform" as const, key: j.key, name: j.name }));
const user = [{ kind: "user" as const, id: "c".repeat(24), name: "Hora de estudiar" }];
const all = [...platform, ...user];
const pick = (text: string) => {
  const cmd = parseDirectCommand(text);
  if (!cmd) return null;
  const hit = matchTarget(cmd.target, all);
  return hit ? { verb: cmd.verb, ...(hit.kind === "platform" ? { key: hit.key } : { id: hit.id }) } : null;
};

describe("parseDirectCommand + matchTarget", () => {
  it("frases reales de bliss", () => {
    expect(pick("ejecuta purga de notificaciones")).toEqual({ verb: "run", key: "purge-notifications" });
    expect(pick("Ejecuta la purga de notificaciones ya")).toEqual({ verb: "run", key: "purge-notifications" });
    expect(pick("corre purge-notifications")).toEqual({ verb: "run", key: "purge-notifications" });
    expect(pick("pausa el monitor de hosting")).toEqual({ verb: "pause", key: "check-hosting" });
    expect(pick("Detén «Monitor de hosting»")).toEqual({ verb: "pause", key: "check-hosting" });
    expect(pick("reanuda monitor de hosting")).toEqual({ verb: "resume", key: "check-hosting" });
    expect(pick("lanza hora de estudiar")).toEqual({ verb: "run", id: "c".repeat(24) });
  });

  it("acentos y mayúsculas no importan", () => {
    expect(pick("EJECUTA ROTACIÓN DE RESPALDOS")).toEqual({ verb: "run", key: "prune-backups" });
  });

  it("ambiguo o no es orden → al modelo (null)", () => {
    expect(pick("ejecuta purga")).toBeNull(); // varias purgas
    expect(pick("ejecuta respaldos")).toBeNull(); // dos respaldos
    expect(pick("¿por qué falló el monitor de hosting?")).toBeNull();
    expect(pick("corre purga de notificaciones y dime qué pasó")).toBeNull();
    expect(pick("ejecuta algo que no existe")).toBeNull();
    expect(pick("hola")).toBeNull();
  });
});
