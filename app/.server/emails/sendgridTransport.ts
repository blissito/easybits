import nodemailer from "nodemailer";
import { SESClient, SendRawEmailCommand } from "@aws-sdk/client-ses";
// import { defaultProvider } from "@aws-sdk/credential-provider-node";

export const sendgridTransport = nodemailer.createTransport({
  host: "smtp.sendgrid.net",
  port: 465,
  auth: {
    user: "apikey",
    pass: process.env.SENDGRID_KEY,
  },
});

export const gmailTransport = nodemailer.createTransport({
  service: "gmail",
  host: "smtp.gmail.com",
  port: 587,
  secure: false,
  auth: {
    user: "contacto@fixter.org",
    pass: process.env.GMAIL_APP_PASSWORD,
  },
});

let sesClient: SESClient;
const getSesClient = () => {
  sesClient ??= new SESClient({
    region: process.env.SES_REGION,
    credentials: {
      accessKeyId: process.env.SES_KEY!,
      secretAccessKey: process.env.SES_SECRET!,
    },
  });
  return sesClient;
};
export const getSesTransport = () => {
  return nodemailer.createTransport({
    SES: {
      ses: getSesClient(),
      aws: { SendRawEmailCommand },
    },
  });
};

export const getSesRemitent = () =>
  `Brenda de EasyBits <no-reply@easybits.cloud>`;
