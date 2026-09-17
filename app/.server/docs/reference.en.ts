// Referencia en inglés: sólo "lo que vende" (decisión de bliss, 2026-09-16). Las secciones
// las escriben reference.en.core.ts y reference.en.agents-hosting.ts; aquí sólo se indexan.
// `hosting` interpola el catálogo de tiers igual que el ES (misma fuente única).
import { EN_ABOUT, EN_QUICKSTART, EN_FILES, EN_WEB, EN_DATABASES, EN_ERRORS } from "./reference.en.core";
import { EN_AGENTS, EN_HOSTING } from "./reference.en.agents-hosting";
import { HOSTING_TIERS_MD } from "./reference";

export const SECTIONS_EN: Record<string, string> = {
  about: EN_ABOUT,
  quickstart: EN_QUICKSTART,
  files: EN_FILES,
  web: EN_WEB,
  databases: EN_DATABASES,
  errors: EN_ERRORS,
  agents: EN_AGENTS,
  hosting: EN_HOSTING.replace("__HOSTING_TIERS_MD__", HOSTING_TIERS_MD),
};
