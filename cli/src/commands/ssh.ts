import { homedir } from "node:os";
import { join } from "node:path";
import { existsSync, readFileSync, mkdirSync } from "node:fs";
import { execFileSync } from "node:child_process";
import type { Command } from "../types.js";
import { need } from "../args.js";
import { getClient } from "../client.js";
import { CliError, usageError } from "../errors.js";

export const SSH_CONFIG_SNIPPET = `Host *.ghosty
    ProxyCommand easybits ssh-proxy %h
    User root`;

// ─── ssh-key ─────────────────────────────────────────────────────
//
// Devuelve la llave PÚBLICA para inyectar en una caja, creándola la primera vez.
//
// Existe para quitarle una decisión al agente. Elegir entre las llaves de ~/.ssh
// —o generar una y acordarse de cuál— es donde se equivoca: inyecta una pública
// que no corresponde a la privada con la que luego conecta, y el sshd responde
// "Permission denied" aunque todo lo demás esté bien. Como este mismo CLI es el
// ProxyCommand, usar SIEMPRE esta llave hace imposible que no coincidan.
//
// La privada NUNCA sale de esta máquina: EasyBits sólo recibe la pública.
export const sshKey: Command = {
  name: "ssh-key",
  group: "SSH",
  summary: "Print your public key for sandbox SSH (creates it once)",
  synopsis: "ssh-key",
  leaf: {
    summary: "Print your public key for sandbox_ssh_enable (creates ~/.ssh/easybits_ed25519 once)",
    usage: "easybits ssh-key",
    examples: ["easybits ssh-key"],
    async run(ctx) {
      const dir = join(homedir(), ".ssh");
      const key = join(dir, "easybits_ed25519");
      const pub = `${key}.pub`;
      if (!existsSync(pub)) {
        mkdirSync(dir, { recursive: true, mode: 0o700 });
        execFileSync("ssh-keygen", ["-t", "ed25519", "-N", "", "-f", key, "-C", "easybits"], {
          stdio: ["ignore", "ignore", "inherit"],
        });
        console.error(`easybits: key created at ${key}`);
      }
      const publicKey = readFileSync(pub, "utf8").trim();
      if (ctx.json) process.stdout.write(JSON.stringify({ publicKey, path: pub }, null, 2) + "\n");
      else process.stdout.write(publicKey + "\n");
    },
  },
};

// ─── ssh-proxy ───────────────────────────────────────────────────
//
// Se usa como ProxyCommand de ssh: mueve bytes entre stdin/stdout y un
// WebSocket contra el borde. Con esto `ssh caja.ghosty` entra a la microVM SIN
// que EasyBits abra un puerto por caja — el 443 pasa en redes donde un puerto
// alto no pasa (oficinas, VPN corporativa), que es de donde vienen los "no me
// conecta" imposibles de reproducir.
//
// El túnel NO autentica: la sesión SSH se autentica de punta a punta entre el
// cliente y el sshd de la caja. Aquí sólo se mueven bytes opacos.
//
// Node 22 trae `WebSocket` global, así que esto no añade ni una dependencia.
export const sshProxy: Command = {
  name: "ssh-proxy",
  group: "SSH",
  summary: "SSH tunnel over 443 (use as ssh ProxyCommand)",
  synopsis: "ssh-proxy <host>",
  leaf: {
    summary: "SSH tunnel over 443; meant to be the ProxyCommand in ~/.ssh/config",
    usage: "easybits ssh-proxy <sandboxId|name.ghosty>",
    examples: ["ssh mybox.ghosty   # with the ~/.ssh/config snippet from `easybits --help`"],
    async run(ctx) {
      const target = need(ctx, 0, "sandboxId|name.ghosty", this.usage);
      // Acepta `sb_xxx`, `sb_xxx.ghosty`, o el NOMBRE de la caja (`taller.ghosty`).
      // El nombre existe para que una persona escriba 15 caracteres en vez de 46; no
      // es secreto, y da igual que no lo sea: la sesión se autentica con tu llave y
      // con el ticket firmado, nunca con el nombre.
      let sandboxId = target.split(".")[0];
      const eb = await getClient(ctx);
      if (!sandboxId.startsWith("sb_")) {
        const hits = (await eb.sandboxes.list()).filter((s) => s.name === sandboxId);
        // Los nombres NO son únicos. Fallar es mejor que elegir: entrar a la caja
        // equivocada es peor que no entrar.
        if (hits.length === 0) throw usageError(`No sandbox named "${sandboxId}".`, this.usage);
        if (hits.length > 1)
          throw usageError(`"${sandboxId}" is ambiguous: ${hits.length} sandboxes use it; pass the sandboxId.`, this.usage);
        sandboxId = hits[0].sandboxId;
      }
      const sb = await eb.sandboxes.get(sandboxId);
      const { url } = await sb.sshTicket();

      const ws = new WebSocket(url);
      ws.binaryType = "arraybuffer";

      // Todo el diagnóstico va a stderr: stdout es el canal de SSH y cualquier byte
      // de más ahí corrompe el handshake.
      await new Promise<void>((resolve, reject) => {
        ws.onopen = () => resolve();
        ws.onerror = () => reject(new CliError("easybits ssh-proxy: could not open the tunnel"));
      });
      ws.onerror = () => {
        console.error("easybits ssh-proxy: tunnel error");
        process.exit(1);
      };
      ws.onclose = () => process.exit(0);
      ws.onmessage = (ev: MessageEvent) => {
        const data = ev.data;
        process.stdout.write(typeof data === "string" ? Buffer.from(data) : Buffer.from(data as ArrayBuffer));
      };
      process.stdin.on("data", (chunk: Buffer) => ws.send(chunk));
      process.stdin.on("end", () => ws.close());
      // El túnel vive hasta que ssh cierra; el proceso sale desde onclose.
      await new Promise(() => {});
    },
  },
};
