import {
  gmailTransport,
  sendgridTransport,
  // sesTransport,
} from "./sendgridTransport";
import { confirmation } from "./templates/confirmation";
import AWS from "aws-sdk";
AWS.config.update({ region: "us-east-2" });

export const sendConfrimation = (email: string, data: any, html?: string) => {
  return sendgridTransport
    .sendMail({
      from: "contacto@fixter.org",
      subject: "👽 Confirmando que eres humano 🤖",
      bcc: [email],
      html: confirmation({ link: `@todo link` }),
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
  // return sendgridTransport
  // return sesTransport
  return gmailTransport
    .sendMail({
      from: "fixtergeek@gmail.com",
      to: email,
      subject,
      html: getTemplate(),
    })
    .then((r: unknown) => console.info("RESUT::", r))
    .catch((e: unknown) => console.error("ERROR::", e));
  // return awsSendMail({
  //   subject: subject || "👽 Confirmando que eres humano 🤖",
  //   emails: [email],
  //   getBody: () => getTemplate(data),
  // });
};

type ParamsType = {
  Destination: { CcAddresses: string[]; ToAddresses: string[] };
  Message: any;
  Source: string;
  ReplyToAddresses: string[];
};

const params: ParamsType = {
  Destination: {
    /* required */
    // CcAddresses: [
    //   "EMAIL_ADDRESS",
    //   /* more items */
    // ],
    // ToAddresses: [
    //   "EMAIL_ADDRESS",
    //   /* more items */
    // ],
  },
  Message: {
    /* required */
    Body: {
      /* required */
      // Html: {
      //   Charset: "UTF-8",
      //   Data: "HTML_FORMAT_BODY",
      // },
      // Text: {
      //   Charset: "UTF-8",
      //   Data: "TEXT_FORMAT_BODY",
      // },
    },
    Subject: {
      Charset: "UTF-8",
      Data: "Test email",
    },
  },
  Source: "fixtergeek@gmail.com" /* required */,
  ReplyToAddresses: [
    "fixtergeek@gmail.com",
    /* more items */
  ],
};

// adapter
type AWSSendMailOptions = {
  emails: string[];
  subject: string;
  getBody?: () => string;
};
const getParams = (options: AWSSendMailOptions) => {
  params.Destination.CcAddresses = options.emails;
  params.Message.Subject.Data = options.subject;
  params.Message.Body = {
    Html: {
      Charset: "UTF-8",
      Data: options.getBody?.(),
    },
  };
  return params;
};

const awsSendMail = (options: AWSSendMailOptions) => {
  // Create the promise and SES service object
  const promise = new AWS.SES({ apiVersion: "2010-12-01" })
    .sendEmail(getParams(options))
    .promise();

  // Handle promise's fulfilled/rejected states
  promise
    .then(function (data) {
      console.log("::SES::DATA::", data);
    })
    .catch(function (err) {
      console.error(err, err.stack);
    });
};
