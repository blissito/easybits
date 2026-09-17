import { VALID_SECTIONS } from "./reference";

// Los ids de las <section> de /docs no siempre coinciden con las claves de la referencia.
export const DOCS_SECTION_ALIAS: Record<string, string> = {
  auth: "quickstart",
  "ghosty-code": "quickstart",
  cowork: "quickstart",
  "video-projects": "videoProjects",
  web: "about",
  forms: "files",
  payments: "account",
  email: "account",
  "ghosty-lite": "agents",
  "agentes-en-tu-app": "flota",
  secrets: "agents",
  llm: "account",
  calls: "studio",
};

export function resolveDocsSection(raw: string): string | null {
  const name = raw.replace(/\.md$/, "");
  const aliased = DOCS_SECTION_ALIAS[name] ?? name;
  return VALID_SECTIONS.find((s) => s.toLowerCase() === aliased.toLowerCase()) ?? null;
}
