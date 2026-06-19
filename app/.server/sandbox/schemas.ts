import { z } from "zod";

// Fuente única de validación de payloads de sandbox para las rutas REST
// (.safeParse del body). NO incluye `sandboxId` — viene del URL param.

// Lista canónica de templates: el tipo SandboxTemplate (en sandboxOperations)
// se deriva de aquí — una sola fuente, sin drift entre validador y tipo.
export const SANDBOX_TEMPLATES = [
  "ubuntu", "python", "node", "node-agent", "bun", "claude-code", "goose",
  "ghostyclaw", "ghosty-lite", "open-ghosty", "lang-ghosty", "rust-ghosty",
  "cagent-ghosty", "openclaw", "chat-openai", "chat-anthropic",
  "code-interpreter", "desktop-ghosty", "computer-ghosty", "computer-ghosty-gemini",
] as const;

export type SandboxTemplate = (typeof SANDBOX_TEMPLATES)[number];

export const SandboxCreateBody = z.object({
  template: z.enum(SANDBOX_TEMPLATES),
  timeoutSeconds: z.number().int().min(30).max(3600).optional(),
  name: z.string().max(64).optional(),
  metadata: z.record(z.string()).optional(),
  // Opt-in a VM always-on (el host salta el reaper). Combina con la lista de
  // templates de agente persistentes en createSandbox.
  persistent: z.boolean().optional(),
  // Clase de tamaño de la VM. Mapea a vcpus/memoryMb/diskMb en createSandbox
  // y se gatea por plan. Omitido → "s" (el default del template).
  size: z.enum(["s", "m", "l", "xl"]).optional(),
});

// ── Hosting (always-on machines) ──────────────────────────────────────────
// Tier keys mirror HOSTING_CATALOG (app/lib/hostingCatalog.ts). Kept as a flat
// enum here to validate at the edge without importing the catalog into zod.
export const MACHINE_TIERS = [
  "nano", "micro", "mini", "lite", "base",
  "plus", "pro", "focus", "performance", "performance-4x",
] as const;

export const MachineCreateBody = z.object({
  tier: z.enum(MACHINE_TIERS),
  cpuMode: z.enum(["shared", "reserved"]).optional(),
  diskAddonsGB: z.number().int().min(0).max(2000).multipleOf(100).optional(),
  template: z.enum(SANDBOX_TEMPLATES).optional(),
  name: z.string().max(64).optional(),
  // When set, PROMOTE this existing (ephemeral) sandbox to permanent instead
  // of provisioning a fresh VM. The sandbox keeps its resources; `tier` is the
  // billed price.
  fromSandboxId: z.string().optional(),
});

export const MachineResizeBody = z.object({
  tier: z.enum(MACHINE_TIERS).optional(),
  cpuMode: z.enum(["shared", "reserved"]).optional(),
});

export const MachineDiskBody = z.object({
  addGB: z.number().int().positive().max(2000).multipleOf(100),
});

export const SandboxExecBody = z.object({
  command: z.string().min(1),
  cwd: z.string().optional(),
  timeoutSeconds: z.number().int().min(1).max(600).optional(),
  env: z.record(z.string()).optional(),
});

export const SandboxRunCodeBody = z.object({
  code: z.string().min(1),
  lang: z.enum(["python", "node", "bash"]).optional(),
  timeoutSeconds: z.number().int().min(1).max(600).optional(),
});

export const SandboxRunCellBody = z.object({
  code: z.string().min(1),
  timeoutSeconds: z.number().int().min(1).max(600).optional(),
});
