import { createCookie } from "react-router";

// State + verificador PKCE del flujo «Conectar Mailmask». Cookie firmada y httpOnly: el
// verificador nunca llega al navegador en claro ni a Mailmask. `d` = el dominio a configurar
// en cuanto vuelva (el usuario no escribe nada más).
export const mailmaskStateCookie = createCookie("mm_oauth_state", {
  httpOnly: true,
  maxAge: 900,
  path: "/dash/integrations/mailmask",
  sameSite: "lax",
  secure: process.env.NODE_ENV !== "development",
  secrets: [process.env.JWT_SECRET ?? "dev"],
});

export type MailmaskState = { s: string; v: string; d?: string };
