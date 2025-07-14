export const newsletterDeliveryEmail = ({
  subject,
  content,
  newsletterName,
  deliveryIndex,
}: {
  subject: string;
  content: string; // Puede ser HTML o markdown ya renderizado
  newsletterName?: string;
  deliveryIndex?: number;
}) => `
<div style="font-family:Arial;background-color:#f9f9f9;">
  <div style="background: #f9f9f9; margin: 0 auto; padding: 16px">
    <div style="background-color: white; border-radius: 16px; margin: 0 auto; max-width: 600px; overflow: hidden; box-shadow: 0 2px 8px #0001;">
      <div style="padding: 24px 32px 8px 32px;">
        <h2 style="color: #9870ed; font-size: 22px; margin: 0 0 8px 0;">${
          newsletterName ? newsletterName : "Newsletter"
        }</h2>
        <h1 style="color: #222; font-size: 26px; margin: 0 0 16px 0;">${subject}</h1>
        ${
          typeof deliveryIndex === "number"
            ? `<div style="color: #888; font-size: 14px; margin-bottom: 16px;">Entrega #${
                deliveryIndex + 1
              }</div>`
            : ""
        }
        <div style="font-size: 16px; color: #222; line-height: 1.6; margin-bottom: 24px;">
          ${content}
        </div>
      </div>
      <div style="background: #f2f2f2; padding: 16px; text-align: center; border-radius: 0 0 16px 16px; color: #888; font-size: 13px;">
        <span>Gracias por ser parte de nuestra comunidad.</span>
      </div>
    </div>
  </div>
</div>
`;
