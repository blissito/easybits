import nodemailer from "nodemailer";
import aws from "@aws-sdk/client-ses";
import { defaultProvider } from "@aws-sdk/credential-provider-node";
// import { getDefaultRoleAssumerWithWebIdentity } from "@aws-sdk/client-sts";

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

// const ses = new aws.SES({
//   apiVersion: "2010-12-01",
//   // region: "us-east-2",
//   region: "mx-central-1",
//   defaultProvider,
// });
export const sesTransport = nodemailer.createTransport({
  // SES: { ses, aws },
  // sendingRate: 1,
  host: process.env.SMTP_HOST, // Replace with your region's SMTP endpoint
  port: process.env.NODE_ENV === "development" ? 587 : 465, // TLS port (use 465 for SSL)
  secure: process.env.NODE_ENV === "development" ? false : true, // true for 465, false for other ports
  auth: {
    user: process.env.SMTP_USER, // Your SES SMTP username
    pass: process.env.SMTP_PASSWORD, // Your SES SMTP password
  },
});

// transporter.sendMail(
//   {
//     from: "sender@example.com",
//     to: "recipient@example.com",
//     subject: "Message",
//     text: "I hope this message gets sent!",
//     ses: {
//       // optional extra arguments for SendRawEmail
//       Tags: [
//         {
//           Name: "tag_name",
//           Value: "tag_value",
//         },
//       ],
//     },
//   },
