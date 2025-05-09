import { generateUserToken } from "~/.server/tokens";
import { getSesTransport } from "./sendgridTransport";
import { review } from "./templates/review";

const isDev = process.env.NODE_ENV === "development";
const location = isDev ? "http://localhost:3000" : "https://www.easybits.cloud";

export const sendReview = (
  email: string,
  data: {
    assetId: string;
    assetTitle: string;
    creatorName: string;
  }
) => {
  const { assetTitle, creatorName, assetId } = data || {};
  const magicToken = generateUserToken(
    {
      email,
      next: `/dash/compras/${assetId}`,
    },
    "7d"
  );
  const url = new URL(`${location}/api/v1/tokens/${magicToken}`);
  return getSesTransport()
    .sendMail({
      from: "EasyBits@easybits.cloud",
      subject: "💬 Danos tu opinión",
      bcc: [email],
      html: review({ creatorName, assetTitle, link: url.toString() }),
    })
    .then((result: unknown) => console.log(result))
    .catch((e: Error) => console.error(e));
};
