import { createCookie } from "react-router";

// Nonce del `state` del flujo de instalación de la GitHub App. Va en cookie
// firmada y se compara al volver: sin esto cualquiera podría mandarle a alguien
// un callback con SU code y colgarle sus instalaciones. `lax` porque vuelve por
// navegación de nivel superior (GitHub → relay de Teams → aquí).
export const githubStateCookie = createCookie("gh_install_state", {
  httpOnly: true,
  maxAge: 900,
  path: "/dash/hosting/github",
  sameSite: "lax",
  secure: process.env.NODE_ENV !== "development",
  secrets: [process.env.JWT_SECRET ?? "dev"],
});

/**
 * El valor de la cookie: el nonce, y opcionalmente el sitio que pidió «Conectar a
 * GitHub» (así el callback sabe que tiene que crear su repo y a dónde volver).
 * Acepta el formato viejo (sólo el nonce como string).
 */
export type GithubState = { n: string; site?: string };
export function readGithubState(raw: unknown): GithubState | null {
  if (typeof raw === "string" && raw) return { n: raw };
  if (raw && typeof raw === "object" && typeof (raw as GithubState).n === "string") return raw as GithubState;
  return null;
}
