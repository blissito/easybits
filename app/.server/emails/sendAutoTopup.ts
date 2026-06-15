import { getSesTransport, getSesRemitent } from "./sendgridTransport";

const location =
  process.env.NODE_ENV === "development"
    ? "http://localhost:3000"
    : "https://www.easybits.cloud";

/**
 * Notifica el resultado de una recarga automática. Una sola función, dos
 * variantes: éxito (te cobramos y acreditamos) y fallo (no pudimos cobrar,
 * auto-topup desactivado). El usuario SIEMPRE debe enterarse de un cobro
 * off-session — por confianza y por requisito de los emisores de tarjeta.
 */
export function sendAutoTopupEmail(
  email: string,
  kind: "success" | "failed",
  data: { packId: string; priceMxn: number },
) {
  const subject =
    kind === "success"
      ? "Recarga automática aplicada ✅"
      : "No pudimos recargar tu saldo ⚠️";

  const body =
    kind === "success"
      ? `
        <h2 style="font-family:sans-serif">Recargamos tu saldo</h2>
        <p style="font-family:sans-serif">
          Tu saldo se agotó y aplicamos tu recarga automática:
          <strong>${data.packId}</strong> por
          <strong>$${data.priceMxn.toLocaleString("es-MX")} MXN</strong>.
          Ya está disponible en tu cuenta.
        </p>
        <p style="font-family:sans-serif">
          <a href="${location}/dash/packs">Ver mi saldo y configuración</a>
        </p>`
      : `
        <h2 style="font-family:sans-serif">No pudimos procesar tu recarga</h2>
        <p style="font-family:sans-serif">
          Intentamos recargar tu saldo (<strong>${data.packId}</strong>,
          $${data.priceMxn.toLocaleString("es-MX")} MXN) pero el cobro no se
          completó. Desactivamos la recarga automática para no insistir.
        </p>
        <p style="font-family:sans-serif">
          Actualiza tu tarjeta y vuelve a activarla aquí:
          <a href="${location}/dash/packs">easybits.cloud/dash/packs</a>
        </p>`;

  return getSesTransport()
    .sendMail({
      from: getSesRemitent(),
      subject,
      bcc: [email],
      html: body,
    })
    .catch((e: Error) => console.error("sendAutoTopupEmail", e));
}
