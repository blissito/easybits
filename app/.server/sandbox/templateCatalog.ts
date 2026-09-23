import { SANDBOX_TEMPLATES, type SandboxTemplate } from "./schemas";

// Catálogo ÚNICO de templates para toda superficie pública (docs ES/EN, docs.tsx,
// OpenAPI, skills, READMEs, description de sandbox_create). Está tipado contra
// SANDBOX_TEMPLATES: añadir un template al enum sin describirlo aquí rompe el
// typecheck, y `scripts/docs-sync.mts` + `test/docsDrift.test.ts` propagan la
// tabla a los archivos de prosa. Antes la lista vivía copiada a mano en 9 sitios.
//
// `kind`:
//   base     — runtime limpio para ejecutar código.
//   agent    — arnés/agente listo (chat, ACP, WhatsApp…).
//   service  — caja de servicio de la plataforma (voz, render, video…); se crea
//              con service_start, no con sandbox_create.
//   internal — sólo la usa la plataforma (workers de flota). Se documenta pero no
//              se recomienda.
// `docs: false` la esconde de las tablas públicas (sigue aceptada por la API).
export type TemplateKind = "base" | "agent" | "service" | "internal";

export interface TemplateInfo {
  kind: TemplateKind;
  /** Una línea, en español (las superficies EN traducen sólo el encabezado). */
  summary: string;
  /** Una línea en inglés para la referencia EN, OpenAPI y READMEs. */
  summaryEn: string;
  docs?: false;
}

export const TEMPLATE_CATALOG: Record<SandboxTemplate, TemplateInfo> = {
  ubuntu: { kind: "base", summary: "Linux completo. Instalar paquetes, compilar, correr servidores.", summaryEn: "Full Linux. Install packages, compile, run servers." },
  python: { kind: "base", summary: "Runtime Python; cada run-code es un proceso fresco.", summaryEn: "Python runtime; each run-code is a fresh process." },
  node: { kind: "base", summary: "Node 24 + typescript, tsx, pnpm, git y python3; cada run-code es un proceso fresco.", summaryEn: "Node 24 + typescript, tsx, pnpm, git and python3; each run-code is a fresh process." },
  bun: { kind: "base", summary: "Runtime Bun.", summaryEn: "Bun runtime." },
  "dev-box": { kind: "base", summary: "Caja de trabajo limpia (git, curl, build-essential, Node 22); la recomendada para SSH.", summaryEn: "Clean work box (git, curl, build-essential, Node 22); the recommended one for SSH." },
  "code-interpreter": { kind: "base", summary: "Python + kernel Jupyter persistente (sandbox_run_cell): variables y gráficas sobreviven entre celdas.", summaryEn: "Python + persistent Jupyter kernel (sandbox_run_cell): variables and charts survive between cells." },
  "eve-nitro": { kind: "base", summary: "Servidor eve (Vercel) self-hosted: Node 24, pnpm, eve CLI 0.65; /data persistente, puerto 3000.", summaryEn: "Self-hosted eve (Vercel) server: Node 24, pnpm, eve CLI 0.65; persistent /data, port 3000." },
  "node-agent": { kind: "agent", summary: "Node + Claude Agent SDK pre-horneado (agent_run).", summaryEn: "Node + Claude Agent SDK pre-baked (agent_run)." },
  "claude-code": { kind: "agent", summary: "Loop del Claude Agent SDK; billing por token.", summaryEn: "Claude Agent SDK loop; per-token billing." },
  goose: { kind: "agent", summary: "goose (AAIF), agente de código con ACP nativo.", summaryEn: "goose (AAIF), coding agent with native ACP." },
  "ghosty-lite": { kind: "agent", summary: "Agente ACP ligero en Rust, multi-provider; el cerebro puede ser tu llave EasyBits.", summaryEn: "Lightweight Rust ACP agent, multi-provider; your EasyBits key can be its brain." },
  "rust-ghosty": { kind: "agent", summary: "Ghosty DeepSeek-first (CodeWhale/Rust) con web SSE y WhatsApp.", summaryEn: "DeepSeek-first Ghosty (CodeWhale/Rust) with SSE web chat and WhatsApp." },
  "open-ghosty": { kind: "agent", summary: "Ghosty sobre modelos abiertos, chat web SSE.", summaryEn: "Ghosty on open models, SSE web chat." },
  "lang-ghosty": { kind: "agent", summary: "Ghosty sobre LangChain, chat web SSE.", summaryEn: "Ghosty on LangChain, SSE web chat." },
  "cagent-ghosty": { kind: "agent", summary: "Ghosty sobre cagent (Docker), chat web SSE.", summaryEn: "Ghosty on cagent (Docker), SSE web chat." },
  "ghosty-gc": { kind: "agent", summary: "Ghosty para equipos (GTeams): hilos, artefactos, editor colaborativo.", summaryEn: "Ghosty for teams (GTeams): threads, artifacts, collaborative editor." },
  "ghosty-chat": { kind: "agent", summary: "Chat Ghosty persistente (Express + SSE).", summaryEn: "Persistent Ghosty chat (Express + SSE)." },
  "chat-openai": { kind: "agent", summary: "Chat persistente Express+SSE con OpenAI; créalo con agent_create.", summaryEn: "Persistent Express+SSE chat on OpenAI; create it with agent_create." },
  "chat-anthropic": { kind: "agent", summary: "Chat persistente Express+SSE con Anthropic; créalo con agent_create.", summaryEn: "Persistent Express+SSE chat on Anthropic; create it with agent_create." },
  ghostyclaw: { kind: "agent", summary: "Daemon always-on de Ghosty (WhatsApp, Slack, Telegram) con Docker y admin-api.", summaryEn: "Always-on Ghosty daemon (WhatsApp, Slack, Telegram) with Docker and admin-api." },
  openclaw: { kind: "agent", summary: "OpenClaw, IA personal always-on.", summaryEn: "OpenClaw, always-on personal AI." },
  "ghosty-studio": { kind: "agent", summary: "Ghosty Studio: control plane de agentes dentro de una caja.", summaryEn: "Ghosty Studio: agent control plane inside a box." },
  "desktop-ghosty": { kind: "agent", summary: "Escritorio Linux con Ghosty (noVNC).", summaryEn: "Linux desktop with Ghosty (noVNC)." },
  "computer-ghosty": { kind: "agent", summary: "Computer-use con escritorio XFCE + noVNC público.", summaryEn: "Computer-use with XFCE desktop + public noVNC." },
  "computer-ghosty-gemini": { kind: "agent", summary: "Computer-use con Gemini.", summaryEn: "Computer-use on Gemini." },
  "claude-worker": { kind: "internal", summary: "Worker de la flota (Claude). Lo crea la plataforma.", summaryEn: "Fleet worker (Claude). Created by the platform." },
  "codex-worker": { kind: "internal", summary: "Worker de la flota (Codex). Lo crea la plataforma.", summaryEn: "Fleet worker (Codex). Created by the platform." },
  "livekit-svc": { kind: "service", summary: "Sala de videollamada + grabación HD (Studio).", summaryEn: "Video call room + HD recording (Studio)." },
  "whisper-svc": { kind: "service", summary: "STT whisper; parte de la caja voice.", summaryEn: "whisper STT; part of the voice box." },
  "kokoro-svc": { kind: "service", summary: "TTS kokoro; parte de la caja voice.", summaryEn: "kokoro TTS; part of the voice box." },
  "voice-svc": { kind: "service", summary: "Voz (STT + TTS) para la flota; service_start('voice').", summaryEn: "Voice (STT + TTS) for the fleet; service_start('voice')." },
  "render-svc": { kind: "service", summary: "Chromium para PDF/PNG/auditoría; service_start('render').", summaryEn: "Chromium for PDF/PNG/audits; service_start('render')." },
  "collab-svc": { kind: "service", summary: "Editor colaborativo (Yjs) de GTeams.", summaryEn: "GTeams collaborative editor (Yjs)." },
  "hyperframes-svc": { kind: "service", summary: "Render de video HyperFrames.", summaryEn: "HyperFrames video rendering." },
};

export const KIND_LABEL: Record<TemplateKind, { es: string; en: string }> = {
  base: { es: "base", en: "base" },
  agent: { es: "agente", en: "agent" },
  service: { es: "servicio", en: "service" },
  internal: { es: "interno", en: "internal" },
};

const KIND_ORDER: TemplateKind[] = ["base", "agent", "service", "internal"];

/** Templates que se documentan: agrupados por tipo (base, agente, servicio, interno), estable dentro del tipo. */
export function publicTemplates(kinds?: TemplateKind[]): SandboxTemplate[] {
  return SANDBOX_TEMPLATES.filter((t) => {
    const info = TEMPLATE_CATALOG[t];
    return info.docs !== false && (!kinds || kinds.includes(info.kind));
  }).sort((a, b) => KIND_ORDER.indexOf(TEMPLATE_CATALOG[a].kind) - KIND_ORDER.indexOf(TEMPLATE_CATALOG[b].kind));
}

/** Tabla markdown `| Template | Tipo | Descripción |` (ES) o EN. Es lo que pegan docs-sync y reference.ts. */
export function templatesMarkdownTable(locale: "es" | "en" = "es", kinds?: TemplateKind[]): string {
  const head = locale === "es" ? "| Template | Tipo | Descripción |" : "| Template | Kind | Description |";
  const rows = publicTemplates(kinds).map((t) => {
    const i = TEMPLATE_CATALOG[t];
    return `| \`${t}\` | ${KIND_LABEL[i.kind][locale]} | ${locale === "es" ? i.summary : i.summaryEn} |`;
  });
  return [head, "|---|---|---|", ...rows].join("\n");
}

/** Lista corta para descriptions de tools / OpenAPI: "ubuntu, python, node…". */
export function templatesInline(kinds?: TemplateKind[]): string {
  return publicTemplates(kinds).join(", ");
}
