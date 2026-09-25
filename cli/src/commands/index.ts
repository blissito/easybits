import type { Command } from "../types.js";
import { login, usage, websites, providers, config, mcp } from "./account.js";
import { files } from "./files.js";
import { init } from "./init.js";
import { sshKey, sshProxy } from "./ssh.js";
import { sandboxes } from "./sandboxes.js";
import { machines } from "./machines.js";
import { domains } from "./domains.js";
import { db } from "./db.js";
import { agents } from "./agents.js";
import { docs } from "./docs.js";

// El orden aquí es el orden de la ayuda.
export const COMMANDS: Command[] = [
  login,
  usage,
  sandboxes,
  agents,
  machines,
  domains,
  init,
  db,
  files,
  websites,
  providers,
  config,
  mcp,
  sshKey,
  sshProxy,
  docs,
];

export function findCommand(name: string): Command | undefined {
  return COMMANDS.find((c) => c.name === name || c.aliases?.includes(name));
}
