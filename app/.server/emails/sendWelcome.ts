import { generateUserToken } from "~/utils/tokens";
import { getSesTransport } from "./sendgridTransport";
import { welcomeEmail } from "./templates/welcomeEmail";

export const sendWelcomeEmail = (email: string, displayName?: string) => {
  const isDev = process.env.NODE_ENV === "development";
  const location = isDev
    ? "http://localhost:3000"
    : "https://www.easybits.cloud";
  return getSesTransport()
    .sendMail({
      from: "EasyBits@easybits.cloud",
      subject: "Bienvenid@ a EasyBits 🎉 📻",
      bcc: [email],
      html: welcomeEmail({ displayName, link: `${location}/dash` }),
    })
    .then((result: unknown) => console.log(result))
    .catch((e: Error) => console.error(e));
};
