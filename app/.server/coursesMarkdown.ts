/** Markdown de la academia para agentes (ver routes/aprende.md.ts). */
import { listCourses, type Course, type Lesson } from "./courses";

const BASE = "https://www.easybits.cloud";

function lessonUrl(c: Course, l: Lesson) {
  return `${BASE}/aprende/${c.slug}/${l.slug}.md`;
}

export function courseMarkdown(c: Course) {
  return [
    `# ${c.title} — Academia EasyBits`,
    ``,
    `> ${c.description}`,
    ``,
    `**Al terminar:** ${c.outcome}`,
    `**Nivel:** ${c.level} · **Duración:** ~${Math.round(c.minutes / 60)}h · **Precio:** gratis, sin tarjeta.`,
    ``,
    `Progreso: no hay quiz. Una lección con "verificada por uso" se marca hecha cuando la cuenta`,
    `cumple el hecho. Consúltalo con la tool MCP \`get_learning_progress\` o \`GET ${BASE}/api/v2/learn/progress\`.`,
    ``,
    `## Lecciones`,
    ...c.lessons.map(
      (l, i) => `${i + 1}. [${l.title}](${lessonUrl(c, l)}) — ${l.minutes} min · costo ${l.cost}${l.verify ? ` · verificada por uso (\`${l.verify}\`)` : " · lectura"}`
    ),
    ``,
    `Índice: ${BASE}/aprende.md · Versión web: ${BASE}/aprende/${c.slug}`,
  ].join("\n");
}

export function lessonMarkdown(c: Course, l: Lesson) {
  const i = c.lessons.findIndex((x) => x.slug === l.slug);
  const prev = c.lessons[i - 1];
  const next = c.lessons[i + 1];
  const body = l.content
    // Los Callout son JSX del blog; en markdown puro son un blockquote.
    .replace(/<Callout[^>]*>\s*([\s\S]*?)\s*<\/Callout>/g, (_m, inner) => inner.trim().split("\n").map((x: string) => `> ${x}`).join("\n"))
    // Enlaces relativos de la UI → absolutos.
    .replace(/\]\(\//g, `](${BASE}/`);
  return [
    `# ${l.title}`,
    ``,
    `Curso: [${c.title}](${BASE}/aprende/${c.slug}.md) · Lección ${i + 1} de ${c.lessons.length} · ${l.minutes} min · costo ${l.cost}`,
    l.verify
      ? `Se marca hecha sola cuando la cuenta cumple \`${l.verify}\` (verifica con \`get_learning_progress\`).`
      : `Lección de lectura: márcala con \`POST ${BASE}/api/v2/learn/progress {"lessonId":"${l.id}"}\`.`,
    ``,
    `> ${l.description}`,
    ``,
    body.trim(),
    ``,
    ...(l.agentPrompt ? [`## Prompt para el agente`, ``, `Si eres el agente del alumno, ejecuta esto ahora con las tools de EasyBits:`, ``, `> ${l.agentPrompt}`, ``] : []),
    `---`,
    `Navegación: ${prev ? `[← ${prev.title}](${lessonUrl(c, prev)}) · ` : ""}[Temario](${BASE}/aprende/${c.slug}.md)${next ? ` · [${next.title} →](${lessonUrl(c, next)})` : ` · [Certificado](${BASE}/aprende/${c.slug}/certificado)`}`,
  ].join("\n");
}

export async function indexMarkdown() {
  const courses = await listCourses();
  return [
    `# Academia EasyBits`,
    ``,
    `> Tres rutas gratis para llevar un agente de IA a producción. Sin quiz: el progreso lo verifica la plataforma contra el uso real de la cuenta.`,
    ``,
    `## Rutas`,
    ...courses.map((c) => `- [${c.title}](${BASE}/aprende/${c.slug}.md) — ${c.description} (${c.lessons.length} lecciones, ~${Math.round(c.minutes / 60)}h)`),
    ``,
    `## Talleres en vivo (de pago, en MXN)`,
    `- Diseño de sistemas agénticos — https://www.fixtergeek.com/sistemas-agenticos`,
    ``,
    `Progreso del alumno: tool MCP \`get_learning_progress\` · \`GET ${BASE}/api/v2/learn/progress\`.`,
  ].join("\n");
}

