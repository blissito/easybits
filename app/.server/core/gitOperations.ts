/**
 * Git dentro de una caja, con la credencial POR LLAMADA.
 *
 * El problema real no es correr git — `sandbox_exec` ya podía— sino entregarle
 * un token sin dejarlo tirado. Todas las formas obvias fallan:
 *
 *   - token en el URL (`https://x:tok@host/…`) → visible en `ps` y, peor, git lo
 *     PERSISTE en `.git/config` como remote. Es lo que hace E2B, que luego tiene
 *     que ir a limpiarlo.
 *   - `-c http.extraHeader=…`                  → visible en `ps` durante toda la
 *     operación, y un clone puede durar minutos.
 *   - `GIT_CONFIG_KEY_n` por env del exec      → aterriza en /proc/<pid>/environ.
 *   - `credential.helper='!f(){ echo …; }'`    → el valor va en la línea de
 *     comando del helper.
 *
 * Lo que se hace aquí: un `GIT_ASKPASS` que lee el token de un archivo 0600 en
 * tmpfs, borrado por un `trap` que corre aunque git muera o venza el timeout.
 * El remote URL nunca contiene credenciales, así que no hay nada que limpiar
 * después.
 *
 * Queda una ventana honesta: mientras git corre, un proceso root DENTRO de la
 * caja podría leer el archivo. Son segundos y la caja es mono-tenant — la misma
 * garantía que da la competencia, sin el `.git/config` sucio.
 */
import { nanoid } from "nanoid";
import type { AuthContext } from "../apiAuth";
import { resolveSecretRef } from "./secretOperations";
import {
  execCommand,
  shQuote,
  writeFile,
  type ExecResult,
} from "./sandboxOperations";

/**
 * Dónde se monta el material de credenciales. tmpfs: nunca toca el disco, así
 * que no entra en un snapshot de bloque ni en el tarball de un release.
 *
 * `/dev/shm` es tmpfs en toda microVM. Si algún template lo montara `noexec` el
 * askpass no podría ejecutarse; por eso el script prueba candidatos en orden y
 * se queda con el primero donde un archivo ejecutable de verdad corre.
 */
const CRED_DIRS = ["/dev/shm", "/run", "/tmp"];

/** Usuario por defecto para un PAT de GitHub — el token va en la contraseña. */
const DEFAULT_GIT_USERNAME = "x-access-token";

const DEFAULT_AUTHOR_NAME = "EasyBits Agent";
const DEFAULT_AUTHOR_EMAIL = "agent@easybits.cloud";

export interface GitAuth {
  /** Token o `$secret:NOMBRE`. Ausente = repo público. */
  token?: string;
  username?: string;
}

export interface GitRunResult extends ExecResult {}

/** Oculta cualquier cosa con pinta de credencial en la salida devuelta. */
export function redactGit(s: string): string {
  return (s || "")
    .replace(/(https?:\/\/)[^/@\s]+@/g, "$1***@")
    .replace(/\b(gh[pousr]_[A-Za-z0-9]{16,})\b/g, "***")
    .replace(/\bgithub_pat_[A-Za-z0-9_]{20,}\b/g, "***");
}

/**
 * Prólogo que deja el askpass montado y programa su borrado.
 *
 * El `trap` es la primera línea ejecutable a propósito: si se pusiera después
 * del `git`, un timeout que mata el shell dejaría el token en tmpfs.
 */
function credentialPrologue(): string {
  // Nada de re-asignar EB_CRED_DIR aquí: la elige el probe de arriba y volver a
  // escribirla con shQuote la dejaría entre comillas SIMPLES, sin expandir — el
  // askpass acabaría siendo la ruta literal "$EB_CRED_DIR/askpass.sh".
  return [
    `trap 'rm -rf "$EB_CRED_DIR"' EXIT INT TERM`,
    `chmod 700 "$EB_CRED_DIR" 2>/dev/null || true`,
    `chmod 600 "$EB_CRED_DIR"/.u "$EB_CRED_DIR"/.p 2>/dev/null || true`,
    `chmod 700 "$EB_CRED_DIR"/askpass.sh 2>/dev/null || true`,
  ].join("\n");
}

/**
 * Ejecuta un git dentro de la caja.
 *
 * Es el ÚNICO sitio que sabe de askpass, tmpfs y `trap`; los handlers de arriba
 * sólo componen argumentos y parsean salida. `args` llega ya shell-quoted.
 */
/**
 * Arma el script que corre en la caja. Función PURA para que un test pueda
 * fijar la regla que de verdad importa —que el token no aparezca en la línea de
 * comando— sin necesitar una caja viva.
 */
export function buildGitScript(opts: {
  args: string;
  dir?: string;
  credTag?: string;
  pre?: string[];
  post?: string[];
}): string {
  let authEnv = "";
  if (opts.credTag) {
    const dirFor = (base: string) => `${base}/${opts.credTag}`;
    // El directorio se elige DENTRO de la caja, no aquí: un template con
    // /dev/shm montado noexec haría fallar el askpass de forma inescrutable, y
    // desde el servidor no hay forma de saberlo. Se prueba escribiendo un
    // ejecutable de verdad y corriéndolo.
    const probe = CRED_DIRS.map(
      (base) =>
        `if [ -z "$EB_CRED_DIR" ] && [ -d ${shQuote(base)} ] && [ -w ${shQuote(base)} ]; then ` +
        `C=${shQuote(dirFor(base))}; ` +
        `if [ -d "$C" ] && chmod 700 "$C"/askpass.sh 2>/dev/null && "$C"/askpass.sh probe >/dev/null 2>&1; then EB_CRED_DIR="$C"; fi; fi`
    ).join("\n");

    authEnv = [
      `EB_CRED_DIR=""`,
      probe,
      `if [ -z "$EB_CRED_DIR" ]; then echo "EB_NO_CRED_DIR" >&2; exit 90; fi`,
      // Los candidatos que no se eligieron TAMBIÉN llevan el token: fuera.
      ...CRED_DIRS.map(
        (base) =>
          `[ "$EB_CRED_DIR" = ${shQuote(dirFor(base))} ] || rm -rf ${shQuote(dirFor(base))} 2>/dev/null || true`
      ),
      credentialPrologue(),
      `export GIT_ASKPASS="$EB_CRED_DIR"/askpass.sh`,
    ].join("\n");
  }

  return [
    "set -e",
    // git no está en todos los templates base. Mismo remedio que usa launchApp.
    "command -v git >/dev/null || (apt-get update -qq && apt-get install -y -qq git >/dev/null 2>&1)",
    authEnv,
    ...(opts.pre ?? []),
    // `credential.helper=` vacío anula cualquier helper heredado del sistema,
    // para que nada quede cacheado tras la operación.
    // `http.version=HTTP/1.1`: git 2.43 (Ubuntu 24.04) + protocolo v2 sobre
    // HTTP/2 revienta contra GitHub con "expected flush after ref listing".
    // `GIT_TERMINAL_PROMPT=0`: un repo privado sin credencial falla rápido en
    // vez de colgarse esperando un usuario que nadie va a teclear.
    `GIT_TERMINAL_PROMPT=0 git -c credential.helper= -c http.version=HTTP/1.1 ${
      opts.dir ? `-C ${shQuote(opts.dir)} ` : ""
    }${opts.args}`,
    ...(opts.post ?? []),
  ]
    .filter(Boolean)
    .join("\n");
}

/**
 * Ejecuta un git dentro de la caja.
 *
 * Es el ÚNICO sitio que sabe de askpass, tmpfs y `trap`; los handlers de arriba
 * sólo componen argumentos y parsean salida. `args` llega ya shell-quoted.
 */
export async function runGit(
  ctx: AuthContext,
  sandboxId: string,
  opts: {
    /** Directorio de trabajo. Ausente para `clone`, que crea el suyo. */
    dir?: string;
    args: string;
    auth?: GitAuth;
    timeoutSeconds?: number;
    /** Comandos extra antes del git (p. ej. preparar el destino de un clone). */
    pre?: string[];
    /** Comandos extra después, sólo si el git salió bien. */
    post?: string[];
  }
): Promise<GitRunResult> {
  const timeoutSeconds = Math.min(opts.timeoutSeconds ?? 120, 600);

  let credTag: string | undefined;
  if (opts.auth?.token) {
    // Se resuelve AQUÍ y no en el handler para que ningún camino pueda saltarse
    // la resolución y mandar la cadena "$secret:FOO" como si fuera el token.
    const token = await resolveSecretRef(ctx.user.id, opts.auth.token, {
      hint: "Cárgalo con `secret_set` y pásalo como $secret:NOMBRE.",
    });
    const username = opts.auth.username || DEFAULT_GIT_USERNAME;
    credTag = `eb-git-${nanoid(12)}`;

    // Los tres archivos se escriben con el endpoint de FICHEROS del host, no
    // con un `echo` en la línea de comando: un `echo $TOKEN` sería exactamente
    // la fuga que este módulo existe para evitar.
    //
    // Se escriben en TODOS los candidatos y el script borra los que no se
    // usaron. Escribir sólo en el elegido exigiría un round-trip extra al host
    // por operación, y el material vive segundos en tmpfs de todos modos.
    for (const base of CRED_DIRS) {
      const dir = `${base}/${credTag}`;
      await Promise.all([
        writeFile(ctx, sandboxId, { path: `${dir}/.u`, content: username }),
        writeFile(ctx, sandboxId, { path: `${dir}/.p`, content: token }),
        writeFile(ctx, sandboxId, {
          path: `${dir}/askpass.sh`,
          content:
            `#!/bin/sh\n` +
            `D=$(dirname "$0")\n` +
            `case "$1" in\n` +
            `  probe) exit 0 ;;\n` +
            `  *[Uu]sername*) cat "$D"/.u ;;\n` +
            `  *) cat "$D"/.p ;;\n` +
            `esac\n`,
        }),
      ]).catch(() => {});
    }
  }

  const res = await execCommand(ctx, sandboxId, {
    command: buildGitScript({
      args: opts.args,
      dir: opts.dir,
      credTag,
      pre: opts.pre,
      post: opts.post,
    }),
    timeoutSeconds,
  });

  return {
    ...res,
    stdout: redactGit(res.stdout ?? ""),
    stderr: redactGit(res.stderr ?? ""),
  };
}

/** Levanta un error legible a partir de un exec que salió mal. */
export function gitFailure(res: GitRunResult, what: string): Error {
  const detail = (res.stderr || res.stdout || "").trim().slice(-600);
  if (res.exitCode === 90) {
    return new Error(
      `${what} falló: no se encontró un tmpfs ejecutable en la caja para el askpass (/dev/shm, /run y /tmp no sirven).`
    );
  }
  const e: any = new Error(`${what} falló (exit ${res.exitCode}): ${detail}`);
  e.exitCode = res.exitCode;
  return e;
}

export { DEFAULT_AUTHOR_EMAIL, DEFAULT_AUTHOR_NAME };

// ─────────────────────────────────────────────────────────────────────────────
// Las operaciones. Cada una compone argumentos y parsea; nada sabe de tokens.
// ─────────────────────────────────────────────────────────────────────────────

export interface GitCloneResult {
  dir: string;
  branch: string;
  head: string;
  remote: string;
  detached: boolean;
}

/**
 * Clona un repo en la caja.
 *
 * Con `commit` se clona completo y se hace checkout del sha (detached HEAD):
 * un `--depth 1` no puede alcanzar un commit arbitrario.
 */
export async function gitClone(
  ctx: AuthContext,
  sandboxId: string,
  params: {
    repo: string;
    dir: string;
    branch?: string;
    depth?: number;
    commit?: string;
    auth?: GitAuth;
    timeoutSeconds?: number;
  }
): Promise<GitCloneResult> {
  assertNoInlineCredentials(params.repo);
  const shallow = params.commit ? "" : `--depth ${Math.max(1, params.depth ?? 1)} `;
  const branch = params.branch && !params.commit ? `-b ${shQuote(params.branch)} ` : "";
  const dir = shQuote(params.dir);

  const res = await runGit(ctx, sandboxId, {
    auth: params.auth,
    timeoutSeconds: params.timeoutSeconds ?? 300,
    pre: [`mkdir -p ${dir}`],
    args: `clone ${shallow}${branch}${shQuote(params.repo)} ${dir}`,
    post: [
      ...(params.commit
        ? [`git -C ${dir} checkout --detach ${shQuote(params.commit)}`]
        : []),
      // Marcador de éxito + los datos de vuelta en una sola línea, para no pagar
      // tres round-trips al host por un clone.
      `echo "EB_GIT_OK $(git -C ${dir} rev-parse HEAD) $(git -C ${dir} rev-parse --abbrev-ref HEAD) $(git -C ${dir} config --get remote.origin.url)"`,
    ],
  });

  const line = (res.stdout || "").split("\n").find((l) => l.startsWith("EB_GIT_OK "));
  if (!line) throw gitFailure(res, "git clone");
  const [, head, branchName, remote] = line.split(/\s+/);
  return {
    dir: params.dir,
    branch: branchName === "HEAD" ? (params.branch ?? "") : branchName,
    head,
    remote: redactGit(remote ?? ""),
    detached: branchName === "HEAD",
  };
}

export interface GitStatus {
  branch: string;
  upstream: string | null;
  ahead: number;
  behind: number;
  clean: boolean;
  staged: string[];
  modified: string[];
  untracked: string[];
  conflicted: string[];
}

/**
 * Estado del repo, ESTRUCTURADO.
 *
 * Se parsea `--porcelain=v2`, que es formato estable y pensado para máquinas —
 * la salida humana de `git status` cambia entre versiones y está traducida.
 */
export async function gitStatus(
  ctx: AuthContext,
  sandboxId: string,
  params: { dir: string }
): Promise<GitStatus> {
  const res = await runGit(ctx, sandboxId, {
    dir: params.dir,
    args: "status --porcelain=v2 --branch --untracked-files=all",
    timeoutSeconds: 60,
  });
  if (res.exitCode !== 0) throw gitFailure(res, "git status");

  const status: GitStatus = {
    branch: "",
    upstream: null,
    ahead: 0,
    behind: 0,
    clean: true,
    staged: [],
    modified: [],
    untracked: [],
    conflicted: [],
  };

  for (const raw of (res.stdout || "").split("\n")) {
    const line = raw.trimEnd();
    if (!line) continue;
    if (line.startsWith("# branch.head ")) {
      status.branch = line.slice("# branch.head ".length);
    } else if (line.startsWith("# branch.upstream ")) {
      status.upstream = line.slice("# branch.upstream ".length);
    } else if (line.startsWith("# branch.ab ")) {
      // Formato: "# branch.ab +2 -1"
      const m = line.match(/\+(\d+)\s+-(\d+)/);
      if (m) {
        status.ahead = Number(m[1]);
        status.behind = Number(m[2]);
      }
    } else if (line.startsWith("1 ") || line.startsWith("2 ")) {
      // Entrada ordinaria o renombrada: "1 XY sub mH mI mW hH hI path"
      const parts = line.split(" ");
      const xy = parts[1] ?? "..";
      const path = line.startsWith("2 ")
        ? (parts.slice(9).join(" ").split("\t")[0] ?? "")
        : parts.slice(8).join(" ");
      if (xy[0] !== ".") status.staged.push(path);
      if (xy[1] !== ".") status.modified.push(path);
    } else if (line.startsWith("u ")) {
      status.conflicted.push(line.split(" ").slice(10).join(" "));
    } else if (line.startsWith("? ")) {
      status.untracked.push(line.slice(2));
    }
  }

  status.clean =
    !status.staged.length &&
    !status.modified.length &&
    !status.untracked.length &&
    !status.conflicted.length;
  return status;
}

export interface GitCommitResult {
  sha: string | null;
  nothingToCommit: boolean;
  output: string;
}

/**
 * Hace commit.
 *
 * `nothingToCommit` se devuelve como RESULTADO, no como error: un agente que
 * recibe un fallo por "no había nada que commitear" reintenta, y reintentar no
 * cambia nada — es la receta de un bucle infinito.
 *
 * La identidad va por `-c` en la invocación, no con un `git config` que dejaría
 * rastro en el repo del cliente.
 */
export async function gitCommit(
  ctx: AuthContext,
  sandboxId: string,
  params: {
    dir: string;
    message: string;
    addAll?: boolean;
    paths?: string[];
    authorName?: string;
    authorEmail?: string;
  }
): Promise<GitCommitResult> {
  const dir = shQuote(params.dir);
  const pre: string[] = [];
  if (params.paths?.length) {
    pre.push(`git -C ${dir} add -- ${params.paths.map(shQuote).join(" ")}`);
  } else if (params.addAll !== false) {
    pre.push(`git -C ${dir} add -A`);
  }

  const ident =
    `-c user.name=${shQuote(params.authorName || DEFAULT_AUTHOR_NAME)} ` +
    `-c user.email=${shQuote(params.authorEmail || DEFAULT_AUTHOR_EMAIL)}`;

  const res = await runGit(ctx, sandboxId, {
    dir: params.dir,
    // `|| true` para poder distinguir "nada que commitear" (exit 1) de un fallo
    // real sin que `set -e` mate el script antes de mirarlo.
    args: `${ident} commit -m ${shQuote(params.message)} || true`,
    pre,
    post: [`echo "EB_GIT_SHA $(git -C ${dir} rev-parse HEAD 2>/dev/null || echo none)"`],
    timeoutSeconds: 120,
  });

  const out = res.stdout || "";
  const nothing = /nothing to commit|nada para (hacer commit|confirmar)|working tree clean/i.test(
    out
  );
  const shaLine = out.split("\n").find((l) => l.startsWith("EB_GIT_SHA "));
  const sha = shaLine ? shaLine.split(" ")[1] : null;
  if (!nothing && !sha) throw gitFailure(res, "git commit");
  return {
    sha: sha === "none" ? null : sha,
    nothingToCommit: nothing,
    output: out.replace(/EB_GIT_SHA .*/g, "").trim(),
  };
}

export async function gitPush(
  ctx: AuthContext,
  sandboxId: string,
  params: {
    dir: string;
    remote?: string;
    branch?: string;
    setUpstream?: boolean;
    force?: boolean;
    auth?: GitAuth;
  }
): Promise<{ pushed: boolean; remote: string; branch: string; output: string }> {
  const remote = params.remote || "origin";
  const branchArg = params.branch ? shQuote(params.branch) : `"$(git -C ${shQuote(params.dir)} rev-parse --abbrev-ref HEAD)"`;
  const flags = [
    params.setUpstream ? "-u" : "",
    // `--force-with-lease` y no `--force`: si alguien más empujó a esa rama, la
    // pierde entera. Un agente no debería poder hacer eso por accidente.
    params.force ? "--force-with-lease" : "",
  ]
    .filter(Boolean)
    .join(" ");

  const res = await runGit(ctx, sandboxId, {
    dir: params.dir,
    auth: params.auth,
    args: `push ${flags} ${shQuote(remote)} ${branchArg}`.replace(/\s+/g, " "),
    post: [`echo EB_GIT_PUSH_OK`],
    timeoutSeconds: 300,
  });
  if (!(res.stdout || "").includes("EB_GIT_PUSH_OK")) throw gitFailure(res, "git push");
  return {
    pushed: true,
    remote,
    branch: params.branch ?? "",
    output: [res.stdout, res.stderr].join("\n").replace("EB_GIT_PUSH_OK", "").trim(),
  };
}

export async function gitPull(
  ctx: AuthContext,
  sandboxId: string,
  params: { dir: string; rebase?: boolean; auth?: GitAuth }
): Promise<{ updated: boolean; head: string; conflicts: string[]; output: string }> {
  const dir = shQuote(params.dir);
  const res = await runGit(ctx, sandboxId, {
    dir: params.dir,
    auth: params.auth,
    args: `pull ${params.rebase ? "--rebase" : "--ff-only"} || true`,
    post: [
      `echo "EB_GIT_HEAD $(git -C ${dir} rev-parse HEAD)"`,
      `git -C ${dir} diff --name-only --diff-filter=U | sed 's/^/EB_GIT_CONFLICT /' || true`,
    ],
    timeoutSeconds: 300,
  });
  const out = res.stdout || "";
  const headLine = out.split("\n").find((l) => l.startsWith("EB_GIT_HEAD "));
  if (!headLine) throw gitFailure(res, "git pull");
  const conflicts = out
    .split("\n")
    .filter((l) => l.startsWith("EB_GIT_CONFLICT "))
    .map((l) => l.slice("EB_GIT_CONFLICT ".length));
  return {
    updated: !/Already up to date|Ya está actualizado/i.test(out),
    head: headLine.split(" ")[1],
    conflicts,
    output: out.replace(/EB_GIT_(HEAD|CONFLICT) .*/g, "").trim(),
  };
}

/**
 * Cambia de rama. Con `create` usa `-B`, no `-b`: idempotente a propósito, para
 * que un bootstrap que corre en cada despertar no falle con "already exists".
 */
export async function gitCheckout(
  ctx: AuthContext,
  sandboxId: string,
  params: { dir: string; branch: string; create?: boolean; from?: string }
): Promise<{ branch: string; created: boolean; head: string }> {
  const dir = shQuote(params.dir);
  const flag = params.create ? "-B " : "";
  const from = params.create && params.from ? ` ${shQuote(params.from)}` : "";
  const res = await runGit(ctx, sandboxId, {
    dir: params.dir,
    args: `checkout ${flag}${shQuote(params.branch)}${from}`,
    post: [`echo "EB_GIT_HEAD $(git -C ${dir} rev-parse HEAD)"`],
    timeoutSeconds: 120,
  });
  const headLine = (res.stdout || "").split("\n").find((l) => l.startsWith("EB_GIT_HEAD "));
  if (!headLine) throw gitFailure(res, "git checkout");
  return {
    branch: params.branch,
    created: !!params.create,
    head: headLine.split(" ")[1],
  };
}

export interface GitLogEntry {
  sha: string;
  author: string;
  date: string;
  message: string;
}

/** Historial paginado por offset — el cursor es el siguiente `--skip`. */
export async function gitLog(
  ctx: AuthContext,
  sandboxId: string,
  params: { dir: string; limit?: number; cursor?: string; path?: string }
): Promise<{ items: GitLogEntry[]; nextCursor: string | null }> {
  const limit = Math.min(Math.max(params.limit ?? 20, 1), 200);
  const skip = Math.max(0, Number(params.cursor ?? 0) || 0);
  const pathArg = params.path ? ` -- ${shQuote(params.path)}` : "";
  // \x1f separa campos y \x1e registros: ningún mensaje de commit los contiene,
  // a diferencia de cualquier separador imprimible que se nos ocurra.
  const res = await runGit(ctx, sandboxId, {
    dir: params.dir,
    args: `log --skip=${skip} -n ${limit + 1} --pretty=format:%H%x1f%an%x1f%aI%x1f%s%x1e${pathArg}`,
    timeoutSeconds: 60,
  });
  if (res.exitCode !== 0) throw gitFailure(res, "git log");

  const rows = (res.stdout || "")
    .split("\x1e")
    .map((r) => r.replace(/^\n/, "").trim())
    .filter(Boolean)
    .map((r) => {
      const [sha, author, date, message] = r.split("\x1f");
      return { sha, author, date, message: message ?? "" };
    });

  const hasMore = rows.length > limit;
  return {
    items: hasMore ? rows.slice(0, limit) : rows,
    nextCursor: hasMore ? String(skip + limit) : null,
  };
}

/**
 * Rechaza un URL con credenciales embebidas.
 *
 * Si se dejara pasar, git las persistiría en `.git/config` y acabarían dentro
 * del tarball de un release — justo lo que todo este módulo evita.
 */
export function assertNoInlineCredentials(repo: string): void {
  if (/^https?:\/\/[^/@\s]+@/.test(repo)) {
    const e: any = new Error(
      "El URL del repo lleva credenciales embebidas. Git las guardaría en .git/config dentro de la caja. Usa el parámetro token (acepta $secret:NOMBRE) y un URL limpio."
    );
    e.code = "RepoUrlHasCredentials";
    e.status = 422;
    throw e;
  }
}
