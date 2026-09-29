import type { Command } from "../types.js";
import { login, logout, whoami, usage, websites, providers, mcp } from "./account.js";
import { files } from "./files.js";
import { init } from "./init.js";
import { sshKey, sshProxy } from "./ssh.js";
import { sandboxes } from "./sandboxes.js";
import { machines } from "./machines.js";
import { domains } from "./domains.js";
import { db } from "./db.js";
import { agents } from "./agents.js";
import { apply } from "./spec.js";
import { completion } from "./completion.js";
import { docs } from "./docs.js";
import { doctor } from "./doctor.js";

// El orden aquí es el orden de la ayuda.
export const COMMANDS: Command[] = [
  login,
  logout,
  whoami,
  doctor,
  usage,
  sandboxes,
  agents,
  apply,
  machines,
  domains,
  init,
  db,
  files,
  websites,
  providers,
  mcp,
  sshKey,
  sshProxy,
  docs,
  completion,
];

export function findCommand(name: string): Command | undefined {
  return COMMANDS.find((c) => c.name === name || c.aliases?.includes(name));
}
