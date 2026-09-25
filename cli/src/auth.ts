// Sesión del CLI: OAuth2 (código de autorización + PKCE) con redirect loopback
// (RFC 8252) contra el servidor OAuth de EasyBits — el mismo que usan los clientes MCP.
//
// Pensado para que un agente de código lo maneje por la persona: `easybits login` abre el
// navegador, imprime la URL (con --json emite `{"event":"login_url"}` de inmediato para
// que el agente se la muestre) y espera el regreso del navegador.
//
// El servidor compara el redirect_uri EXACTO contra el registrado, así que cada login
// registra su cliente (DCR, RFC 7591) con el puerto que tocó — igual que hacen Claude Code
// y Ghosty Code contra este mismo servidor. Sin cambios del lado del servidor.
//
// Alternativa sin navegador: `easybits login <api-key>` o EASYBITS_API_KEY.
import { createHash, randomBytes } from "node:crypto";
import { createServer } from "node:http";
import { spawn } from "node:child_process";
import { chmodSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { resolveBaseUrl } from "@easybits.cloud/sdk";
import type { Ctx } from "./types.js";
import { CliError, EXIT } from "./errors.js";

const LOGIN_TIMEOUT_MS = 5 * 60_000;
const RC_PATH = join(homedir(), ".easybitsrc");

export type OAuthSession = {
  clientId: string;
  accessToken: string;
  refreshToken?: string;
  expiresAt: number; // epoch ms
};

/** ~/.easybitsrc. `apiKey` y `baseUrl` los lee también el proxy MCP: no renombrarlos. */
export type Rc = { apiKey?: string; baseUrl?: string; oauth?: OAuthSession; [k: string]: unknown };

export function readRc(): Rc {
  try {
    return JSON.parse(readFileSync(RC_PATH, "utf8")) as Rc;
  } catch {
    return {};
  }
}

export function writeRc(rc: Rc): void {
  writeFileSync(RC_PATH, JSON.stringify(rc, null, 2) + "\n", { mode: 0o600 });
  chmodSync(RC_PATH, 0o600); // por si ya existía con otro modo: guarda tokens
}

/**
 * ¿Hay una persona en la terminal a la que se le pueda abrir el navegador? Se mira stderr
 * (donde van los avisos) y no stdout, para que `easybits sb ls | jq` también lo arranque.
 */
export const interactive = (ctx: Ctx) =>
  Boolean(process.stdin.isTTY && process.stderr.isTTY) && !ctx.json;

const b64url = (buf: Buffer) => buf.toString("base64url");
const info = (s: string) => process.stderr.write(s + "\n");

export function openUrl(url: string): void {
  const cmd = process.platform === "darwin" ? "open" : process.platform === "win32" ? "cmd" : "xdg-open";
  const args = process.platform === "win32" ? ["/c", "start", "", url] : [url];
  try {
    spawn(cmd, args, { stdio: "ignore", detached: true }).on("error", () => {}).unref();
  } catch {
    // Sin navegador: la persona (o el agente) usa la URL impresa.
  }
}

type TokenResponse = { access_token?: string; refresh_token?: string; expires_in?: number; error?: string };

async function tokenRequest(base: string, form: Record<string, string>): Promise<TokenResponse & { access_token: string }> {
  const res = await fetch(`${base}/oauth/token`, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(form),
  });
  const body = (await res.json().catch(() => ({}))) as TokenResponse;
  if (!res.ok || !body.access_token) {
    throw new CliError(`Login failed (${body.error ?? res.status}).`, EXIT.AUTH, "Run: easybits login", "login_failed", res.status);
  }
  return body as TokenResponse & { access_token: string };
}

// Página de error del regreso al loopback. En español y con el logo de EasyBits servido
// por el sitio (el mismo de BrandLogo), nunca un emoji. El éxito redirige a /oauth/listo.
const FAIL_PAGE = (base: string) => `<!doctype html><html lang="es"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>EasyBits CLI</title><body style="font-family:system-ui,sans-serif;background:#0b0b0f;color:#f4f5fb;display:grid;place-items:center;min-height:100vh;margin:0;padding:16px;box-sizing:border-box">
<div style="text-align:center;max-width:420px">
<img src="${base}/logo-purple.svg" alt="EasyBits" width="96" height="96" style="display:block;margin:0 auto 20px">
<h1 style="font-size:26px;margin:0 0 8px">No se pudo entrar</h1>
<p style="margin:0;color:#a1a1aa;line-height:1.5">Vuelve a la terminal y corre <code style="color:#fbbf24">easybits login</code> otra vez.</p></div>`;

/** Email de la cuenta dueña del token (GET /api/v2/me acepta el JWT OAuth y las keys). */
export async function fetchEmail(token: string): Promise<string | undefined> {
  const base = (await resolveBaseUrl()).replace(/\/+$/, "");
  const res = await fetch(`${base}/api/v2/me`, { headers: { authorization: `Bearer ${token}` } });
  if (res.status === 401) {
    throw new CliError("Credentials rejected (401).", EXIT.AUTH, "Check the key at https://www.easybits.cloud/dash/developer", "unauthorized", 401);
  }
  if (!res.ok) return undefined;
  return ((await res.json().catch(() => ({}))) as { email?: string }).email;
}

/**
 * Login interactivo. Emite los eventos en stdout con --json (una línea cada uno) y los
 * avisos para humanos siempre a stderr, para no ensuciar la salida.
 */
export async function oauthLogin(ctx: Ctx, opts: { openBrowser?: boolean } = {}): Promise<OAuthSession> {
  const base = (await resolveBaseUrl()).replace(/\/+$/, "");
  const verifier = b64url(randomBytes(32));
  const challenge = b64url(createHash("sha256").update(verifier).digest());
  const state = b64url(randomBytes(16));

  const server = createServer();
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const port = (server.address() as { port: number }).port;
  const redirectUri = `http://127.0.0.1:${port}/cb`;

  try {
    const reg = await fetch(`${base}/oauth/register`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ client_name: "EasyBits CLI", redirect_uris: [redirectUri] }),
    });
    const client = (await reg.json().catch(() => ({}))) as { client_id?: string; error?: string };
    if (!reg.ok || !client.client_id) {
      throw new CliError(`Could not start the login (${client.error ?? reg.status}).`, EXIT.AUTH, "Or use an API key: easybits login <api-key>", "login_failed", reg.status);
    }
    const clientId = client.client_id;

    const url =
      `${base}/oauth/authorize?` +
      new URLSearchParams({
        response_type: "code",
        client_id: clientId,
        redirect_uri: redirectUri,
        scope: "mcp",
        state,
        code_challenge: challenge,
        code_challenge_method: "S256",
      });

    const code = await new Promise<string>((resolve, reject) => {
      const timer = setTimeout(
        () => reject(new CliError("Login timed out after 5 minutes.", EXIT.AUTH, "Run: easybits login", "login_timeout")),
        LOGIN_TIMEOUT_MS,
      );
      server.on("request", (req, res) => {
        const u = new URL(req.url ?? "/", "http://127.0.0.1");
        if (u.pathname !== "/cb") {
          res.writeHead(404).end();
          return;
        }
        const got = u.searchParams.get("code");
        const ok = u.searchParams.get("state") === state && !!got;
        clearTimeout(timer);
        if (ok) {
          // La última pantalla es la de la marca (la misma que ven los clientes MCP).
          res.writeHead(302, { location: `${base}/oauth/listo` }).end();
          resolve(got!);
        } else {
          res.writeHead(400, { "content-type": "text/html; charset=utf-8" }).end(FAIL_PAGE(base));
          reject(
            new CliError(`Login was not completed (${u.searchParams.get("error") ?? "state mismatch"}).`, EXIT.AUTH, "Run: easybits login", "login_failed"),
          );
        }
      });

      if (ctx.json) process.stdout.write(JSON.stringify({ event: "login_url", url }) + "\n");
      if (opts.openBrowser !== false) {
        info("Opening your browser to sign in to EasyBits…");
        openUrl(url);
      }
      info(`If it doesn't open, visit:\n  ${url}`);
      info("Waiting for the browser…");
    });

    const tok = await tokenRequest(base, {
      grant_type: "authorization_code",
      code,
      redirect_uri: redirectUri,
      client_id: clientId,
      code_verifier: verifier,
    });
    const session: OAuthSession = {
      clientId,
      accessToken: tok.access_token,
      refreshToken: tok.refresh_token,
      expiresAt: Date.now() + (tok.expires_in ?? 3600) * 1000,
    };
    // `apiKey` se conserva: el proxy MCP (@easybits.cloud/mcp) lo lee de este archivo.
    writeRc({ ...readRc(), oauth: session });
    return session;
  } finally {
    server.close();
  }
}

/** Cambia el refresh por un par nuevo (el servidor ROTA el refresh en cada uso). */
export async function refreshSession(s: OAuthSession): Promise<OAuthSession | null> {
  if (!s.refreshToken) return null;
  try {
    const tok = await tokenRequest((await resolveBaseUrl()).replace(/\/+$/, ""), {
      grant_type: "refresh_token",
      refresh_token: s.refreshToken,
      client_id: s.clientId,
    });
    const next: OAuthSession = {
      ...s,
      accessToken: tok.access_token,
      refreshToken: tok.refresh_token ?? s.refreshToken,
      expiresAt: Date.now() + (tok.expires_in ?? 3600) * 1000,
    };
    writeRc({ ...readRc(), oauth: next });
    return next;
  } catch {
    return null;
  }
}
