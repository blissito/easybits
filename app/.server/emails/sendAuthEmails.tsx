// Correos de ACCESO (magic link y confirmación de cuenta), vía SES.
// El newsletter vive aparte en ./sendNewsLetter.
import { generateUserToken } from "~/.server/tokens";
import { getSesTransport } from "./sendgridTransport";
import { confirmation } from "./templates/confirmation";
import { magic_link } from "./templates/magic_link";
import { db } from "../db";
import { z } from "zod";

export const emailSchema = z.string().email();

// EXAMPLE AMAZON REPLACING LINK: http://jls7lj7d.r.us-east-2.awstrack.me/L0/http:%2F%2Flocalhost:3000%2F%3Fintent=confirm_account%26token=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJlbWFpbCI6ImZpeHRlcmdlZWtAZ21haWwuY29tIiwiaWF0IjoxNzQ0ODIyMDc2LCJleHAiOjE3NDUwODEyNzZ9.Ycfu9hqXderEKOsO34jFS3ewgjs9BqrfSmUMEw0tDXM/1/010f01963f800604-633ab96d-7fc6-4fc4-aed9-950ac8836f83-000000/smoa_w4iLPzncdB2qomLIl1Qh_k=207

const isDev = process.env.NODE_ENV === "development";
const location = isDev ? "http://localhost:3000" : "https://www.easybits.cloud";

const recentConfirmations = new Map<string, number>();
// Límite POR CORREO (antes era global: un link de cualquiera bloqueaba a todos 2 min).
const magicLinkCooldown = new Map<string, number>();
export const sendMagicLink = (email: string, data: any) => {
  const key = String(email || "").trim().toLowerCase();
  const now = Date.now();
  if ((magicLinkCooldown.get(key) ?? 0) > now) {
    console.error("Magic link rate-limited:", key);
    return;
  }
  for (const [k, until] of magicLinkCooldown) if (until <= now) magicLinkCooldown.delete(k);
  magicLinkCooldown.set(key, now + 120000); // 2 min por correo
  const magicToken = generateUserToken({ ...data, email });
  const url = new URL(location + "/api/v1/tokens");
  url.searchParams.set("token", magicToken);
  return getSesTransport()
    .sendMail({
      from: "EasyBits@easybits.cloud",
      subject: "Aquí está tu Magic Link 🪄",
      bcc: [email],
      html: magic_link({ ...data, link: url.toString() }),
    })
    .then((result: unknown) => console.log(result))
    .catch((e: Error) => console.error(e));
};

type SendConfirmationData = { displayName?: string };
export const sendConfirmation = async (
  email: string,
  data?: SendConfirmationData
) => {
  email = emailSchema.parse(email);

  // Skip if already confirmed
  const user = await db.user.findUnique({ where: { email } });
  if (user?.confirmed) return false;

  // Max 1 confirmation per 24h per email
  const cooldownUntil = recentConfirmations.get(email);
  if (cooldownUntil && cooldownUntil > Date.now()) {
    console.info(`Confirmation rate-limited: ${email}`);
    return false;
  }
  recentConfirmations.set(email, Date.now() + 24 * 60 * 60 * 1000);

  const confirmationToken = generateUserToken({ ...data, email });
  const url = new URL(`${location}/api/v1/tokens`);
  url.searchParams.set("token", confirmationToken);
  return getSesTransport()
    .sendMail({
      from: "EasyBits@easybits.cloud",
      subject: "👽 Confirmando que eres humano 🤖",
      bcc: [email],
      html: confirmation({ ...data, link: url.toString() }),
    })
    .then((result: unknown) => console.log(result))
    .catch((e: Error) => console.error(e));
};
