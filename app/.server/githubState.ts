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
