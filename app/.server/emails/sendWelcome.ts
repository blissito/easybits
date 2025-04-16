import { generateUserToken } from "~/utils/tokens";
import { getSesTransport } from "./sendgridTransport";
import { welcomeEmail } from "./templates/welcomeEmail";

export const sendWelcomeEmail = (email: string, displayName?: string) => {
  const magicToken = generateUserToken({ email, displayName });
  const url = new URL(`${location}/api/v1/tokens`);
  url.searchParams.set("intent", "magic_link");
  url.searchParams.set("token", magicToken);
  return getSesTransport()
    .sendMail({
      from: "no-replay@easybits.cloud",
      subject: "Bienvenid@ a EasyBits 🎉 📻",
      bcc: [email],
      html: welcomeEmail({ displayName, link: url.toString() }),
    })
    .then((result: unknown) => console.log(result))
    .catch((e: Error) => console.error(e));
};
