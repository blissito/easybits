// Referencia en inglés: sólo "lo que vende" (decisión de bliss, 2026-09-16). Las secciones
// las escriben reference.en.core.ts, reference.en.agents-hosting.ts y reference.en.cli.ts; aquí sólo se indexan.
// `hosting` interpola el catálogo de tiers igual que el ES (misma fuente única).
import { EN_ABOUT, EN_QUICKSTART, EN_FILES, EN_WEB, EN_DATABASES, EN_ERRORS } from "./reference.en.core";
import { EN_AGENTS, EN_HOSTING, EN_EVE } from "./reference.en.agents-hosting";
import { EN_CLI } from "./reference.en.cli";
import { HOSTING_TIERS_MD } from "./reference";
import { templatesMarkdownTable } from "../sandbox/templateCatalog";

export const SECTIONS_EN: Record<string, string> = {
  about: EN_ABOUT,
  quickstart: EN_QUICKSTART,
  cli: EN_CLI,
  files: EN_FILES,
  web: EN_WEB,
  databases: EN_DATABASES,
  errors: EN_ERRORS,
  agents: EN_AGENTS.replace("__TEMPLATES_MD_EN__", templatesMarkdownTable("en")),
  hosting: EN_HOSTING.replace("__HOSTING_TIERS_MD__", HOSTING_TIERS_MD),
  eve: EN_EVE,
};
