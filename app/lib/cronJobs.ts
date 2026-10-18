import { CronExpressionParser } from "cron-parser";

// Tabla ÚNICA de tareas programadas. La lee el panel /dash/admin/crons y la sirve
// GET /api/cron/schedule; el servicio Restate `eb-cron` la sincroniza al arrancar y cada
// hora. Cambiar un horario = editar esta tabla y desplegar (igual que Vercel Cron: el
// horario vive en el código, no en la UI).
export type CronJob = {
  key: string;
  name: string;
  path: string;
  cron: string;
  timezone: "UTC";
};

const job = (key: string, name: string, cron: string): CronJob => ({
  key,
  name,
  path: `/api/cron/${key}`,
  cron,
  timezone: "UTC",
});

export const CRON_JOBS: CronJob[] = [
  job("backup-agents", "Respaldos de agentes", "0 2 * * *"),
  job("backup-machines", "Respaldos de máquinas", "0 3 * * *"),
  job("prune-backups", "Rotación de respaldos", "30 3 * * *"),
  job("expire-work-boxes", "Caducidad de web apps sin publicar", "0 4 * * *"),
  job("check-hosting", "Monitor de hosting", "*/5 * * * *"),
  job("dispatch-user-crons", "Crons de usuarios", "* * * * *"),
  job("purge-files", "Purga de archivos borrados", "0 6 * * 0"),
  job("purge-keys", "Purga de llaves revocadas", "0 6 * * 0"),
  job("purge-machines", "Purga de máquinas liberadas", "0 6 * * 0"),
  job("purge-notifications", "Purga de notificaciones", "0 6 * * 0"),
  job("sweep-fleet-memory", "Barrido de memoria de la flota", "0 6 * * 0"),
];

export const getCronJob = (key: string) => CRON_JOBS.find((j) => j.key === key);

const DAYS = ["domingos", "lunes", "martes", "miércoles", "jueves", "viernes", "sábados"];
const pad = (n: string) => n.padStart(2, "0");

/** Horario en palabras: «cada 5 min», «diario 03:00 UTC», «domingos 06:00 UTC». */
export function scheduleWords(cron: string, timezone = "UTC"): string {
  const [min, hour, dom, mon, dow] = cron.trim().split(/\s+/);
  const every = /^\*\/(\d+)$/;
  if (every.test(min) && hour === "*" && dom === "*" && mon === "*" && dow === "*") {
    return `cada ${min.match(every)![1]} min`;
  }
  if (min === "*" && hour === "*" && dom === "*" && mon === "*" && dow === "*") return "cada minuto";
  const fixed = /^\d+$/;
  if (fixed.test(min) && fixed.test(hour) && dom === "*" && mon === "*") {
    const at = `${pad(hour)}:${pad(min)} ${timezone}`;
    if (dow === "*") return `diario ${at}`;
    if (/^[0-7]$/.test(dow)) return `${DAYS[Number(dow) % 7]} ${at}`;
  }
  return `${cron} (${timezone})`;
}

/** Próxima corrida estrictamente después de `from`. */
export function nextRun(cron: string, from: Date = new Date(), tz = "UTC"): Date {
  return CronExpressionParser.parse(cron, { currentDate: from, tz }).next().toDate();
}

/** Periodo entre dos corridas consecutivas (para calcular la gracia). */
export function periodMs(cron: string, from: Date = new Date(), tz = "UTC"): number {
  const it = CronExpressionParser.parse(cron, { currentDate: from, tz });
  const a = it.next().getTime();
  const b = it.next().getTime();
  return b - a;
}

/** Gracia estilo Healthchecks: 10 % del periodo, mínimo 5 min. */
export function graceMs(cron: string, from: Date = new Date()): number {
  return Math.max(periodMs(cron, from) * 0.1, 5 * 60_000);
}

// Una corrida sin `finishedAt` más vieja que esto la dio por muerta un reinicio de la app.
export const RUNNING_STALE_MS = 60 * 60_000;

export type CronStatus = "nuevo" | "al-dia" | "tarde" | "fallo" | "pausado";

export type RunLike = { startedAt: Date; finishedAt: Date | null; ok: boolean | null };

/**
 * Estado de una tarea con la semántica de Healthchecks.io para horarios cron:
 * la fecha límite es la siguiente hora programada DESPUÉS de la última corrida; entre la
 * fecha límite y la gracia está «tarde»; pasada la gracia, «falló». Una corrida que
 * terminó con error también es «falló». `lastRun` = la más reciente (terminada o no).
 */
export function cronStatus(
  cron: string,
  lastRun: RunLike | null,
  paused: boolean,
  now: Date = new Date(),
): CronStatus {
  if (paused) return "pausado";
  if (!lastRun) return "nuevo";
  const running = !lastRun.finishedAt;
  if (running && now.getTime() - lastRun.startedAt.getTime() > RUNNING_STALE_MS) return "fallo";
  if (!running && lastRun.ok === false) return "fallo";
  const deadline = nextRun(cron, lastRun.startedAt).getTime();
  if (now.getTime() < deadline) return "al-dia";
  if (now.getTime() < deadline + graceMs(cron, lastRun.startedAt)) return "tarde";
  return "fallo";
}
