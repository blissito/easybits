import { describe, it, expect } from "vitest";
import { execFileSync } from "node:child_process";
import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  assertNoInlineCredentials,
  buildGitScript,
  redactGit,
} from "~/.server/core/gitOperations";

// El valor de este módulo NO es correr git —`sandbox_exec` ya podía— sino
// entregarle un token sin dejarlo tirado. Cada una de estas reglas tiene una
// "simplificación" obvia que la rompe en silencio, y el fallo no se nota: el
// clone funciona igual, el token simplemente queda legible para cualquier
// proceso de la caja. Por eso se fijan aquí.
describe("git credential handling", () => {
  const script = buildGitScript({
    args: "clone --depth 1 'https://github.com/acme/private.git' '/data/work'",
    credTag: "eb-git-TESTTAG",
    post: ["echo EB_GIT_OK"],
  });

  it("nunca pone el token en la línea de comando", () => {
    // El script se arma en el servidor y el token NO se le pasa: llega a la caja
    // por el endpoint de ficheros. Si alguien "simplifica" esto a un
    // `echo $TOKEN` o a un URL con credenciales, el token aparece en `ps` y en
    // cualquier log de ejecución del host.
    expect(script).not.toMatch(/ghp_|github_pat_/);
    expect(script).not.toMatch(/https?:\/\/[^/@\s]+@/);
    expect(script).toContain("GIT_ASKPASS=");
  });

  it("borra el material de credenciales pase lo que pase", () => {
    // El trap va ANTES del git a propósito: puesto después, un timeout que mata
    // el shell dejaría el token vivo en tmpfs hasta que la caja muera.
    const trapAt = script.indexOf("trap 'rm -rf");
    const gitAt = script.indexOf("git -c credential.helper=");
    expect(trapAt).toBeGreaterThan(-1);
    expect(trapAt).toBeLessThan(gitAt);
    expect(script).toContain("EXIT INT TERM");
  });

  it("limpia los directorios candidatos que no se eligieron", () => {
    // El token se escribe en los tres candidatos para no pagar un round-trip
    // extra al host; los dos que sobran llevan el mismo secreto.
    for (const base of ["/dev/shm", "/run", "/tmp"]) {
      expect(script).toContain(`rm -rf '${base}/eb-git-TESTTAG'`);
    }
  });

  it("anula cualquier credential helper heredado", () => {
    // Sin esto, un helper del sistema podría CACHEAR la credencial y
    // sobrevivir a la llamada — que es justo lo que se está evitando.
    expect(script).toContain("-c credential.helper= ");
  });

  it("conserva HTTP/1.1 y el fallo rápido sin prompt", () => {
    // git 2.43 + protocolo v2 sobre HTTP/2 revienta contra GitHub incluso en un
    // repo público; y sin GIT_TERMINAL_PROMPT=0 un repo privado se cuelga
    // esperando un usuario que nadie va a teclear.
    expect(script).toContain("http.version=HTTP/1.1");
    expect(script).toContain("GIT_TERMINAL_PROMPT=0");
  });

  it("no monta nada de credenciales cuando el repo es público", () => {
    const plain = buildGitScript({ args: "status --porcelain=v2", dir: "/data/work" });
    expect(plain).not.toContain("GIT_ASKPASS");
    expect(plain).not.toContain("EB_CRED_DIR");
  });
});

describe("URLs con credenciales embebidas", () => {
  it("se rechazan en vez de aceptarse en silencio", () => {
    // git las PERSISTE en .git/config, y de ahí acabarían dentro del tarball de
    // un release. Un 422 explícito enseña el camino correcto; aceptarlo, no.
    expect(() =>
      assertNoInlineCredentials("https://user:ghp_secret@github.com/acme/x.git")
    ).toThrowError(/credenciales embebidas/i);
    expect(() =>
      assertNoInlineCredentials("https://github.com/acme/x.git")
    ).not.toThrow();
  });
});

describe("redactGit", () => {
  it("tapa tokens y userinfo en la salida devuelta", () => {
    expect(redactGit("remote: https://x-access-token:ghp_abcdefghijklmnop@github.com/a/b")).not.toContain(
      "ghp_abcdefghijklmnop"
    );
    expect(redactGit("fatal: github_pat_11ABCDEFG0123456789abcdef rejected")).toContain("***");
  });
});

// Los tests de arriba miran el script como TEXTO, y por eso dejaron pasar un bug
// real: el prólogo re-asignaba EB_CRED_DIR con shQuote, o sea entre comillas
// SIMPLES, así que GIT_ASKPASS acababa siendo la ruta literal
// "$EB_CRED_DIR/askpass.sh" y git respondía "No such file or directory". Todas
// las aserciones de texto pasaban.
//
// La lección: para un script, la prueba tiene que EJECUTARLO.
describe("el script se comporta como shell, no como texto", () => {
  const bash = (script: string) =>
    execFileSync("bash", ["-c", script], { encoding: "utf8" });

  it("GIT_ASKPASS apunta a un archivo que existe y devuelve la credencial", () => {
    const tag = "eb-git-SHELLTEST";
    const tmp = mkdtempSync(join(tmpdir(), "ebgit-"));
    // Se simulan los tres candidatos, como hace runGit escribiendo por el
    // endpoint de ficheros del host.
    for (const base of ["shm", "run", "tmp"]) {
      const dir = join(tmp, base, tag);
      mkdirSync(dir, { recursive: true });
      writeFileSync(join(dir, ".u"), "x-access-token");
      writeFileSync(join(dir, ".p"), "ghp_SECRETO");
      writeFileSync(
        join(dir, "askpass.sh"),
        `#!/bin/sh\nD=$(dirname "$0")\ncase "$1" in\n  probe) exit 0 ;;\n  *[Uu]sername*) cat "$D"/.u ;;\n  *) cat "$D"/.p ;;\nesac\n`
      );
      chmodSync(join(dir, "askpass.sh"), 0o700);
    }

    const script = buildGitScript({ args: "--version", credTag: tag })
      // El script busca en las rutas reales del sistema; aquí se redirigen al
      // temporal para no tocar el /dev/shm de la máquina que corre los tests.
      .replace(/'\/dev\/shm\//g, `'${tmp}/shm/`)
      .replace(/'\/run\//g, `'${tmp}/run/`)
      .replace(/'\/tmp\//g, `'${tmp}/tmp/`)
      .replace(/'\/dev\/shm'/g, `'${tmp}/shm'`)
      .replace(/'\/run'/g, `'${tmp}/run'`)
      .replace(/'\/tmp'/g, `'${tmp}/tmp'`)
      // No se instala git ni se corre git en un test.
      .replace(/^command -v git .*$/m, "true")
      .replace(/^GIT_TERMINAL_PROMPT=0 git .*$/m, [
        `test -x "$GIT_ASKPASS" || { echo "ASKPASS_NO_EJECUTABLE:$GIT_ASKPASS"; exit 1; }`,
        `echo "PASSWORD=$("$GIT_ASKPASS" Password)"`,
        `echo "USERNAME=$("$GIT_ASKPASS" Username)"`,
        `echo "DIR=$EB_CRED_DIR"`,
      ].join("\n"));

    const out = bash(script);
    expect(out).toContain("PASSWORD=ghp_SECRETO");
    expect(out).toContain("USERNAME=x-access-token");
    // Y el material se borró al salir, por el trap.
    const chosen = out.match(/DIR=(.+)/)?.[1].trim();
    expect(chosen).toBeTruthy();
    expect(existsSync(chosen!)).toBe(false);
    // Los candidatos NO elegidos también llevaban el token: tampoco quedan.
    for (const base of ["shm", "run", "tmp"]) {
      expect(existsSync(join(tmp, base, tag))).toBe(false);
    }
    rmSync(tmp, { recursive: true, force: true });
  });
});
