import { generateUserToken } from "~/utils/tokens";
import { getSesTransport, gmailTransport } from "./sendgridTransport";
import { confirmation } from "./templates/confirmation";
import AWS from "aws-sdk";
import { magic_link } from "./templates/magic_link";
AWS.config.update({ region: "us-east-2" });

// EXAMPLE AMAZON REPLACING LINK: http://jls7lj7d.r.us-east-2.awstrack.me/L0/http:%2F%2Flocalhost:3000%2F%3Fintent=confirm_account%26token=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJlbWFpbCI6ImZpeHRlcmdlZWtAZ21haWwuY29tIiwiaWF0IjoxNzQ0ODIyMDc2LCJleHAiOjE3NDUwODEyNzZ9.Ycfu9hqXderEKOsO34jFS3ewgjs9BqrfSmUMEw0tDXM/1/010f01963f800604-633ab96d-7fc6-4fc4-aed9-950ac8836f83-000000/smoa_w4iLPzncdB2qomLIl1Qh_k=207

const isDev = process.env.NODE_ENV === "development";
const location = isDev ? "http://localhost:3000" : "https://www.easybits.cloud";

let timer: number;
export const sendMagicLink = (email: string, data: any) => {
  if (timer < Date.now()) {
    console.error("Avoided");
  } else {
    timer = Date.now() + 120000; // 2 min de espera para un nuevo link
  }
  const magicToken = generateUserToken({ ...data, email });
  const url = new URL(location);
  url.pathname = "/api/v1/tokens/" + magicToken;
  // url.searchParams.set("intent", "magic_link");
  // url.searchParams.set("token", magicToken);
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

type SendConfirmationData = { displayName: string };
export const sendConfrimation = (
  email: string,
  data: SendConfirmationData = { displayName: "" }
  // getTemplate?: (data: SendConfirmationData) => string
) => {
  const confirmationToken = generateUserToken({ ...data, email });
  const url = new URL(`${location}/api/v1/tokens/${confirmationToken}`);
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

export const sendNewsLetter = (options: {
  email: string;
  data?: any;
  subject?: string;
  getTemplate: (data?: any) => string;
}) => {
  const { getTemplate, subject, data, email } = options;
  return gmailTransport
    .sendMail({
      from: "contacto@fixter.org",
      to: email,
      subject,
      html: getTemplate(),
    })
    .then((r: unknown) => console.info("EMAIL_SUCCESS::", r))
    .catch((e: unknown) => console.error("EMAIL_ERROR::", e));
};
