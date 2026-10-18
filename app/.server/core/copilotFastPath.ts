// Vía rápida del piloto de crons: una ORDEN directa («ejecuta purga de notificaciones»,
// «pausa el monitor de hosting») no pasa por el modelo. Si la tarea se identifica sin
// ambigüedad, se crea la propuesta y sale la tarjeta en milisegundos; aprobarla ejecuta
// directo (resume). Lo ambiguo o lo que no es una orden cae al agente como siempre.
import { db } from "~/.server/db";
import { CRON_JOBS } from "~/lib/cronJobs";
import { proposeAction, proposeUserCronAction, type PendingActionView } from "./agentActions";

export type DirectVerb = "run" | "pause" | "resume";

const VERBS: [RegExp, DirectVerb][] = [
  [/^(ejecuta|ejecutar|ejecutame|corre|correr|correme|lanza|lanzar|dispara|disparar|run)\b/, "run"],
  [/^(pausa|pausar|pausame|deten|detener|apaga|apagar|pause)\b/, "pause"],
  [/^(reanuda|reanudar|reactiva|reactivar|enciende|encender|prende|resume)\b/, "resume"],
];

// Relleno que no nombra la tarea: «la», «el cron de», «ahora», «por favor»…
const FILLER = /\b(la|el|los|las|un|una|tarea|tareas|cron|crons|job|de nuevo|otra vez|ahora|ya|mismo|por favor|porfa|plis|please)\b/g;

export const normalize = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[«»"'`¿?¡!.,;:()]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

/** «ejecuta purga de notificaciones» → {verb:"run", target:"purga de notificaciones"}; si no es orden, null. */
export function parseDirectCommand(text: string): { verb: DirectVerb; target: string } | null {
  const t = normalize(text);
  if (!t || t.length > 120 || t.includes("\n")) return null;
  for (const [re, verb] of VERBS) {
    const m = re.exec(t);
    if (!m) continue;
    const target = t
      .slice(m[0].length)
      .replace(FILLER, " ")
      .replace(/\s+/g, " ")
      .trim()
      .replace(/^(de|del)\s+/, "");
    // Una orden con preguntas o condiciones («corre X y dime por qué falló») no es directa.
    if (!target || /\b(y|si|cuando|porque|por que|que|como)\b/.test(target)) return null;
    return { verb, target };
  }
  return null;
}

type Candidate = { kind: "platform"; key: string; name: string } | { kind: "user"; id: string; name: string };

/** Nombres con los que se nombra una tarea: el nombre, la key (con y sin guiones) y la ruta. */
const aliases = (c: Candidate) =>
  c.kind === "platform" ? [c.name, c.key, c.key.replace(/-/g, " ")].map(normalize) : [c.name].map(normalize);

/**
 * La tarea que nombra `target`, SÓLO si es una: primero coincidencia exacta con un alias; si no,
 * la única cuyo alias contiene el texto completo (mínimo 4 letras). Cualquier otra cosa → null.
 */
export function matchTarget(target: string, candidates: Candidate[]): Candidate | null {
  const q = normalize(target);
  if (q.length < 3) return null;
  const exact = candidates.filter((c) => aliases(c).includes(q));
  if (exact.length === 1) return exact[0];
  if (exact.length > 1) return null;
  if (q.length < 4) return null;
  const partial = candidates.filter((c) => aliases(c).some((a) => a.includes(q)));
  return partial.length === 1 ? partial[0] : null;
}

/**
 * Intenta la vía rápida: regresa la propuesta creada y la pregunta para la tarjeta, o null
 * para que el turno siga al modelo.
 */
export async function tryDirectCommand(
  ownerId: string,
  text: string
): Promise<{ action: PendingActionView; question: string } | null> {
  const cmd = parseDirectCommand(text);
  if (!cmd) return null;
  const userCrons = await db.userCron
    .findMany({ where: { ownerId }, select: { id: true, name: true } })
    .catch(() => [] as { id: string; name: string }[]);
  const candidates: Candidate[] = [
    ...CRON_JOBS.map((j) => ({ kind: "platform" as const, key: j.key, name: j.name })),
    ...userCrons.map((u) => ({ kind: "user" as const, id: u.id, name: u.name })),
  ];
  const hit = matchTarget(cmd.target, candidates);
  if (!hit) return null;
  try {
    if (hit.kind === "platform") {
      const action =
        cmd.verb === "run"
          ? await proposeAction(ownerId, "run_cron", { job: hit.key })
          : await proposeAction(ownerId, "pause_cron", { job: hit.key, paused: cmd.verb === "pause" });
      return { action, question: question(cmd.verb, hit.name) };
    }
    const action =
      cmd.verb === "run"
        ? await proposeUserCronAction(ownerId, "run_my_cron", { id: hit.id })
        : await proposeUserCronAction(ownerId, "update_cron", { id: hit.id, enabled: cmd.verb === "resume" });
    return { action, question: question(cmd.verb, hit.name) };
  } catch {
    // Propuesta inválida (p. ej. reanudar algo que no estaba en pausa): que lo explique el agente.
    return null;
  }
}

const question = (verb: DirectVerb, name: string) =>
  verb === "run" ? `¿Corro «${name}» ahora?` : verb === "pause" ? `¿Pauso «${name}»?` : `¿Reanudo «${name}»?`;
