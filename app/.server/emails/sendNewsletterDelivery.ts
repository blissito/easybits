import { getSesTransport } from "./sendgridTransport";
import { newsletterDeliveryEmail } from "./templates/newsletterDelivery";

export const sendNewsletterDelivery = async ({
  email,
  subject,
  content,
  newsletterName,
  deliveryIndex,
}: {
  email: string;
  subject: string;
  content: string; // HTML ya renderizado
  newsletterName?: string;
  deliveryIndex?: number;
}) => {
  return getSesTransport()
    .sendMail({
      from: "EasyBits@easybits.cloud",
      subject,
      bcc: [email],
      html: newsletterDeliveryEmail({
        subject,
        content,
        newsletterName,
        deliveryIndex,
      }),
    })
    .then((result: unknown) => console.log(result))
    .catch((e: Error) => console.error(e));
};
