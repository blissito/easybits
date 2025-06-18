import { db } from "~/.server/db";
import {
  assignAssetToUserByEmail,
  removeAssetFromUserByEmail,
  constructStripeEvent,
  getLastPendingOrder,
  getEmailFromEvent,
} from "~/.server/webhookUtils";

export const action = async ({
  request,
}: {
  request: Request;
  params: { assetId: string };
}) => {
  const event = await constructStripeEvent(request);
  if (event instanceof Response) return event;
  const email = getEmailFromEvent(event);

  // Manejo de éxitos
  if (
    event.type === "payment_intent.succeeded" ||
    event.type === "charge.succeeded"
  ) {
    if (email) {
      // FIXME: this is flaky: change.
      const order = await getLastPendingOrder();
      if (order) {
        await assignAssetToUserByEmail({ assetId: order.assetId, email });
        await db.order.update({
          where: { id: order.id },
          data: { status: "paid" },
        });
        console.info(
          `::ASSET_ID::${order.assetId}::ASSIGNADO_AL_USER::${email}`
        );
      } else {
        console.error("No se encontró orden para email:", email);
      }
    } else {
      console.error("No se pudo determinar el email en el evento");
    }
  }
  // listener para activar o desactivar acceso al asset
  if (event.type === "charge.updated") {
    if (email) {
      const order = await getLastPendingOrder();
      if (order) {
        const charge = event.data.object;
        if (charge.status === "failed" || charge.status === "refunded") {
          await removeAssetFromUserByEmail({ assetId: order.assetId, email });
          await db.order.update({
            where: { id: order.id },
            data: { status: "refunded" },
          });
          return new Response("Asset removed", { status: 200 });
        }
      } else {
        console.error("No se encontró orden pendiente para email:", email);
      }
      return new Response(null, { status: 200 });
    } else {
      console.error("No email en charge.updated");
      return new Response("Missing required metadata or email", {
        status: 400,
      });
    }
  }

  // resto y no soportadas
  switch (event.type) {
    case "account.application.deauthorized": {
      const user = await db.user.findFirst({
        where: { email },
      });

      if (!user) {
        return new Response("User not found", { status: 404 });
      }

      // Remove merchant role //@todo this removes everything! correct this
      await db.user.update({
        where: { email },
        data: {
          roles: [], // @todo this removes everything! correct this
        },
      });

      return new Response(null, { status: 200 });
    }

    case "payout.paid":
    case "transfer.created":
      // Handle these events if needed
      return new Response(null, { status: 204 });

    case "payment_intent.created": {
      console.info("payment_intent.created");
      return new Response(null, { status: 200 });
    }

    default:
      console.log(`Unhandled event type: ${event.type}`);
      return new Response("Event type not handled", { status: 404 });
  }
};
