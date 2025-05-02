import { generateUserToken } from "~/utils/tokens";
import { getSesRemitent, getSesTransport } from "./sendgridTransport";
import { purchase } from "./templates/purchase";

const isDev = process.env.NODE_ENV === "development";
const location = isDev ? "http://localhost:3000" : "https://www.easybits.cloud";

export const sendPurchase = (options: {
  email: string;
  data: {
    assetName: string;
    date: string | Date;
    price: number | string;
    assetId: string;
  };
  subject?: string;
  getTemplate?: (data?: any) => string;
}) => {
  const { subject = "Aquí está tu asset", data, email } = options;
  const { assetName, price, date, assetId } = data || {};
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
      from: getSesRemitent(),
      subject,
      to: email,
      html: purchase({ assetName, price, date, link: url.toString() }),
    })
    .then((r: unknown) => console.info("EMAIL_SUCCESS::", r))
    .catch((e: unknown) => console.error("EMAIL_ERROR::", e));
};
